import { DEFAULT_ARCHIVE_FOLDER, DEFAULT_NN_TITLE_FORMAT } from './constants';

export interface PluginSettings {
  apiKey: string;
  defaultModel: string;
  archiveFolderName: string;
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
  modelSortOrder: string;
  enableCcShortcut: boolean; // Relates to specific command ID
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
	enableNnRibbonButton: false,
	enableNnKeyboardShortcut: false,
	archivePreviousNoteOnNn: false,
	enableArchiveRenameDate: false,
	archiveRenameDateFormat: DEFAULT_NN_TITLE_FORMAT,
	enableArchiveRenameLlm: false,
	llmRenameWordLimit: 5,
	llmRenameIncludeEmojis: false,
	llmRenameModel: '',
	enableViewportScrolling: false,
	modelSortOrder: 'alphabetical',
	enableCcShortcut: false,
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
