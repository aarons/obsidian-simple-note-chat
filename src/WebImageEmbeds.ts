import type { CachedMetadata } from 'obsidian';

/** Obsidian indexes local images. Inline web images retain their Markdown destinations. */
function webImageAt(text: string, from: number, limit: number) {
    let cursor = from + 2; // After "![".
    let brackets = 1;
    while (cursor < limit && brackets) {
        const char = text[cursor++];
        if (char === '\\') cursor++;
        else if (char === '[') brackets++;
        else if (char === ']') brackets--;
    }
    const destination = /\(\s*(<)?(?=https?:\/\/)/iy;
    destination.lastIndex = cursor;
    const match = destination.exec(text);
    if (brackets || !match || destination.lastIndex >= limit) return;

    const start = destination.lastIndex;
    const angle = !!match[1];
    let parentheses = 0;
    for (cursor = start; cursor < limit; cursor++) {
        const char = text[cursor];
        if (char === '\\') cursor++;
        else if (angle) {
            if (char === '>') break;
            if (char === '\n' || char === '<') return;
        } else if (/\s/.test(char) || (char === ')' && !parentheses)) break;
        else if (char === '(') parentheses++;
        else if (char === ')') parentheses--;
    }
    const suffix = /(?:\s+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\)))?\s*\)/y;
    suffix.lastIndex = cursor + (angle ? 1 : 0);
    if (parentheses || !suffix.exec(text) || suffix.lastIndex > limit) return;
    const destinationText = text.slice(start, cursor).replace(/\\([\\()<>])/g, '$1');
    try {
        return { url: new URL(destinationText).href, end: suffix.lastIndex };
    } catch {
        throw new Error('Invalid web image URL. Check the destination of the Markdown image embed.');
    }
}

export function webImageEmbeds(text: string, cache: CachedMetadata, start: number, end: number) {
    const images: { offset: number; url: string }[] = [];
    const selection = text.slice(start, end);
    if (!selection.includes('![') || !/https?:\/\//i.test(selection)) return images;

    const sections = cache.sections ?? [];
    let sectionIndex = 0;
    const tokens = /\\[\s\S]|<!--|%%|`+|~{3,}|!\[/g;
    let token: RegExpExecArray | null;
    while ((token = tokens.exec(text)) && token.index < end) {
        while (sectionIndex < sections.length && sections[sectionIndex].position.end.offset <= token.index) sectionIndex++;
        const block = sections[sectionIndex];
        const inBlock = block && block.position.start.offset <= token.index;
        if (inBlock && ['code', 'yaml', 'html', 'comment'].includes(block.type)) {
            tokens.lastIndex = block.position.end.offset;
            continue;
        }
        const limit = inBlock ? block.position.end.offset : text.length;
        if (token[0] === '<!--' || token[0] === '%%') {
            const closer = token[0] === '<!--' ? '-->' : '%%';
            const close = text.indexOf(closer, tokens.lastIndex);
            tokens.lastIndex = close < 0 ? text.length : close + closer.length;
        } else if (token[0][0] === '`' || token[0][0] === '~') {
            const marker = token[0];
            // Fences inside a quote or list belong to that container's metadata section.
            const lineStart = text.lastIndexOf('\n', token.index - 1) + 1;
            if (marker.length >= 3 && /^[ \t>]*(?:(?:[-+*]|\d+[.)])[ \t]+)?$/.test(text.slice(lineStart, token.index))) {
                const fenceEnd = new RegExp('^[ \\t>]*' + marker[0] + '{' + marker.length + ',}[ \\t]*\\r?$', 'gm');
                fenceEnd.lastIndex = tokens.lastIndex;
                const close = fenceEnd.exec(text);
                tokens.lastIndex = close && close.index < limit ? fenceEnd.lastIndex : limit;
                continue;
            }
            if (marker[0] === '~') continue;
            // A code span ends at a run of exactly as many backticks in this block.
            const ticks = /`+/g;
            ticks.lastIndex = tokens.lastIndex;
            let close: RegExpExecArray | null;
            while ((close = ticks.exec(text)) && close.index < limit) {
                if (close[0] === marker) { tokens.lastIndex = ticks.lastIndex; break; }
            }
        } else if (token[0] === '![' && token.index >= start) {
            const image = webImageAt(text, token.index, Math.min(limit, end));
            if (image) {
                images.push({ offset: token.index, url: image.url });
                tokens.lastIndex = image.end;
            }
        }
    }
    return images;
}
