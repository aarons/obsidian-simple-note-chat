import { DEFAULT_STOP_SEQUENCE, DEFAULT_ARCHIVE_FOLDER, DEFAULT_NN_TITLE_FORMAT } from './constants';

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
  enableArchiveRenameDate: boolean;
  archiveRenameDateFormat: string;
  enableArchiveRenameLlm: boolean;
  llmRenameWordLimit: number;
  llmRenameIncludeEmojis: boolean;
  llmRenameModel: string; // Stores the ID of the model to use for titling
  enableViewportScrolling: boolean;
  ddBypassSeparatorCheck: boolean;
  enableCcShortcut: boolean;
  ccCommandPhrase: string;
  ggCommandPhrase: string;
  ddCommandPhrase: string;
  nnCommandPhrase: string;
  chatSeparator: string;
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
	archivePreviousNoteOnNn: false,
	enableArchiveRenameDate: false,
	archiveRenameDateFormat: DEFAULT_NN_TITLE_FORMAT,
	enableArchiveRenameLlm: false,
	llmRenameWordLimit: 5, // Default word limit
	llmRenameIncludeEmojis: false,
	llmRenameModel: '', // Default to empty, maybe use `defaultModel` later if empty?
	enableViewportScrolling: false,
	ddBypassSeparatorCheck: false,
	enableCcShortcut: false,
	ccCommandPhrase: '', // Will be set from constants in main.ts
	ggCommandPhrase: '', // Will be set from constants in main.ts
	ddCommandPhrase: '', // Will be set from constants in main.ts
	nnCommandPhrase: '', // Will be set from constants in main.ts
	chatSeparator: '' // Will be set from constants in main.ts
};
// Defines the structure for a chat message
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}