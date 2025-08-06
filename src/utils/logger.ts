import { PluginSettings, LogLevel } from '../types';

/**
 * Logger utility with configurable levels controlled by plugin settings.
 */

let loggingEnabled = false;
let currentLogLevel = LogLevel.ERROR;

const LogLevelValue: { [key in LogLevel]: number } = {
	[LogLevel.ERROR]: 1,
	[LogLevel.WARN]: 2,
	[LogLevel.INFO]: 3,
	[LogLevel.DEBUG]: 4,
};

/**
 * Initializes logger with current plugin settings.
 */
export const initializeLogger = (settings: PluginSettings): void => {
	loggingEnabled = settings.enableLogging;
	currentLogLevel = settings.logLevel;
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
		if (loggingEnabled && LogLevelValue[currentLogLevel] >= LogLevelValue[LogLevel.ERROR]) {
			console.error(`[ERROR] ${message}`, ...args);
		}
	}
};
