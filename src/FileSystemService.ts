import { App, TFile, normalizePath, moment, Notice } from 'obsidian';
import { PluginSettings, ChatMessage } from './types';
import { OpenRouterService } from './OpenRouterService';

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
            const normalizedArchivePath = normalizePath(archiveFolderName);

            const folderExists = await this.app.vault.adapter.exists(normalizedArchivePath);
            if (!folderExists) {
                try {
                    await this.app.vault.createFolder(normalizedArchivePath);
                    console.log(`Created archive folder: ${normalizedArchivePath}`);
                } catch (error) {
                    console.error(`Failed to create archive folder "${normalizedArchivePath}":`, error);
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
                const content = await this.app.vault.read(file);
                const titleModel = settings.llmRenameModel || settings.defaultModel;

                if (!titleModel || !settings.apiKey) {
                    new Notice("LLM Title generation skipped: API Key or Title/Default Model not set.");
                    console.warn("LLM Title generation skipped: API Key or Title/Default Model not set.");
                } else if (!content.trim()) {
                    new Notice("LLM Title generation skipped: Note content is empty.");
                    console.warn("LLM Title generation skipped: Note content is empty.");
                }
                else {
                    const wordLimit = settings.llmRenameWordLimit > 0 ? settings.llmRenameWordLimit : 10;
                    const prompt = `Generate a concise filename-friendly title for the following note content, under ${wordLimit} words.${settings.llmRenameIncludeEmojis ? ' You can include relevant emojis.' : ''} Respond ONLY with the title itself, no explanations or quotation marks. Content:\n\n---\n\n${content}`;
                    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

                    console.log(`FileSystemService: Requesting LLM title with model ${titleModel}`);
                    const llmTitle = await this.openRouterService.getChatCompletion(
                        settings.apiKey,
                        titleModel,
                        messages,
                        wordLimit * 5 // Estimate max tokens based on word limit
                    );

                    if (llmTitle) {
                        console.log(`FileSystemService: Received LLM title: "${llmTitle}"`);
                        const sanitizedTitle = llmTitle
                            .replace(/[\\/:*?"<>|\n\r]+/g, '')
                            .replace(/\s+/g, '_')
                            .replace(/^_|_$/g, '')
                            .substring(0, 100);

                        if (sanitizedTitle) {
                            const filenameWithoutExt = baseFilename.substring(0, baseFilename.lastIndexOf('.'));
                            if (settings.enableArchiveRenameDate) {
                                baseFilename = `${filenameWithoutExt}_${sanitizedTitle}${originalExtension}`;
                            } else {
                                baseFilename = `${sanitizedTitle}${originalExtension}`;
                            }
                            console.log(`FileSystemService: Updated baseFilename with LLM title: ${baseFilename}`);
                        } else {
                             console.warn(`FileSystemService: LLM title "${llmTitle}" became empty after sanitization.`);
                             new Notice("LLM title was empty after sanitization. Archiving with current name.");
                        }
                    } else {
                        console.warn("FileSystemService: LLM title generation failed.");
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
                targetPath = normalizePath(`${normalizedArchivePath}/${targetBaseName}-${counter}${targetExtension}`);
            }

            await this.app.fileManager.renameFile(file, targetPath);
            console.log(`Archived file ${file.path} to ${targetPath}`);
            return targetPath;

        } catch (error) {
            console.error(`Error archiving file "${file.path}" to folder "${archiveFolderName}":`, error);
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
            console.log(`Moved file ${file.path} to system trash`);
        } catch (error) {
            console.error(`Error deleting file "${file.path}":`, error);
            // Error is logged but not re-thrown
        }
    }
}
