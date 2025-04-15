// src/OpenRouterService.ts
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
     * Fetches models from the OpenRouter API.
     * @param apiKey The OpenRouter API key.
     * @returns A promise that resolves to an array of models or an empty array in case of error.
     */
    async fetchModels(apiKey: string): Promise<OpenRouterModel[]> {
        if (!apiKey) {
            log.warn('OpenRouter API key is missing.');
            return []; // Don't show notice, just return empty
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
                    return data.data as OpenRouterModel[];
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

                let readResult: ReadableStreamReadResult<string>;
                try {
                    readResult = await reader.read();
                    done = readResult.done;
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
                                console.log('OpenRouterService: Received [DONE] signal.');
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
        // Validate settings before proceeding
        if (!apiKey) {
            log.error('OpenRouterService: API key is missing for getChatCompletion.');
            new Notice('OpenRouter API key is not set. Please configure it in the plugin settings.');
            return null;
        }
        if (!model) {
             log.error('OpenRouterService: Model is missing for getChatCompletion.');
             // This case might indicate a programming error if model isn't passed correctly
             new Notice('Error: No model specified for chat completion.');
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
                throw: false, // Prevent requestUrl from throwing on non-200 status
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
                    const errorJson = response.json; // Try parsing error JSON
                    errorMessage += ` ${errorJson?.error?.message || response.text || ''}`;
                 } catch {
                    errorMessage += ` ${response.text || 'Could not read error body.'}`;
                 }
                new Notice(errorMessage.substring(0, 200)); // Limit notice length
                return null;
            }
        } catch (error) {
            log.error('OpenRouterService: Network or other error during non-stream completion:', error);
            new Notice('Error connecting to OpenRouter for title generation. Check network or API.');
            return null;
        }
    }
}
