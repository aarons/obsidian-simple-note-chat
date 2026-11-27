import { App, TFile, requestUrl } from 'obsidian';

/** Some providers omit media_type or return a generic download content type. */
function imageExtension(data: ArrayBuffer): string {
    const bytes = new Uint8Array(data);
    const starts = (signature: number[], offset = 0) => signature.every((byte, index) => bytes[offset + index] === byte);
    if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return 'png';
    if (starts([255, 216, 255])) return 'jpg';
    if (starts([82, 73, 70, 70]) && starts([87, 69, 66, 80], 8)) return 'webp';
    if (starts([71, 73, 70, 56, 55, 97]) || starts([71, 73, 70, 56, 57, 97])) return 'gif';
    throw new Error('The model returned invalid or unsupported image data. Expected PNG, JPEG, WebP, or GIF.');
}

/** Keep image bytes in attachments, never in the Markdown conversation. */
export class GeneratedImageService {
    constructor(private app: App) {}

    async save(url: string, source: TFile, signal: AbortSignal): Promise<string> {
        const checkCancelled = () => {
            if (signal.aborted) throw new DOMException('Chat cancelled', 'AbortError');
        };
        checkCancelled();
        let bytes: ArrayBuffer;
        if (url.startsWith('https://')) {
            const parsed = new URL(url);
            if (parsed.username || parsed.password) throw new Error('The model returned an unsupported image URL.');
            // No provider credentials are sent to image hosts. requestUrl also works
            // with hosts that do not permit browser CORS requests.
            const response = await requestUrl({ url, method: 'GET', throw: false });
            checkCancelled();
            if (response.status !== 200) throw new Error(`Could not download the generated image (${response.status}).`);
            bytes = response.arrayBuffer;
        } else {
            const match = /^data:(?:image\/[a-z0-9.+-]+|application\/octet-stream);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(url);
            if (!match) throw new Error('The model returned an unsupported image. Expected PNG, JPEG, WebP, or GIF.');
            let decoded: string;
            try { decoded = atob(match[1]); }
            catch { throw new Error('The model returned invalid image data.'); }
            const array = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) array[i] = decoded.charCodeAt(i);
            bytes = array.buffer;
        }
        const extension = imageExtension(bytes);

        const filename = `generated-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
        const path = await this.app.fileManager.getAvailablePathForAttachment(filename, source.path);
        checkCancelled();
        const file = await this.app.vault.createBinary(path, bytes);
        if (signal.aborted) {
            await this.app.vault.delete(file);
            checkCancelled();
        }
        // Vault-relative embeds survive copying a conversation into an archive note.
        return `\n\n![[${file.path}]]\n\n`;
    }
}
