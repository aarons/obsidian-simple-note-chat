import { requestUrl, Notice } from 'obsidian';
import { OPENROUTER_API_URL } from './constants';
import { PluginSettings, ChatMessage } from './types';
import { log } from './utils/logger';
export interface OpenRouterModel {
    id: string;
    name: string;
    description: string;
    pricing: {
        prompt: string;
        completion: string;
        request?: string;
        image?: string;
    };
    context_length?: number;
    architecture?: {
        modality: string;
        tokenizer: string;
        instruct_type: string | null;
    };
    top_provider?: {
        max_completion_tokens: number | null;
        is_moderated: boolean;
    };
    per_request_limits?: {
        prompt_tokens: string;
        completion_tokens: string;
    } | null;
}

export enum ModelSortOption {
    ALPHABETICAL = 'alphabetical',
    PROMPT_PRICE_ASC = 'prompt_price_asc',
    PROMPT_PRICE_DESC = 'prompt_price_desc',
    COMPLETION_PRICE_ASC = 'completion_price_asc',
    COMPLETION_PRICE_DESC = 'completion_price_desc'
}

export interface FormattedModelInfo {
    id: string;
    displayName: string;
}


export class OpenRouterService {
    private availableModels: OpenRouterModel[] = [];
    private modelsLastFetched: number = 0;
    private cacheValidityDuration: number = 1000 * 60 * 60 * 24; // 24 hours in milliseconds
    /**
     * Formats a price string (representing price per token) into price per million tokens.
     * @param price The price string (e.g., "0.0000015") or undefined/null.
     * @returns A formatted string representing the price per million tokens (e.g., "$1.50", "free", "<$0.01").
     */
    private formatPricePerMillion(price: string | undefined | null): string {
        if (price === undefined || price === null) return '?';

        const numPrice = typeof price === 'string' ? parseFloat(price) : NaN;

        if (isNaN(numPrice)) return '?';
        if (numPrice === 0) return 'free';

        const pricePerMillion = numPrice * 1000000;

        let formattedPrice: string;
        if (pricePerMillion < 0.01) {
            formattedPrice = '<0.01';
        } else if (pricePerMillion < 10) {
            formattedPrice = pricePerMillion.toFixed(2);
        } else if (pricePerMillion < 100) {
            formattedPrice = pricePerMillion.toFixed(1);
        } else {
            formattedPrice = Math.round(pricePerMillion).toString();
        }

        // Clean up decimal formatting to remove redundant trailing zeros
        if (formattedPrice.includes('.')) {
             formattedPrice = formattedPrice.replace(/(\.\d*?)0+$/, '$1');
             formattedPrice = formattedPrice.replace(/\.$/, '');
        }


        return `$${formattedPrice}`;
    }

    isCacheValid(): boolean {
        return this.availableModels.length > 0 &&
               (Date.now() - this.modelsLastFetched) < this.cacheValidityDuration;
    }

    isRefreshNeeded(): boolean {
        return this.availableModels.length > 0 &&
               (Date.now() - this.modelsLastFetched) >= this.cacheValidityDuration;
    }

    /**
     * Performs a background refresh of the model cache if needed.
     * This method doesn't await the result and handles errors silently.
     * @param apiKey The OpenRouter API key.
     */
    backgroundRefreshIfNeeded(apiKey: string): void {
        if (!this.isRefreshNeeded() || !apiKey) {
            return;
        }

        log.debug('OpenRouterService: Starting background model refresh');

        this.fetchModels(apiKey, true)
            .then(models => {
                log.debug(`OpenRouterService: Background refresh completed, loaded ${models.length} models`);
            })
            .catch(error => {
                log.error('OpenRouterService: Background refresh failed:', error);
            });
    }

    async getCachedModels(apiKey: string): Promise<OpenRouterModel[]> {
        return this.fetchModels(apiKey, false);
    }

    async refreshModels(apiKey: string): Promise<OpenRouterModel[]> {
        return this.fetchModels(apiKey, true);
    }

    /**
     * Fetches models from the OpenRouter API or returns cached models if available.
     * @param apiKey The OpenRouter API key.
     * @param forceRefresh Whether to force a refresh from the API instead of using cache.
     * @returns A promise that resolves to an array of models or an empty array in case of error.
     */
    async fetchModels(apiKey: string, forceRefresh: boolean = false): Promise<OpenRouterModel[]> {
        if (!forceRefresh && this.isCacheValid()) {
            log.debug('OpenRouterService: Using cached models');
            return this.availableModels;
        }

        if (!apiKey) {
            log.warn('OpenRouter API key is missing.');
            return [];
        }

        try {
            const response = await requestUrl({
                url: `${OPENROUTER_API_URL}/models`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                },
            });

            if (response.status === 200) {
                const data = response.json;
                if (data && Array.isArray(data.data)) {
                    this.availableModels = data.data as OpenRouterModel[];
                    this.modelsLastFetched = Date.now();
                    log.debug(`Model cache updated at: ${this.modelsLastFetched}`)
                    return this.availableModels;
                } else {
                    log.error('Unexpected response structure from OpenRouter API:', data);
                    new Notice('Failed to parse model list from OpenRouter. Unexpected format.');
                    return [];
                }
            } else {
                log.error(`Error fetching models from OpenRouter: ${response.status}`, response.text);
                let errorMessage = `Failed to fetch models from OpenRouter. Status: ${response.status}.`;
                if (response.status === 401) {
                    errorMessage += ' Please check your API key.';
                }
                new Notice(errorMessage);
                return [];
            }
        } catch (error) {
            log.error('Network or other error fetching models from OpenRouter:', error);
            new Notice('Error connecting to OpenRouter. Check your network connection or the API endpoint.');
            return [];
        }
    }

    /**
     * Sorts an array of models based on specified criteria.
     * @param models The array of models to sort.
     * @param sortCriteria The sorting criteria enum value. Defaults to `ModelSortOption.ALPHABETICAL`.
     * @returns The sorted array of models.
     */
    sortModels(models: OpenRouterModel[], sortCriteria: ModelSortOption = ModelSortOption.ALPHABETICAL): OpenRouterModel[] {
        const modelsToSort = [...models];

        const getModelName = (model: OpenRouterModel): string =>
            model.name?.toLowerCase() ?? model.id?.toLowerCase() ?? '';

        const parsePrice = (price: string | undefined | null): number => {
            if (price === undefined || price === null) return Infinity;
            const numPrice = parseFloat(price);
            // Sort invalid/negative prices last
            return isNaN(numPrice) || numPrice < 0 ? Infinity : numPrice;
        };

        modelsToSort.sort((a, b) => {
            const nameA = getModelName(a);
            const nameB = getModelName(b);
            let comparison = 0;

            switch (sortCriteria) {
                case ModelSortOption.PROMPT_PRICE_ASC:
                case ModelSortOption.PROMPT_PRICE_DESC: {
                    const priceA = parsePrice(a.pricing?.prompt);
                    const priceB = parsePrice(b.pricing?.prompt);
                    comparison = priceA - priceB;
                    if (sortCriteria === ModelSortOption.PROMPT_PRICE_DESC) {
                        comparison *= -1;
                    }
                    break;
                }
                case ModelSortOption.COMPLETION_PRICE_ASC:
                case ModelSortOption.COMPLETION_PRICE_DESC: {
                    const priceA = parsePrice(a.pricing?.completion);
                    const priceB = parsePrice(b.pricing?.completion);
                    comparison = priceA - priceB;
                    if (sortCriteria === ModelSortOption.COMPLETION_PRICE_DESC) {
                        comparison *= -1;
                    }
                    break;
                }
                case ModelSortOption.ALPHABETICAL:
                default:
                    comparison = nameA.localeCompare(nameB);
                    break;
            }

            // Fallback to alphabetical sorting for ties
            if (comparison === 0 && sortCriteria !== ModelSortOption.ALPHABETICAL) {
                comparison = nameA.localeCompare(nameB);
            }

            return comparison;
        });

        return modelsToSort;
    }

    getFormattedModels(models: OpenRouterModel[]): FormattedModelInfo[] {
        return models.map(model => {
            const modelName = model.name || model.id;

            if (model.id === 'openrouter/auto') {
                return {
                    id: model.id,
                    displayName: `${modelName} | variable pricing`
                };
            }

            const promptPriceStr = this.formatPricePerMillion(model.pricing?.prompt);
            const completionPriceStr = this.formatPricePerMillion(model.pricing?.completion);

            if (model.id.includes(':free')) {
                 return {
                     id: model.id,
                     displayName: `${modelName} | free | free`
                 };
            } else {
                 return {
                     id: model.id,
                     displayName: `${modelName} | ${promptPriceStr} in | ${completionPriceStr} out`
                 };
            }
        });
    }


    /**
     * Performs a streaming chat completion request to the OpenRouter API.
     * @param messages The chat history messages.
     * @param settings Plugin settings containing API key and model.
     * @param signal AbortSignal to allow cancellation.
     * @returns An async generator yielding content chunks (strings).
     * @throws Error if the API request fails or the stream cannot be processed.
     */
    async * streamChatCompletion(
        messages: ChatMessage[],
        settings: PluginSettings,
        signal: AbortSignal
    ): AsyncGenerator<string> {
        const { apiKey, defaultModel } = settings;

        if (!apiKey) {
            log.error('OpenRouterService: API key is missing.');
            throw new Error("OpenRouter API key is not set");
        }

        this.backgroundRefreshIfNeeded(apiKey);
        if (!defaultModel) {
            log.error('OpenRouterService: Default model is not set.');
            throw new Error("Default model is not set");
        }

        const requestBody = {
            model: defaultModel,
            messages: messages,
            stream: true,
        };

        log.debug('OpenRouterService: Sending stream request:', JSON.stringify(requestBody, null, 2));

        let response: Response;
        try {
            response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal: signal,
            });

            log.debug('OpenRouterService: Response status:', response.status);

        } catch (error: any) {
             log.error('OpenRouterService: Fetch error:', error);
             if (error.name === 'AbortError') {
                 log.debug('OpenRouterService: Fetch aborted.');
                 return;
             }
             throw new Error(`Network error calling OpenRouter: ${error.message}`);
        }

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'Failed to read error body');
            log.error('OpenRouterService: API Error:', response.status, errorBody);
            let specificError = `API request failed with status ${response.status}`;
            try {
                const errorJson = JSON.parse(errorBody);
                specificError += `: ${errorJson.error?.message || errorBody}`;
            } catch {
                specificError += `: ${errorBody || response.statusText}`;
            }
            throw new Error(specificError);
        }

        if (!response.body) {
            throw new Error('Response body is null.');
        }

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        let done = false;

        try {
            while (!done) {
                 if (signal.aborted) {
                    log.debug('OpenRouterService: Abort signal detected during stream read.');
                    await reader.cancel('Aborted by signal');
                    throw new DOMException(signal.reason || 'Chat cancelled', 'AbortError');
                 }

                let readResult;
                try {
                    readResult = await reader.read();
                    done = readResult.done;
                } catch (readError: any) {
                     log.error('OpenRouterService: Error reading stream chunk:', readError);
                     if (readError.name === 'AbortError') {
                         return;
                     }
                     throw new Error(`Error reading stream: ${readError.message}`);
                }

                if (readResult.value) {
                    buffer += readResult.value;

                    let endOfMessageIndex;
                    while ((endOfMessageIndex = buffer.indexOf('\n\n')) >= 0) {
                        const message = buffer.substring(0, endOfMessageIndex);
                        buffer = buffer.substring(endOfMessageIndex + 2);

                        if (message.startsWith('data: ')) {
                            const dataContent = message.substring(6).trim();
                            if (dataContent === '[DONE]') {
                                log.info('OpenRouterService: Received [DONE] signal.');
                                continue;
                            }
                            try {
                                const jsonData = JSON.parse(dataContent);
                                const chunk = jsonData.choices?.[0]?.delta?.content;
                                if (chunk) {
                                    log.debug('OpenRouterService: Received chunk:', chunk);
                                    yield chunk;
                                }
                            } catch (e) {
                                log.error('OpenRouterService: Error parsing SSE JSON:', e, 'Data:', dataContent);

                            }
                        } else if (message.startsWith(':')) {
                             log.debug("OpenRouterService: Received SSE comment:", message);
                        } else if (message.trim()) {
                             log.warn("OpenRouterService: Received unexpected non-empty line:", message);
                        }
                    }
                }
            }
            log.debug('OpenRouterService: Stream finished.');

        } catch (error) {
             log.error("OpenRouterService: Error during stream processing loop:", error);
             throw error;
        } finally {
            if (!done) {
                 log.debug("OpenRouterService: Stream loop exited unexpectedly, ensuring reader cancellation.");
                 try {
                     await reader.cancel('Stream processing finished or errored.');
                 } catch (cancelError) {
                     log.warn("OpenRouterService: Error during final reader cancellation:", cancelError);
                 }
            }
             reader.releaseLock();
             log.debug("OpenRouterService: Stream reader lock released.");
        }
    }

    /**
     * Performs a non-streaming chat completion request to the OpenRouter API.
     * @param apiKey The OpenRouter API key.
     * @param model The model ID to use for completion.
     * @param messages The chat history messages.
     * @param maxTokens Optional maximum number of tokens for the completion.
     * @returns A promise that resolves to the completion content string or null in case of error.
     */
    async getChatCompletion(
        apiKey: string,
        model: string,
        messages: ChatMessage[],
        maxTokens?: number
    ): Promise<string | null> {
        if (!apiKey) {
            log.error('OpenRouterService: API key is missing for getChatCompletion.');
            new Notice('OpenRouter API key is not set. Please configure it in the plugin settings.');
            return null;
        }

        const requestBody: any = {
            model: model,
            messages: messages,
            stream: false,
        };

        if (maxTokens !== undefined && maxTokens > 0) {
            requestBody.max_tokens = maxTokens;
        }

        log.debug('OpenRouterService: Sending non-stream request:', JSON.stringify(requestBody, null, 2));

        try {
            const response = await requestUrl({
                url: `${OPENROUTER_API_URL}/chat/completions`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                throw: false,
            });

            log.debug('OpenRouterService: Non-stream response status:', response.status);

            if (response.status === 200) {
                const data = response.json;
                const content = data?.choices?.[0]?.message?.content;

                if (content) {
                    log.debug('OpenRouterService: Received non-stream completion.');
                    log.debug('OpenRouterService: Content:', content);
                    return content.trim();
                } else {
                    log.error('OpenRouterService: Could not extract content from non-stream response:', data);
                    new Notice('Failed to parse LLM response from OpenRouter.');
                    return null;
                }
            } else {
                log.error(`OpenRouterService: Error fetching non-stream completion: ${response.status}`, response.text);
                let errorMessage = `LLM request failed. Status: ${response.status}.`;
                 try {
                    const errorJson = response.json;
                    errorMessage += ` ${errorJson?.error?.message || response.text || ''}`;
                 } catch {
                    errorMessage += ` ${response.text || 'Could not read error body.'}`;
                 }
                new Notice(errorMessage.substring(0, 200));
                return null;
            }
        } catch (error) {
            log.error('OpenRouterService: Network or other error during non-stream completion:', error);
            new Notice('Error connecting to OpenRouter for title generation. Check network or API.');
            return null;
        }
    }
}
