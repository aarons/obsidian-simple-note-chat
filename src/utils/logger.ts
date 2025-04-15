/**
 * Simple logger utility that only logs in development environments
 * Per Obsidian guidelines, we should avoid console logs in production builds
 */

const isDev = () => {
    // Check common development environment indicators
    return (
        process.env.NODE_ENV === 'development' ||
        process.env.DEBUG === 'true' ||
        process.env.DEBUG === '*' ||
        // @ts-ignore - Check Obsidian special environment variable
        (typeof globalThis.app !== 'undefined' && (globalThis.app).inDevMode)
    );
};

export const log = {
    debug: (message: string, ...args: any[]): void => {
        if (isDev()) {
            console.log(message, ...args);
        }
    },
    info: (message: string, ...args: any[]): void => {
        if (isDev()) {
            console.info(message, ...args);
        }
    },
    warn: (message: string, ...args: any[]): void => {
        if (isDev()) {
            console.warn(message, ...args);
        }
    },
    error: (message: string, ...args: any[]): void => {
        // Always show errors to help with debugging, even in production
        console.error(message, ...args);
    }
};
