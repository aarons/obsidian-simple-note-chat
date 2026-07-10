import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', () => ({
    normalizePath: (path: string) => path.replace(/\/+/g, '/').replace(/^\//, ''),
    App: class {},
    TFile: class {},
    Notice: class {},
    Editor: class {},
    moment: () => ({ format: () => '' }),
    requestUrl: () => { throw new Error('network not available in tests'); },
}));

import { FileSystemService } from './FileSystemService';

// findAvailablePath decides where an archived or new note lands when its
// preferred name is taken. A wrong split of name vs. extension produces
// unusable paths like "note.md 1" instead of "note 1.md".
describe('findAvailablePath', () => {
    function serviceWithExistingPaths(existing: string[]): FileSystemService {
        const taken = new Set(existing);
        const app = {
            vault: {
                getAbstractFileByPath: (path: string) => (taken.has(path) ? {} : null),
            },
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new FileSystemService(app as any, {} as any);
    }

    it('returns the direct path when nothing occupies it', () => {
        const service = serviceWithExistingPaths([]);
        expect(service.findAvailablePath('archive', 'note.md')).toBe('archive/note.md');
    });

    it('inserts a counter before the extension and increments past existing collisions', () => {
        const service = serviceWithExistingPaths(['archive/note.md', 'archive/note 1.md']);
        expect(service.findAvailablePath('archive', 'note.md')).toBe('archive/note 2.md');
    });

    it('treats only the final dot segment as the extension, so dotted date-format names stay intact', () => {
        // archiveRenameDateFormat is user-configurable and may contain dots (e.g. "YYYY.MM.DD")
        const service = serviceWithExistingPaths(['archive/2026.07.09.md']);
        expect(service.findAvailablePath('archive', '2026.07.09.md')).toBe('archive/2026.07.09 1.md');
    });
});
