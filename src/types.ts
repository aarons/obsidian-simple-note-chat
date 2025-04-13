import { DEFAULT_STOP_SEQUENCE, DEFAULT_ARCHIVE_FOLDER } from './constants';

// Defines the structure for the plugin settings
export interface PluginSettings {
  apiKey: string;
  defaultModel: string;
  stopCommandSequence: string;
  archiveFolderName: string;
}

// Define the default settings
export const DEFAULT_SETTINGS: PluginSettings = {
	apiKey: '',
	defaultModel: '',
	stopCommandSequence: DEFAULT_STOP_SEQUENCE,
	archiveFolderName: DEFAULT_ARCHIVE_FOLDER
};
// Defines the structure for a chat message
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}