import { App, Editor, MarkdownView, TFile, EditorPosition, Notice } from 'obsidian';
import SimpleNoteChat from './main'; // Assuming main exports the class as default
import { PluginSettings } from './types';
import { log } from './utils/logger';
import { ModelSelectorModal } from './ModelSelectorModal'; // Added import

export class EditorHandler {
	private app: App;
	private plugin: SimpleNoteChat;

	constructor(app: App, plugin: SimpleNoteChat) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * Positions cursor to end of previous line or start of document after command removal.
	 */
	private _setCursorBeforeCommand(editor: Editor, commandLineIndex: number): void {
		if (commandLineIndex > 0) {
			const targetLineIndex = commandLineIndex - 1;
			const targetLineLength = editor.getLine(targetLineIndex).length;
			editor.setCursor({ line: targetLineIndex, ch: targetLineLength });
		} else {
			editor.setCursor({ line: 0, ch: 0 });
		}
	}

	/**
	 * Processes chat command trigger by removing command line and initiating streaming response.
	 * Command line is completely removed before starting chat to avoid content duplication.
	 */
	public triggerChatCommand(
		editor: Editor,
		markdownView: MarkdownView,
		settings: PluginSettings,
		commandLineIndex: number
	): void {
		const file = markdownView.file;
		if (!file) {
			log.error(`Cannot execute chat command: markdownView.file is null.`);
			new Notice(`Failed to execute chat command: No active file.`);
			return;
		}

		const commandLineStartPos: EditorPosition = { line: commandLineIndex, ch: 0 };
		const commandLineEndPos: EditorPosition = { line: commandLineIndex, ch: editor.getLine(commandLineIndex).length };

		// Include newline for mid-document lines to prevent line merging
		const rangeToRemoveEnd = (commandLineIndex < editor.lastLine())
			? { line: commandLineIndex + 1, ch: 0 }
			: commandLineEndPos;

		editor.replaceRange('', commandLineStartPos, rangeToRemoveEnd);

		// Start chat at removed command position for streaming response
		this.plugin.chatService.startChat(
			editor,
			file,
			settings,
			commandLineStartPos
		).catch((error: Error) => {
			log.error("Error starting chat from command phrase:", error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			log.error(`Chat Error from command phrase: ${errorMessage}. Relying on startChat cleanup.`);
		});
	}

	/**
	 * Processes archive command by removing command line and moving file to archive.
	 * Shows early notice for LLM-powered rename operations due to potential delay.
	 */
	public triggerArchiveCommand(
		editor: Editor,
		markdownView: MarkdownView,
		settings: PluginSettings,
		commandLineIndex: number
	): void {
		const file = markdownView.file;
		if (!file) {
			log.error(`Cannot execute archive command: markdownView.file is null.`);
			new Notice(`Failed to execute archive command: No active file.`);
			return;
		}

		const commandLineStartPos: EditorPosition = { line: commandLineIndex, ch: 0 };
		const commandLineEndPos: EditorPosition = { line: commandLineIndex, ch: editor.getLine(commandLineIndex).length };

		const rangeToRemoveEnd = (commandLineIndex < editor.lastLine())
			? { line: commandLineIndex + 1, ch: 0 }
			: commandLineEndPos;

		editor.replaceRange('', commandLineStartPos, rangeToRemoveEnd);

		// Position cursor before async operation to provide immediate feedback
		this._setCursorBeforeCommand(editor, commandLineIndex);

		// Notify user early if LLM rename is enabled due to potential processing delay
		if (settings.enableArchiveRenameLlm) {
			const titleModel = settings.llmRenameModel || settings.defaultModel;
			if (titleModel && settings.apiKey) {
				new Notice(`Calling ${titleModel} to generate title...`, 5000);
			} else {
				log.warn("Archive rename with LLM enabled, but API key or model not set. Skipping notice.");
			}
		}

		(async () => {
			try {
				const newPath = await this.plugin.fileSystemService.moveFileToArchive(
					file,
					settings.archiveFolderName,
					settings,
					editor
				);
				if (newPath) {
					const newName = newPath.split('/').pop() || file.basename;
					const archiveFolder = settings.archiveFolderName;
					new Notice(`Renamed to ${newName}\nMoved to ${archiveFolder}`);

				} else {
					new Notice("Failed to archive note.");
					log.warn("FileSystemService.moveFileToArchive returned null.");
				}
			} catch (error) {
				console.error("Error during note archive:", error);
				new Notice("Failed to archive note. Check console for details.");
			}
		})();
	}

	/**
	 * Processes new chat command by removing command line and executing note creation command.
	 */
	public triggerNewChatCommand(
		editor: Editor,
		markdownView: MarkdownView,
		settings: PluginSettings,
		commandLineIndex: number
	): void {
		const commandLineStartPos: EditorPosition = { line: commandLineIndex, ch: 0 };
		const commandLineEndPos: EditorPosition = { line: commandLineIndex, ch: editor.getLine(commandLineIndex).length };

		const rangeToRemoveEnd = (commandLineIndex < editor.lastLine())
			? { line: commandLineIndex + 1, ch: 0 }
			: commandLineEndPos;

		editor.replaceRange('', commandLineStartPos, rangeToRemoveEnd);

		// Position cursor before command execution to maintain proper state
		this._setCursorBeforeCommand(editor, commandLineIndex);

		// Execute note creation after editor modification to ensure clean state
		// @ts-ignore - Assuming 'commands' exists on app
		this.app.commands.executeCommandById('simple-note-chat:create-new-chat-note');
		new Notice("Creating new chat note...");
	}

	/**
	 * Processes model selection command by removing command line and opening model selector.
	 */
	public triggerModelCommand(
		editor: Editor,
		markdownView: MarkdownView,
		settings: PluginSettings,
		commandLineIndex: number
	): void {
		const commandLineStartPos: EditorPosition = { line: commandLineIndex, ch: 0 };
		const commandLineEndPos: EditorPosition = { line: commandLineIndex, ch: editor.getLine(commandLineIndex).length };

		const rangeToRemoveEnd = (commandLineIndex < editor.lastLine())
			? { line: commandLineIndex + 1, ch: 0 }
			: commandLineEndPos;

		editor.replaceRange('', commandLineStartPos, rangeToRemoveEnd);

		// Position cursor before modal to maintain editor state
		this._setCursorBeforeCommand(editor, commandLineIndex);

		new ModelSelectorModal(this.plugin).open();
		log.debug(`Executed model command ('${settings.modelCommandPhrase}') on line ${commandLineIndex}. Opening modal.`);
	}

	/**
	 * Opens model selector modal via command/hotkey (bypasses command line processing).
	 */
	public openModelSelectorModal(): void {
		new ModelSelectorModal(this.plugin).open();
		log.debug("Opened model selector modal via command/hotkey.");
	}
}
