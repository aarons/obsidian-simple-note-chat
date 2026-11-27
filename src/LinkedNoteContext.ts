import { App, arrayBufferToBase64, CachedMetadata, getLinkpath, TFile } from 'obsidian';
import { getChatContentStart } from './constants';
import { ChatMessage, DEFAULT_SETTINGS, PluginSettings } from './types';
import { log } from './utils/logger';
import { imageExtension } from './utils/imageFormat';
import { webImageEmbeds } from './WebImageEmbeds';

interface LinkedNote {
    path: string;
    content: string;
    images?: string[];
}

export interface NoteImage {
    offset: number;
    url: string;
}

const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'jfif', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic', 'heif', 'tif', 'tiff', 'apng', 'ico']);
const imageSuffix = new RegExp(`\\.(?:${Array.from(imageExtensions).join('|')})\\b`, 'i');

/** Only a fast path for ordinary text. Obsidian decides which links are real. */
export function mayContainImages(text: string): boolean {
    return text.includes('![') || (text.includes('[') && imageSuffix.test(text));
}

export function normalizeNoteLinkDepth(depth: PluginSettings['noteLinkDepth']): number | 'unlimited' {
    return depth === 'unlimited' || (Number.isSafeInteger(depth) && Number(depth) >= 1)
        ? depth : DEFAULT_SETTINGS.noteLinkDepth;
}

function checkCancelled(signal: AbortSignal): void {
    if (signal.aborted) throw new DOMException('Chat cancelled', 'AbortError');
}

/** Resolve vault references relative to the note that contains them. */
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
        depthSetting: PluginSettings['noteLinkDepth'] | false,
        signal: AbortSignal
    ): Promise<{ notes: LinkedNote[]; images: NoteImage[]; skipped: string[] }> {
        const depth = depthSetting === false ? 0 : normalizeNoteLinkDepth(depthSetting);
        const maxDepth = depth === 'unlimited' ? Infinity : depth;
        const rootCache = await this.waitForIndex(source, sourceContent, signal);
        const visited = new Set([source.path]);
        const queue: { file: TFile; depth: number }[] = [];
        const notes: LinkedNote[] = [];
        const skipped: string[] = [];
        const loadedImages = new Map<string, string>();

        const collectReferences = async (file: TFile, content: string, cache: CachedMetadata, end: number, depth: number, start = 0) => {
            const images = webImageEmbeds(content, cache, start, end);
            const refs = [...(cache.links ?? []), ...(cache.embeds ?? [])]
                .sort((a, b) => a.position.start.offset - b.position.start.offset);
            for (const ref of refs) {
                checkCancelled(signal);
                const from = ref.position.start.offset;
                const to = ref.position.end.offset;
                // Preserve chat boundaries and reject stale positions rather than
                // including a link that is no longer in the selected text.
                if (from < start || to > end || content.slice(from, to) !== ref.original) continue;
                if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(ref.link)) continue;
                const linkpath = getLinkpath(ref.link);
                if (!linkpath) continue; // A heading/block in this same note.
                const target = this.app.metadataCache.getFirstLinkpathDest(linkpath, file.path);
                const extension = target?.extension.toLowerCase() ?? /\.([^./]+)$/.exec(linkpath)?.[1].toLowerCase();
                if (extension && imageExtensions.has(extension)) {
                    if (!target) throw new Error(`Could not find reference image "${linkpath}" in "${file.path}". Check the attachment link.`);
                    let url = loadedImages.get(target.path);
                    if (!url) {
                        url = await this.readImage(target, signal);
                        loadedImages.set(target.path, url);
                    }
                    images.push({ offset: from, url });
                } else if (target && extension === 'md' && depth <= maxDepth && !visited.has(target.path)) {
                    visited.add(target.path);
                    queue.push({ file: target, depth });
                }
            }
            return images.sort((a, b) => a.offset - b.offset);
        };

        const images = await collectReferences(source, sourceContent, rootCache, end, 1, getChatContentStart(sourceContent, end));
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
            const note: LinkedNote = { path: file.path, content };
            notes.push(note);
            const hasImageSyntax = mayContainImages(content);
            if (depth >= maxDepth && !hasImageSyntax) continue;
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) {
                if (hasImageSyntax) throw new Error(`Obsidian has not finished indexing images in "${file.path}". Wait a moment and try again.`);
                skipped.push(file.path);
                continue;
            }
            const references = await collectReferences(file, content, cache, content.length, depth + 1);
            if (references.length) note.images = references.map(image => image.url);
        }
        return { notes, images, skipped };
    }

    private async readImage(file: TFile, signal: AbortSignal): Promise<string> {
        let bytes: ArrayBuffer;
        try {
            bytes = await this.app.vault.readBinary(file);
        } catch {
            checkCancelled(signal);
            throw new Error(`Could not read reference image "${file.path}". Check that the attachment is available in this vault.`);
        }
        checkCancelled(signal);
        const extension = imageExtension(bytes);
        if (!extension) throw new Error(`Could not use "${file.path}" as a reference image. Use a PNG, JPEG, WebP, or GIF file.`);
        return `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${arrayBufferToBase64(bytes)}`;
    }
}

/** Add reference material to the first user message without changing conversation roles. */
export function withLinkedNoteContext(messages: ChatMessage[], notes: LinkedNote[]): ChatMessage[] {
    if (!notes.length || !messages.length) return messages;
    const context = notes.map(note =>
        `--- Note: ${JSON.stringify(note.path)} ---\n${note.content}\n--- End note ---`
    ).join('\n\n');
    const images = notes.flatMap(note => note.images ?? []).concat(messages[0].images ?? []);
    return [
        { ...messages[0], ...(images.length ? { images } : {}),
            content: `Linked note context (reference material):\n\n${context}\n\n--- Conversation ---\n\n${messages[0].content}` },
        ...messages.slice(1),
    ];
}
