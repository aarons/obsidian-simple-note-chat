import { App, TFile, normalizePath, moment, Notice, Editor } from 'obsidian';
import { PluginSettings, ChatMessage } from './types';
import { OpenRouterService } from './OpenRouterService';
import { log } from './utils/logger';
import { CHAT_BOUNDARY_MARKER } from './constants';

export class FileSystemService {
    private app: App;
    private openRouterService: OpenRouterService;

    constructor(app: App, openRouterService: OpenRouterService) {
        this.app = app;
        this.openRouterService = openRouterService;
    }

    /**
     * Moves file to archive folder with optional LLM title generation and boundary marker handling.
     * 
     * Boundary marker (^^^) system: If present, content above marker stays in original file,
     * content below marker gets archived. This allows keeping conversation context while
     * archiving completed chat sessions.
     */
    async moveFileToArchive(file: TFile, archiveFolderName: string, settings: PluginSettings, editor?: Editor): Promise<string | null> {
        try {
            const originalContent = await this.app.vault.read(file);

            // Boundary marker system: ^^^ on its own line separates content to keep vs archive
            // Content above marker stays in original file, content below gets archived
            const escapedMarker = CHAT_BOUNDARY_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const boundaryRegex = new RegExp(`^\\s?${escapedMarker}\\s*$`, 'm');

            const markerExists = boundaryRegex.test(originalContent);

            let contentForTitleGeneration = originalContent;
            let contentToArchive = originalContent;
            let contentAboveMarker = '';

            if (markerExists) {
                const parts = originalContent.split(boundaryRegex);
                contentAboveMarker = parts[0];
                // Handle multiple markers by archiving everything after the first one
                contentToArchive = parts.slice(1).join(CHAT_BOUNDARY_MARKER).trimStart();
                contentForTitleGeneration = contentToArchive;
            }


            const normalizedArchivePath = normalizePath(archiveFolderName);

            const folderExists = (this.app.vault.getFolderByPath(normalizedArchivePath) !== null);
            if (!folderExists) {
                try {
                    await this.app.vault.createFolder(normalizedArchivePath);
                } catch (error) {
                    log.error(`Failed to create archive folder "${normalizedArchivePath}":`, error);
                    return null;
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
                const content = contentForTitleGeneration;
                const titleModel = settings.llmRenameModel || settings.defaultModel;

                if (!titleModel || !settings.apiKey) {
                    new Notice("LLM title generation skipped: API key or title/default model not set.");
                    log.warn("LLM title generation skipped: API key or title/default model not set.");
                } else if (!content.trim()) {
                    new Notice("LLM title generation skipped: Note content is empty.");
                    log.warn("LLM title generation skipped: Note content is empty.");
                }
                else {
                    const wordLimit = settings.llmRenameWordLimit > 0 ? settings.llmRenameWordLimit : 10;
                    const prompt = `Create a concise functional title for the following note content, under ${wordLimit} words.${settings.llmRenameIncludeEmojis ? ' You can include relevant emojis.' : ''} Respond ONLY with the title itself, no explanations or quotation marks. Note Content:\n\n${content}`;
                    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

                    const llmTitle = await this.openRouterService.getChatCompletion(
                        settings.apiKey,
                        titleModel,
                        messages,
                        wordLimit * 5
                    );

                    if (llmTitle) {
                        // Sanitize LLM-generated title for filesystem safety using whitelist approach
                        const basicWhitelistRegex = /[^a-zA-Z0-9 ]/g;
                        const emojiWhitelistRegex = /[^a-zA-Z0-9 \u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu;

                        let sanitizedTitle = llmTitle;
                        if (settings.llmRenameIncludeEmojis) {
                            sanitizedTitle = sanitizedTitle.replace(emojiWhitelistRegex, '');
                        } else {
                            sanitizedTitle = sanitizedTitle.replace(basicWhitelistRegex, '');
                        }

                        sanitizedTitle = sanitizedTitle
                            .trim()
                            .replace(/\s+/g, ' ')
                            .substring(0, 100);

                        if (sanitizedTitle) {
                            const titleCasedSanitizedTitle = sanitizedTitle
                                .split(' ')
                                .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : '')
                                .join(' ');

                            const filenameWithoutExt = baseFilename.substring(0, baseFilename.lastIndexOf('.'));
                            if (settings.enableArchiveRenameDate) {
                                baseFilename = `${filenameWithoutExt} ${titleCasedSanitizedTitle}${originalExtension}`;
                            } else {
                                baseFilename = `${titleCasedSanitizedTitle}${originalExtension}`;
                            }
                        } else {
                             log.warn(`FileSystemService: LLM title "${llmTitle}" became empty after sanitization.`);
                             new Notice("LLM title was empty after sanitization. Archiving with current name.");
                        }
                    } else {
                        log.warn("FileSystemService: LLM title generation failed.");
                        new Notice("LLM title generation failed. Archiving with current name.");
                    }
                }
            }

            let targetPath = normalizePath(`${normalizedArchivePath}/${baseFilename}`);
            targetPath = this.findAvailablePath(normalizedArchivePath, baseFilename);
            
            if (markerExists) {
                // Two-step archiving: create new file with content below marker,
                // then replace original file content with content above marker
                await this.app.vault.create(targetPath, contentToArchive);
                
                if (editor) {
                    editor.setValue(contentAboveMarker);
                    editor.setCursor(editor.lastLine());
                } else {
                    await this.app.vault.modify(file, contentAboveMarker);
                }
            } else {
                // No marker: standard file move (rename entire file to archive)
                await this.app.fileManager.renameFile(file, targetPath);
            }
            return targetPath;

        } catch (error) {
            log.error(`Error archiving file "${file.path}" to folder "${archiveFolderName}":`, error);
            return null;
        }
    }

    /**
     * Handles file naming collisions by appending a counter to find an available path.
     * Essential for preventing overwrites when multiple files have similar generated titles.
     */
    public findAvailablePath(folderPath: string, baseFilename: string): string {
        let targetPath = normalizePath(`${folderPath}/${baseFilename}`);
        let counter = 0;

        const targetBaseNameMatch = baseFilename.match(/^(.*?)(?:\.([^\.]+))?$/);
        const targetBaseName = targetBaseNameMatch ? targetBaseNameMatch[1] : baseFilename;
        const targetExtension = targetBaseNameMatch && targetBaseNameMatch[2] ? `.${targetBaseNameMatch[2]}` : '';

        // Using getAbstractFileByPath here because we need to check if ANY item (file OR folder) 
        // exists at this path to avoid naming collisions
        while (this.app.vault.getAbstractFileByPath(targetPath) !== null) {
            counter++;
            targetPath = normalizePath(`${folderPath}/${targetBaseName} ${counter}${targetExtension}`);
        }
        return targetPath;
    }

    /**
     * Deletes a file by moving it to the system trash.
     */
    async deleteFile(file: TFile): Promise<void> {
        try {
            await this.app.fileManager.trashFile(file);
        } catch (error) {
            log.error(`Error deleting file "${file.path}":`, error);
        }
    }
}
