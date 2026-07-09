import { App, TFile, normalizePath, moment, Notice, Editor } from 'obsidian';
import { PluginSettings, ChatMessage } from './types';
import { OpenRouterService } from './OpenRouterService';
import { log } from './utils/logger';
import { CHAT_BOUNDARY_MARKER, createChatBoundaryRegex } from './constants';

export class FileSystemService {
    private app: App;
    private openRouterService: OpenRouterService;

    constructor(app: App, openRouterService: OpenRouterService) {
        this.app = app;
        this.openRouterService = openRouterService;
    }

    /**
     * Moves a file to an archive folder, handling name conflicts.
     * @param file The file to move.
     * @param archiveFolderName The relative path of the archive folder from the vault root.
     * @param settings The plugin settings containing archive and LLM options.
     * @param editor Optional Editor instance if the file is currently active in an editor.
     * @returns The new path of the archived file.
     * @throws Error if the archive folder cannot be created or the vault operations fail.
     */
    async moveFileToArchive(file: TFile, archiveFolderName: string, settings: PluginSettings, editor?: Editor): Promise<string> {
        const originalContent = await this.app.vault.read(file);

        const boundaryRegex = createChatBoundaryRegex('m');
        const markerMatch = boundaryRegex.exec(originalContent);

        let contentForTitleGeneration = originalContent;
        let contentToArchive = originalContent;
        let contentAboveMarker = ''; // Only used if marker exists

        if (markerMatch) {
            const parts = originalContent.split(boundaryRegex);
            contentAboveMarker = parts[0];
            log.debug(`contentAboveMarker: ${contentAboveMarker}`);
            // In case the marker appears multiple times, we archive everything after the first one.
            contentToArchive = parts.slice(1).join(CHAT_BOUNDARY_MARKER).trimStart();
            contentForTitleGeneration = contentToArchive; // Use archived part for title
            log.debug(`Marker found. Archiving content below marker. Original file will retain content above.`);
        } else {
            log.debug(`Marker not found. Archiving entire file.`);
        }


        const normalizedArchivePath = normalizePath(archiveFolderName);

        const folderExists = (this.app.vault.getAbstractFileByPath(normalizedArchivePath) !== null);
        if (!folderExists) {
            try {
                await this.app.vault.createFolder(normalizedArchivePath);
                log.debug(`Created archive folder: ${normalizedArchivePath}`);
            } catch (error) {
                log.error(`Failed to create archive folder "${normalizedArchivePath}":`, error);
                throw new Error(`Could not create archive folder "${normalizedArchivePath}".`);
            }
        }

        let baseFilename: string;
        const originalExtension = file.extension ? `.${file.extension}` : '';

        if (settings.enableArchiveRenameDate && settings.archiveRenameDateFormat) {
            const formattedDate = moment().format(settings.archiveRenameDateFormat);
            baseFilename = `${formattedDate}${originalExtension}`;
        } else {
            baseFilename = file.name;
        }

        if (settings.enableArchiveRenameLlm) {
            // Use the determined content (either full or below marker) for title generation
            const llmTitle = await this.generateLlmTitle(contentForTitleGeneration, settings);
            if (llmTitle) {
                if (settings.enableArchiveRenameDate) {
                    const filenameWithoutExt = baseFilename.substring(0, baseFilename.lastIndexOf('.'));
                    baseFilename = `${filenameWithoutExt} ${llmTitle}${originalExtension}`;
                } else {
                    baseFilename = `${llmTitle}${originalExtension}`;
                }
                log.debug(`FileSystemService: Updated baseFilename with LLM title: ${baseFilename}`);
            }
        }

        const targetPath = await this.findAvailablePath(normalizedArchivePath, baseFilename);
        // Check if the boundary marker was present, if so we'll keep the content above the marker
        // and only save content below it to the archived note
        if (markerMatch) {
            await this.app.vault.create(targetPath, contentToArchive);
            log.debug(`Created archive file at ${targetPath} with content below marker.`);
            // Modify original file to keep content above marker
            if (editor) {
                // Delete from the marker down (rather than setValue) so undo history
                // and scroll position are preserved.
                editor.replaceRange('',
                    editor.offsetToPos(markerMatch.index),
                    editor.offsetToPos(editor.getValue().length));
                editor.setCursor(editor.lastLine());
                log.debug(`Modified original file ${file.path} using Editor API to retain content above marker.`);
            } else { // No editor instance
                await this.app.vault.process(file, (_data) => contentAboveMarker);
                log.debug(`Modified original file ${file.path} using Vault.process to retain content above marker.`);
            }
        } else {
            // move the entire file to the archive
            await this.app.fileManager.renameFile(file, targetPath);
            log.debug(`Archived entire file ${file.path} to ${targetPath}`);
        }
        return targetPath; // Return the path of the archived content
    }

    /**
     * Generates a sanitized, title-cased note title via the LLM.
     * @param content The note content to base the title on.
     * @param settings The plugin settings (model, word limit, emoji preference).
     * @returns The title, or null if generation was skipped or failed (a Notice explains why).
     */
    private async generateLlmTitle(content: string, settings: PluginSettings): Promise<string | null> {
        const titleModel = settings.llmRenameModel || settings.defaultModel;

        if (!titleModel || !settings.apiKey) {
            new Notice("LLM Title generation skipped: API Key or Title/Default Model not set.");
            log.warn("LLM Title generation skipped: API Key or Title/Default Model not set.");
            return null;
        }
        if (!content.trim()) {
            new Notice("LLM Title generation skipped: Note content is empty.");
            log.warn("LLM Title generation skipped: Note content is empty.");
            return null;
        }

        const wordLimit = settings.llmRenameWordLimit > 0 ? settings.llmRenameWordLimit : 10;
        const prompt = `Create a concise functional title for the following note content, under ${wordLimit} words.${settings.llmRenameIncludeEmojis ? ' You can include relevant emojis.' : ''} Respond ONLY with the title itself, no explanations or quotation marks. Note Content:\n\n${content}`;
        const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

        log.debug(`FileSystemService: Requesting LLM title with model ${titleModel}`);
        let llmTitle: string;
        try {
            llmTitle = await this.openRouterService.getChatCompletion(
                settings.apiKey,
                titleModel,
                messages,
                wordLimit * 5 // Estimate max tokens based on word limit
            );
        } catch (error) {
            log.error("FileSystemService: LLM title generation failed:", error);
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`LLM title generation failed: ${message}\nArchiving with current name.`);
            return null;
        }

        log.debug(`FileSystemService: Received LLM title: "${llmTitle}"`);
        // Whitelist approach for sanitization
        const basicWhitelistRegex = /[^a-zA-Z0-9 ]/g;
        // Regex to keep alphanumeric characters, spaces, and common emoji ranges (requires 'u' flag)
        const emojiWhitelistRegex = /[^a-zA-Z0-9 \u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu;

        const sanitizedTitle = llmTitle
            .replace(settings.llmRenameIncludeEmojis ? emojiWhitelistRegex : basicWhitelistRegex, '')
            .trim()                 // Trim leading/trailing whitespace
            .replace(/\s+/g, ' ')   // Collapse multiple spaces to one
            .substring(0, 100);     // Limit length
        log.debug(`Sanitized LLM title. Before: "${llmTitle}", After: "${sanitizedTitle}"`);

        if (!sanitizedTitle) {
            log.warn(`FileSystemService: LLM title "${llmTitle}" became empty after sanitization.`);
            new Notice("LLM title was empty after sanitization. Archiving with current name.");
            return null;
        }

        return sanitizedTitle
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Finds an available file path in a folder by appending a number if the base name exists.
     * @param folderPath The normalized path of the target folder.
     * @param baseFilename The desired filename (including extension).
     * @returns A promise that resolves to an available, normalized full path.
     */
    public async findAvailablePath(folderPath: string, baseFilename: string): Promise<string> {
        let targetPath = normalizePath(`${folderPath}/${baseFilename}`);
        let counter = 0;

        const targetBaseNameMatch = baseFilename.match(/^(.*?)(?:\.([^\.]+))?$/);
        const targetBaseName = targetBaseNameMatch ? targetBaseNameMatch[1] : baseFilename;
        const targetExtension = targetBaseNameMatch && targetBaseNameMatch[2] ? `.${targetBaseNameMatch[2]}` : '';

        while (this.app.vault.getAbstractFileByPath(targetPath) !== null) {
            counter++;
            targetPath = normalizePath(`${folderPath}/${targetBaseName} ${counter}${targetExtension}`);
        }
        return targetPath;
    }
}
