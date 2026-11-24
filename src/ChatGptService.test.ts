import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', () => ({ Platform: { isDesktopApp: true } }));
vi.mock('./ChatGptHttp', () => ({ chatGptJson: vi.fn(), chatGptRequest: vi.fn() }));
import { ChatGptService } from './ChatGptService';
import { chatGptJson, chatGptRequest } from './ChatGptHttp';

function fixture() {
    const auth = { accessToken: vi.fn(async () => 'oauth-token'), dispose: vi.fn(), signOut: vi.fn() };
    const service = new ChatGptService(auth as any);
    const response = Object.assign(new PassThrough(), { statusCode: 200, headers: { 'content-type': 'text/event-stream' } });
    vi.mocked(chatGptRequest).mockResolvedValue(response as any);
    const event = (type: string, rest = {}) => `event: ${type}\r\ndata: ${JSON.stringify({ type, ...rest })}\r\n\r\n`;
    return { service, auth, response, event };
}
async function collect(stream: AsyncGenerator<string>) { let text = ''; for await (const chunk of stream) text += chunk; return text; }

describe('direct ChatGPT connection', () => {
    it('uses the subscription catalog schema, filters hidden models, and preserves provider order', async () => {
        const { service } = fixture();
        vi.mocked(chatGptJson).mockResolvedValue({ models: [
            { slug: 'z', display_name: 'Zeta', visibility: 'list' },
            { slug: 'hidden', display_name: 'Hidden', visibility: 'hidden' },
            { slug: 'a', display_name: 'Alpha', visibility: 'list' },
        ] });
        expect((await service.fetchModels()).map(model => model.id)).toEqual(['chatgpt/z', 'chatgpt/a']);
        expect(chatGptJson).toHaveBeenLastCalledWith('https://api.openai.com/v1/models', expect.objectContaining({ headers: { Authorization: 'Bearer oauth-token', Accept: 'application/json' } }));
    });

    it('streams fragmented SSE and sends native history with only supported parameters', async () => {
        const { service, response, event } = fixture();
        const messages = [{ role: 'user' as const, content: 'question' }, { role: 'assistant' as const, content: 'answer' }, { role: 'user' as const, content: 'follow-up' }];
        const wire = event('response.output_text.delta', { delta: 'Hello 🌎' }) + event('response.completed');
        const bytes = Buffer.from(wire);
        for (let i = 0; i < bytes.length; i += 3) response.write(bytes.subarray(i, i + 3));
        response.end();
        expect(await collect(service.streamChatCompletion(messages, 'example', new AbortController().signal, 'high'))).toBe('Hello 🌎');
        const [url, options] = vi.mocked(chatGptRequest).mock.calls[vi.mocked(chatGptRequest).mock.calls.length - 1];
        expect(url).toBe('https://api.openai.com/v1/responses');
        expect(JSON.parse(options!.body!)).toEqual({ model: 'example', input: messages, instructions: expect.any(String), stream: true, store: false });
        expect(response.destroyed).toBe(true);
    });

    it.each(['response.failed', 'error', 'response.incomplete', 'EOF', 'malformed'])('surfaces %s without treating partial output as success', async failure => {
        const { service, response, event } = fixture();
        response.write(event('response.output_text.delta', { delta: 'partial' }));
        response.end(failure === 'EOF' ? '' : failure === 'malformed' ? 'data: {bad}\n\n' : event(failure));
        await expect(collect(service.streamChatCompletion([], 'example', new AbortController().signal))).rejects.toThrow();
        expect(response.destroyed).toBe(true);
    });

    it('stops after cancellation while yielding buffered output', async () => {
        const { service, response, event } = fixture();
        response.end(event('response.output_text.delta', { delta: 'first' }) + event('response.output_text.delta', { delta: 'second' }));
        const controller = new AbortController();
        const stream = service.streamChatCompletion([], 'example', controller.signal);
        expect((await stream.next()).value).toBe('first');
        controller.abort();
        expect((await stream.next()).done).toBe(true);
        expect(response.destroyed).toBe(true);
    });

    it('does not start a request if disabled during credential loading', async () => {
        const { service, auth } = fixture();
        auth.accessToken.mockImplementation(async () => { service.dispose(); return 'token'; });
        vi.mocked(chatGptRequest).mockClear();
        expect(await collect(service.streamChatCompletion([], 'example', new AbortController().signal))).toBe('');
        expect(chatGptRequest).not.toHaveBeenCalled();
    });

    it('reports sharing limits without billing fallback', async () => {
        const { service, response } = fixture();
        response.statusCode = 429;
        await expect(collect(service.streamChatCompletion([], 'example', new AbortController().signal))).rejects.toThrow('sharing usage limit');
    });
});
