// Command phrases for chat interaction
export const CC_COMMAND = 'cc';
export const GG_COMMAND = 'gg';
export const DD_COMMAND = 'dd';
export const NN_COMMAND = 'nn';
export const DEFAULT_STOP_SEQUENCE = 'stop';

// Array of all command phrases (lowercase)
export const COMMAND_PHRASES = [
    CC_COMMAND,
    GG_COMMAND,
    DD_COMMAND,
    NN_COMMAND,
];

// Separator for chat blocks within notes
export const CHAT_SEPARATOR = '<hr>';
export const DEFAULT_ARCHIVE_FOLDER = 'archive/';
export const DEFAULT_NN_TITLE_FORMAT = 'YYYY-MM-DD-HH-mm';


// Base URL for the OpenRouter API service
export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1'; // Renamed from ENDPOINT