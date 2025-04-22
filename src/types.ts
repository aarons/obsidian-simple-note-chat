import { DEFAULT_ARCHIVE_FOLDER, DEFAULT_NN_TITLE_FORMAT } from './constants';

export interface PluginSettings {
  apiKey: string;
  defaultModel: string;
  archiveFolderName: string;
  archivePreviousNoteOnNn: boolean;
  enableArchiveRenameDate: boolean;
  archiveRenameDateFormat: string;
  enableArchiveRenameLlm: boolean;
  llmRenameWordLimit: number;
  llmRenameIncludeEmojis: boolean;
  llmRenameModel: string; // Stores the ID of the model to use for titling
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
	archivePreviousNoteOnNn: false,
	enableArchiveRenameDate: false,
	archiveRenameDateFormat: DEFAULT_NN_TITLE_FORMAT,
	enableArchiveRenameLlm: false,
	llmRenameWordLimit: 5,
	llmRenameIncludeEmojis: false,
	llmRenameModel: '',
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
