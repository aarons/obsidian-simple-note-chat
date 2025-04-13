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
	archiveRenameDateFormat: DEFAULT_NN_TITLE_FORMAT
};
// Defines the structure for a chat message
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}