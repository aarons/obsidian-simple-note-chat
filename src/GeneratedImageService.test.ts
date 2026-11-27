import { describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
vi.mock('obsidian', () => ({ requestUrl: vi.fn() }));
import { requestUrl } from 'obsidian';
import { GeneratedImageService } from './GeneratedImageService';

const png = 'data:image/png;base64,iVBORw0KGgo=';
function fixture() {
    const file = { path: 'attachments/generated.png' } as TFile;
    const app = {
        fileManager: { getAvailablePathForAttachment: vi.fn(async () => file.path) },
        vault: { createBinary: vi.fn(async () => file), delete: vi.fn(async () => {}) },
    };
    const controller = new AbortController();
    const save = (url = png) => new GeneratedImageService(app as unknown as App).save(url, { path: 'notes/chat.md' } as TFile, controller.signal);
    return { app, file, controller, save };
}

describe('generated image attachments', () => {
    it('uses the note attachment location and embeds saved bytes with a vault-relative path', async () => {
        const f = fixture();
        expect(await f.save()).toBe('\n\n![[attachments/generated.png]]\n\n');
        expect(f.app.fileManager.getAvailablePathForAttachment).toHaveBeenCalledWith(expect.stringMatching(/^generated-.*\.png$/), 'notes/chat.md');
        const bytes = (f.app.vault.createBinary.mock.calls[0] as unknown as [string, ArrayBuffer])[1];
        expect([...new Uint8Array(bytes)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    });

    it.each(['http://example.com/image.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,A', 'data:image/png;base64,'])('rejects unsupported or invalid payload %s without saving', async url => {
        const f = fixture();
        await expect(f.save(url)).rejects.toThrow();
        expect(f.app.vault.createBinary).not.toHaveBeenCalled();
    });

    it('persists remote images without sending provider credentials', async () => {
        const f = fixture();
        vi.mocked(requestUrl).mockResolvedValue({ status: 200, headers: { 'Content-Type': 'application/octet-stream' }, arrayBuffer: new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]).buffer } as any);
        await f.save('https://example.com/generated.webp');
        expect(requestUrl).toHaveBeenLastCalledWith({ url: 'https://example.com/generated.webp', method: 'GET', throw: false });
        expect(f.app.fileManager.getAvailablePathForAttachment).toHaveBeenCalledWith(expect.stringMatching(/\.webp$/), 'notes/chat.md');
    });

    it('detects the format from bytes when the provider omits or mislabels the media type', async () => {
        const f = fixture();
        await f.save('data:application/octet-stream;base64,/9j/');
        expect(f.app.fileManager.getAvailablePathForAttachment).toHaveBeenLastCalledWith(expect.stringMatching(/\.jpg$/), 'notes/chat.md');
        await f.save('data:image/png;base64,R0lGODlh');
        expect(f.app.fileManager.getAvailablePathForAttachment).toHaveBeenLastCalledWith(expect.stringMatching(/\.gif$/), 'notes/chat.md');
    });

    it('does not save after cancellation during path resolution', async () => {
        const f = fixture();
        f.app.fileManager.getAvailablePathForAttachment.mockImplementation(async () => { f.controller.abort(); return f.file.path; });
        await expect(f.save()).rejects.toMatchObject({ name: 'AbortError' });
        expect(f.app.vault.createBinary).not.toHaveBeenCalled();
    });

    it('removes only the new unembedded attachment if cancelled during saving', async () => {
        const f = fixture();
        f.app.vault.createBinary.mockImplementation(async () => { f.controller.abort(); return f.file; });
        await expect(f.save()).rejects.toMatchObject({ name: 'AbortError' });
        expect(f.app.vault.delete).toHaveBeenCalledWith(f.file);
    });
});
