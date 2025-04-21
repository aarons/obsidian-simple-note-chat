// src/OpenRouterService.ts
import { requestUrl, Notice, App } from 'obsidian'; // Added App
import { OPENROUTER_API_URL } from './constants';
import { PluginSettings, ChatMessage } from './types'; // Keep PluginSettings
import { log } from './utils/logger';
import { Buffer } from 'buffer'; // Needed for base64url encoding
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
    private availableModels: OpenRouterModel[] = [];
    private modelsLastFetched: number = 0;
    private cacheValidityDuration: number = 1000 * 60 * 60 * 24; // 24 hours
    private settings: PluginSettings;
    private app: App;
    private manifestId: string; // Added manifestId
    private codeVerifier: string | null = null;

    constructor(app: App, settings: PluginSettings, manifestId: string) { // Updated constructor
    	this.app = app;
    	this.settings = settings;
    	this.manifestId = manifestId; // Store manifestId
    }
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
    isCacheValid(): boolean {
        return this.availableModels.length > 0 &&
               (Date.now() - this.modelsLastFetched) < this.cacheValidityDuration;
    }

    /**
     * Checks if a refresh is needed (cache expired) but we still have cached models.
     * Used to determine if we should trigger a background refresh.
     * @returns true if we have cached models but they're stale
     */
    isRefreshNeeded(): boolean {
        return this.availableModels.length > 0 &&
               (Date.now() - this.modelsLastFetched) >= this.cacheValidityDuration;
    }

    /**
     * Performs a background refresh of the model cache if needed.
     * This method doesn't await the result and handles errors silently.
     * No longer needs apiKey passed in.
     */
    backgroundRefreshIfNeeded(): void {
     // Use internal settings
     if (!this.isRefreshNeeded() || !this.settings.apiKey) {
     	return;
     }
     log.debug('OpenRouterService: Starting background model refresh');
     this.fetchModels(true) // Pass forceRefresh=true
     	.then(models => {
     		log.debug(`OpenRouterService: Background refresh completed, loaded ${models.length} models`);
     	})
     	.catch(error => {
     		log.error('OpenRouterService: Background refresh failed:', error);
     	});
    }

    /**
     * Gets cached models or fetches them if not available.
     * No longer needs apiKey passed in.
     * @param forceRefresh Optional: Whether to force a refresh.
     * @returns A promise that resolves to the cached models.
     */
    async getCachedModels(forceRefresh: boolean = false): Promise<OpenRouterModel[]> {
     return this.fetchModels(forceRefresh);
    }

    /**
     * Clears the model cache and forces a refresh.
     * No longer needs apiKey passed in.
     * @returns A promise that resolves to the newly fetched models.
     */
    async refreshModels(): Promise<OpenRouterModel[]> {
     return this.fetchModels(true); // forceRefresh = true
    }

    /**
     * Fetches models from the OpenRouter API or returns cached models if available.
     * @param apiKey The OpenRouter API key.
     * @param forceRefresh Whether to force a refresh from the API instead of using cache.
     * @returns A promise that resolves to an array of models or an empty array in case of error.
     */
    async fetchModels(forceRefresh: boolean = false): Promise<OpenRouterModel[]> { // Removed apiKey parameter
    	if (!forceRefresh && this.isCacheValid()) {
    		log.debug('OpenRouterService: Using cached models');
    		return this.availableModels;
    	}

    	// Use internal settings for API key
    	if (!this.settings.apiKey) {
    		log.warn('OpenRouter API key is missing.');
    		this.availableModels = []; // Clear cache if no key
    		this.modelsLastFetched = 0;
    		return [];
    	}

    	try {
    		const response = await requestUrl({
    			url: `${OPENROUTER_API_URL}/models`,
    			method: 'GET',
    			headers: {
    				'Authorization': `Bearer ${this.settings.apiKey}`, // Use internal key
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
    				this.availableModels = []; // Clear cache on error
    				this.modelsLastFetched = 0;
    				return [];
    			}
    		} else {
    			log.error(`Error fetching models from OpenRouter: ${response.status}`, response.text);
    			let errorMessage = `Failed to fetch models from OpenRouter. Status: ${response.status}.`;
    			if (response.status === 401) {
    				errorMessage += ' Invalid API Key or Authentication. Please re-authenticate.';
    				// Don't logout here, let the caller handle it based on the error/empty result
    			}
    			new Notice(errorMessage);
    			this.availableModels = []; // Clear cache on error
    			this.modelsLastFetched = 0;
    			return [];
    		}
    	} catch (error) {
    		log.error('Network or other error fetching models from OpenRouter:', error);
    		new Notice('Error connecting to OpenRouter. Check your network connection or the API endpoint.');
    		this.availableModels = []; // Clear cache on error
    		this.modelsLastFetched = 0;
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
     * Uses internal settings.
     * @param messages The chat history messages.
     * @param signal AbortSignal to allow cancellation.
     * @returns An async generator yielding content chunks (strings).
     * @throws Error if the API request fails or the stream cannot be processed.
     */
    async * streamChatCompletion(
     messages: ChatMessage[],
     // settings: PluginSettings, // Removed settings parameter
     signal: AbortSignal
    ): AsyncGenerator<string> {
     // Use internal settings
     const { apiKey, defaultModel } = this.settings;

     if (!apiKey) {
     	log.error('OpenRouterService: API key is missing.');
     	throw new Error("OpenRouter API key is not set. Please authenticate.");
     }
     if (!defaultModel) {
     	log.error('OpenRouterService: Default model is not set.');
     	throw new Error("Default model is not set");
     }

     // Check if we should refresh the model cache in the background
     this.backgroundRefreshIfNeeded(); // Uses internal key

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
     			'Authorization': `Bearer ${apiKey}`, // Use internal key
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
     	if (response.status === 401) {
     	 specificError += ' Please re-authenticate.';
     	 // Don't logout here, throw the error
     	}
     throw new Error(specificError); // Throw error for caller to handle
    }

    // Add null check for response.body
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

     		let readResult: ReadableStreamReadResult<string>;
     		try {
     			readResult = await reader.read();
     			done = readResult.done;
     			// log.debug('OpenRouterService: Raw stream chunk received:', readResult.value); // Reduce noise
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
     						// console.log('OpenRouterService: Received [DONE] signal.'); // Reduce noise
     						continue;
     					}
     					try {
     						const jsonData = JSON.parse(dataContent);
     						const chunk = jsonData.choices?.[0]?.delta?.content;
     						if (chunk) {
     							// log.debug('OpenRouterService: Received chunk:', chunk); // Reduce noise
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
     	 // Let the error propagate, caller can decide to logout if it's 401
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
     * Uses internal settings.
     * @param model The model ID to use for completion.
     * @param messages The chat history messages.
     * @param maxTokens Optional maximum number of tokens for the completion.
     * @returns A promise that resolves to the completion content string or null in case of error.
     */
    async getChatCompletion(
     // apiKey: string, // Removed apiKey parameter
     model: string,
     messages: ChatMessage[],
     maxTokens?: number
    ): Promise<string | null> {
     // Use internal settings
     if (!this.settings.apiKey) {
     	log.error('OpenRouterService: API key is missing for getChatCompletion.');
     	new Notice('OpenRouter API key is not set. Please authenticate.');
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
     			'Authorization': `Bearer ${this.settings.apiKey}`, // Use internal key
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
     		 if (response.status === 401) {
     		  errorMessage += ' Please re-authenticate.';
     		  // Don't logout here, return null or throw
     		 }
     		new Notice(errorMessage.substring(0, 200));
     		return null; // Indicate failure
     	}
     } catch (error) {
     	log.error('OpenRouterService: Network or other error during non-stream completion:', error);
     	new Notice('Error connecting to OpenRouter for title generation. Check network or API.');
     	return null;
     }
    }

    // --- OAuth PKCE Methods ---

    /**
     * Generates a cryptographically random string for the code verifier.
     */
    private generateCodeVerifier(): string {
     const randomBytes = crypto.getRandomValues(new Uint8Array(32));
     // Use base64url encoding (RFC 7636 Appendix A)
     return Buffer.from(randomBytes).toString('base64url').replace(/=/g, '');
    }

    /**
     * Generates the SHA256 code challenge from the code verifier.
     */
    private async generateCodeChallenge(verifier: string): Promise<string> {
     const encoder = new TextEncoder();
     const data = encoder.encode(verifier);
     const hashBuffer = await crypto.subtle.digest('SHA-256', data);
     // Use base64url encoding
     return Buffer.from(hashBuffer).toString('base64url').replace(/=/g, '');
    }

    /**
     * Initiates the OpenRouter OAuth PKCE flow.
     */
    async initiateOAuthFlow(): Promise<void> {
     try {
     	this.codeVerifier = this.generateCodeVerifier();
     	const codeChallenge = await this.generateCodeChallenge(this.codeVerifier);
     	// Use manifestId for the callback URL
     	const callbackUrl = `obsidian://plugin/${this.manifestId}/oauth-callback`;

     	const authUrl = new URL('https://openrouter.ai/auth');
     	authUrl.searchParams.set('callback_url', callbackUrl);
     	authUrl.searchParams.set('code_challenge', codeChallenge);
     	authUrl.searchParams.set('code_challenge_method', 'S256');

     	log.info('Initiating OAuth flow. Opening URL:', authUrl.toString());
     	// Open the URL in the default browser
     	window.open(authUrl.toString());
     } catch (error) {
     	log.error('Error initiating OAuth flow:', error);
     	new Notice('Failed to start authentication process. See console for details.');
     	this.codeVerifier = null; // Clear verifier on error
     }
    }

    /**
     * Handles the OAuth callback, exchanging the code for an API key.
     * @param code The authorization code received from OpenRouter.
     * @param pluginSaveCallback Callback function to save plugin settings.
     * @param settingsTabUpdateCallback Callback function to update the settings tab UI.
     */
    async handleOAuthCallback(
     code: string,
     pluginSaveCallback: () => Promise<void>,
     settingsTabUpdateCallback: () => void
    ): Promise<void> {
     if (!this.codeVerifier) {
     	log.error('OAuth callback received but no code_verifier stored.');
     	new Notice('Authentication error: Missing internal state. Please try authenticating again.');
     	return;
     }

     log.info('Handling OAuth callback with code:', code);

     try {
     	const response = await requestUrl({
     		url: `${OPENROUTER_API_URL}/auth/keys`,
     		method: 'POST',
     		headers: {
     			'Content-Type': 'application/json',
     		},
     		body: JSON.stringify({
     			code: code,
     			code_verifier: this.codeVerifier,
     			code_challenge_method: 'S256', // Must match the method used in initiateOAuthFlow
     		}),
     		throw: false, // Handle errors manually
     	});

     	this.codeVerifier = null; // Clear verifier after use

     	if (response.status === 200) {
     		const data = response.json;
     		const apiKey = data?.key;

     		if (apiKey) {
     			log.info('Successfully exchanged code for API key.');
     			this.settings.apiKey = apiKey; // Store the key in settings
     			await pluginSaveCallback(); // Save settings via plugin instance
     			new Notice('Successfully authenticated with OpenRouter!');
     			settingsTabUpdateCallback(); // Trigger UI update
     		} else {
     			log.error('OAuth callback success, but no API key found in response:', data);
     			new Notice('Authentication failed: Could not retrieve API key.');
     		}
     	} else {
     		const errorBody = response.text;
     		log.error(`OAuth code exchange failed: ${response.status}`, errorBody);
     		let errorMessage = `Authentication failed. Status: ${response.status}.`;
     		 try {
     			const errorJson = response.json;
     			errorMessage += ` ${errorJson?.error?.message || errorBody || ''}`;
     		 } catch {
     			errorMessage += ` ${errorBody || 'Could not read error body.'}`;
     		 }
     		new Notice(errorMessage);
     	}
     } catch (error) {
     	log.error('Error during OAuth code exchange:', error);
     	new Notice('An error occurred during authentication. See console for details.');
     	this.codeVerifier = null; // Ensure verifier is cleared on error
     }
    }

    /**
     * Checks if the user is considered authenticated (i.e., has an API key).
     */
    isOAuthAuthenticated(): boolean {
     return !!this.settings.apiKey;
    }

    /**
     * Clears the stored API key and model cache.
     * @param pluginSaveCallback Callback function to save plugin settings.
     * @param settingsTabUpdateCallback Callback function to update the settings tab UI.
     */
    async logout(
     pluginSaveCallback: () => Promise<void>,
     settingsTabUpdateCallback: () => void
    ): Promise<void> {
     log.info('Logging out from OpenRouter.');
     this.settings.apiKey = ''; // Clear the key
     this.availableModels = []; // Clear model cache
     this.modelsLastFetched = 0;
     await pluginSaveCallback(); // Save the cleared settings
     new Notice('Logged out from OpenRouter.');
     settingsTabUpdateCallback(); // Update the UI
    }
   }
