import { ChatCompletionOptions, ModelSortOption, OpenRouterService } from './OpenRouterService';
import { ChatGptService } from './ChatGptService';
import { CHATGPT_MODEL_PREFIX, CompletionProvider, isChatGptModel, ProviderModel } from './ModelProvider';
import { ChatMessage, PluginSettings } from './types';

export class ProviderService implements CompletionProvider {
    constructor(private openRouter: OpenRouterService, private chatGpt: ChatGptService, private settings: () => PluginSettings) {}

    async fetchModels(forceRefresh = false): Promise<{ models: ProviderModel[]; errors: string[] }> {
        const settings = this.settings();
        const results = await Promise.allSettled([
            settings.chatGptEnabled ? this.chatGpt.fetchModels() : Promise.resolve([]),
            settings.apiKey ? this.openRouter.fetchModels(settings.apiKey, forceRefresh).then(models =>
                this.openRouter.getFormattedModels(this.openRouter.sortModels(models, settings.modelSortOrder as ModelSortOption))
                    .map(model => ({ ...model, provider: 'openrouter' as const }))) : Promise.resolve([]),
        ]);
        const models: ProviderModel[] = [];
        const errors: string[] = [];
        results.forEach(result => {
            if (result.status === 'fulfilled') models.push(...result.value);
            else errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
        });
        return { models, errors };
    }

    getModelReasoningInfo(model: string) {
        return isChatGptModel(model) ? undefined : this.openRouter.getModelReasoningInfo(model);
    }

    async *streamChatCompletion(messages: ChatMessage[], settings: PluginSettings, signal: AbortSignal): AsyncGenerator<string> {
        if (isChatGptModel(settings.defaultModel)) {
            if (!settings.chatGptEnabled) throw new Error('Enable and connect ChatGPT in plugin settings.');
            yield* this.chatGpt.streamChatCompletion(messages, settings.defaultModel.slice(CHATGPT_MODEL_PREFIX.length), signal);
        } else {
            yield* this.openRouter.streamChatCompletion(messages, settings, signal);
        }
    }

    async getChatCompletion(apiKey: string, model: string, messages: ChatMessage[], options?: ChatCompletionOptions): Promise<string> {
        if (!isChatGptModel(model)) return this.openRouter.getChatCompletion(apiKey, model, messages, options);
        if (!this.settings().chatGptEnabled) throw new Error('Enable and connect ChatGPT in plugin settings.');
        let result = '';
        for await (const chunk of this.chatGpt.streamChatCompletion(messages, model.slice(CHATGPT_MODEL_PREFIX.length), new AbortController().signal, options?.reasoning?.effort)) {
            result += chunk;
        }
        return result;
    }
}
