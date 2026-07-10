// src/OpenRouterService.ts
import { requestUrl } from 'obsidian';
import { OPENROUTER_API_URL } from './constants';
import { PluginSettings, ChatMessage, ReasoningEffort } from './types';
import { log } from './utils/logger';

/**
 * Per-model reasoning capabilities reported by GET /models.
 * Absent for non-reasoning models and dynamic router models (e.g. openrouter/auto).
 */
export interface ModelReasoningInfo {
    supported_efforts?: string[] | null; // null = all gateway effort values accepted
    default_effort?: string;
    default_enabled?: boolean;
    supports_max_tokens?: boolean;
    mandatory?: boolean; // true = the model rejects effort "none"
}

export interface OpenRouterModel {
    id: string;
    name: string;
    description: string;
    pricing: {
        prompt: string;
        completion: string;
        request?: string; // Optional, based on OpenRouter API docs
        image?: string;   // Optional
    };
    context_length?: number; // Optional
    architecture?: { // Optional
        modality: string;
        tokenizer: string;
        instruct_type: string | null;
    };
    top_provider?: { // Optional
        max_completion_tokens: number | null;
        is_moderated: boolean;
    };
    per_request_limits?: { // Optional
        prompt_tokens: string;
        completion_tokens: string;
    } | null;
    reasoning?: ModelReasoningInfo; // Optional
}

/**
 * Options for non-streaming chat completions.
 */
export interface ChatCompletionOptions {
    /** Cap on total completion tokens (reasoning + content). */
    maxTokens?: number;
    /** OpenRouter unified reasoning config. Send effort OR max_tokens, not both. */
    reasoning?: {
        effort?: ReasoningEffort;
        exclude?: boolean;
    };
}

/**
 * Error from a failed chat completion request, carrying the HTTP status
 * so callers can distinguish client errors (4xx) from other failures.
 */
export class ChatCompletionError extends Error {
    constructor(message: string, public readonly status?: number) {
        super(message);
        this.name = 'ChatCompletionError';
    }
}

/**
 * Defines the available sorting options for models.
 */
export enum ModelSortOption {
    ALPHABETICAL = 'alphabetical',
    PROMPT_PRICE_ASC = 'prompt_price_asc',
    PROMPT_PRICE_DESC = 'prompt_price_desc',
    COMPLETION_PRICE_ASC = 'completion_price_asc',
    COMPLETION_PRICE_DESC = 'completion_price_desc'
}

/**
 * Represents the formatted information for a model, suitable for display.
 */
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
        if (price === undefined || price === null) return '?'; // Indicate unknown price

        const numPrice = typeof price === 'string' ? parseFloat(price) : NaN;

        if (isNaN(numPrice)) return '?'; // Indicate invalid price string
        if (numPrice === 0) return 'free';

        const pricePerMillion = numPrice * 1000000;

        let formattedPrice: string;
        // Format based on magnitude
        if (pricePerMillion < 0.01) {
            formattedPrice = '<0.01';
        } else if (pricePerMillion < 10) {
            // Use toFixed(2) for prices like $1.50, $0.15 etc.
            formattedPrice = pricePerMillion.toFixed(2);
        } else if (pricePerMillion < 100) {
            // Use toFixed(1) for prices like $15.5, $99.9
            formattedPrice = pricePerMillion.toFixed(1);
        } else {
            // Round for prices >= $100
            formattedPrice = Math.round(pricePerMillion).toString();
        }

        // Remove trailing zeros after decimal point if they are redundant (e.g., "1.50" -> "1.5", "2.00" -> "2")
        // But keep ".0" if it resulted from toFixed(1) e.g. 15.0
        if (formattedPrice.includes('.')) {
             formattedPrice = formattedPrice.replace(/(\.\d*?)0+$/, '$1'); // Remove trailing zeros
             formattedPrice = formattedPrice.replace(/\.$/, ''); // Remove trailing decimal point if it exists (e.g. "2.")
        }


        return `$${formattedPrice}`;
    }

    /**
     * Checks if the model cache is valid.
     * @returns true if models are cached and the cache hasn't expired.
     */
    private isCacheValid(): boolean {
        return this.availableModels.length > 0 &&
               (Date.now() - this.modelsLastFetched) < this.cacheValidityDuration;
    }

    /**
     * Fetches models from the OpenRouter API or returns cached models if available.
     * @param apiKey The OpenRouter API key.
     * @param forceRefresh Whether to force a refresh from the API instead of using cache.
     * @returns A promise that resolves to an array of models.
     * @throws Error if the API key is missing, the request fails, or the response is malformed.
     */
    async fetchModels(apiKey: string, forceRefresh: boolean = false): Promise<OpenRouterModel[]> {
        // Return cached models if available and cache is still valid
        if (!forceRefresh && this.isCacheValid()) {
            log.debug('OpenRouterService: Using cached models');
            return this.availableModels;
        }

        if (!apiKey) {
            throw new Error('OpenRouter API key is not set.');
        }

        let response;
        try {
            response = await requestUrl({
                url: `${OPENROUTER_API_URL}/models`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                },
                throw: false, // Prevent requestUrl from throwing on non-200 status
            });
        } catch (error) {
            log.error('Network or other error fetching models from OpenRouter:', error);
            throw new Error('Error connecting to OpenRouter. Check your network connection.');
        }

        if (response.status !== 200) {
            log.error(`Error fetching models from OpenRouter: ${response.status}`, response.text);
            let errorMessage = `Failed to fetch models from OpenRouter. Status: ${response.status}.`;
            if (response.status === 401) {
                errorMessage += ' Please check your API key.';
            }
            throw new Error(errorMessage);
        }

        const data = response.json;
        if (!data || !Array.isArray(data.data)) {
            log.error('Unexpected response structure from OpenRouter API:', data);
            throw new Error('Failed to parse model list from OpenRouter. Unexpected format.');
        }

        // Update the cache
        this.availableModels = data.data as OpenRouterModel[];
        this.modelsLastFetched = Date.now();
        log.debug(`Model cache updated at: ${this.modelsLastFetched}`)
        return this.availableModels;
    }

    /**
     * Looks up a model's reasoning capabilities from the cached model list.
     * @param modelId The model ID to look up.
     * @returns The model's reasoning info, or undefined if the model isn't cached
     *          or doesn't report reasoning support (treat as unknown/not applicable).
     */
    getModelReasoningInfo(modelId: string): ModelReasoningInfo | undefined {
        return this.availableModels.find(model => model.id === modelId)?.reasoning;
    }

    /**
     * Sorts an array of models based on specified criteria.
     * @param models The array of models to sort.
     * @param sortCriteria The sorting criteria ('alphabetical', 'prompt_price_asc', 'prompt_price_desc',
     * @param sortCriteria The sorting criteria enum value. Defaults to `ModelSortOption.ALPHABETICAL`.
     * @returns The sorted array of models.
     */
    sortModels(models: OpenRouterModel[], sortCriteria: ModelSortOption = ModelSortOption.ALPHABETICAL): OpenRouterModel[] {
        const modelsToSort = [...models];

        // Helper to get a consistent name for sorting
        const getModelName = (model: OpenRouterModel): string =>
            model.name?.toLowerCase() ?? model.id?.toLowerCase() ?? '';

        // Helper to parse price, handling 0, null/undefined, and invalid strings
        const parsePrice = (price: string | undefined | null): number => {
            if (price === undefined || price === null) return Infinity;
            const numPrice = parseFloat(price);
            // Treat NaN or negative prices (shouldn't happen) as Infinity for sorting
            return isNaN(numPrice) || numPrice < 0 ? Infinity : numPrice;
        };

        modelsToSort.sort((a, b) => {
            const nameA = getModelName(a);
            const nameB = getModelName(b);
            let comparison = 0;

            // Primary sort based on criteria
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

            // Secondary sort: if primary comparison is equal, sort alphabetically
            if (comparison === 0 && sortCriteria !== ModelSortOption.ALPHABETICAL) {
                comparison = nameA.localeCompare(nameB);
            }

            return comparison;
        });

        return modelsToSort;
    }

    /**
     * Formats a list of OpenRouter models for display purposes.
     * @param models The array of models fetched from the API.
     * @returns An array of FormattedModelInfo objects.
     */
    getFormattedModels(models: OpenRouterModel[]): FormattedModelInfo[] {
        return models.map(model => {
            const modelName = model.name || model.id; // Fallback to ID if name is missing

            // Handle special cases like free models or auto-routing
            if (model.id === 'openrouter/auto') {
                return {
                    id: model.id,
                    displayName: `${modelName} | variable pricing`
                };
            }

            // Check if pricing info exists and format it
            const promptPriceStr = this.formatPricePerMillion(model.pricing?.prompt);
            const completionPriceStr = this.formatPricePerMillion(model.pricing?.completion);

            // Construct the display name
            // Use 'free' explicitly if the ID indicates it, otherwise use formatted prices
            if (model.id.includes(':free')) {
                 // Use the name but indicate free pricing clearly
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

        // Validate settings before proceeding
        if (!apiKey) {
            log.error('OpenRouterService: API key is missing.');
            throw new Error("OpenRouter API key is not set");
        }

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
                    // Ensure the reader is cancelled if we break early
                    await reader.cancel('Aborted by signal');
                    // Throwing here ensures the calling ChatService knows it was aborted
                    throw new DOMException(signal.reason || 'Chat cancelled', 'AbortError');
                 }

                let readResult; // Allow TypeScript to infer the type from the assignment below
                try {
                    readResult = await reader.read();
                    done = readResult.done;
                    // log.debug('OpenRouterService: Raw stream chunk received:', readResult.value);
                } catch (readError: any) {
                     // Catch errors during reader.read() itself
                     log.error('OpenRouterService: Error reading stream chunk:', readError);
                     // Check if it's an abort error triggered by reader.cancel()
                     if (readError.name === 'AbortError') {
                         // Already handled by the signal check or cancellation logic
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
                                // Optionally yield an error marker or throw? For now, just log.
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
     * @param options Optional completion cap and reasoning configuration.
     * @returns A promise that resolves to the completion content string.
     * @throws ChatCompletionError (with HTTP status) if the request fails;
     *         Error if the API key is missing or the response has no content.
     */
    async getChatCompletion(
        apiKey: string,
        model: string,
        messages: ChatMessage[],
        options?: ChatCompletionOptions
    ): Promise<string> {
        if (!apiKey) {
            throw new Error('OpenRouter API key is not set. Please configure it in the plugin settings.');
        }

        const requestBody: any = {
            model: model,
            messages: messages,
            stream: false,
        };

        if (options?.maxTokens !== undefined && options.maxTokens > 0) {
            requestBody.max_tokens = options.maxTokens;
        }
        if (options?.reasoning) {
            requestBody.reasoning = options.reasoning;
        }

        log.debug('OpenRouterService: Sending non-stream request:', JSON.stringify(requestBody, null, 2));

        let response;
        try {
            response = await requestUrl({
                url: `${OPENROUTER_API_URL}/chat/completions`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                throw: false, // Prevent requestUrl from throwing on non-200 status
            });
        } catch (error) {
            log.error('OpenRouterService: Network or other error during non-stream completion:', error);
            throw new Error('Error connecting to OpenRouter. Check your network connection.');
        }

        log.debug('OpenRouterService: Non-stream response status:', response.status);

        if (response.status !== 200) {
            log.error(`OpenRouterService: Error fetching non-stream completion: ${response.status}`, response.text);
            let errorMessage = `LLM request failed. Status: ${response.status}.`;
            try {
                const errorJson = response.json; // Try parsing error JSON
                errorMessage += ` ${errorJson?.error?.message || response.text || ''}`;
            } catch {
                errorMessage += ` ${response.text || 'Could not read error body.'}`;
            }
            throw new ChatCompletionError(errorMessage, response.status);
        }

        const data = response.json;
        const choice = data?.choices?.[0];
        const content = choice?.message?.content;

        if (!content) {
            // finish_reason is the key diagnostic here: "length" means the token cap
            // starved the content (e.g. reasoning consumed the whole budget).
            const finishReason = choice?.finish_reason ?? 'unknown';
            const nativeFinishReason = choice?.native_finish_reason ?? 'unknown';
            log.error(`OpenRouterService: No content in non-stream response. finish_reason: ${finishReason}, native_finish_reason: ${nativeFinishReason}`, data);
            if (finishReason === 'length') {
                throw new Error('Model ran out of tokens before answering (finish_reason: length). Try raising the reasoning token limit or lowering the reasoning effort.');
            }
            throw new Error(`LLM returned no content (finish_reason: ${finishReason}).`);
        }

        log.debug('OpenRouterService: Received non-stream completion.');
        log.debug('OpenRouterService: Content:', content);
        return content.trim();
    }
}
