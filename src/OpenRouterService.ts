// src/OpenRouterService.ts
import { requestUrl, Notice } from 'obsidian';
// Assuming constants.ts is now in src/
import { OPENROUTER_API_URL } from './constants';

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
}