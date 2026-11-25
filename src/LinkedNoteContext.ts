import { App, CachedMetadata, getLinkpath, TFile } from 'obsidian';
import { getChatContentStart } from './constants';
import { ChatMessage, DEFAULT_SETTINGS, PluginSettings } from './types';
import { log } from './utils/logger';

interface LinkedNote {
    path: string;
    content: string;
}

export function normalizeNoteLinkDepth(depth: PluginSettings['noteLinkDepth']): number | 'unlimited' {
    return depth === 'unlimited' || (Number.isSafeInteger(depth) && Number(depth) >= 1)
        ? depth : DEFAULT_SETTINGS.noteLinkDepth;
}

function checkCancelled(signal: AbortSignal): void {
    if (signal.aborted) throw new DOMException('Chat cancelled', 'AbortError');
}

/** Collects note context using only Obsidian's parsed links and vault APIs. */
export class LinkedNoteContext {
    constructor(private app: App) {}

    /**
     * startChat's status insertion schedules an Obsidian save/index. Wait for that
     * exact snapshot: the existing cache may predate the user's latest links.
     * There is no public Obsidian API to parse an arbitrary Markdown string.
     */
    private waitForIndex(file: TFile, content: string, signal: AbortSignal): Promise<CachedMetadata> {
        checkCancelled(signal);
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timeout);
                this.app.metadataCache.offref(event);
                signal.removeEventListener('abort', onAbort);
            };
            const onAbort = () => {
                cleanup();
                reject(new DOMException('Chat cancelled', 'AbortError'));
            };
            const event = this.app.metadataCache.on('changed', (changedFile, data, cache) => {
                if (changedFile.path === file.path && data === content) {
                    cleanup();
                    resolve(cache);
                }
            });
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Obsidian has not finished indexing this note. Wait a moment and try chatting again.'));
            }, 5000);
            signal.addEventListener('abort', onAbort, { once: true });
        });
    }

    async collect(
        source: TFile,
        sourceContent: string,
        end: number,
        depthSetting: PluginSettings['noteLinkDepth'],
        signal: AbortSignal
    ): Promise<{ notes: LinkedNote[]; skipped: string[] }> {
        const depth = normalizeNoteLinkDepth(depthSetting);
        const maxDepth = depth === 'unlimited' ? Infinity : depth;
        const rootCache = await this.waitForIndex(source, sourceContent, signal);
        const visited = new Set([source.path]);
        const queue: { file: TFile; depth: number }[] = [];
        const notes: LinkedNote[] = [];
        const skipped: string[] = [];

        const enqueueLinks = (file: TFile, content: string, cache: CachedMetadata, end: number, depth: number, start = 0) => {
            const refs = [...(cache.links ?? []), ...(cache.embeds ?? [])]
                .sort((a, b) => a.position.start.offset - b.position.start.offset);
            for (const ref of refs) {
                const from = ref.position.start.offset;
                const to = ref.position.end.offset;
                // Preserve chat boundaries and reject stale positions rather than
                // including a link that is no longer in the selected text.
                if (from < start || to > end || content.slice(from, to) !== ref.original) continue;
                if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(ref.link)) continue;
                const linkpath = getLinkpath(ref.link);
                if (!linkpath) continue; // A heading/block in this same note.
                const target = this.app.metadataCache.getFirstLinkpathDest(linkpath, file.path);
                if (!target || target.extension.toLowerCase() !== 'md' || visited.has(target.path)) continue;
                visited.add(target.path);
                queue.push({ file: target, depth });
            }
        };

        enqueueLinks(source, sourceContent, rootCache, end, 1, getChatContentStart(sourceContent, end));
        // Breadth-first order ensures a note first reached via a longer route
        // doesn't lose the opportunity to expand at its shortest depth.
        for (let index = 0; index < queue.length; index++) {
            checkCancelled(signal);
            const { file, depth } = queue[index];
            let content: string;
            try {
                content = await this.app.vault.cachedRead(file);
            } catch (error) {
                checkCancelled(signal);
                log.warn(`Could not read linked note: ${file.path}`, error);
                skipped.push(file.path);
                continue;
            }
            checkCancelled(signal);
            notes.push({ path: file.path, content });
            if (depth < maxDepth) {
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache) enqueueLinks(file, content, cache, content.length, depth + 1);
                else skipped.push(file.path);
            }
        }
        return { notes, skipped };
    }
}

/** Add reference material to the first user message without changing conversation roles. */
export function withLinkedNoteContext(messages: ChatMessage[], notes: LinkedNote[]): ChatMessage[] {
    if (!notes.length || !messages.length) return messages;
    const context = notes.map(note =>
        `--- Note: ${JSON.stringify(note.path)} ---\n${note.content}\n--- End note ---`
    ).join('\n\n');
    return [
        { ...messages[0], content: `Linked note context (reference material):\n\n${context}\n\n--- Conversation ---\n\n${messages[0].content}` },
        ...messages.slice(1),
    ];
}
