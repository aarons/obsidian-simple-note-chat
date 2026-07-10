import { App, TFile, normalizePath, moment, Notice, Editor } from 'obsidian';
import { PluginSettings, ChatMessage } from './types';
import { OpenRouterService, ChatCompletionError, ChatCompletionOptions } from './OpenRouterService';
import { log } from './utils/logger';
import { formatLlmTitle } from './utils/llmTitle';
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
            new Notice("LLM title generation skipped: API key or title/default model not set.");
            log.warn("LLM title generation skipped: API key or title/default model not set.");
            return null;
        }
        if (!content.trim()) {
            new Notice("LLM title generation skipped: Note content is empty.");
            log.warn("LLM title generation skipped: Note content is empty.");
            return null;
        }

        const wordLimit = settings.llmRenameWordLimit > 0 ? settings.llmRenameWordLimit : 10;
        const prompt = `Create a concise functional title for the following note content, under ${wordLimit} words.${settings.llmRenameIncludeEmojis ? ' You can include relevant emojis.' : ''} Respond ONLY with the title itself, no explanations or quotation marks. Note Content:\n\n${content}`;
        const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

        const completionOptions = this.buildTitleCompletionOptions(titleModel, settings);

        log.debug(`FileSystemService: Requesting LLM title with model ${titleModel}`, completionOptions);
        let llmTitle: string;
        try {
            llmTitle = await this.openRouterService.getChatCompletion(
                settings.apiKey,
                titleModel,
                messages,
                completionOptions
            );
        } catch (error) {
            // If we asked a mandatory-reasoning model not to reason (metadata didn't
            // warn us), the request is rejected with a 400 — retry once without the
            // reasoning field rather than failing the whole title.
            if (error instanceof ChatCompletionError && error.status === 400
                && completionOptions.reasoning?.effort === 'none') {
                log.warn("FileSystemService: Request with reasoning effort 'none' was rejected; retrying without the reasoning field.", error);
                try {
                    llmTitle = await this.openRouterService.getChatCompletion(
                        settings.apiKey,
                        titleModel,
                        messages,
                        { maxTokens: completionOptions.maxTokens }
                    );
                } catch (retryError) {
                    return this.noticeTitleFailure(retryError);
                }
            } else {
                return this.noticeTitleFailure(error);
            }
        }

        log.debug(`FileSystemService: Received LLM title: "${llmTitle}"`);
        // Word limit is enforced here, on the response — never via request token caps.
        const formattedTitle = formatLlmTitle(llmTitle, wordLimit, settings.llmRenameIncludeEmojis);
        log.debug(`Formatted LLM title. Before: "${llmTitle}", After: "${formattedTitle}"`);

        if (!formattedTitle) {
            log.warn(`FileSystemService: LLM title "${llmTitle}" became empty after sanitization.`);
            new Notice("LLM title was empty after sanitization. Archiving with current name.");
            return null;
        }

        return formattedTitle;
    }

    private noticeTitleFailure(error: unknown): null {
        log.error("FileSystemService: LLM title generation failed:", error);
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`LLM title generation failed: ${message}\nArchiving with current name.`);
        return null;
    }

    /**
     * Builds the completion cap and reasoning config for a title request.
     *
     * The cap is independent of the title word count (reasoning tokens count
     * against it, so word-derived caps starve reasoning models of content —
     * the original titling bug). OpenRouter's effort ratios size the thinking
     * budget from this cap, and the +500 headroom keeps content unstarved; the
     * 1600 floor keeps the cap above Anthropic's 1024-token minimum thinking
     * budget, which requests must strictly exceed.
     */
    private buildTitleCompletionOptions(model: string, settings: PluginSettings): ChatCompletionOptions {
        const maxTokens = Math.max(settings.llmRenameReasoningMaxTokens + 500, 1600);
        const effort = settings.llmRenameReasoningEffort;

        if (effort === 'none') {
            // Models with mandatory reasoning reject effort 'none'; omit the field
            // so they use their default behavior instead of failing the archive.
            if (this.openRouterService.getModelReasoningInfo(model)?.mandatory) {
                log.debug(`FileSystemService: Model ${model} has mandatory reasoning; omitting reasoning field.`);
                return { maxTokens };
            }
            return { maxTokens, reasoning: { effort: 'none' } };
        }
        // exclude: the title flow never reads the reasoning trace.
        return { maxTokens, reasoning: { effort, exclude: true } };
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
