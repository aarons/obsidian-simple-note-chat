// src/OpenRouterService.ts
import { requestUrl, Notice } from 'obsidian';
// Assuming constants.ts is now in src/
import { OPENROUTER_API_URL } from './constants';
import { PluginSettings, ChatMessage } from './types'; // Import necessary types

// Define and EXPORT the structure of a model from the OpenRouter API
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
                // Ensure data.data exists and is an array before returning
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
     * @param sortBy The field to sort by ('name', 'promptPrice', 'completionPrice'). Defaults to 'name'.
     * @param sortOrder The sort order ('asc' or 'desc'). Defaults to 'asc'.
     * @returns The sorted array of models.
     */
    sortModels(models: OpenRouterModel[], sortBy: string = 'name', sortOrder: string = 'asc'): OpenRouterModel[] {
        return models.sort((a, b) => {
            let comparison = 0;
            let valA: string | number | undefined;
            let valB: string | number | undefined;

            switch (sortBy) {
                case 'promptPrice':
                    // Convert price strings to numbers for comparison
                    valA = parseFloat(a.pricing?.prompt ?? 'Infinity');
                    valB = parseFloat(b.pricing?.prompt ?? 'Infinity');
                    break;
                case 'completionPrice':
                    valA = parseFloat(a.pricing?.completion ?? 'Infinity');
                    valB = parseFloat(b.pricing?.completion ?? 'Infinity');
                    break;
                case 'name':
                default:
                    valA = a.name?.toLowerCase() ?? '';
                    valB = b.name?.toLowerCase() ?? '';
                    break;
            }

            if (valA === undefined || valB === undefined) {
                comparison = 0; // Treat undefined values as equal or handle as needed
            } else if (typeof valA === 'string' && typeof valB === 'string') {
                comparison = valA.localeCompare(valB);
            } else if (typeof valA === 'number' && typeof valB === 'number') {
                comparison = valA - valB;
            }


            return sortOrder === 'desc' ? comparison * -1 : comparison;
        });
    }

    /**
     * Performs a streaming chat completion request to the OpenRouter API.
     * Handles SSE parsing and yields content chunks.
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

        if (!apiKey || !defaultModel) {
            throw new Error("API key or default model is not configured.");
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
                    // Optional headers from docs:
                    // 'HTTP-Referer': 'YOUR_SITE_URL', // e.g., 'app://obsidian.md'
                    // 'X-Title': 'Obsidian Simple Note Chat',
                },
                body: JSON.stringify(requestBody),
                signal: signal,
            });

            console.log('OpenRouterService: Response status:', response.status);

        } catch (error: any) {
             // Catch fetch errors (network issues, DNS errors, etc.)
             console.error('OpenRouterService: Fetch error:', error);
             if (error.name === 'AbortError') {
                 // Don't throw for abort, let ChatService handle the notice
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

        // Process the stream
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
                    // Use '\n\n' as the delimiter for SSE messages
                    while ((endOfMessageIndex = buffer.indexOf('\n\n')) >= 0) {
                        const message = buffer.substring(0, endOfMessageIndex);
                        buffer = buffer.substring(endOfMessageIndex + 2);

                        if (message.startsWith('data: ')) {
                            const dataContent = message.substring(6).trim();
                            if (dataContent === '[DONE]') {
                                console.log('OpenRouterService: Received [DONE] signal.');
                                // Don't break here, let the reader naturally finish
                                continue;
                            }
                            try {
                                const jsonData = JSON.parse(dataContent);
                                const chunk = jsonData.choices?.[0]?.delta?.content;
                                if (chunk) {
                                    yield chunk;
                                } else {
                                     // Log if data received but no content (e.g., role change message)
                                }
                            } catch (e) {
                                console.error('OpenRouterService: Error parsing SSE JSON:', e, 'Data:', dataContent);
                                // Optionally yield an error marker or throw? For now, just log.
                            }
                        } else if (message.startsWith(':')) {
                             console.log("OpenRouterService: Received SSE comment:", message);
                             // Ignore comments as per SSE spec
                        } else if (message.trim()) {
                             console.warn("OpenRouterService: Received unexpected non-empty line:", message);
                        }
                    }
                }
            }
            console.log('OpenRouterService: Stream finished.');

        } catch (error) {
             // Re-throw errors (including AbortError) to be handled by ChatService
             console.error("OpenRouterService: Error during stream processing loop:", error);
             throw error;
        } finally {
            // Ensure the reader is released/cancelled if the loop exits unexpectedly
            // (though reader.cancel might already be called on abort)
            if (!done) {
                 console.log("OpenRouterService: Stream loop exited unexpectedly, ensuring reader cancellation.");
                 try {
                     await reader.cancel('Stream processing finished or errored.');
                 } catch (cancelError) {
                     // Ignore errors during cancellation itself, as the primary error is more important
                     console.warn("OpenRouterService: Error during final reader cancellation:", cancelError);
                 }
            }
             reader.releaseLock();
             console.log("OpenRouterService: Stream reader lock released.");
        }
    }
}
