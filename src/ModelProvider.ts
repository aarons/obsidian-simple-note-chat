import { ChatMessage, ChatOutput, PluginSettings } from './types';
import { ChatCompletionOptions, ModelReasoningInfo } from './OpenRouterService';

export const CHATGPT_MODEL_PREFIX = 'chatgpt/';
export const isChatGptModel = (id: string): boolean => id.startsWith(CHATGPT_MODEL_PREFIX);
export const isModelConfigured = (id: string, settings: PluginSettings): boolean =>
    !!id && (isChatGptModel(id) ? settings.chatGptEnabled : !!settings.apiKey);

export interface CompletionProvider {
    streamChatCompletion(messages: ChatMessage[], settings: PluginSettings, signal: AbortSignal): AsyncGenerator<ChatOutput>;
    getChatCompletion(apiKey: string, model: string, messages: ChatMessage[], options?: ChatCompletionOptions): Promise<string>;
    getModelReasoningInfo(model: string): ModelReasoningInfo | undefined;
}

export interface ProviderModel {
    id: string;
    displayName: string;
    provider: 'chatgpt' | 'openrouter';
}

/** Use native optgroups everywhere, keeping the subscription section first. */
export function populateModelOptions(select: HTMLSelectElement, models: ProviderModel[], selected: string, placeholder: string): void {
    select.replaceChildren();
    const doc = select.ownerDocument;
    const addOption = (parent: HTMLElement, id: string, label: string) => {
        const option = doc.createElement('option');
        option.value = id;
        option.textContent = label;
        parent.appendChild(option);
    };
    addOption(select, '', placeholder);
    for (const provider of ['chatgpt', 'openrouter'] as const) {
        const entries = models.filter(model => model.provider === provider);
        if (!entries.length) continue;
        const group = doc.createElement('optgroup');
        group.label = provider === 'chatgpt' ? 'ChatGPT subscription · Using ChatGPT plan' : 'OpenRouter';
        entries.forEach(model => addOption(group, model.id, model.displayName));
        select.appendChild(group);
    }
    // Preserve unavailable selections visibly without silently switching billing providers.
    if (selected && !models.some(model => model.id === selected)) {
        addOption(select, selected, `${selected} (unavailable — check connection)`);
    }
    select.value = selected;
}
