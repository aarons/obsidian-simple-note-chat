/**
 * Simple encryption utility for API keys using base64 encoding.
 * This provides basic obfuscation to avoid storing API keys in plain text.
 */

const ENCRYPTION_PREFIX = 'snc_encrypted:';

/**
 * Encrypts a string using base64 encoding with a simple prefix.
 * @param plaintext The string to encrypt
 * @returns The encrypted string with prefix
 */
export function encryptApiKey(plaintext: string): string {
    if (!plaintext) {
        return '';
    }

    // Simple base64 encoding with prefix to identify encrypted values
    const encoded = btoa(plaintext);
    return ENCRYPTION_PREFIX + encoded;
}

/**
 * Decrypts a string that was encrypted with encryptApiKey.
 * @param encrypted The encrypted string
 * @returns The decrypted plaintext string
 */
export function decryptApiKey(encrypted: string): string {
    if (!encrypted) {
        return '';
    }

    // Check if the string is encrypted (has our prefix)
    if (!encrypted.startsWith(ENCRYPTION_PREFIX)) {
        // If no prefix, assume it's already plaintext (for backward compatibility)
        return encrypted;
    }

    try {
        // Remove prefix and decode
        const encoded = encrypted.substring(ENCRYPTION_PREFIX.length);
        return atob(encoded);
    } catch (error) {
        // If decoding fails, return empty string
        console.warn('Failed to decrypt API key:', error);
        return '';
    }
}

/**
 * Checks if a string appears to be encrypted.
 * @param value The string to check
 * @returns True if the string appears to be encrypted
 */
export function isEncrypted(value: string): boolean {
    return value.startsWith(ENCRYPTION_PREFIX);
}