import { describe, expect, it, vi } from 'vitest';
import type { Editor, EditorPosition, Plugin, TFile } from 'obsidian';

vi.mock('obsidian', () => ({
    Notice: class {},
    getLinkpath: (link: string) => link.split('#')[0],
}));

import { ChatService } from './ChatService';
import { CHAT_SEPARATOR } from './constants';
import { DEFAULT_SETTINGS } from './types';

function setup() {
    let text = `Private [[secret]]\n^^^\nQuestion [[reference]]\n\n${CHAT_SEPARATOR}\n\nPrevious answer\n\n${CHAT_SEPARATOR}\n\nFollow up\n`;
    const posToOffset = (pos: EditorPosition) => text.split('\n').slice(0, pos.line).reduce((n, line) => n + line.length + 1, 0) + pos.ch;
    const offsetToPos = (offset: number) => {
        const lines = text.slice(0, offset).split('\n');
        return { line: lines.length - 1, ch: lines[lines.length - 1].length };
    };
    const editor = {
        getValue: () => text, posToOffset, offsetToPos,
        replaceRange: (value: string, from: EditorPosition, to = from) => {
            text = text.slice(0, posToOffset(from)) + value + text.slice(posToOffset(to));
        },
        getRange: (from: EditorPosition, to: EditorPosition) => text.slice(posToOffset(from), posToOffset(to)),
        setCursor: vi.fn(),
    } as unknown as Editor;
    const file = { path: 'root.md', extension: 'md' } as TFile;
    const target = { path: 'reference.md', extension: 'md' } as TFile;
    let listener: ((...args: any[]) => void) | undefined;
    const metadataCache = {
        on: vi.fn((_event: string, callback: (...args: any[]) => void) => { listener = callback; return callback; }),
        offref: vi.fn(() => { listener = undefined; }),
        getFirstLinkpathDest: vi.fn(() => target),
        getFileCache: vi.fn(() => ({})),
    };
    const app = { metadataCache, vault: { cachedRead: vi.fn(async () => 'Reference before\n^^^\nReference after') } };
    const provider = {
        streamChatCompletion: vi.fn(async function* () { yield 'New answer'; }),
        getChatCompletion: vi.fn(), getModelReasoningInfo: vi.fn(),
    };
    const service = new ChatService({ app } as unknown as Plugin, provider);
    const indexed = () => {
        const original = '[[reference]]';
        const offset = text.indexOf(original);
        listener?.(file, text, { links: [{ original, link: 'reference', position: {
            start: { offset }, end: { offset: offset + original.length },
        } }] });
    };
    const start = (enabled = false) => service.startChat(editor, file, { ...DEFAULT_SETTINGS, followNoteLinks: enabled }, offsetToPos(text.length));
    return { editor, provider, service, app, indexed, start, file };
}

describe('chat context integration', () => {
    it('keeps the default request unchanged and never accesses linked notes when off', async () => {
        const f = setup();
        await f.start();
        expect(f.provider.streamChatCompletion).toHaveBeenCalledWith([
            { role: 'user', content: 'Question [[reference]]' },
            { role: 'assistant', content: 'Previous answer' },
            { role: 'user', content: 'Follow up' },
        ], expect.any(Object), expect.any(AbortSignal));
        expect(f.app.metadataCache.on).not.toHaveBeenCalled();
        expect(f.app.vault.cachedRead).not.toHaveBeenCalled();
    });

    it('sends full linked context to the provider without writing it into the chat note', async () => {
        const f = setup();
        const chat = f.start(true);
        expect(f.provider.streamChatCompletion).not.toHaveBeenCalled();
        f.indexed();
        await chat;
        const messages = (f.provider.streamChatCompletion.mock.calls[0] as unknown as [any[]])[0];
        expect(messages[0].content).toContain('Reference before\n^^^\nReference after');
        expect(messages[0].content).not.toContain('Private');
        expect(messages.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
        expect(f.editor.getValue()).not.toContain('Reference before');
        expect(f.editor.getValue()).toContain('New answer');
        expect(f.editor.getValue()).not.toContain('Calling');
        expect(f.service.isStreamActive(f.file.path)).toBe(false);
    });

    it('can cancel while waiting for indexing without sending a provider request', async () => {
        const f = setup();
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const chat = f.start(true);
            f.service.cancelStream(f.file.path, f.editor);
            await chat;
            expect(f.provider.streamChatCompletion).not.toHaveBeenCalled();
            expect(f.app.metadataCache.offref).toHaveBeenCalledTimes(1);
            expect(f.editor.getValue()).not.toContain('Calling');
            expect(f.service.isStreamActive(f.file.path)).toBe(false);
        } finally { errorLog.mockRestore(); }
    });
});
