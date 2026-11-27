import { describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', () => ({ requestUrl: vi.fn(), Platform: { isDesktopApp: true } }));
import { ProviderService } from './ProviderService';
import { OpenRouterService } from './OpenRouterService';
import { ChatOutput, DEFAULT_SETTINGS } from './types';
import { isModelConfigured, populateModelOptions } from './ModelProvider';

async function collect(stream: AsyncGenerator<ChatOutput>): Promise<string> {
    let output = '';
    for await (const chunk of stream) output += chunk;
    return output;
}

function fixture(overrides = {}) {
    const settings = { ...DEFAULT_SETTINGS, ...overrides };
    const openRouter = new OpenRouterService();
    const routerModels = vi.spyOn(openRouter, 'fetchModels').mockResolvedValue([
        { id: 'openai/example', name: 'Example', description: '', pricing: { prompt: '0.1', completion: '0.2' } },
    ]);
    const routerStream = vi.spyOn(openRouter, 'streamChatCompletion').mockImplementation(async function* () { yield 'router'; });
    const routerCompletion = vi.spyOn(openRouter, 'getChatCompletion').mockResolvedValue('router title');
    const chatGpt = {
        fetchModels: vi.fn().mockResolvedValue([{ id: 'chatgpt/example', displayName: 'Example | subscription usage', provider: 'chatgpt' }]),
        streamChatCompletion: vi.fn().mockImplementation(async function* () { yield 'subscription'; }),
    };
    return { settings, chatGpt, routerModels, routerStream, routerCompletion, service: new ProviderService(openRouter, chatGpt as any, () => settings) };
}

describe('provider selection', () => {
    it.each(['prompt_price_desc', 'alphabetical'])('puts subscription models first with %s sorting', async modelSortOrder => {
        const { service } = fixture({ chatGptEnabled: true, apiKey: 'test', modelSortOrder });
        expect((await service.fetchModels()).models.map(model => model.provider)).toEqual(['chatgpt', 'openrouter']);
    });

    it('supports either provider alone and preserves the working list if the other fails', async () => {
        const { service, settings, chatGpt, routerModels } = fixture({ chatGptEnabled: true });
        expect((await service.fetchModels()).models).toHaveLength(1);
        expect(routerModels).not.toHaveBeenCalled();
        settings.apiKey = 'test';
        chatGpt.fetchModels.mockRejectedValue(new Error('Please sign in'));
        expect(await service.fetchModels()).toMatchObject({ models: [{ provider: 'openrouter' }], errors: ['Please sign in'] });
        chatGpt.fetchModels.mockClear();
        settings.chatGptEnabled = false;
        await service.fetchModels();
        expect(chatGpt.fetchModels).not.toHaveBeenCalled();
    });

    it('routes chat and titles by model ID without falling back to a billed provider', async () => {
        const { service, settings, chatGpt, routerStream, routerCompletion } = fixture({ chatGptEnabled: true, defaultModel: 'chatgpt/example' });
        const messages = [{ role: 'user' as const, content: 'hello' }];
        const signal = new AbortController().signal;
        expect(await collect(service.streamChatCompletion(messages, settings, signal))).toBe('subscription');
        expect(chatGpt.streamChatCompletion).toHaveBeenCalledWith(messages, 'example', signal);
        expect(await service.getChatCompletion('', 'chatgpt/example', messages)).toBe('subscription');
        expect(routerStream).not.toHaveBeenCalled();
        expect(routerCompletion).not.toHaveBeenCalled();
        settings.chatGptEnabled = false;
        await expect(collect(service.streamChatCompletion(messages, settings, signal))).rejects.toThrow('Enable and connect');
        expect(await service.getChatCompletion('key', 'openai/example', messages)).toBe('router title');
        settings.defaultModel = 'openai/example';
        expect(await collect(service.streamChatCompletion(messages, settings, signal))).toBe('router');
    });

    it('allows title generation for a subscription-only setup', () => {
        expect(isModelConfigured('chatgpt/example', { ...DEFAULT_SETTINGS, chatGptEnabled: true })).toBe(true);
        expect(isModelConfigured('openai/example', DEFAULT_SETTINGS)).toBe(false);
    });
});

// Minimal DOM surface used by the native select/optgroup helper.
class Element {
    children: Element[] = [];
    value = '';
    textContent = '';
    label = '';
    constructor(public tag: string) {}
    ownerDocument = { createElement: (tag: string) => new Element(tag) };
    replaceChildren() { this.children = []; }
    appendChild(child: Element) { this.children.push(child); }
}

it('groups models in all pickers and retains unavailable selections without switching providers', () => {
    const select = new Element('select');
    populateModelOptions(select as any, [
        { id: 'test/image-z', displayName: 'Z image 🎨', provider: 'openrouter', isImageModel: true },
        { id: 'openai/example', displayName: 'Example API', provider: 'openrouter' },
        { id: 'test/image-a', displayName: 'A image 🎨 📎', provider: 'openrouter', isImageModel: true },
        { id: 'chatgpt/example', displayName: 'Example subscription', provider: 'chatgpt' },
    ], 'chatgpt/old-model', 'Choose a model');
    const groups = select.children.filter(child => child.tag === 'optgroup');
    expect(groups.map(child => child.label)).toEqual(['ChatGPT subscription · Using ChatGPT plan', 'OpenRouter', 'OpenRouter · Image models']);
    expect(groups[1].children.map(child => child.value)).toEqual(['openai/example']);
    expect(groups[2].children.map(child => child.value)).toEqual(['test/image-z', 'test/image-a']);
    expect(select.value).toBe('chatgpt/old-model');
    expect(select.children[4].textContent).toContain('unavailable');
});
