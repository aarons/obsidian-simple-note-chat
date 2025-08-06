import { DEFAULT_ARCHIVE_FOLDER, DEFAULT_NN_TITLE_FORMAT, CHAT_SEPARATOR } from './constants';

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
  newNoteLocation: 'current' | 'archive' | 'custom';
  newNoteCustomFolder: string;
  newNoteTitleFormat: string;
  enableArchiveRenameDate: boolean;
  archiveRenameDateFormat: string;
  enableArchiveRenameLlm: boolean;
  llmRenameWordLimit: number;
  llmRenameIncludeEmojis: boolean;
  llmRenameModel: string; // Stores the ID of the model to use for titling
  newNoteTitlePrefix: string;
  newNoteTitleSuffix: string;
  modelSortOrder: string;
  chatCommandPhrase: string;
  archiveCommandPhrase: string;
  newChatCommandPhrase: string;
  modelCommandPhrase: string;
  chatSeparator: string;

  enableSpacebarDetection: boolean;
  spacebarDetectionDelay: number;
  enableLogging: boolean;
  logLevel: LogLevel;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  apiKey: '',
  defaultModel: 'openrouter/auto',
  archiveFolderName: DEFAULT_ARCHIVE_FOLDER,
  newNoteLocation: 'archive',
  newNoteCustomFolder: '',
  newNoteTitleFormat: DEFAULT_NN_TITLE_FORMAT,
  enableArchiveRenameDate: false,
  archiveRenameDateFormat: DEFAULT_NN_TITLE_FORMAT,
  enableArchiveRenameLlm: false,
  llmRenameWordLimit: 5,
  llmRenameIncludeEmojis: false,
  llmRenameModel: ''
  newNoteTitlePrefix: '',
  newNoteTitleSuffix: '',
  modelSortOrder: 'alphabetical',
  chatCommandPhrase: '',
  archiveCommandPhrase: '',
  newChatCommandPhrase: '',
  modelCommandPhrase: '',
  chatSeparator: CHAT_SEPARATOR,
  enableSpacebarDetection: false,
  spacebarDetectionDelay: 0.5
  enableLogging: false,
  logLevel: LogLevel.ERROR,
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
