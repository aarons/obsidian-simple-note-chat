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
    isImageModel?: boolean;
}

/** Preserve provider sorting within sections, with favorites appearing only at the top. */
export function getModelSections(models: ProviderModel[], favoriteModels: string[] = []) {
    const favorites = new Set(favoriteModels);
    const remaining = models.filter(model => !favorites.has(model.id));
    return [
        { label: 'Favorites', entries: models.filter(model => favorites.has(model.id)) },
        { label: 'ChatGPT subscription · Using ChatGPT plan', entries: remaining.filter(model => model.provider === 'chatgpt') },
        { label: 'OpenRouter', entries: remaining.filter(model => model.provider === 'openrouter' && !model.isImageModel) },
        { label: 'OpenRouter · Image models', entries: remaining.filter(model => model.provider === 'openrouter' && model.isImageModel) },
    ].filter(section => section.entries.length > 0);
}

/** Use the same sections in native dropdowns and the change-model picker. */
export function populateModelOptions(select: HTMLSelectElement, models: ProviderModel[], selected: string, placeholder: string, favoriteModels: string[] = []): void {
    select.replaceChildren();
    const doc = select.ownerDocument;
    const addOption = (parent: HTMLElement, id: string, label: string) => {
        const option = doc.createElement('option');
        option.value = id;
        option.textContent = label;
        parent.appendChild(option);
    };
    addOption(select, '', placeholder);
    for (const { label, entries } of getModelSections(models, favoriteModels)) {
        const group = doc.createElement('optgroup');
        group.label = label;
        entries.forEach(model => addOption(group, model.id, model.displayName));
        select.appendChild(group);
    }
    // Preserve unavailable selections visibly without silently switching billing providers.
    if (selected && !models.some(model => model.id === selected)) {
        addOption(select, selected, `${selected} (unavailable — check connection)`);
    }
    select.value = selected;
}
