import { ChatGptAuth } from './ChatGptAuth';
import { chatGptJson, chatGptRequest } from './ChatGptHttp';
import { CHATGPT_MODEL_PREFIX, ProviderModel } from './ModelProvider';
import { ChatMessage, ReasoningEffort } from './types';
import { formatChatInputs } from './ChatInputs';

const API = 'https://api.openai.com/v1';

/** Official Sign in with ChatGPT direct token-sharing connection. */
export class ChatGptService {
    private active = new Set<AbortController>();

    constructor(private auth = new ChatGptAuth()) {}

    getAccount(): ReturnType<ChatGptAuth['getAccount']> { return this.auth.getAccount(); }
    signIn(openUrl: (url: string) => void): Promise<void> { return this.auth.signIn(openUrl); }
    async signOut(): Promise<void> { this.dispose(); await this.auth.signOut(); }

    async fetchModels(): Promise<ProviderModel[]> {
        const controller = new AbortController();
        this.active.add(controller);
        try {
            const token = await this.auth.accessToken();
            if (controller.signal.aborted) throw new Error('ChatGPT connection cancelled.');
            const response = await chatGptJson(`${API}/models`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: controller.signal });
            if (!Array.isArray(response.models)) throw new Error('ChatGPT returned an invalid model catalog.');
            return response.models.filter((model: any) => model.visibility === 'list').map((model: any) => {
                if (typeof model.slug !== 'string' || !model.slug.trim() || typeof model.display_name !== 'string' || !model.display_name.trim()) throw new Error('ChatGPT returned an incomplete model listing.');
                return { id: CHATGPT_MODEL_PREFIX + model.slug, displayName: `${model.display_name} | ChatGPT plan`, provider: 'chatgpt' as const };
            });
        } finally { this.active.delete(controller); }
    }

    async *streamChatCompletion(messages: ChatMessage[], model: string, signal: AbortSignal, _effort?: ReasoningEffort): AsyncGenerator<string> {
        if (signal.aborted) return;
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal.addEventListener('abort', abort, { once: true });
        this.active.add(controller);
        let response: Awaited<ReturnType<typeof chatGptRequest>> | undefined;
        try {
            const token = await this.auth.accessToken();
            if (controller.signal.aborted) return;
            response = await chatGptRequest(`${API}/responses`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
                signal: controller.signal,
                body: JSON.stringify({ model, input: formatChatInputs(messages, 'responses'),
                    instructions: 'You are a helpful text chat assistant inside Obsidian. Respond in Markdown.', store: false, stream: true }),
            });
            if (response.statusCode !== 200) {
                throw new Error(response.statusCode === 401 ? 'Your ChatGPT connection expired. Sign in again.' :
                    response.statusCode === 429 ? 'ChatGPT sharing usage limit reached. Manage usage at https://chatgpt.com/settings/usage or try again later.' :
                    response.statusCode === 400 && messages.some(message => message.images?.length) ? 'ChatGPT could not use the reference images. Check the image format, size, and selected model\'s image support.' :
                    `ChatGPT request failed (${response.statusCode}). Please try again.`);
            }
            const contentType = response.headers['content-type']?.split(';')[0].trim().toLowerCase();
            if (contentType && contentType !== 'text/event-stream') throw new Error('ChatGPT did not return a response stream.');
            response.setEncoding('utf8');
            let buffer = '';
            let receivedText = false;
            for await (const chunk of response) {
                if (controller.signal.aborted) return;
                buffer += chunk;
                if (buffer.length > 2_000_000) throw new Error('ChatGPT returned an oversized stream event.');
                let boundary: RegExpExecArray | null;
                while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
                    const frame = buffer.slice(0, boundary.index);
                    buffer = buffer.slice(boundary.index + boundary[0].length);
                    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
                    if (!data || data === '[DONE]') continue;
                    let event: any;
                    try { event = JSON.parse(data); }
                    catch { throw new Error('ChatGPT returned an invalid stream event.'); }
                    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
                        receivedText ||= !!event.delta;
                        yield event.delta;
                        if (controller.signal.aborted) return;
                    } else if (event.type === 'response.completed') {
                        if (!receivedText) throw new Error('ChatGPT returned an empty response. Try another model.');
                        return;
                    } else if (event.type === 'response.failed' || event.type === 'error') {
                        throw new Error('ChatGPT could not complete the response. Check your connection and plan usage, then try again.');
                    } else if (event.type === 'response.incomplete') {
                        throw new Error('ChatGPT stopped before completing the response. Please try again.');
                    }
                }
            }
            if (!controller.signal.aborted) throw new Error('ChatGPT disconnected before completing the response. Please try again.');
        } catch (error) {
            if (!controller.signal.aborted) throw error;
        } finally {
            response?.destroy();
            signal.removeEventListener('abort', abort);
            this.active.delete(controller);
        }
    }

    dispose(): void {
        this.active.forEach(controller => controller.abort());
        this.active.clear();
        this.auth.dispose();
    }
}
