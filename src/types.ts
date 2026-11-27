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
  chatGptEnabled: boolean;
  defaultModel: string;
  favoriteModels: string[];
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
  followNoteLinks: boolean;
  noteLinkDepth: number | 'unlimited';
  lastNoteLinkDepth: number; // Preserves the finite depth while unlimited is enabled.
  enableSpacebarDetection: boolean;
  spacebarDetectionDelay: number;

  // Logging Settings
  enableLogging: boolean;
  logLevel: LogLevel;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  apiKey: '',
  chatGptEnabled: false,
  defaultModel: 'openrouter/auto',
  favoriteModels: [],
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
  followNoteLinks: false,
  noteLinkDepth: 2,
  lastNoteLinkDepth: 2,
  enableSpacebarDetection: false,
  spacebarDetectionDelay: 0.5,
  // Logging Defaults
  enableLogging: false,
  logLevel: LogLevel.ERROR,
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Vault data URLs or web image URLs, in the order they appear in this turn. */
  images?: string[];
}

/** Text streams as before; generated images arrive as complete data or HTTPS URLs. */
export type ChatOutput = string | { type: 'image'; url: string };
