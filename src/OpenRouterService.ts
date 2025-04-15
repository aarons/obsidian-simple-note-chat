// src/OpenRouterService.ts
import { requestUrl, Notice } from 'obsidian';
import { OPENROUTER_API_URL } from './constants';
import { PluginSettings, ChatMessage } from './types';
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


export class OpenRouterService {
    /**
     * Fetches models from the OpenRouter API.
     * @param apiKey The OpenRouter API key.
     * @returns A promise that resolves to an array of models or an empty array in case of error.
     */
    async fetchModels(apiKey: string): Promise<OpenRouterModel[]> {
        if (!apiKey) {
            console.warn('OpenRouter API key is missing.');
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
                    console.error('Unexpected response structure from OpenRouter API:', data);
                    new Notice('Failed to parse model list from OpenRouter. Unexpected format.');
                    return [];
                }
            } else {
                console.error(`Error fetching models from OpenRouter: ${response.status}`, response.text);
                let errorMessage = `Failed to fetch models from OpenRouter. Status: ${response.status}.`;
                if (response.status === 401) {
                    errorMessage += ' Please check your API key.';
                }
                new Notice(errorMessage);
                return [];
            }
        } catch (error) {
            console.error('Network or other error fetching models from OpenRouter:', error);
            new Notice('Error connecting to OpenRouter. Check your network connection or the API endpoint.');
            return [];
        }
    }

    /**
     * Sorts an array of models based on specified criteria.
     * @param models The array of models to sort.
     * @param sortCriteria The sorting criteria ('alphabetical', 'price_asc', 'price_desc'). Defaults to 'alphabetical'.
     * @returns The sorted array of models.
     */
    sortModels(models: OpenRouterModel[], sortCriteria: string = 'alphabetical'): OpenRouterModel[] {
        const modelsToSort = [...models];

        modelsToSort.sort((a, b) => {
            let comparison = 0;

            switch (sortCriteria) {
                case 'price_asc':
                case 'price_desc':
                    const priceA = (parseFloat(a.pricing?.prompt ?? 'Infinity') || Infinity) + (parseFloat(a.pricing?.completion ?? 'Infinity') || Infinity);
                    const priceB = (parseFloat(b.pricing?.prompt ?? 'Infinity') || Infinity) + (parseFloat(b.pricing?.completion ?? 'Infinity') || Infinity);
                    if (priceA === Infinity && priceB === Infinity) {
                        comparison = 0;
                    } else {
                        comparison = priceA - priceB;
                    }

                    if (sortCriteria === 'price_desc') {
                        comparison *= -1;
                    }
                    break;

                case 'alphabetical':
                default:
                    const nameA = a.name?.toLowerCase() ?? a.id?.toLowerCase() ?? '';
                    const nameB = b.name?.toLowerCase() ?? b.id?.toLowerCase() ?? '';
                    comparison = nameA.localeCompare(nameB);
                    break;
            }

            return comparison;
        });

        return modelsToSort;
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
            console.error('OpenRouterService: API key is missing.');
            throw new Error("OpenRouter API key is not set");
        }
        if (!defaultModel) {
            console.error('OpenRouterService: Default model is not set.');
            throw new Error("Default model is not set");
        }

        const requestBody = {
            model: defaultModel,
            messages: messages,
            stream: true,
        };

        console.log('OpenRouterService: Sending stream request:', JSON.stringify(requestBody, null, 2));

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

            console.log('OpenRouterService: Response status:', response.status);

        } catch (error: any) {
             console.error('OpenRouterService: Fetch error:', error);
             if (error.name === 'AbortError') {
                 console.log('OpenRouterService: Fetch aborted.');
                 return;
             }
             throw new Error(`Network error calling OpenRouter: ${error.message}`);
        }

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'Failed to read error body');
            console.error('OpenRouterService: API Error:', response.status, errorBody);
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
                    console.log('OpenRouterService: Abort signal detected during stream read.');
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
                     console.error('OpenRouterService: Error reading stream chunk:', readError);
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
                                    yield chunk;
                                }
                            } catch (e) {
                                console.error('OpenRouterService: Error parsing SSE JSON:', e, 'Data:', dataContent);
                                // Optionally yield an error marker or throw? For now, just log.
                            }
                        } else if (message.startsWith(':')) {
                             console.log("OpenRouterService: Received SSE comment:", message);
                        } else if (message.trim()) {
                             console.warn("OpenRouterService: Received unexpected non-empty line:", message);
                        }
                    }
                }
            }
            console.log('OpenRouterService: Stream finished.');

        } catch (error) {
             console.error("OpenRouterService: Error during stream processing loop:", error);
             throw error;
        } finally {
            if (!done) {
                 console.log("OpenRouterService: Stream loop exited unexpectedly, ensuring reader cancellation.");
                 try {
                     await reader.cancel('Stream processing finished or errored.');
                 } catch (cancelError) {
                     console.warn("OpenRouterService: Error during final reader cancellation:", cancelError);
                 }
            }
             reader.releaseLock();
             console.log("OpenRouterService: Stream reader lock released.");
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
            console.error('OpenRouterService: API key is missing for getChatCompletion.');
            new Notice('OpenRouter API key is not set. Please configure it in the plugin settings.');
            return null;
        }
        if (!model) {
             console.error('OpenRouterService: Model is missing for getChatCompletion.');
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

        console.log('OpenRouterService: Sending non-stream request:', JSON.stringify(requestBody, null, 2));

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

            console.log('OpenRouterService: Non-stream response status:', response.status);

            if (response.status === 200) {
                const data = response.json;
                const content = data?.choices?.[0]?.message?.content;

                if (content) {
                    console.log('OpenRouterService: Received non-stream completion.');
                    return content.trim();
                } else {
                    console.error('OpenRouterService: Could not extract content from non-stream response:', data);
                    new Notice('Failed to parse LLM response from OpenRouter.');
                    return null;
                }
            } else {
                console.error(`OpenRouterService: Error fetching non-stream completion: ${response.status}`, response.text);
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
            console.error('OpenRouterService: Network or other error during non-stream completion:', error);
            new Notice('Error connecting to OpenRouter for title generation. Check network or API.');
            return null;
        }
    }
}
