import {
	DEFAULT_ARCHIVE_FOLDER,
	DEFAULT_NN_TITLE_FORMAT,
	CHAT_COMMAND_DEFAULT,
	ARCHIVE_COMMAND_DEFAULT,
	NEW_CHAT_COMMAND_DEFAULT,
	MODEL_COMMAND_DEFAULT
} from './constants';

/**
 * Reasoning effort levels accepted by OpenRouter's unified `reasoning` parameter.
 * 'none' asks the model not to reason (rejected by models whose reasoning is mandatory).
 */
export type ReasoningEffort = 'max' | 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none';

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
  llmRenameReasoningEffort: ReasoningEffort;
  // Reasoning token budget for title generation. Not sent as reasoning.max_tokens
  // (mutually exclusive with effort); it sizes the completion cap that OpenRouter's
  // effort ratios are applied to, so it bounds reasoning spend approximately.
  llmRenameReasoningMaxTokens: number;
  // General settings
  newNoteTitlePrefix: string;
  newNoteTitleSuffix: string;
  modelSortOrder: string;
  chatCommandPhrase: string;
  archiveCommandPhrase: string;
  newChatCommandPhrase: string;
  modelCommandPhrase: string;

  // Behavior Settings
  enableSpacebarDetection: boolean;
  spacebarDetectionDelay: number;

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
  llmRenameReasoningEffort: 'minimal',
  llmRenameReasoningMaxTokens: 1000,
  // General settings defaults
  newNoteTitlePrefix: '',
  newNoteTitleSuffix: '',
  modelSortOrder: 'alphabetical',
  chatCommandPhrase: CHAT_COMMAND_DEFAULT,
  archiveCommandPhrase: ARCHIVE_COMMAND_DEFAULT,
  newChatCommandPhrase: NEW_CHAT_COMMAND_DEFAULT,
  modelCommandPhrase: MODEL_COMMAND_DEFAULT,
  // Behavior Settings defaults
  enableSpacebarDetection: false,
  spacebarDetectionDelay: 0.5,
  // Logging Defaults
  enableLogging: false,
  logLevel: LogLevel.ERROR,
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
