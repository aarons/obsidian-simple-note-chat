// src/utils/llmTitle.ts

// Whitelist approach for sanitization
const BASIC_WHITELIST_REGEX = /[^a-zA-Z0-9 ]/g;
// Regex to keep alphanumeric characters, spaces, and common emoji ranges (requires 'u' flag)
const EMOJI_WHITELIST_REGEX = /[^a-zA-Z0-9 \u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu;

/**
 * Turns a raw LLM completion into a filename-safe, title-cased note title.
 *
 * This carries the business guarantee that titles are short: the word limit is
 * enforced here on the response, not via request token caps (reasoning models
 * spend completion tokens before emitting content, so token caps can't bound
 * the title length without starving it entirely).
 *
 * Pipeline: character whitelist → whitespace collapse → 100-char cap →
 * truncate to word limit → title-case.
 *
 * @param rawTitle The raw completion text from the model.
 * @param wordLimit Maximum number of words to keep (must be >= 1).
 * @param includeEmojis Whether common emoji ranges survive sanitization.
 * @returns The formatted title, or '' if nothing survives sanitization.
 */
export function formatLlmTitle(rawTitle: string, wordLimit: number, includeEmojis: boolean): string {
    const sanitized = rawTitle
        .replace(includeEmojis ? EMOJI_WHITELIST_REGEX : BASIC_WHITELIST_REGEX, '')
        .trim()                 // Trim leading/trailing whitespace
        .replace(/\s+/g, ' ')   // Collapse multiple spaces to one
        .substring(0, 100);     // Limit length

    return sanitized
        .split(' ')
        .filter(word => word.length > 0) // The 100-char cap can leave a trailing space
        .slice(0, wordLimit)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
