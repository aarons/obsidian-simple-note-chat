import { App, TFile, normalizePath, moment, Notice } from 'obsidian';
import { PluginSettings, ChatMessage } from './types';
import { OpenRouterService } from './OpenRouterService';
import { log } from './utils/logger';

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
     * @returns The new path of the archived file, or null if an error occurred.
     */
    async moveFileToArchive(file: TFile, archiveFolderName: string, settings: PluginSettings): Promise<string | null> {
        try {
            const originalContent = await this.app.vault.read(file);
            const chatBoundaryMarker = '^^^';
            const boundaryString = `\n${chatBoundaryMarker}\n`;
            const boundaryIndex = originalContent.indexOf(boundaryString);
            const markerExists = boundaryIndex !== -1;

            let contentForTitleGeneration = originalContent;
            let contentToArchive = originalContent;
            let contentAboveMarker = ''; // Only used if marker exists

            if (markerExists) {
                contentAboveMarker = originalContent.substring(0, boundaryIndex);
                contentToArchive = originalContent.substring(boundaryIndex + boundaryString.length);
                contentForTitleGeneration = contentToArchive; // Use archived part for title
                log.debug(`Marker found. Archiving content below marker. Original file will retain content above.`);
            } else {
                log.debug(`Marker not found. Archiving entire file.`);
            }


            const normalizedArchivePath = normalizePath(archiveFolderName);

            const folderExists = await this.app.vault.adapter.exists(normalizedArchivePath);
            if (!folderExists) {
                try {
                    await this.app.vault.createFolder(normalizedArchivePath);
                    log.debug(`Created archive folder: ${normalizedArchivePath}`);
                } catch (error) {
                    log.error(`Failed to create archive folder "${normalizedArchivePath}":`, error);
                    return null; // Cannot proceed without the folder
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
                const content = contentForTitleGeneration;
                const titleModel = settings.llmRenameModel || settings.defaultModel;

                if (!titleModel || !settings.apiKey) {
                    new Notice("LLM Title generation skipped: API Key or Title/Default Model not set.");
                    log.warn("LLM Title generation skipped: API Key or Title/Default Model not set.");
                } else if (!content.trim()) {
                    new Notice("LLM Title generation skipped: Note content is empty.");
                    log.warn("LLM Title generation skipped: Note content is empty.");
                }
                else {
                    const wordLimit = settings.llmRenameWordLimit > 0 ? settings.llmRenameWordLimit : 10;
                    const prompt = `Create a concise functional title for the following note content, under ${wordLimit} words.${settings.llmRenameIncludeEmojis ? ' You can include relevant emojis.' : ''} Respond ONLY with the title itself, no explanations or quotation marks. Note Content:\n\n${content}`;
                    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

                    log.debug(`FileSystemService: Requesting LLM title with model ${titleModel}`);
                    const llmTitle = await this.openRouterService.getChatCompletion(
                        settings.apiKey,
                        titleModel,
                        messages,
                        wordLimit * 5 // Estimate max tokens based on word limit
                    );

                    if (llmTitle) {
                        log.debug(`FileSystemService: Received LLM title: "${llmTitle}"`);
                        const sanitizedTitle = llmTitle
                            .replace(/[\\/:*?"<>|\n\r,]+/g, '') // Remove illegal chars
                            .replace(/_/g, ' ')             // Replace underscores with spaces
                            .trim()                         // Trim leading/trailing whitespace
                            .replace(/\s+/g, ' ')           // Collapse multiple spaces to one
                            .substring(0, 100);              // Limit length

                        if (sanitizedTitle) {
                            const titleCasedSanitizedTitle = sanitizedTitle
                                .split(' ')
                                .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : '') // Handle potential empty strings from split
                                .join(' ');

                            const filenameWithoutExt = baseFilename.substring(0, baseFilename.lastIndexOf('.'));
                            if (settings.enableArchiveRenameDate) {
                                baseFilename = `${filenameWithoutExt} ${titleCasedSanitizedTitle}${originalExtension}`;
                            } else {
                                baseFilename = `${titleCasedSanitizedTitle}${originalExtension}`;
                            }
                            log.debug(`FileSystemService: Updated baseFilename with LLM title: ${baseFilename}`);
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
            let counter = 0;

            const targetBaseNameMatch = baseFilename.match(/^(.*?)(?:\.([^\.]+))?$/);
            const targetBaseName = targetBaseNameMatch ? targetBaseNameMatch[1] : baseFilename;
            const targetExtension = targetBaseNameMatch && targetBaseNameMatch[2] ? `.${targetBaseNameMatch[2]}` : '';

            while (await this.app.vault.adapter.exists(targetPath)) {
                counter++;
                targetPath = normalizePath(`${normalizedArchivePath}/${targetBaseName} ${counter}${targetExtension}`);
            }

            if (markerExists) {
                // Create new file with content below marker
                await this.app.vault.create(targetPath, contentToArchive);
                log.debug(`Created archive file at ${targetPath} with content below marker.`);
                // Modify original file to keep content above marker
                await this.app.vault.modify(file, contentAboveMarker);
                log.debug(`Modified original file ${file.path} to retain content above marker.`);
            } else {
                // Original behavior: move the entire file
                await this.app.fileManager.renameFile(file, targetPath);
                log.debug(`Archived entire file ${file.path} to ${targetPath}`);
            }
            return targetPath; // Return the path of the archived content

        } catch (error) {
            log.error(`Error archiving file "${file.path}" to folder "${archiveFolderName}":`, error);
            // Optionally notify the user here
            return null; // Indicate failure
        }
    }

    /**
     * Deletes a file by moving it to the system trash.
     * @param file The file to delete.
     */
    async deleteFile(file: TFile): Promise<void> {
        try {
            await this.app.vault.trash(file, true);
            log.debug(`Moved file ${file.path} to system trash`);
        } catch (error) {
            log.error(`Error deleting file "${file.path}":`, error);
            // Error is logged but not re-thrown
        }
    }
}
