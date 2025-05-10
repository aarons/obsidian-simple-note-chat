import { PluginSettings } from '../types';
import { LogLevel } from '../constants';

/**
 * Simple logger utility.
 * Logging behavior is controlled by plugin settings.
 */

// Module-level variables to store current logging settings
let loggingEnabled = false;
let currentLogLevel = LogLevel.ERROR;

// Map LogLevel enum to numeric values for easier comparison
const LogLevelValue: { [key in LogLevel]: number } = {
	[LogLevel.ERROR]: 1,
	[LogLevel.WARN]: 2,
	[LogLevel.INFO]: 3,
	[LogLevel.DEBUG]: 4,
};

/**
 * Initializes or updates the logger settings.
 * Called by the main plugin on load and when settings change.
 * @param settings The current plugin settings.
 */
export const initializeLogger = (settings: PluginSettings): void => {
	loggingEnabled = settings.enableLogging;
	currentLogLevel = settings.logLevel;
	// Log initialization status itself if INFO level is enabled
	if (loggingEnabled && LogLevelValue[currentLogLevel] >= LogLevelValue[LogLevel.INFO]) {
		console.info(`Logger initialized. Logging enabled: ${loggingEnabled}, Level: ${currentLogLevel}`);
	}
};

export const log = {
	debug: (message: string, ...args: any[]): void => {
		if (loggingEnabled && LogLevelValue[currentLogLevel] >= LogLevelValue[LogLevel.DEBUG]) {
			console.debug(`[DEBUG] ${message}`, ...args);
		}
	},
	info: (message: string, ...args: any[]): void => {
		if (loggingEnabled && LogLevelValue[currentLogLevel] >= LogLevelValue[LogLevel.INFO]) {
			console.info(`[INFO] ${message}`, ...args);
		}
	},
	warn: (message: string, ...args: any[]): void => {
		if (loggingEnabled && LogLevelValue[currentLogLevel] >= LogLevelValue[LogLevel.WARN]) {
			console.warn(`[WARN] ${message}`, ...args);
		}
	},
	error: (message: string, ...args: any[]): void => {
		// Errors are logged if logging is enabled, regardless of level (minimum level is ERROR)
		if (loggingEnabled && LogLevelValue[currentLogLevel] >= LogLevelValue[LogLevel.ERROR]) {
			console.error(`[ERROR] ${message}`, ...args);
		}
	}
};
