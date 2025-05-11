import { 
  DEFAULT_ARCHIVE_FOLDER, 
  DEFAULT_NN_TITLE_FORMAT, 
  CHAT_COMMAND_DEFAULT,
  ARCHIVE_COMMAND_DEFAULT,
  NEW_CHAT_COMMAND_DEFAULT,
  MODEL_COMMAND_DEFAULT,
  CHAT_SEPARATOR,
  LogLevel,
  ModelSortOption
} from './constants';

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
  modelSortOrder: ModelSortOption;
  chatCommandPhrase: string;
  archiveCommandPhrase: string;
  newChatCommandPhrase: string;
  modelCommandPhrase: string;
  chatSeparator: string;

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
  // General settings defaults
  newNoteTitlePrefix: '',
  newNoteTitleSuffix: '',
  modelSortOrder: ModelSortOption.ALPHABETICAL,
  chatCommandPhrase: CHAT_COMMAND_DEFAULT,
  archiveCommandPhrase: ARCHIVE_COMMAND_DEFAULT,
  newChatCommandPhrase: NEW_CHAT_COMMAND_DEFAULT,
  modelCommandPhrase: MODEL_COMMAND_DEFAULT,
  chatSeparator: CHAT_SEPARATOR,
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
