import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', () => ({ Platform: { isDesktopApp: true } }));
vi.mock('./ChatGptHttp', () => ({ chatGptJson: vi.fn(), chatGptRequest: vi.fn() }));
import { ChatGptAuth } from './ChatGptAuth';
import { chatGptJson, chatGptRequest } from './ChatGptHttp';

const issuer = 'https://auth.openai.com';
const config = { issuer, authorization_endpoint: `${issuer}/api/accounts/authorize`, token_endpoint: `${issuer}/api/accounts/oauth/token`, jwks_uri: `${issuer}/.well-known/jwks.json`, revocation_endpoint: `${issuer}/api/accounts/oauth/revoke` };
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
function jwt(overrides: Record<string, unknown> = {}) {
    const parts = [ { alg: 'RS256', kid: 'test' }, { iss: issuer, aud: 'oaiapp_test', sub: 'account', exp: Date.now() / 1000 + 3600, iat: Date.now() / 1000, email: 'person@example.com', ...overrides } ].map(part => Buffer.from(JSON.stringify(part)).toString('base64url'));
    return `${parts.join('.')}.${sign('RSA-SHA256', Buffer.from(parts.join('.')), privateKey).toString('base64url')}`;
}
function fixture() {
    const auth = new ChatGptAuth();
    let stored: any = { hostId: 'urn:uuid:test', clientId: 'oaiapp_test', identity: { sub: 'account' }, credentials: { accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: 0, scope: 'offline_access chatgpt.tokens.use.direct' } };
    vi.spyOn(auth as any, 'load').mockImplementation(async () => stored);
    const save = vi.spyOn(auth as any, 'save').mockImplementation(async (value: any) => { stored = value; });
    vi.mocked(chatGptJson).mockImplementation(async url => {
        if (url.endsWith('openid-configuration')) return config;
        if (url === config.jwks_uri) return { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256' }] };
        if (url === config.token_endpoint) return { access_token: 'new-access', refresh_token: 'new-refresh', token_type: 'Bearer', expires_in: 3600 };
        throw new Error('Unexpected URL');
    });
    return { auth, save, get stored() { return stored; }, set stored(value: any) { stored = value; } };
}
afterEach(() => vi.restoreAllMocks());

describe('ChatGPT OAuth credentials', () => {
    it('serializes concurrent rotating refresh and persists the new refresh token', async () => {
        const f = fixture();
        expect(await Promise.all([f.auth.accessToken(), f.auth.accessToken(), f.auth.accessToken()])).toEqual(['new-access', 'new-access', 'new-access']);
        const calls = vi.mocked(chatGptJson).mock.calls.filter(([url]) => url === config.token_endpoint);
        expect(calls).toHaveLength(1);
        expect(new URLSearchParams(calls[0][1]!.body!).get('refresh_token')).toBe('old-refresh');
        expect(new URLSearchParams(calls[0][1]!.body!).has('scope')).toBe(false);
        expect(f.stored.credentials.refreshToken).toBe('new-refresh');
    });

    it('preserves rotated credentials across a temporary identity verification outage', async () => {
        const f = fixture();
        vi.mocked(chatGptJson).mockImplementation(async url => {
            if (url.endsWith('openid-configuration')) return config;
            if (url === config.token_endpoint) return { access_token: 'rotated', refresh_token: 'rotated-refresh', token_type: 'Bearer', expires_in: 3600, id_token: jwt() };
            throw new Error('Temporary key service outage');
        });
        await expect(f.auth.accessToken()).rejects.toThrow('Temporary');
        expect(f.stored.pending.credentials.refreshToken).toBe('rotated-refresh');
        vi.mocked(chatGptJson).mockClear().mockImplementation(async url => url.endsWith('openid-configuration') ? config : { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test' }] });
        expect(await f.auth.accessToken()).toBe('rotated');
        expect(vi.mocked(chatGptJson).mock.calls.some(([url]) => url === config.token_endpoint)).toBe(false);
        expect(f.stored.pending).toBeUndefined();
    });

    it('checks signature, issuer, audience, expiry, nonce and authorized party', async () => {
        const { auth } = fixture();
        expect(await (auth as any).verifyIdentity(jwt({ nonce: 'expected' }), 'oaiapp_test', 'expected')).toEqual({ sub: 'account', email: 'person@example.com' });
        for (const claims of [{ iss: 'https://wrong.example' }, { aud: 'another-client' }, { exp: 0 }, { nonce: 'wrong' }, { azp: 'another-client' }, { aud: ['oaiapp_test', 'another-client'] }]) {
            await expect((auth as any).verifyIdentity(jwt({ nonce: 'expected', ...claims }), 'oaiapp_test', 'expected')).rejects.toThrow('verify');
        }
        const valid = jwt({ nonce: 'expected' });
        const parts = valid.split('.');
        parts[1] = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');
        await expect((auth as any).verifyIdentity(parts.join('.'), 'oaiapp_test', 'expected')).rejects.toThrow('verify');
    });

    it('honors earliest refresh and rejects missing subscription permission', async () => {
        const f = fixture();
        f.stored.credentials.earliestRefreshAt = Date.now() + 60_000;
        await expect(f.auth.accessToken()).rejects.toThrow('not available yet');
        f.stored.credentials.expiresAt = Date.now() + 10_000;
        expect(await f.auth.accessToken()).toBe('old-access');
        expect(() => (f.auth as any).credentials({ scope: 'openid' })).toThrow('subscription usage');
    });

    it('clears local credentials even if remote revocation fails', async () => {
        const f = fixture();
        vi.mocked(chatGptRequest).mockRejectedValue(new Error('offline'));
        await expect(f.auth.signOut()).rejects.toThrow('Local credentials removed');
        expect(f.stored).toEqual({ hostId: 'urn:uuid:test', clientId: 'oaiapp_test' });
    });

    it('does not restore a signed-out session when an in-flight refresh finishes', async () => {
        const f = fixture();
        let release!: (value: any) => void;
        let started!: () => void;
        const reachedToken = new Promise<void>(resolve => { started = resolve; });
        vi.mocked(chatGptJson).mockImplementation(async url => {
            if (url.endsWith('openid-configuration')) return config;
            started();
            return new Promise(resolve => { release = resolve; });
        });
        vi.mocked(chatGptRequest).mockResolvedValue({ statusCode: 200, resume() {} } as any);
        const refreshing = f.auth.accessToken();
        const rejected = expect(refreshing).rejects.toThrow('cancelled');
        await reachedToken;
        await f.auth.signOut();
        release({ access_token: 'new', refresh_token: 'new', token_type: 'Bearer', expires_in: 3600 });
        await rejected;
        expect(f.stored.credentials).toBeUndefined();
    });

    it('writes atomic owner-only files outside plugin settings', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'snc-auth-test-'));
        try {
            const auth = new ChatGptAuth();
            const file = join(directory, 'chatgpt.json');
            vi.spyOn(auth as any, 'path').mockReturnValue(file);
            expect(await auth.getAccount()).toBeNull();
            expect(JSON.parse(await readFile(file, 'utf8')).hostId).toMatch(/^urn:uuid:/);
            if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600);
            await (auth as any).save({ hostId: 'urn:uuid:replacement' });
            expect(JSON.parse(await readFile(file, 'utf8')).hostId).toBe('urn:uuid:replacement');
        } finally { await rm(directory, { recursive: true, force: true }); }
    });
});

describe('browser sign-in', () => {
    function listener() {
        let handler: (request: any, response: any) => void;
        const server = Object.assign(new EventEmitter(), { listen: vi.fn((_port, _host, ready) => ready()), address: () => ({ port: 41777 }), close: vi.fn(), closeAllConnections: vi.fn() });
        vi.spyOn(require('http'), 'createServer').mockImplementation((fn: any) => { handler = fn; return server; });
        const send = (url: string) => {
            const response = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
            response.writeHead.mockReturnValue(response);
            handler({ method: 'GET', headers: { host: '127.0.0.1:41777' }, url }, response);
            return response;
        };
        return { server, send };
    }

    it('registers dynamically, validates callback state and exchanges the PKCE code with the issued client ID', async () => {
        const f = fixture();
        f.stored = { hostId: 'urn:uuid:test' };
        const { server, send } = listener();
        let authorization!: URL;
        const original = vi.mocked(chatGptJson).getMockImplementation()!;
        vi.mocked(chatGptJson).mockImplementation(async (url, options) => {
            if (url === config.token_endpoint) {
                expect(f.stored.clientId).toBe('oaiapp_test');
                const body = new URLSearchParams(options!.body!);
                expect(body.get('client_id')).toBe('oaiapp_test');
                expect(body.get('redirect_uri')).toBe('http://127.0.0.1:41777/auth/callback');
                expect(createHash('sha256').update(body.get('code_verifier')!).digest('base64url')).toBe(authorization.searchParams.get('code_challenge'));
                return { access_token: 'access', refresh_token: 'refresh', token_type: 'Bearer', expires_in: 3600, scope: 'offline_access chatgpt.tokens.use.direct', id_token: jwt({ nonce: authorization.searchParams.get('nonce') }) };
            }
            return original(url, options);
        });
        await f.auth.signIn(url => {
            authorization = new URL(url);
            expect(authorization.searchParams.get('client_id')).toBe('dynamic_agent_client');
            expect(authorization.searchParams.get('agent_name_hint')).toBe('Simple Note Chat');
            expect(send('/auth/callback?state=wrong&code=bad').writeHead).toHaveBeenCalledWith(400);
            send(`/auth/callback?state=${authorization.searchParams.get('state')}&code=valid&client_id=oaiapp_test`);
        });
        expect(await f.auth.getAccount()).toEqual({ type: 'chatgpt', email: 'person@example.com' });
        expect(server.close).toHaveBeenCalled();
    });

    it('reuses registration and closes the listener when sign-in is cancelled', async () => {
        const f = fixture();
        const { server } = listener();
        await expect(f.auth.signIn(url => {
            const params = new URL(url).searchParams;
            expect(params.get('client_id')).toBe('oaiapp_test');
            expect(params.has('agent_name_hint')).toBe(false);
            f.auth.dispose();
        })).rejects.toThrow('cancelled');
        expect(server.close).toHaveBeenCalled();
    });
});
