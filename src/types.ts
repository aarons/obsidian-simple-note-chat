import { DEFAULT_STOP_SEQUENCE, DEFAULT_ARCHIVE_FOLDER } from './constants';

// Defines the structure for the plugin settings
export interface PluginSettings {
  apiKey: string;
  defaultModel: string;
  stopCommandSequence: string;
  archiveFolderName: string;
  enableDeleteCommand: boolean;
  enableNnCommandPhrase: boolean;
  enableNnRibbonButton: boolean;
  enableNnKeyboardShortcut: boolean;
  archivePreviousNoteOnNn: boolean;
}

// Define the default settings
export const DEFAULT_SETTINGS: PluginSettings = {
	apiKey: '',
	defaultModel: '',
	stopCommandSequence: DEFAULT_STOP_SEQUENCE,
	archiveFolderName: DEFAULT_ARCHIVE_FOLDER,
	enableDeleteCommand: false,
	enableNnCommandPhrase: true,
	enableNnRibbonButton: false,
	enableNnKeyboardShortcut: false,
	archivePreviousNoteOnNn: false
};
// Defines the structure for a chat message
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}