import { DEFAULT_ARCHIVE_FOLDER, DEFAULT_NN_TITLE_FORMAT } from './constants';

export interface PluginSettings {
  apiKey: string;
  defaultModel: string;
  archiveFolderName: string;
  // Settings for the 'New Note' command
  newNoteLocation: 'current' | 'archive' | 'custom';
  newNoteCustomFolder: string;
  newNoteTitleFormat: string;
  archivePreviousNoteOnNn: boolean;
  // Settings for the 'Archive' command
  enableArchiveRenameDate: boolean;
  archiveRenameDateFormat: string;
  enableArchiveRenameLlm: boolean;
  llmRenameWordLimit: number;
  llmRenameIncludeEmojis: boolean;
  llmRenameModel: string; // Stores the ID of the model to use for titling
  // General settings
  modelSortOrder: string;
  chatCommandPhrase: string;
  archiveCommandPhrase: string;
  newChatCommandPhrase: string;
  modelCommandPhrase: string;
  chatSeparator: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	apiKey: '',
	defaultModel: 'openrouter/auto',
	archiveFolderName: DEFAULT_ARCHIVE_FOLDER,
	// New Note settings defaults
	newNoteLocation: 'archive',
	newNoteCustomFolder: '',
	newNoteTitleFormat: DEFAULT_NN_TITLE_FORMAT,
	archivePreviousNoteOnNn: false,
	// Archive settings defaults
	enableArchiveRenameDate: false,
	archiveRenameDateFormat: DEFAULT_NN_TITLE_FORMAT, // Reuses the note title format
	enableArchiveRenameLlm: false,
	llmRenameWordLimit: 5,
	llmRenameIncludeEmojis: false,
	llmRenameModel: '',
	// General settings defaults
	modelSortOrder: 'alphabetical',
	chatCommandPhrase: '',
	archiveCommandPhrase: '',
	newChatCommandPhrase: '',
	modelCommandPhrase: '',
	chatSeparator: ''
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
