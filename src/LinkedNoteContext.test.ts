import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App, CachedMetadata, ReferenceCache, TFile } from 'obsidian';

vi.mock('obsidian', () => ({
    getLinkpath: (link: string) => link.split('#')[0],
    arrayBufferToBase64: (bytes: ArrayBuffer) => Buffer.from(bytes).toString('base64'),
}));

import { LinkedNoteContext, normalizeNoteLinkDepth, withLinkedNoteContext } from './LinkedNoteContext';
import { DEFAULT_SETTINGS } from './types';

// Cache fixtures represent Obsidian's parsed output, not a second Markdown parser.
// Markdown destinations arrive decoded once; wikilink display aliases are separate.
function reference(content: string, original: string, link: string): ReferenceCache {
    const start = content.indexOf(original);
    if (start < 0) throw new Error(`Missing fixture reference: ${original}`);
    return {
        original, link,
        position: {
            start: { line: 0, col: start, offset: start },
            end: { line: 0, col: start + original.length, offset: start + original.length },
        },
    };
}

function fixture() {
    const files = new Map<string, TFile>();
    const contents = new Map<string, string>();
    const caches = new Map<string, CachedMetadata>();
    const listeners = new Set<(file: TFile, data: string, cache: CachedMetadata) => void>();
    const app = {
        vault: {
            cachedRead: vi.fn(async (file: TFile) => contents.get(file.path)!),
            readBinary: vi.fn(async (file: TFile) => Uint8Array.from(Buffer.from(contents.get(file.path)!, 'base64')).buffer),
        },
        metadataCache: {
            on: vi.fn((_event, callback) => { listeners.add(callback); return callback; }),
            offref: vi.fn(callback => listeners.delete(callback)),
            getFileCache: vi.fn((file: TFile) => caches.get(file.path) ?? null),
            getFirstLinkpathDest: vi.fn((link: string, _source: string) => files.get(link) ?? files.get(`${link}.md`) ?? null),
        },
    };
    const add = (path: string, content: string, links: [string, string][] = [], embeds: [string, string][] = []) => {
        const file = { path, extension: path.split('.').pop() } as TFile;
        files.set(path, file);
        contents.set(path, content);
        caches.set(path, {
            links: links.map(([original, link]) => reference(content, original, link)),
            embeds: embeds.map(([original, link]) => reference(content, original, link)),
        });
        return file;
    };
    const indexed = (file: TFile, data = contents.get(file.path)!, cache = caches.get(file.path)!) => {
        for (const callback of listeners) callback(file, data, cache);
    };
    const service = new LinkedNoteContext(app as unknown as App);
    const collect = (source: TFile, depth: number | 'unlimited' | false, end = contents.get(source.path)!.length) => {
        const result = service.collect(source, contents.get(source.path)!, end, depth, new AbortController().signal);
        indexed(source);
        return result;
    };
    return { app, add, collect, service, indexed, caches, listeners };
}

afterEach(() => vi.useRealTimers());

describe('linked note traversal', () => {
    it.each([1, 2, 'unlimited'] as const)('follows exactly depth %s and terminates cycles', async depth => {
        const f = fixture();
        const root = f.add('root.md', '[[a]]', [['[[a]]', 'a']]);
        f.add('a.md', '[[b]] [[root]]', [['[[b]]', 'b'], ['[[root]]', 'root']]);
        f.add('b.md', '[[c]] [[a]]', [['[[c]]', 'c'], ['[[a]]', 'a']]);
        f.add('c.md', '[[b]]', [['[[b]]', 'b']]);
        const result = await f.collect(root, depth);
        expect(result.notes.map(n => n.path)).toEqual(
            depth === 1 ? ['a.md'] : depth === 2 ? ['a.md', 'b.md'] : ['a.md', 'b.md', 'c.md']
        );
        expect(f.app.vault.cachedRead).toHaveBeenCalledTimes(result.notes.length);
    });

    it('uses the shortest route when links converge, without duplicate context', async () => {
        const f = fixture();
        const root = f.add('root.md', '[[a]] [[b]]', [['[[a]]', 'a'], ['[[b]]', 'b']]);
        f.add('a.md', '[[b]]', [['[[b]]', 'b']]);
        f.add('b.md', '[[c]]', [['[[c]]', 'c']]);
        f.add('c.md', 'C');
        expect((await f.collect(root, 2)).notes.map(n => n.path)).toEqual(['a.md', 'b.md', 'c.md']);
    });

    it('applies boundaries and the insertion point only in the root; linked notes stay whole', async () => {
        const f = fixture();
        const content = '[[private]]\n^^^\n[[old]]\n  ^^^  \n[[a]]\nCalling model...\n[[later]]';
        const root = f.add('root.md', content, [
            ['[[private]]', 'private'], ['[[old]]', 'old'], ['[[a]]', 'a'], ['[[later]]', 'later'],
        ]);
        const linkedContent = 'Before: [[b]]\n^^^\nAfter: [[root]]';
        f.add('a.md', linkedContent, [['[[b]]', 'b'], ['[[root]]', 'root']]);
        f.add('b.md', 'B');
        f.add('private.md', 'private');
        f.add('old.md', 'old');
        f.add('later.md', 'later');
        const result = await f.collect(root, 2, content.indexOf('Calling'));
        expect(result.notes).toEqual([{ path: 'a.md', content: linkedContent }, { path: 'b.md', content: 'B' }]);
    });

    it('delegates both syntaxes, aliases, fragments, encoded paths and embeds to Obsidian', async () => {
        const f = fixture();
        const content = '[[a.md#^block|Alias]] [a](a.md#Heading) [b](../Some%20Note.md) [literal](literal%2520.md) ![[embed]]';
        const root = f.add('folder/root.md', content, [
            ['[[a.md#^block|Alias]]', 'a.md#^block'], ['[a](a.md#Heading)', 'a.md#Heading'],
            ['[b](../Some%20Note.md)', '../Some Note.md'], ['[literal](literal%2520.md)', 'literal%20.md'],
        ], [['![[embed]]', 'embed']]);
        f.add('a.md', 'A');
        const relative = f.add('Some Note.md', 'B');
        f.add('literal%20.md', 'Literal percent');
        f.add('embed.md', 'Embed');
        const resolve = f.app.metadataCache.getFirstLinkpathDest.getMockImplementation()!;
        f.app.metadataCache.getFirstLinkpathDest.mockImplementation((link, source) =>
            link === '../Some Note.md' && source === 'folder/root.md' ? relative : resolve(link, source));
        expect((await f.collect(root, 1)).notes.map(n => n.path)).toEqual(['a.md', 'Some Note.md', 'literal%20.md', 'embed.md']);
        expect(f.app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith('../Some Note.md', 'folder/root.md');
        expect(f.app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith('literal%20.md', 'folder/root.md');
    });

    it('ignores missing notes, other attachments, external links and local headings', async () => {
        const f = fixture();
        const root = f.add('root.md', '[[missing]] [[manual.pdf]] [[#Heading]] [web](https://example.com)', [
            ['[[missing]]', 'missing'], ['[[manual.pdf]]', 'manual.pdf'], ['[[#Heading]]', '#Heading'],
            ['[web](https://example.com)', 'https://example.com'],
        ]);
        f.add('manual.pdf', 'other attachment');
        expect((await f.collect(root, 'unlimited')).notes).toEqual([]);
        expect(f.app.vault.cachedRead).not.toHaveBeenCalled();
        expect(f.app.vault.readBinary).not.toHaveBeenCalled();
    });

    it('restricts root images to the selected chat and includes images in a linked note at the depth limit', async () => {
        const f = fixture();
        const png = 'iVBORw0KGgo=';
        const jpeg = '/9j/';
        const content = '![[private.png]]\n^^^\n[[guide]] ![[icon.png|80]]\ncc\n![[later.png]]';
        const root = f.add('root.md', content, [['[[guide]]', 'notes/guide']], [
            ['![[private.png]]', 'private.png'], ['![[icon.png|80]]', 'icon.png'], ['![[later.png]]', 'later.png'],
        ]);
        f.add('icon.png', png);
        const linked = '![side](<../side%20view.jpg>)\n^^^\n[[icon.png]] [[deeper]]';
        f.add('notes/guide.md', linked, [['[[icon.png]]', 'icon.png'], ['[[deeper]]', 'deeper']], [
            ['![side](<../side%20view.jpg>)', '../side view.jpg'],
        ]);
        const side = f.add('side view.jpg', jpeg);
        f.add('deeper.md', '![[unselected.png]]');
        const resolve = f.app.metadataCache.getFirstLinkpathDest.getMockImplementation()!;
        f.app.metadataCache.getFirstLinkpathDest.mockImplementation((link, source) =>
            link === '../side view.jpg' && source === 'notes/guide.md' ? side : resolve(link, source));

        const result = await f.collect(root, 1, content.indexOf('cc'));
        const pngUrl = `data:image/png;base64,${png}`;
        expect(result.images).toEqual([{ offset: content.indexOf('![[icon'), url: pngUrl }]);
        expect(result.notes).toEqual([{ path: 'notes/guide.md', content: linked, images: [`data:image/jpeg;base64,${jpeg}`, pngUrl] }]);
        expect(f.app.vault.readBinary.mock.calls.map(([file]) => file.path)).toEqual(['icon.png', 'side view.jpg']);
    });

    it('stops when a requested attachment cannot be sent', async () => {
        const f = fixture();
        const root = f.add('root.md', '![[ref.png]]', [], [['![[ref.png]]', 'ref.png']]);
        await expect(f.collect(root, false)).rejects.toThrow('Could not find reference image "ref.png"');
        f.add('ref.png', 'bm90IGFuIGltYWdl');
        await expect(f.collect(root, false)).rejects.toThrow('PNG, JPEG, WebP, or GIF');
        f.app.vault.readBinary.mockRejectedValueOnce(new Error('I/O error'));
        await expect(f.collect(root, false)).rejects.toThrow('Could not read reference image "ref.png"');
    });

    it('preserves web and vault image order while excluding literal Markdown and out-of-chat embeds', async () => {
        const f = fixture();
        const literal = '![literal](https://example.com/literal)';
        const content = [
            '![private](https://example.com/private)', '^^^',
            '![front [view]](https://example.com/mug_(front).png "Mug")', '![[cat.png]]',
            '![side](<https://example.com/side view>)',
            '`' + literal + '` <!-- ' + literal + ' --> %% ' + literal + ' %% \\' + literal,
            '> ~~~md', '> ' + literal, '> ~~~',
            '[ordinary link](https://example.com/page)', 'cc', '![later](https://example.com/later)',
        ].join('\n');
        // Obsidian omits remote URLs from its embeds array.
        const root = f.add('chat.md', content, [], [['![[cat.png]]', 'cat.png']]);
        f.add('cat.png', 'iVBORw0KGgo=');
        const result = await f.collect(root, false, content.indexOf('\ncc'));
        expect(result.images.map(image => image.url)).toEqual([
            'https://example.com/mug_(front).png', 'data:image/png;base64,iVBORw0KGgo=', 'https://example.com/side%20view',
        ]);
    });

    it('honors cancellation during an image read', async () => {
        const f = fixture();
        const text = '![[ref.png]]';
        const root = f.add('root.md', text, [], [[text, 'ref.png']]);
        f.add('ref.png', 'iVBORw0KGgo=');
        const controller = new AbortController();
        f.app.vault.readBinary.mockImplementationOnce(async () => {
            controller.abort();
            return new ArrayBuffer(0);
        });
        const request = f.service.collect(root, text, text.length, false, controller.signal);
        f.indexed(root);
        await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('continues past unreadable notes and reports missing metadata', async () => {
        const f = fixture();
        const root = f.add('root.md', '[[a]] [[b]]', [['[[a]]', 'a'], ['[[b]]', 'b']]);
        f.add('a.md', 'A');
        f.add('b.md', 'B');
        f.caches.delete('b.md');
        f.app.vault.cachedRead.mockRejectedValueOnce(new Error('Deleted'));
        const result = await f.collect(root, 2);
        expect(result.notes).toEqual([{ path: 'b.md', content: 'B' }]);
        expect(result.skipped).toEqual(['a.md', 'b.md']);
    });

    it('waits for the exact current snapshot, ignoring old indexes and other files', async () => {
        const f = fixture();
        const root = f.add('root.md', '[[new]]', [['[[new]]', 'new']]);
        const other = f.add('new.md', 'New content');
        const promise = f.service.collect(root, '[[new]]', 7, 1, new AbortController().signal);
        f.indexed(root, '[[old]]');
        f.indexed(other);
        expect(f.app.vault.cachedRead).not.toHaveBeenCalled();
        f.indexed(root);
        expect((await promise).notes).toEqual([{ path: 'new.md', content: 'New content' }]);
        expect(f.listeners.size).toBe(0);
    });

    it('cleans up and stops on indexing timeout or cancellation', async () => {
        vi.useFakeTimers();
        const f = fixture();
        const root = f.add('root.md', 'Text');
        const timed = f.service.collect(root, 'Text', 4, 2, new AbortController().signal);
        const rejection = expect(timed).rejects.toThrow('indexing');
        await vi.advanceTimersByTimeAsync(5000);
        await rejection;
        const controller = new AbortController();
        const cancelled = f.service.collect(root, 'Text', 4, 2, controller.signal);
        controller.abort();
        await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
        expect(f.listeners.size).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
        expect(f.app.vault.cachedRead).not.toHaveBeenCalled();
    });
});

it('defaults to off and depth 2; invalid stored depths cannot become unlimited', () => {
    expect(DEFAULT_SETTINGS.followNoteLinks).toBe(false);
    expect(DEFAULT_SETTINGS.noteLinkDepth).toBe(2);
    for (const value of [0, -1, 1.5, Infinity, NaN, null, '2']) {
        expect(normalizeNoteLinkDepth(value as any)).toBe(2);
    }
});

it('adds labeled reference context without modifying conversation roles or original messages', () => {
    const messages = [{ role: 'user' as const, content: 'Question' }, { role: 'assistant' as const, content: 'Answer' }];
    const result = withLinkedNoteContext(messages, [{ path: 'a.md', content: 'Reference text' }]);
    expect(result.map(m => m.role)).toEqual(['user', 'assistant']);
    expect(result[0].content).toContain('"a.md"');
    expect(result[0].content).toContain('Reference text');
    expect(result[0].content).toContain('Question');
    expect(messages[0].content).toBe('Question');
    expect(result[1]).toBe(messages[1]);
    expect(withLinkedNoteContext(messages, [])).toBe(messages);
});
