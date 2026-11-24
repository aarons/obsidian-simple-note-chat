import { Platform } from 'obsidian';
import { chatGptJson } from './ChatGptHttp';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const DIRECT_SCOPE = 'chatgpt.tokens.use.direct';
const SCOPES = `openid profile email offline_access resource.invoke ${DIRECT_SCOPE}`;
interface Credentials { accessToken: string; refreshToken: string; expiresAt: number; scope: string; earliestRefreshAt?: number }
interface Identity { sub: string; email?: string }
interface StoredAuth {
    hostId: string;
    clientId?: string;
    identity?: Identity;
    credentials?: Credentials;
    pending?: { credentials: Credentials; idToken: string; receivedAt: number };
}

export class ChatGptAuth {
    private data: StoredAuth | undefined;
    private loading: Promise<StoredAuth> | undefined;
    private refresh: Promise<string> | undefined;
    private login: AbortController | undefined;
    private writes: Promise<void> = Promise.resolve();
    private generation = 0;

    private desktop(): void {
        if (!Platform.isDesktopApp) throw new Error('Sign in with ChatGPT requires Obsidian desktop. Use OpenRouter on mobile.');
    }

    private path(): string {
        this.desktop();
        return require('path').join(require('os').homedir(), '.simple-note-chat', 'chatgpt.json');
    }

    private async load(): Promise<StoredAuth> {
        if (this.data) return this.data;
        if (!this.loading) this.loading = (async () => {
            const fs = require('fs/promises') as typeof import('fs/promises');
            try {
                const data = JSON.parse(await fs.readFile(this.path(), 'utf8')) as StoredAuth;
                if (!data.hostId?.startsWith('urn:uuid:')) throw new Error('Invalid ChatGPT connection file.');
                return this.data = data;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                const data = { hostId: `urn:uuid:${require('crypto').randomUUID()}` };
                await this.save(data);
                return data;
            }
        })();
        try { return await this.loading; } finally { this.loading = undefined; }
    }

    private async save(data: StoredAuth): Promise<void> {
        // Serialize atomic replacements so refresh/sign-out cannot restore stale tokens.
        this.data = data;
        const serialized = JSON.stringify(data);
        const file = this.path();
        const write = this.writes.catch(() => {}).then(async () => {
            const fs = require('fs/promises') as typeof import('fs/promises');
            const path = require('path') as typeof import('path');
            await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
            const temp = `${file}.${require('crypto').randomUUID()}.tmp`;
            try {
                await fs.writeFile(temp, serialized, { mode: 0o600, flag: 'wx' });
                await fs.rename(temp, file);
            } finally { await fs.rm(temp, { force: true }); }
        });
        this.writes = write;
        await write;
    }

    private async discovery(): Promise<any> {
        const data = await chatGptJson(`${ISSUER}/.well-known/openid-configuration`);
        if (data.issuer !== ISSUER) throw new Error('Could not verify ChatGPT sign-in configuration.');
        for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'revocation_endpoint']) {
            if (key === 'revocation_endpoint' && !data[key]) continue;
            if (typeof data[key] !== 'string' || new URL(data[key]).origin !== ISSUER) throw new Error('Invalid ChatGPT sign-in endpoint.');
        }
        return data;
    }

    private async verifyIdentity(token: string, clientId: string, nonce?: string, receivedAt = Date.now()): Promise<Identity> {
        const { createPublicKey, verify } = require('crypto') as typeof import('crypto');
        const parts = token.split('.');
        if (parts.length !== 3) throw new Error('Invalid ChatGPT identity token.');
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
        const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        const config = await this.discovery();
        const jwks = await chatGptJson(config.jwks_uri);
        const key = jwks.keys?.find((entry: any) => entry.kid === header.kid && entry.kty === 'RSA' && (!entry.use || entry.use === 'sig') && (!entry.alg || entry.alg === 'RS256'));
        const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
        const now = receivedAt / 1000;
        if (header.alg !== 'RS256' || !key || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url')) ||
            claims.iss !== ISSUER || !aud.includes(clientId) || typeof claims.exp !== 'number' || claims.exp < now - 5 ||
            typeof claims.iat !== 'number' || claims.iat > now + 5 || (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now + 5)) ||
            typeof claims.sub !== 'string' || !claims.sub || (nonce !== undefined && claims.nonce !== nonce) ||
            (claims.azp !== undefined && claims.azp !== clientId) || (aud.length > 1 && claims.azp !== clientId)) {
            throw new Error('Could not verify your ChatGPT identity. Sign in again.');
        }
        return { sub: claims.sub, ...(typeof claims.email === 'string' ? { email: claims.email } : {}) };
    }

    private credentials(data: any, previousScope?: string): Credentials {
        const scope = data.scope ?? previousScope;
        if (typeof scope !== 'string' || !scope.split(/\s+/).includes(DIRECT_SCOPE)) throw new Error('ChatGPT did not grant subscription usage. Sign in again and allow token sharing.');
        if (typeof data.access_token !== 'string' || !data.access_token || typeof data.refresh_token !== 'string' || !data.refresh_token ||
            typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer' || typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
            throw new Error('ChatGPT returned incomplete credentials. Sign in again.');
        }
        const earliest = typeof data.earliest_refresh_at === 'number' ? data.earliest_refresh_at * 1000 : Date.parse(data.earliest_refresh_at);
        return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000, scope, ...(Number.isFinite(earliest) ? { earliestRefreshAt: earliest } : {}) };
    }

    async getAccount(): Promise<{ type: string; email?: string } | null> {
        const data = await this.load();
        return data.credentials && data.identity ? { type: 'chatgpt', email: data.identity.email } : null;
    }

    async signIn(openUrl: (url: string) => void): Promise<void> {
        this.desktop();
        if (this.login) throw new Error('ChatGPT sign-in is already in progress. Finish it in your browser.');
        const controller = new AbortController();
        this.login = controller;
        const generation = this.generation;
        const { randomBytes, createHash, timingSafeEqual } = require('crypto') as typeof import('crypto');
        const { createServer } = require('http') as typeof import('http');
        const state = randomBytes(32).toString('base64url');
        const nonce = randomBytes(32).toString('base64url');
        const verifier = randomBytes(32).toString('base64url');
        let server: ReturnType<typeof createServer> | undefined;
        let rejectCallback: (error: Error) => void = () => {};
        const abort = () => rejectCallback(new Error('ChatGPT sign-in cancelled or timed out.'));
        const timer = setTimeout(() => controller.abort(), 5 * 60_000);
        controller.signal.addEventListener('abort', abort);
        try {
            const previous = await this.load();
            const config = await this.discovery();
            if (controller.signal.aborted) throw new Error('ChatGPT sign-in cancelled.');
            let origin = '';
            let settled = false;
            const callback = new Promise<{ code: string; clientId: string }>((resolve, reject) => {
                rejectCallback = reject;
                server = createServer((request, response) => {
                    response.setHeader('Cache-Control', 'no-store');
                    response.setHeader('Referrer-Policy', 'no-referrer');
                    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
                    let url: URL;
                    try { url = new URL(request.url || '/', origin); }
                    catch { response.writeHead(400).end(); return; }
                    if (request.method === 'GET' && request.headers.host === new URL(origin).host && url.origin === origin && url.pathname === '/auth/complete') { response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Return to Obsidian to finish connecting ChatGPT. You can close this tab.'); return; }
                    if (settled || request.method !== 'GET' || request.headers.host !== new URL(origin).host || url.origin !== origin || url.pathname !== '/auth/callback') { response.writeHead(404).end(); return; }
                    const actual = Buffer.from(url.searchParams.get('state') || '');
                    if (url.searchParams.getAll('state').length !== 1 || actual.length !== state.length || !timingSafeEqual(actual, Buffer.from(state))) { response.writeHead(400).end('Invalid sign-in state.'); return; }
                    settled = true;
                    // Strip the code from the browser address before showing the completion page.
                    response.writeHead(302, { Location: '/auth/complete' }).end();
                    if (url.searchParams.has('error')) { reject(new Error('ChatGPT sign-in was declined.')); return; }
                    const code = url.searchParams.get('code');
                    const clientId = url.searchParams.get('client_id') || previous.clientId;
                    if (!code || url.searchParams.getAll('code').length !== 1 || url.searchParams.getAll('client_id').length > 1 || !clientId || !/^oaiapp_[a-zA-Z0-9_-]+$/.test(clientId) || (previous.clientId && clientId !== previous.clientId)) {
                        reject(new Error('ChatGPT did not complete app registration. Try signing in again.')); return;
                    }
                    resolve({ code, clientId });
                });
                server.requestTimeout = 15_000;
                server.headersTimeout = 10_000;
                server.on('error', () => reject(new Error('Could not start the local ChatGPT sign-in listener.')));
            });
            void callback.catch(() => {});
            await new Promise<void>((resolve, reject) => {
                server!.once('error', reject);
                server!.listen(0, '127.0.0.1', () => { server!.removeListener('error', reject); resolve(); });
            });
            const address = server!.address() as import('net').AddressInfo;
            origin = `http://127.0.0.1:${address.port}`;
            const redirectUri = `${origin}/auth/callback`;
            const url = new URL(config.authorization_endpoint);
            url.search = new URLSearchParams({ client_id: previous.clientId || 'dynamic_agent_client',
                ...(!previous.clientId ? { agent_name_hint: 'Simple Note Chat' } : {}), ext_agent_host_id: previous.hostId,
                response_type: 'code', redirect_uri: redirectUri, scope: SCOPES, resource: RESOURCE, state, nonce,
                code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
            }).toString();
            if (controller.signal.aborted) throw new Error('ChatGPT sign-in cancelled.');
            openUrl(url.toString());
            const result = await callback;
            if (generation !== this.generation || controller.signal.aborted) throw new Error('ChatGPT sign-in cancelled.');
            const registered = { ...previous, clientId: result.clientId };
            await this.save(registered);
            const tokens = await chatGptJson(config.token_endpoint, { method: 'POST', signal: controller.signal,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({
                    grant_type: 'authorization_code', client_id: result.clientId, code: result.code,
                    code_verifier: verifier, redirect_uri: redirectUri, resource: RESOURCE,
                }).toString() });
            if (typeof tokens.id_token !== 'string') throw new Error('ChatGPT did not return a verifiable identity.');
            const identity = await this.verifyIdentity(tokens.id_token, result.clientId, nonce);
            const credentials = this.credentials(tokens);
            if (generation !== this.generation || controller.signal.aborted) throw new Error('ChatGPT sign-in cancelled.');
            await this.save({ hostId: previous.hostId, clientId: result.clientId, identity, credentials });
        } finally {
            clearTimeout(timer);
            controller.signal.removeEventListener('abort', abort);
            server?.close();
            server?.closeAllConnections?.();
            if (this.login === controller) this.login = undefined;
        }
    }

    async accessToken(): Promise<string> {
        const data = await this.load();
        if (!data.credentials || !data.clientId || !data.identity) throw new Error('Sign in to ChatGPT in plugin settings.');
        if (!data.pending && data.credentials.expiresAt > Date.now() + 30_000) return data.credentials.accessToken;
        if (!data.pending && data.credentials.earliestRefreshAt && data.credentials.earliestRefreshAt > Date.now()) {
            if (data.credentials.expiresAt > Date.now()) return data.credentials.accessToken;
            throw new Error('ChatGPT token refresh is not available yet. Please try again shortly.');
        }
        if (this.refresh) return this.refresh;
        const generation = this.generation;
        this.refresh = (async () => {
            let pending = data.pending;
            let credentials: Credentials;
            if (pending) credentials = pending.credentials;
            else {
                const config = await this.discovery();
                const tokens = await chatGptJson(config.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: data.clientId!, refresh_token: data.credentials!.refreshToken, resource: RESOURCE }).toString() });
                credentials = this.credentials(tokens, data.credentials!.scope);
                if (tokens.id_token !== undefined) {
                    if (typeof tokens.id_token !== 'string' || !tokens.id_token) throw new Error('Invalid refreshed ChatGPT identity. Sign in again.');
                    pending = { credentials, idToken: tokens.id_token, receivedAt: Date.now() };
                    if (generation !== this.generation) throw new Error('ChatGPT connection cancelled.');
                    await this.save({ ...data, pending });
                }
            }
            const identity = pending ? await this.verifyIdentity(pending.idToken, data.clientId!, undefined, pending.receivedAt) : data.identity!;
            if (identity.sub !== data.identity!.sub) throw new Error('ChatGPT account changed. Sign in again.');
            if (generation !== this.generation) throw new Error('ChatGPT connection cancelled.');
            await this.save({ hostId: data.hostId, clientId: data.clientId, identity, credentials });
            return credentials.accessToken;
        })();
        try { return await this.refresh; } finally { this.refresh = undefined; }
    }

    async signOut(): Promise<void> {
        this.generation++;
        this.dispose();
        const data = await this.load();
        await this.save({ hostId: data.hostId, clientId: data.clientId });
        const token = data.pending?.credentials.refreshToken || data.credentials?.refreshToken;
        if (token) {
            try {
                const config = await this.discovery();
                if (!config.revocation_endpoint) throw new Error();
                // Revocation commonly returns an empty body, so consume the raw response.
                const { chatGptRequest } = await import('./ChatGptHttp');
                const response = await chatGptRequest(config.revocation_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ token, client_id: data.clientId!, token_type_hint: 'refresh_token' }).toString() });
                response.resume();
                if (response.statusCode !== 200) throw new Error();
            } catch { throw new Error('Local credentials removed. Remote revocation could not be confirmed; disconnect Simple Note Chat in ChatGPT settings.'); }
        }
    }

    dispose(): void { this.login?.abort(); }
}
