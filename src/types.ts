import { DEFAULT_STOP_SEQUENCE, DEFAULT_ARCHIVE_FOLDER, DEFAULT_NN_TITLE_FORMAT } from './constants';

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
  modelSortOrder: string; // Added for model sorting
  ddBypassSeparatorCheck: boolean;
  enableCcShortcut: boolean; // Keep this name as it relates to the specific command ID
  chatCommandPhrase: string;
  archiveCommandPhrase: string;
  deleteCommandPhrase: string;
  newChatCommandPhrase: string;
  chatSeparator: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	apiKey: '',
	defaultModel: 'openrouter/auto',
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
	modelSortOrder: 'alphabetical', // Default sort order
	ddBypassSeparatorCheck: false,
	enableCcShortcut: false,
	chatCommandPhrase: '', // Will be set from constants in main.ts
	archiveCommandPhrase: '', // Will be set from constants in main.ts
	deleteCommandPhrase: '', // Will be set from constants in main.ts
	newChatCommandPhrase: '', // Will be set from constants in main.ts
	chatSeparator: '' // Will be set from constants in main.ts
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
