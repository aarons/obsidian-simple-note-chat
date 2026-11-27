import { describe, expect, it, vi } from 'vitest';
import type { Editor, EditorPosition, Plugin, TFile } from 'obsidian';
import { EditorSelection, EditorState } from '@codemirror/state';
import type { TransactionSpec } from '@codemirror/state';

vi.mock('obsidian', () => ({
    Notice: class {},
    getLinkpath: (link: string) => link.split('#')[0],
}));

import { ChatService } from './ChatService';
import { CHAT_SEPARATOR } from './constants';
import { DEFAULT_SETTINGS } from './types';

function setup(useCodeMirror = true) {
    let text = `Private [[secret]]\n^^^\nQuestion [[reference]]\n\n${CHAT_SEPARATOR}\n\nPrevious answer\n\n${CHAT_SEPARATOR}\n\nFollow up\n`;
    let state = EditorState.create({ doc: text, extensions: [EditorState.allowMultipleSelections.of(true)] });
    let scroll = { left: 0, top: 0 };
    const posToOffset = (pos: EditorPosition) => text.split('\n').slice(0, pos.line).reduce((n, line) => n + line.length + 1, 0) + pos.ch;
    const offsetToPos = (offset: number) => {
        const lines = text.slice(0, offset).split('\n');
        return { line: lines.length - 1, ch: lines[lines.length - 1].length };
    };
    const cm = {
        get state() { return state; },
        dispatch: vi.fn((spec: TransactionSpec) => {
            const transaction = state.update(spec);
            state = transaction.state;
            text = state.doc.toString();
            // Model Obsidian's public edits revealing an offscreen cursor.
            if (transaction.scrollIntoView) scroll = { left: 0, top: state.selection.main.head * 20 };
        }),
    };
    const editor = {
        ...(useCodeMirror ? { cm } : {}),
        getValue: () => text, posToOffset, offsetToPos,
        replaceRange: vi.fn((value: string, from: EditorPosition, to = from) => cm.dispatch({
            changes: { from: posToOffset(from), to: posToOffset(to), insert: value }, scrollIntoView: true,
        })),
        getRange: (from: EditorPosition, to: EditorPosition) => text.slice(posToOffset(from), posToOffset(to)),
        setCursor: vi.fn((pos: EditorPosition) => cm.dispatch({ selection: { anchor: posToOffset(pos) }, scrollIntoView: true })),
        getScrollInfo: () => ({ ...scroll }),
        scrollTo: vi.fn((left: number, top: number) => { scroll = { left, top }; }),
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
    return { editor, cm, provider, service, app, indexed, start, file };
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

describe('navigation during streaming', () => {
    it.each([true, false])('respects new scroll positions and selections through every chunk and completion (CM6: %s)', async useCodeMirror => {
        const f = setup(useCodeMirror);
        const original = f.editor.getValue();
        // Include a backwards selection and a second range to exercise CM mapping.
        const selection = EditorSelection.create([EditorSelection.range(17, 8), EditorSelection.range(24, 30)]);
        f.cm.dispatch({ selection });
        f.editor.scrollTo(12, 400);
        f.provider.streamChatCompletion.mockImplementation(async function* () {
            // Even the initial status insertion must leave navigation alone.
            expect(f.editor.getScrollInfo()).toEqual({ left: 12, top: 400 });
            yield 'First line\n';
            expect(f.editor.getScrollInfo()).toEqual({ left: 12, top: 400 });
            expect(f.cm.state.selection.eq(selection)).toBe(true);

            // Move to a different part of the note between arriving chunks.
            f.editor.scrollTo(0, 80);
            yield 'Second line';
            expect(f.editor.getScrollInfo()).toEqual({ left: 0, top: 80 });

            // Select newly streamed text: the next chunk still goes at the response end.
            const responseStart = f.editor.getValue().indexOf('First line');
            const responseSelection = EditorSelection.single(responseStart, responseStart + 5);
            f.cm.dispatch({ selection: responseSelection });
            f.editor.scrollTo(7, 250);
            yield '\nThird line';
            expect(f.editor.getScrollInfo()).toEqual({ left: 7, top: 250 });
            expect(f.cm.state.selection.eq(responseSelection)).toBe(true);
        });

        await f.start();

        expect(f.editor.getScrollInfo()).toEqual({ left: 7, top: 250 });
        expect(f.cm.state.sliceDoc(f.cm.state.selection.main.from, f.cm.state.selection.main.to)).toBe('First');
        expect(f.editor.setCursor).not.toHaveBeenCalled();
        expect(f.editor.getValue()).toBe(`${original}\n${CHAT_SEPARATOR}\n\nFirst line\nSecond line\nThird line\n\n${CHAT_SEPARATOR}\n\n`);
        expect(f.service.isStreamActive(f.file.path)).toBe(false);
        if (useCodeMirror) {
            expect(f.editor.replaceRange).not.toHaveBeenCalled();
            // No corrective scrolls (which would fight a user's ongoing scroll gesture).
            expect(f.editor.scrollTo).toHaveBeenCalledTimes(3);
            expect(f.cm.dispatch.mock.calls.every(([spec]) => !spec.scrollIntoView)).toBe(true);
        }
    });

    it.each(['empty', 'error', 'cancel'] as const)('does not jump when status is removed after %s', async outcome => {
        const f = setup();
        const original = f.editor.getValue();
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        f.provider.streamChatCompletion.mockImplementation(async function* () {
            f.editor.scrollTo(10, 300);
            f.cm.dispatch({ selection: EditorSelection.single(28, 23) });
            if (outcome === 'error') throw new Error('Provider unavailable');
            if (outcome === 'cancel') {
                f.service.cancelStream(f.file.path, f.editor);
                throw new DOMException('Cancelled', 'AbortError');
            }
        });
        try {
            await f.start();
            expect(f.editor.getScrollInfo()).toEqual({ left: 10, top: 300 });
            expect(f.cm.state.selection.eq(EditorSelection.single(28, 23))).toBe(true);
            expect(f.editor.getValue()).toBe(original);
            expect(f.editor.setCursor).not.toHaveBeenCalled();
            expect(f.service.isStreamActive(f.file.path)).toBe(false);
        } finally { errorLog.mockRestore(); }
    });
});
