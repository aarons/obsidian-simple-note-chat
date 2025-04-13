import { App, TFile, normalizePath, moment } from 'obsidian';

export class FileSystemService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Moves a file to the specified archive folder, handling name conflicts.
     * @param file The file to move.
     * @param archiveFolderName The relative path of the archive folder from the vault root.
     * @param enableRename Whether to rename the file using the date format.
     * @param renameFormat The moment.js format string for renaming.
     * @returns The new path of the archived file, or null if an error occurred.
     */
    async moveFileToArchive(file: TFile, archiveFolderName: string, enableRename: boolean, renameFormat: string): Promise<string | null> {
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

            if (enableRename && renameFormat) {
                const formattedDate = moment().format(renameFormat);
                baseFilename = `${formattedDate}${originalExtension}`;
            } else {
                baseFilename = file.name;
            }

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