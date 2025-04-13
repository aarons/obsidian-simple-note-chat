import { App, TFile, normalizePath, moment, Notice } from 'obsidian';
import { PluginSettings, ChatMessage } from './types'; // Import PluginSettings and ChatMessage
import { OpenRouterService } from './OpenRouterService'; // Import OpenRouterService

export class FileSystemService {
    private app: App;
    private openRouterService: OpenRouterService; // Add OpenRouterService instance

    constructor(app: App, openRouterService: OpenRouterService) { // Inject OpenRouterService
        this.app = app;
        this.openRouterService = openRouterService; // Store the instance
    }

    /**
     * Moves a file to the specified archive folder, handling name conflicts.
     * @param file The file to move.
     * @param archiveFolderName The relative path of the archive folder from the vault root.
     * @param settings The plugin settings containing archive and LLM options.
     * @returns The new path of the archived file, or null if an error occurred.
     */
    async moveFileToArchive(file: TFile, archiveFolderName: string, settings: PluginSettings): Promise<string | null> {
        try {
            const normalizedArchivePath = normalizePath(archiveFolderName);

            // Ensure the archive folder exists
            const folderExists = await this.app.vault.adapter.exists(normalizedArchivePath);
            if (!folderExists) {
                try {
                    await this.app.vault.createFolder(normalizedArchivePath);
                    console.log(`Created archive folder: ${normalizedArchivePath}`);
                } catch (error) {
                    console.error(`Failed to create archive folder "${normalizedArchivePath}":`, error);
                    // Optionally notify the user here
                    return null; // Cannot proceed without the folder
                }
            }

            // Determine the base filename based on settings
            let baseFilename: string;
            const originalExtension = file.extension ? `.${file.extension}` : ''; // Store original extension

            if (settings.enableArchiveRenameDate && settings.archiveRenameDateFormat) {
                const formattedDate = moment().format(settings.archiveRenameDateFormat);
                baseFilename = `${formattedDate}${originalExtension}`;
            } else {
                baseFilename = file.name; // Use original name if date rename is off
            }

            // --- LLM Title Generation ---
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
                    const wordLimit = settings.llmRenameWordLimit > 0 ? settings.llmRenameWordLimit : 10; // Default/fallback word limit
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
                        // Sanitize Title: Remove invalid chars, replace whitespace with '_', trim, limit length
                        const sanitizedTitle = llmTitle
                            .replace(/[\\/:*?"<>|\n\r]+/g, '') // Remove invalid filename chars
                            .replace(/\s+/g, '_') // Replace whitespace sequences with single underscore
                            .replace(/^_|_$/g, '') // Trim leading/trailing underscores
                            .substring(0, 100); // Limit length

                        if (sanitizedTitle) {
                            const filenameWithoutExt = baseFilename.substring(0, baseFilename.lastIndexOf('.'));
                            // Combine based on whether date rename was enabled
                            if (settings.enableArchiveRenameDate) {
                                // Append LLM title to date-based name
                                baseFilename = `${filenameWithoutExt}_${sanitizedTitle}${originalExtension}`;
                            } else {
                                // Use LLM title as the primary name
                                baseFilename = `${sanitizedTitle}${originalExtension}`;
                            }
                            console.log(`FileSystemService: Updated baseFilename with LLM title: ${baseFilename}`);
                        } else {
                             console.warn(`FileSystemService: LLM title "${llmTitle}" became empty after sanitization.`);
                             new Notice("LLM title was empty after sanitization. Archiving with current name.");
                        }
                    } else {
                        // Fallback (Line 146)
                        console.warn("FileSystemService: LLM title generation failed.");
                        new Notice("LLM title generation failed. Archiving with current name.");
                    }
                }
            }
            // --- End LLM Title Generation ---

            let targetPath = normalizePath(`${normalizedArchivePath}/${baseFilename}`);
            let counter = 0;

            // Extract base name and extension from the *potentially new* filename for conflict resolution
            const targetBaseNameMatch = baseFilename.match(/^(.*?)(?:\.([^\.]+))?$/); // Match base name and optional extension
            const targetBaseName = targetBaseNameMatch ? targetBaseNameMatch[1] : baseFilename; // Base part (e.g., "2025-01-01-12-00" or "My Note")
            const targetExtension = targetBaseNameMatch && targetBaseNameMatch[2] ? `.${targetBaseNameMatch[2]}` : ''; // Extension part (e.g., ".md")

            // Handle name conflicts by appending -1, -2, etc.
            while (await this.app.vault.adapter.exists(targetPath)) {
                counter++;
                targetPath = normalizePath(`${normalizedArchivePath}/${targetBaseName}-${counter}${targetExtension}`);
            }

            // Move/rename the file
            await this.app.fileManager.renameFile(file, targetPath);
            console.log(`Archived file ${file.path} to ${targetPath}`);
            return targetPath; // Return the new path

        } catch (error) {
            console.error(`Error archiving file "${file.path}" to folder "${archiveFolderName}":`, error);
            // Optionally notify the user here
            return null; // Indicate failure
        }
    }

    /**
     * Moves a file to the system trash.
     * @param file The file to delete.
     */
    async deleteFile(file: TFile): Promise<void> {
        try {
            await this.app.vault.trash(file, true); // true uses system trash
            console.log(`Moved file ${file.path} to system trash`);
        } catch (error) {
            console.error(`Error deleting file "${file.path}":`, error);
            // Optionally notify the user here
            // Re-throw or handle as needed, currently just logs
        }
    }
}