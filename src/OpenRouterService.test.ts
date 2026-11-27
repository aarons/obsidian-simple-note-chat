import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', () => ({ requestUrl: vi.fn() }));
import { requestUrl } from 'obsidian';
import { OpenRouterService } from './OpenRouterService';
import { ChatMessage, ChatOutput, DEFAULT_SETTINGS } from './types';

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function collect(stream: AsyncGenerator<ChatOutput>) {
    const chunks: ChatOutput[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
}

function fixture(outputs: string[] = ['image']) {
    const model = { id: 'test/image', name: 'Image model', description: '', pricing: { prompt: '0', completion: '0' },
        endpoints: undefined as string[] | undefined,
        architecture: { output_modalities: outputs, input_modalities: undefined as string[] | undefined, tokenizer: undefined as string | undefined } };
    vi.mocked(requestUrl).mockResolvedValue({ status: 200, json: { data: [model] } } as any);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=', media_type: 'image/webp' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new OpenRouterService();
    const controller = new AbortController();
    const settings = { ...DEFAULT_SETTINGS, apiKey: 'test-key', defaultModel: model.id };
    const messages: ChatMessage[] = [{ role: 'user', content: 'Draw a cat' }];
    const run = () => collect(service.streamChatCompletion(messages, settings, controller.signal));
    return { model, fetchMock, service, controller, settings, messages, run };
}

describe('OpenRouter image generation', () => {
    it('discovers image-only models and routes them to the synchronous image API', async () => {
        const f = fixture();
        expect(await f.run()).toEqual([{ type: 'image', url: 'data:image/webp;base64,aW1hZ2U=' }]);
        expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://openrouter.ai/api/v1/models?output_modalities=all' }));
        expect(f.fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/images', expect.objectContaining({
            signal: f.controller.signal,
            body: JSON.stringify({ model: 'test/image', prompt: 'Draw a cat', response_format: 'b64_json' }),
        }));
        expect(f.service.getFormattedModels([f.model])[0]).toMatchObject({ isImageModel: true, displayName: 'Image model | free in | free out 🎨' });
        const referenceModel = { ...f.model, architecture: { ...f.model.architecture, input_modalities: ['text', 'image'] } };
        expect(f.service.getFormattedModels([referenceModel])[0].displayName).toBe('Image model | free in | free out 🎨 📎');
        expect(f.service.getFormattedModels([{ ...referenceModel, id: 'test/image:free' }])[0].displayName).toBe('Image model | free | free 🎨 📎');
    });

    it('requests text and images for chat models and preserves image order', async () => {
        const f = fixture(['text', 'image']);
        f.fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: {
            content: 'Two cats', images: [
                { image_url: { url: 'data:image/png;base64,YQ==' } },
                { image_url: { url: 'https://example.com/cat.png' } },
            ],
        } }] })));
        expect(await f.run()).toEqual(['Two cats', { type: 'image', url: 'data:image/png;base64,YQ==' }, { type: 'image', url: 'https://example.com/cat.png' }]);
        expect(f.fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.objectContaining({
            body: JSON.stringify({ model: 'test/image', messages: f.messages, modalities: ['text', 'image'], stream: false }),
        }));
    });

    it('sends ordered image references alongside the edit prompt to the dedicated images endpoint', async () => {
        const f = fixture();
        const first = 'data:image/png;base64,iVBORw0KGgo=';
        const second = 'data:image/jpeg;base64,/9j/';
        f.model.architecture.input_modalities = ['text', 'image'];
        f.messages.push({ role: 'assistant', content: '![[cat.png]]', images: [first] },
            { role: 'user', content: 'Use this background ![[scene.jpg]] with the same cat.', images: [second, first] });
        await f.run();
        expect(f.fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/images', expect.objectContaining({
            body: JSON.stringify({ model: f.model.id,
                prompt: f.messages.map(m => `${m.role}: ${m.content}`).join('\n\n'),
                input_references: [first, second].map(url => ({ type: 'image_url', image_url: { url } })),
                response_format: 'b64_json' }),
        }));
    });

    it.each([false, true])('sends prior generated images and new embeds as user inputs (image output: %s)', async imageOutput => {
        const f = fixture(imageOutput ? ['text', 'image'] : ['text']);
        const original = 'data:image/png;base64,iVBORw0KGgo=';
        const detail = 'data:image/jpeg;base64,/9j/';
        f.messages.push({ role: 'assistant', content: 'Result ![[cat.png]]', images: [original] },
            { role: 'user', content: 'Change the face to match ![[detail.jpg]]', images: [detail] });
        const output = imageOutput ? JSON.stringify({ choices: [{ message: { content: 'Edited' } }] })
            : 'data: {"choices":[{"delta":{"content":"A cat"}}]}\n\ndata: [DONE]\n\n';
        f.fetchMock.mockResolvedValue(new Response(output));
        await f.run();
        const [url, init] = f.fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
        expect(JSON.parse(String(init.body)).messages).toEqual([
            f.messages[0], { role: 'assistant', content: 'Result ![[cat.png]]' },
            { role: 'user', content: [{ type: 'text', text: f.messages[2].content },
                { type: 'image_url', image_url: { url: original } }, { type: 'image_url', image_url: { url: detail } }] },
        ]);
    });

    it('stops before generating when the chosen image model accepts only text input', async () => {
        const f = fixture();
        f.model.architecture.input_modalities = ['text'];
        f.messages[0].images = ['data:image/png;base64,iVBORw0KGgo='];
        await expect(f.run()).rejects.toThrow('does not accept reference images');
        expect(f.fetchMock).not.toHaveBeenCalled();
    });

    it('continues streaming text-only models without image modalities', async () => {
        const f = fixture(['text']);
        f.fetchMock.mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n'));
        expect(await f.run()).toEqual(['Hello']);
        expect(f.fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.objectContaining({
            body: JSON.stringify({ model: 'test/image', messages: f.messages, stream: true }),
        }));
    });

    it('keeps automatic routers in text chat mode despite aggregate image capabilities', async () => {
        const f = fixture(['text', 'image']);
        f.model.architecture.tokenizer = 'Router';
        f.fetchMock.mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n'));
        expect(await f.run()).toEqual(['Hello']);
        expect(f.service.getFormattedModels([f.model])[0]).toMatchObject({ isImageModel: false, displayName: 'Image model | free in | free out' });
    });

    it('uses advertised endpoints when a text-and-image model only serves images', async () => {
        const f = fixture(['text', 'image']);
        f.model.endpoints = ['/api/v1/images'];
        await f.run();
        expect(f.fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/images', expect.any(Object));
    });

    it('supports image-only chat endpoints with image-only modalities', async () => {
        const f = fixture();
        f.model.endpoints = ['/api/v1/chat/completions'];
        f.fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,YQ==' } }] } }] })));
        await f.run();
        expect(f.fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.objectContaining({
            body: JSON.stringify({ model: 'test/image', messages: f.messages, modalities: ['image'], stream: false }),
        }));
    });

    it.each([
        { status: 402, data: { error: { message: 'Insufficient credits' } }, message: 'Insufficient credits' },
        { status: 200, data: { error: { message: 'Generation failed' } }, message: 'Generation failed' },
        { status: 200, data: { data: [] }, message: 'no image or text' },
        { status: 200, data: { data: [{}] }, message: 'without image data' },
    ])('surfaces provider failure: $message', async ({ status, data, message }) => {
        const f = fixture();
        f.fetchMock.mockResolvedValue(new Response(JSON.stringify(data), { status }));
        await expect(f.run()).rejects.toThrow(message);
    });

    it('does not yield or request generation when cancelled during discovery', async () => {
        const f = fixture();
        vi.mocked(requestUrl).mockImplementation(() => {
            f.controller.abort();
            return Promise.resolve({ status: 200, json: { data: [f.model] } }) as ReturnType<typeof requestUrl>;
        });
        expect(await f.run()).toEqual([]);
        expect(f.fetchMock).not.toHaveBeenCalled();
    });

    it('stops yielding images after cancellation', async () => {
        const f = fixture();
        f.fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: 'YQ==' }, { b64_json: 'Yg==' }] })));
        const stream = f.service.streamChatCompletion(f.messages, f.settings, f.controller.signal);
        expect((await stream.next()).value).toEqual({ type: 'image', url: 'data:application/octet-stream;base64,YQ==' });
        f.controller.abort();
        expect((await stream.next()).done).toBe(true);
    });

    it('rejects known image-only models for titles without requesting a generation', async () => {
        const f = fixture();
        await f.service.fetchModels('test-key');
        await expect(f.service.getChatCompletion('test-key', 'test/image', f.messages)).rejects.toThrow('Select a text model');
        expect(f.fetchMock).not.toHaveBeenCalled();
    });
});
