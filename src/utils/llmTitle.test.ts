import { describe, it, expect } from 'vitest';
import { formatLlmTitle } from './llmTitle';

// formatLlmTitle carries the business guarantee that archived-note titles are
// short and filename-safe regardless of what the model returns. The word limit
// is enforced here — not via request token caps, which starve reasoning models.
describe('formatLlmTitle', () => {
    it('truncates a response longer than the word limit to exactly the limit', () => {
        const rambling = 'A Very Long And Excessively Detailed Title About Many Things';
        expect(formatLlmTitle(rambling, 3, false)).toBe('A Very Long');
    });

    it('sanitizes punctuation and quotation marks and title-cases the result', () => {
        expect(formatLlmTitle('"my note: about  (three) things!"', 5, false))
            .toBe('My Note About Three Things');
    });

    it('returns empty string when nothing survives sanitization, so the caller can fall back to the current filename', () => {
        expect(formatLlmTitle('«::…!!??»', 5, false)).toBe('');
    });

    it('strips emojis when disabled but keeps them when enabled', () => {
        const withEmoji = 'Rocket 🚀 Launch Plan';
        expect(formatLlmTitle(withEmoji, 5, false)).toBe('Rocket Launch Plan');
        expect(formatLlmTitle(withEmoji, 5, true)).toBe('Rocket 🚀 Launch Plan');
    });

    it('caps titles at 100 characters even when the word limit alone would allow more', () => {
        const longWords = Array(10).fill('Abcdefghijklmnopqrst').join(' '); // 10 words x 20 chars
        const result = formatLlmTitle(longWords, 10, false);
        expect(result.length).toBeLessThanOrEqual(100);
        // The cap cuts mid-list; surviving words stay intact and none are empty
        expect(result.split(' ').every(word => word.length > 0)).toBe(true);
    });
});
