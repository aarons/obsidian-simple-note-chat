import { App, TFile, normalizePath } from 'obsidian';

export class FileSystemService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Moves a file to the specified archive folder, handling name conflicts.
     * @param file The file to move.
     * @param archiveFolderName The relative path of the archive folder from the vault root.
     * @returns The new path of the archived file, or null if an error occurred.
     */
    async moveFileToArchive(file: TFile, archiveFolderName: string): Promise<string | null> {
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

            let targetPath = normalizePath(`${normalizedArchivePath}/${file.name}`);
            let counter = 0;
            const fileExtension = file.extension ? `.${file.extension}` : '';
            const fileBaseName = file.basename;

            // Handle name conflicts by appending -1, -2, etc.
            while (await this.app.vault.adapter.exists(targetPath)) {
                counter++;
                targetPath = normalizePath(`${normalizedArchivePath}/${fileBaseName}-${counter}${fileExtension}`);
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