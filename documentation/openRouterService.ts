import { Notice } from 'obsidian';
import { logger } from '../utils/logger';
import StoryHelperPlugin from '../main';
import { StoryHelperSettings } from '../settings';

export type OpenRouterModel = string;

export enum ModelSortOption {
    ALPHABETICAL = 'alphabetical',
    COMPLETION_PRICE_ASC = 'completion_price_asc',
    COMPLETION_PRICE_DESC = 'completion_price_desc',
    PROMPT_PRICE_ASC = 'prompt_price_asc',
    PROMPT_PRICE_DESC = 'prompt_price_desc'
}

export interface OpenRouterModelInfo {
    id: string;
    name?: string;
    context_length?: number;
    pricing?: {
        prompt?: number;
        completion?: number;
    };
}

export interface FormattedModelInfo {
    id: string;
    displayName: string;
}

export interface OpenRouterResponse {
    id: string;
    choices: {
        message: {
            content: string;
        };
        index: number;
    }[];
    error?: {
        message: string;
    };
}

export class OpenRouterService {
    private availableModels: OpenRouterModelInfo[] = [];
    private modelsLoaded = false;
    public plugin: StoryHelperPlugin; // Public for modal access to settings
    private apiKey: string;

    constructor(plugin: StoryHelperPlugin) {
        this.plugin = plugin;
        this.apiKey = plugin.settings.openRouterApiKey;

        if (plugin.settings.cachedModels && plugin.settings.cachedModels.length > 0) {
            this.availableModels = plugin.settings.cachedModels;
            this.modelsLoaded = true;
            logger.info(`Loaded ${this.availableModels.length} models from settings cache.`);
            this.sortModels(this.plugin.settings.modelSortOption, false); // Sort without saving again
        } else {
            logger.info("No cached models found in settings. Fetching may be required.");
        }
    }

    /**
     * Fetch available models from OpenRouter API
     */
    public async loadModels(): Promise<void> {
        try {
            if (!this.apiKey) {
                logger.debug('OpenRouter API key not set, skipping model loading');
                return;
            }

            logger.info('Fetching available models from OpenRouter API');

            const response = await fetch('https://openrouter.ai/api/v1/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/aarons/story-helper',
                    'X-Title': 'Story Helper Plugin'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`Failed to fetch models: ${response.status} ${errorText}`);
                return;
            }

            const data = await response.json();
            if (data.data && Array.isArray(data.data)) {
                this.availableModels = data.data.map((model: any) => ({
                    id: model.id,
                    name: model.name,
                    context_length: model.context_length,
                    pricing: model.pricing
                }));

                this.modelsLoaded = true;
                logger.info(`Loaded ${this.availableModels.length} models from OpenRouter API`);

                this.plugin.settings.cachedModels = this.availableModels;
                await this.plugin.saveSettings();
                logger.info(`Saved ${this.availableModels.length} models to settings cache.`);
            } else {
                logger.error('Invalid response format from OpenRouter API');
                this.modelsLoaded = false;
            }
        } catch (error) {
            logger.error(`Error fetching models: ${error.message}`, error as Error);
        }
    }

    /**
     * Get all available models
     * @returns Array of model information objects
     */
    public getAvailableModels(): OpenRouterModelInfo[] {
        return this.availableModels;
    }

    /**
     * Format price for display in per-million tokens format
     * @param price The price value
     * @returns Formatted price string per million tokens
     */
    private formatPricePerMillion(price: number | string | undefined): string {
        if (price === undefined) return 'unknown';

        const numPrice = typeof price === 'string' ? parseFloat(price) : price;

        if (numPrice === 0) return 'free';

        const pricePerMillion = numPrice * 1000000;

        // Format based on magnitude
        if (pricePerMillion < 0.01) {
            return '<0.01';
        } else if (pricePerMillion < 10) {
            return parseFloat(pricePerMillion.toFixed(2)).toString();
        } else if (pricePerMillion < 100) {
            return parseFloat(pricePerMillion.toFixed(1)).toString();
        } else {
            return Math.round(pricePerMillion).toString();
        }
    }

    /**
     * Get formatted model information for display in UI
     * @param sortOption Current sort option to determine display format
     * @returns Array of formatted model info
     */
    public getFormattedModels(sortOption: ModelSortOption): FormattedModelInfo[] {
        return this.availableModels.map(model => {
            if (model.id === 'openrouter/auto') {
                return {
                    id: model.id,
                    displayName: `${model.id} | variable pricing`
                };
            }

            if (model.id.includes(':free')) {
                return {
                    id: model.id,
                    displayName: `${model.id.replace(':free', '')} | free | free`
                };
            }

            const promptPricePerM = this.formatPricePerMillion(model.pricing?.prompt);
            const completionPricePerM = this.formatPricePerMillion(model.pricing?.completion);

            return {
                id: model.id,
                displayName: `${model.id} | ${promptPricePerM} in | ${completionPricePerM} out`
            };
        });
    }

    /**
     * Sort the available models based on the specified sort option.
     * @param sortOption The option to sort by
     * @param saveSettings Whether to save the settings after sorting (defaults to true)
     */
    public sortModels(sortOption: ModelSortOption, saveSettings: boolean = true): void {
        if (!this.availableModels || this.availableModels.length === 0) {
            logger.debug("No models available to sort.");
            return;
        }

        let autoModel: OpenRouterModelInfo | undefined;
        let regularModels: OpenRouterModelInfo[];

        // Handle potential errors
        try {
            autoModel = this.availableModels.find(model => model && model.id === 'openrouter/auto');
            regularModels = this.availableModels.filter(model => model && model.id !== 'openrouter/auto');
        } catch (error) {
            logger.error("Error processing available models during sort:", error);
            regularModels = this.availableModels.filter(model => model && model.id);
            autoModel = undefined;
        }

        if (sortOption === ModelSortOption.ALPHABETICAL) {
            regularModels.sort((a, b) => a.id.localeCompare(b.id));
        } else {
            const sortConfig = {
                property: sortOption.includes('prompt') ? 'prompt' : 'completion',
                ascending: sortOption.includes('_asc')
            };
            regularModels.sort((a, b) => {
                const priceA = a.pricing?.[sortConfig.property as keyof typeof a.pricing] || 0;
                const priceB = b.pricing?.[sortConfig.property as keyof typeof b.pricing] || 0;

                if (priceA === priceB) {
                    return a.id.localeCompare(b.id);
                }
                return sortConfig.ascending ? priceA - priceB : priceB - priceA;
            });
        }

        // Ensure regularModels is an array before proceeding
        if (!Array.isArray(regularModels)) {
            logger.error("Regular models is not an array after filtering, cannot sort.");
            regularModels = [];
        }

        this.availableModels = autoModel ? [autoModel, ...regularModels] : regularModels;

        if (saveSettings) {
            this.plugin.settings.cachedModels = this.availableModels;
            this.plugin.saveSettings().then(() => {
                 logger.info(`Saved sorted models (${sortOption}) to settings cache.`);
            }).catch(error => {
                 logger.error("Error saving settings after sorting models:", error);
            });
        } else {
            logger.debug(`Sorted models by ${sortOption} (save skipped).`);
        }
    }

    /**
     * Check if models have been loaded
     * @returns True if models are loaded
     */
    public areModelsLoaded(): boolean {
        return this.modelsLoaded;
    }

    /**
     * Get default models to use when API models can't be loaded
     * @returns Array of default model IDs
     */
    public getDefaultModels(): OpenRouterModelInfo[] {
        return [
            { id: 'anthropic/claude-3.5-haiku' },
            { id: 'anthropic/claude-3.7-sonnet' },
            { id: 'deepseek/deepseek-r1:free' },
            { id: 'google/gemini-2.0-flash-001' },
            { id: 'gryphe/mythomax-l2-13b' },
            { id: 'meta-llama/llama-3.3-70b-instruct' },
            { id: 'microsoft/wizardlm-2-8x22b' },
            { id: 'mistralai/mistral-nemo' },
            { id: 'openai/gpt-4o-mini' },
            { id: 'openai/gpt-4o' },
            { id: 'openrouter/auto' }
        ];
    }

    /**
     * Send a request to OpenRouter API
     * @param text The text to send
     * @param model The model to use
     * @param temperature The temperature parameter (0.0-2.0)
     * @returns The response content or null if there was an error
     */
    private async sendRequest(text: string, model: OpenRouterModel, temperature: number = 1.0): Promise<string | null> {
        try {
            // Set a timeout for fetch (120 seconds)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);

            const requestObj = {
                model: model,
                temperature: temperature,
                messages: [
                    {
                        role: 'user',
                        content: text
                    }
                ]
            };

            logger.debug(`OpenRouter API request: ${JSON.stringify(requestObj, null, 2)}`);

            const requestBody = JSON.stringify(requestObj);
            logger.debug(`[sendRequest] JSON request body length: ${requestBody.length}`);

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/aarons/story-helper',
                    'X-Title': 'Story Helper Plugin'
                },
                body: requestBody,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            logger.info(`OpenRouter API response status: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                const errorMessage = `API returned status ${response.status}: ${errorText}`;
                logger.error(errorMessage);
                return null;
            }

            const data = await response.json() as OpenRouterResponse;

            logger.debug(`OpenRouter API response: ${JSON.stringify(data, null, 2)}`);

            if (data.error) {
                logger.error(`OpenRouter API error: ${data.error.message}`);
                return null;
            }

            if (data.choices && data.choices.length > 0) {
                return data.choices[0].message.content;
            } else {
                logger.error('OpenRouter API returned an empty response');
                return null;
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                logger.error('Request to OpenRouter API timed out after 90 seconds');
                return null;
            }

            logger.error(`Error in API request: ${error.message}`, error);
            return null;
        }
    }

    /**
     * Send a request to OpenRouter API for a completion
     * @param text The text to send
     * @param model The model to use
     * @param temperature The temperature parameter (0.0-2.0)
     * @returns Response text or null if there was an error
     */
    async getCompletion(text: string, model: OpenRouterModel, temperature: number = 1.0): Promise<string | null> {
        if (!this.apiKey) {
            new Notice('OpenRouter API key is not set. Please configure it in settings.');
            logger.error('OpenRouter API key is not set');
            return null;
        }

        logger.info(`Getting response from OpenRouter API using model: ${model}`);
        logger.info(`Temperature: ${temperature}, ${text.length} characters in prompt`);

        return await this.sendRequest(text, model, temperature);
    }

    public updateApiKey(newApiKey: string): void {
        this.apiKey = newApiKey;
        logger.info("OpenRouter API key updated in service.");
    }
}
