// Defines the structure for the plugin settings
export interface PluginSettings {
  apiKey: string;
  defaultModel: string;
}

// Define the default settings
export const DEFAULT_SETTINGS: PluginSettings = {
	apiKey: '',
	defaultModel: ''
};
// Defines the structure for a chat message
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}