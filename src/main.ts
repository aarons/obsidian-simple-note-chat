import { Editor, MarkdownView, Notice, Plugin, moment, normalizePath } from 'obsidian';
import { SimpleNoteChatSettingsTab } from './SettingsTab';
import { ChatService } from './ChatService';
import { OpenRouterService } from './OpenRouterService';
import { EditorHandler } from './EditorHandler';
import { FileSystemService } from './FileSystemService';
import { PluginSettings, DEFAULT_SETTINGS, LogLevel } from './types';
import { log, initializeLogger } from './utils/logger';
import {
	DEFAULT_NN_TITLE_FORMAT,
	CHAT_COMMAND_DEFAULT,
	ARCHIVE_COMMAND_DEFAULT,
	NEW_CHAT_COMMAND_DEFAULT,
	CHAT_SEPARATOR,
	MODEL_COMMAND_DEFAULT
} from './constants';
DEFAULT_SETTINGS.chatCommandPhrase = CHAT_COMMAND_DEFAULT;
DEFAULT_SETTINGS.archiveCommandPhrase = ARCHIVE_COMMAND_DEFAULT;
DEFAULT_SETTINGS.newChatCommandPhrase = NEW_CHAT_COMMAND_DEFAULT;
DEFAULT_SETTINGS.modelCommandPhrase = MODEL_COMMAND_DEFAULT;
DEFAULT_SETTINGS.chatSeparator = CHAT_SEPARATOR;

export default class SimpleNoteChatPlugin extends Plugin {
	settings: PluginSettings;
	chatService: ChatService;
	openRouterService: OpenRouterService;
	editorHandler: EditorHandler;
	fileSystemService: FileSystemService;

	private commandMap: Record<string, ((editor: Editor, view: MarkdownView, line: number) => void) | undefined> = {};
	private lastSettingsHash: string = '';
	private spacebarCommandTimeoutIds: Map<string, number> = new Map();

	async onload() {
		log.debug('Loading Simple Note Chat plugin');
		await this.loadSettings();
		initializeLogger(this.settings);

		this.updateCommandMap();
		this.lastSettingsHash = this.getSettingsHash();

		this.openRouterService = new OpenRouterService();

		if (this.settings.apiKey) {
			this.openRouterService.getCachedModels(this.settings.apiKey)
				.then(() => log.debug('Models prefetched on plugin load'))
				.catch(err => log.error('Error prefetching models:', err));
		}
		this.chatService = new ChatService(this, this.openRouterService);
		this.fileSystemService = new FileSystemService(this.app, this.openRouterService);
		this.editorHandler = new EditorHandler(this.app, this);

		this.addSettingTab(new SimpleNoteChatSettingsTab(this.app, this));

		this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView) {
				this.handleKeyDown(activeView, evt);
			}
		});


		this.addCommand({
			id: 'create-new-chat-note',
			name: 'Create new chat note',
			callback: async () => {
				try {
					let targetFolder = '';
					if (this.settings.newNoteLocation === 'current') {
						const currentFile = this.app.workspace.getActiveFile();
						if (currentFile && currentFile.parent) {
							targetFolder = currentFile.parent.path;
						} else {
							targetFolder = '/';
							log.debug("No active file or parent folder found, using vault root for new note.");
						}
					} else if (this.settings.newNoteLocation === 'custom') {
						targetFolder = this.settings.newNoteCustomFolder;
					} else {
						targetFolder = this.settings.archiveFolderName;
					}

					if (targetFolder && targetFolder !== '/') {
						targetFolder = normalizePath(targetFolder);
					} else if (targetFolder === '') {
						targetFolder = '/';
					}


					if (targetFolder !== '/') {
						const folderExists = this.app.vault.getFolderByPath(targetFolder) !== null;
						if (!folderExists) {
							try {
								await this.app.vault.createFolder(targetFolder);
								log.debug(`Created target folder: ${targetFolder}`);
							} catch (folderError) {
								log.error(`Failed to create target folder "${targetFolder}":`, folderError);
								new Notice(`Failed to create folder "${targetFolder}". Using vault root.`);
								targetFolder = '/';
							}
						}
					}

					const formattedDate = moment().format(this.settings.newNoteTitleFormat || DEFAULT_NN_TITLE_FORMAT);
					const prefix = this.settings.newNoteTitlePrefix || '';
					const suffix = this.settings.newNoteTitleSuffix || '';
					const title = `${prefix}${formattedDate}${suffix}`;

					const baseFilename = `${title}.md`;
					const availablePath = await this.fileSystemService.findAvailablePath(targetFolder, baseFilename);

					const newFile = await this.app.vault.create(availablePath, '');
					await this.app.workspace.openLinkText(newFile.path, '', true);
					new Notice(`Created new chat note: ${newFile.basename}`);

				} catch (error) {
					log.error("Error creating new chat note:", error);
					new Notice("Error creating new chat note. Check console for details.");
				}
			}
		});
		this.addCommand({
			id: 'trigger-chat-completion-cc',
			name: 'Trigger chat completion (cc)',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const file = view.file;
				if (!file) {
					new Notice("Cannot trigger chat: No active file.");
					log.error("Trigger chat completion hotkey failed: No active file.");
					return;
				}
				log.debug(`Triggering chat completion via hotkey for file: ${file.path}`);
				const cursor = editor.getCursor();
				this.chatService.startChat(editor, file, this.settings, cursor)
					.catch((error: Error) => {
						log.error("Error starting chat from hotkey:", error);
						new Notice("Failed to start chat. See console for details.");
					});
			}
		});

		this.addCommand({
			id: 'archive-current-note',
			name: 'Archive current note',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					return false;
				}

				if (checking) {
					return true;
				}

				this.fileSystemService.moveFileToArchive(
					activeFile,
					this.settings.archiveFolderName,
					this.settings
				);

				return true;
			}
		});

		this.addCommand({
			id: 'change-chat-model',
			name: 'Change chat model',
			callback: () => {
				this.editorHandler.openModelSelectorModal();
				log.debug("Executed 'change model' command via hotkey.");
			}
		});
	}

	onunload() {
		log.debug('Unloading Simple Note Chat plugin');
		this.cleanupTimeouts();
	}

	private cleanupTimeouts() {
		this.spacebarCommandTimeoutIds.forEach(timeoutId => clearTimeout(timeoutId));
		this.spacebarCommandTimeoutIds.clear();
	}


	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.settings.chatSeparator = CHAT_SEPARATOR;
	}

	async saveSettings() {
		await this.saveData(this.settings);

		this.updateCommandMap();
		initializeLogger(this.settings);
		this.lastSettingsHash = this.getSettingsHash();
	}

	/**
	 * Creates a hash to detect command phrase setting changes.
	 */
	private getSettingsHash(): string {
		return [
			this.settings.chatCommandPhrase,
			this.settings.archiveCommandPhrase,
			this.settings.modelCommandPhrase,
			this.settings.newChatCommandPhrase,
		].join('|');
	}

	private updateCommandMap() {
		this.commandMap = {};

		if (this.settings.chatCommandPhrase) {
			this.commandMap[this.settings.chatCommandPhrase] =
				(editor, view, line) => this.editorHandler.triggerChatCommand(editor, view, this.settings, line);
		}
		if (this.settings.archiveCommandPhrase) {
			this.commandMap[this.settings.archiveCommandPhrase] =
				(editor, view, line) => this.editorHandler.triggerArchiveCommand(editor, view, this.settings, line);
		}
		if (this.settings.modelCommandPhrase) {
			this.commandMap[this.settings.modelCommandPhrase] =
				(editor, view, line) => this.editorHandler.triggerModelCommand(editor, view, this.settings, line);
		}
		if (this.settings.newChatCommandPhrase) {
			this.commandMap[this.settings.newChatCommandPhrase] =
				(editor, view, line) => this.editorHandler.triggerNewChatCommand(editor, view, this.settings, line);
		}
	}

	/**
	 * Handles keydown events for stream cancellation and command triggers.
	 */
	private handleKeyDown(view: MarkdownView, evt: KeyboardEvent): void {
		const file = view.file;

		if (!file) {
			log.debug("Keydown ignored: No file associated with the view.");
			return;
		}
		const filePath = file.path;

		// Clear any pending spacebar timeout when any non-space key is pressed.
		// This prevents false command triggers when users type after a space.
		const existingTimeoutId = this.spacebarCommandTimeoutIds.get(filePath);
		if (existingTimeoutId && evt.key !== ' ') {
			clearTimeout(existingTimeoutId);
			this.spacebarCommandTimeoutIds.delete(filePath);
			log.debug(`Cleared spacebar command timeout for ${filePath} due to subsequent non-space key press: ${evt.key}`);
		}

		if (this.handleEscapeKey(view, evt)) {
			return;
		}

		if (this.chatService.isStreamActive(filePath)) {
			if (evt.key === 'Enter' || evt.key === ' ') {
				log.debug(`${evt.key} key ignored: Stream active for ${filePath}.`);
				return;
			}
		}

		const isEnterKey = evt.key === 'Enter';
		const isSpaceKeyForCommand = evt.key === ' ' && this.settings.enableSpacebarDetection;

		if (!isEnterKey && !isSpaceKeyForCommand) {
			return;
		}

		// Enter and Space require different processing paths:
		// - Enter: immediate command execution on previous line
		// - Space: delayed execution with timeout to allow typing continuation
		if (isEnterKey) {
			this.handleEnterKey(view, evt);
			return;
		}

		if (isSpaceKeyForCommand) {
			this.handleSpaceKey(view, evt);
			return;
		}
	}

	/**
	 * Handles Escape key for stream cancellation.
	 */
	private handleEscapeKey(view: MarkdownView, evt: KeyboardEvent): boolean {
		if (evt.key !== 'Escape') return false;

		const editor = view.editor;
		const file = view.file;
		const filePath = file!.path;

		log.debug(`Key: Escape, File: ${filePath}`);
		const isActive = this.chatService.isStreamActive(filePath);
		if (isActive && this.chatService.cancelStream(filePath, editor, this.settings)) {
			log.debug("Stream cancellation successful via Escape.");
			evt.preventDefault();
			evt.stopPropagation();
			return true;
		} else if (isActive) {
			log.debug("Stream cancellation via Escape failed or no stream to cancel.");
			return true;
		}
		return false;
	}

	/**
	 * Handles Enter key for command execution.
	 */
	private handleEnterKey(view: MarkdownView, evt: KeyboardEvent): void {
		const editor = view.editor;
		const file = view.file!
		const filePath = file.path;

		log.debug(`Key: Enter, File: ${filePath}`);

		const currentSettingsHash = this.getSettingsHash();
		if (this.lastSettingsHash !== currentSettingsHash) {
			this.updateCommandMap();
			this.lastSettingsHash = currentSettingsHash;
			log.debug("Command map updated due to settings change (triggered by Enter).");
		}

		const cursor = editor.getCursor();
		const commandLineNum = cursor.line - 1;
		if (commandLineNum >= 0) {
			const possibleCommand = editor.getLine(commandLineNum).trim();
			const commandHandler = this.commandMap[possibleCommand];
			if (commandHandler) {
				log.debug(`Enter: Found command "${possibleCommand}" on line ${commandLineNum}`);
				evt.preventDefault();
				evt.stopPropagation();
				commandHandler(editor, view, commandLineNum);
			} else {
				log.debug(`Enter: No command found for "${possibleCommand}" on line ${commandLineNum}`);
			}
		}
	}

	/**
	 * Handles Space key for delayed command execution when spacebar detection is enabled.
	 */
	private handleSpaceKey(view: MarkdownView, evt: KeyboardEvent): void {
		const editor = view.editor;
		const file = view.file!
		const filePath = file.path;

		log.debug(`Key: Space, File: ${filePath}, Spacebar detection enabled.`);

		const currentSettingsHash = this.getSettingsHash();
		if (this.lastSettingsHash !== currentSettingsHash) {
			this.updateCommandMap();
			this.lastSettingsHash = currentSettingsHash;
			log.debug("Command map updated due to settings change (triggered by Space).");
		}

		const oldTimeoutId = this.spacebarCommandTimeoutIds.get(filePath);
		if (oldTimeoutId) {
			clearTimeout(oldTimeoutId);
			log.debug(`Cleared previous spacebar timeout for ${filePath} due to new space press.`);
		}

		// Capture cursor position at space-press time, not timeout execution time.
		// This ensures command detection uses the correct line/column even if
		// the cursor moves during the timeout delay.
		const triggerCursor = editor.getCursor();

		const newTimeoutId = window.setTimeout(() => {
			this.spacebarCommandTimeoutIds.delete(filePath);

			const commandLineNum = triggerCursor.line;
			const textBeforeSpace = editor.getLine(commandLineNum)
										.substring(0, triggerCursor.ch)
										.trim();

			log.debug(`Spacebar timeout: Checking for command "${textBeforeSpace}" on line ${commandLineNum} (cursor was at ch ${triggerCursor.ch})`);

			const commandHandler = this.commandMap[textBeforeSpace];
			if (commandHandler) {
				log.debug(`Spacebar: Found command "${textBeforeSpace}" on line ${commandLineNum}. Executing.`);
				commandHandler(editor, view, commandLineNum);
			} else {
				log.debug(`Spacebar: No command found for "${textBeforeSpace}"`);
			}
		}, this.settings.spacebarDetectionDelay * 1000);
		this.spacebarCommandTimeoutIds.set(filePath, newTimeoutId);
	}

}
