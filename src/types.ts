import { DEFAULT_ARCHIVE_FOLDER, DEFAULT_NN_TITLE_FORMAT } from './constants';

// Define LogLevel enum
export enum LogLevel {
	ERROR = 'ERROR',
	WARN = 'WARN',
	INFO = 'INFO',
	DEBUG = 'DEBUG',
}

export interface PluginSettings {
  apiKey: string;
  defaultModel: string;
  archiveFolderName: string;
  // Settings for the 'New Note' command
  newNoteLocation: 'current' | 'archive' | 'custom';
  newNoteCustomFolder: string;
  newNoteTitleFormat: string;
  // Settings for the 'Archive' command
  enableArchiveRenameDate: boolean;
  archiveRenameDateFormat: string;
  enableArchiveRenameLlm: boolean;
  llmRenameWordLimit: number;
  llmRenameIncludeEmojis: boolean;
  llmRenameModel: string; // Stores the ID of the model to use for titling
  // General settings
  newNoteTitlePrefix: string;
  newNoteTitleSuffix: string;
  modelSortOrder: string;
  chatCommandPhrase: string;
  archiveCommandPhrase: string;
  newChatCommandPhrase: string;
  modelCommandPhrase: string;
  chatSeparator: string;

	// Logging Settings
	enableLogging: boolean;
	logLevel: LogLevel;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	apiKey: '',
	defaultModel: 'openrouter/auto',
	archiveFolderName: DEFAULT_ARCHIVE_FOLDER,
	// New Note settings defaults
	newNoteLocation: 'archive',
	newNoteCustomFolder: '',
	newNoteTitleFormat: DEFAULT_NN_TITLE_FORMAT,
	// Archive settings defaults
	enableArchiveRenameDate: false,
	archiveRenameDateFormat: DEFAULT_NN_TITLE_FORMAT,
	enableArchiveRenameLlm: false,
	llmRenameWordLimit: 5,
	llmRenameIncludeEmojis: false,
	llmRenameModel: '',
	// General settings defaults
	newNoteTitlePrefix: '',
	newNoteTitleSuffix: '',
	modelSortOrder: 'alphabetical',
	chatCommandPhrase: '',
	archiveCommandPhrase: '',
	newChatCommandPhrase: '',
	modelCommandPhrase: '',
	chatSeparator: '',
	// Logging Defaults
	enableLogging: false,
	logLevel: LogLevel.ERROR,
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
