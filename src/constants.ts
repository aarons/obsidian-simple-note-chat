export const CHAT_COMMAND_DEFAULT = 'cc';
export const ARCHIVE_COMMAND_DEFAULT = 'gg';
export const NEW_CHAT_COMMAND_DEFAULT = 'nn';
export const MODEL_COMMAND_DEFAULT = 'cm';

export const COMMAND_PHRASES_DEFAULTS = [
    CHAT_COMMAND_DEFAULT,
    ARCHIVE_COMMAND_DEFAULT,
    NEW_CHAT_COMMAND_DEFAULT,
    MODEL_COMMAND_DEFAULT,
] as const;

// Define LogLevel enum
export enum LogLevel {
	ERROR = 'ERROR',
	WARN = 'WARN',
	INFO = 'INFO',
	DEBUG = 'DEBUG',
}

// Define model sort options enum
export enum ModelSortOption {
  ALPHABETICAL = 'alphabetical',
  PROMPT_PRICE_ASC = 'prompt_price_asc',
  PROMPT_PRICE_DESC = 'prompt_price_desc',
  COMPLETION_PRICE_ASC = 'completion_price_asc',
  COMPLETION_PRICE_DESC = 'completion_price_desc'
}

// Define location constants for note creation
export const NEW_NOTE_LOCATION_CURRENT = 'current';
export const NEW_NOTE_LOCATION_ARCHIVE = 'archive';
export const NEW_NOTE_LOCATION_CUSTOM = 'custom';

// Define note location enum
export enum NewNoteLocation {
  CURRENT = NEW_NOTE_LOCATION_CURRENT,
  ARCHIVE = NEW_NOTE_LOCATION_ARCHIVE,
  CUSTOM = NEW_NOTE_LOCATION_CUSTOM
}

export const CHAT_SEPARATOR_DEFAULT = '<hr message-from="chat">';
export const DEFAULT_ARCHIVE_FOLDER = 'archive/';
export const DEFAULT_NN_TITLE_FORMAT = 'YYYY-MM-DD-HH-mm';
export const CHAT_BOUNDARY_MARKER = '^^^';

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';
