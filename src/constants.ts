// Command phrases for chat interaction
export const CC_COMMAND_DEFAULT = 'cc';
export const GG_COMMAND_DEFAULT = 'gg';
export const DD_COMMAND_DEFAULT = 'dd';
export const NN_COMMAND_DEFAULT = 'nn';
export const DEFAULT_STOP_SEQUENCE = 'stop';

// Array of all command phrases (lowercase)
export const COMMAND_PHRASES_DEFAULTS = [ // Renamed array as well for clarity
    CC_COMMAND_DEFAULT,
    GG_COMMAND_DEFAULT,
    DD_COMMAND_DEFAULT,
    NN_COMMAND_DEFAULT,
];

// Separator for chat blocks within notes
export const CHAT_SEPARATOR_DEFAULT = '<hr>';
export const DEFAULT_ARCHIVE_FOLDER = 'archive/';
export const DEFAULT_NN_TITLE_FORMAT = 'YYYY-MM-DD-HH-mm';


// Base URL for the OpenRouter API service
export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1'; // Renamed from ENDPOINT