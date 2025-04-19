import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, moment } from 'obsidian';
import { SimpleNoteChatSettingsTab } from './SettingsTab';
import { ChatService } from './ChatService';
import { OpenRouterService } from './OpenRouterService';
import { EditorHandler } from './EditorHandler';
import { FileSystemService } from './FileSystemService';
import { PluginSettings, DEFAULT_SETTINGS } from './types';
import { log } from './utils/logger';
import {
	DEFAULT_NN_TITLE_FORMAT,
	CHAT_COMMAND_DEFAULT,
	ARCHIVE_COMMAND_DEFAULT,
	NEW_CHAT_COMMAND_DEFAULT,
	CHAT_SEPARATOR_DEFAULT,
	MODEL_COMMAND_DEFAULT
} from './constants';
DEFAULT_SETTINGS.chatCommandPhrase = CHAT_COMMAND_DEFAULT;
DEFAULT_SETTINGS.archiveCommandPhrase = ARCHIVE_COMMAND_DEFAULT;
DEFAULT_SETTINGS.newChatCommandPhrase = NEW_CHAT_COMMAND_DEFAULT;
DEFAULT_SETTINGS.modelCommandPhrase = MODEL_COMMAND_DEFAULT;
DEFAULT_SETTINGS.chatSeparator = CHAT_SEPARATOR_DEFAULT;

export default class SimpleNoteChatPlugin extends Plugin {
	settings: PluginSettings;
	chatService: ChatService;
	openRouterService: OpenRouterService;
	editorHandler: EditorHandler;
	fileSystemService: FileSystemService;

	private activeMarkdownView: MarkdownView | null = null;
	private activeEditorKeyDownTarget: EventTarget | null = null;
	private boundKeyDownHandler: ((evt: KeyboardEvent) => void) | null = null;

	async onload() {
		log.debug('Loading Simple Note Chat plugin');
		await this.loadSettings();

		this.openRouterService = new OpenRouterService();
		this.chatService = new ChatService(this, this.openRouterService);
		this.fileSystemService = new FileSystemService(this.app, this.openRouterService);
		this.editorHandler = new EditorHandler(this.app, this);

		this.addSettingTab(new SimpleNoteChatSettingsTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('editor-change', this.editorHandler.handleEditorChange)
		);

		// Register/unregister keydown handler based on active leaf
		this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
			this.unregisterScopedKeyDownHandler(); // Clean up previous listener first

			if (leaf?.view instanceof MarkdownView) {
				const view = leaf.view;
				const target = view.containerEl; // Listen on the view's container

				// Bind the handler first
				const boundHandler = this.handleKeyDown.bind(this, view);
				this.boundKeyDownHandler = boundHandler; // Store it
				target.addEventListener('keydown', boundHandler); // Use the non-null bound handler

				this.activeMarkdownView = view; // Store for potential use and cleanup
				this.activeEditorKeyDownTarget = target; // Store for cleanup
				log.debug("Registered scoped keydown handler for active MarkdownView");
			}
		}));

		// Initial check in case a markdown view is already active on load
		const currentLeaf = this.app.workspace.activeLeaf;
		if (currentLeaf?.view instanceof MarkdownView) {
			const view = currentLeaf.view;
			const target = view.containerEl;
			// Bind the handler first
			const boundHandler = this.handleKeyDown.bind(this, view);
			this.boundKeyDownHandler = boundHandler; // Store it
			target.addEventListener('keydown', boundHandler); // Use the non-null bound handler
			this.activeMarkdownView = view;
			this.activeEditorKeyDownTarget = target;
			log.debug("Registered initial scoped keydown handler");
		}


		this.addCommand({
			id: 'create-new-chat-note',
			name: 'Create New Chat Note',
			callback: async () => {
				try {
					if (this.settings.archivePreviousNoteOnNn) {
						const activeFile = this.app.workspace.getActiveFile();
						if (activeFile) {
							try {
								const content = await this.app.vault.read(activeFile);
								if (content.includes(this.settings.chatSeparator)) {
									const archiveResult = await this.fileSystemService.moveFileToArchive(activeFile, this.settings.archiveFolderName, this.settings);
									if (archiveResult === null) {
										new Notice(`Failed to archive previous note '${activeFile.name}'. Continuing to create new note.`);
									} else {
										new Notice(`Archived '${activeFile.name}'.`);
									}
								} else {
									new Notice(`Previous note '${activeFile.name}' not archived because it lacks a chat separator.`);
								}
							} catch (archiveError) {
								log.error(`Error during pre-nn archive attempt for ${activeFile.name}:`, archiveError);
								new Notice(`Error trying to archive previous note '${activeFile.name}'. Continuing to create new note.`);
							}
						}
					}
					const parentPath = this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path || '').path;
					const title = moment().format(DEFAULT_NN_TITLE_FORMAT);
					const separator = parentPath === '/' ? '' : '/';
					const fullPath = `${parentPath}${separator}${title}.md`;

					const newFile = await this.app.vault.create(fullPath, '');
					this.app.workspace.openLinkText(newFile.path, '', false);
					new Notice(`Created new chat note: ${title}.md`);
				} catch (error) {
					log.error("Error creating new chat note:", error);
					new Notice("Error creating new chat note. Check console for details.");
				}
			}
		});
		this.addCommand({
			id: 'trigger-chat-completion-cc',
			name: 'Trigger Chat Completion (cc)',
			checkCallback: (checking: boolean) => {
				if (!this.settings.enableCcShortcut) {
					return false; // Command is disabled if setting is off
				}

				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!activeView) {
					return false; // No active markdown view
				}

				if (checking) {
					return true;
				}

				const editor = activeView.editor;
				const docEnd = editor.offsetToPos(editor.getValue().length);
				const currentContent = editor.getValue();
				const textToInsert = (currentContent.endsWith('\n') ? '' : '\n') + this.settings.chatCommandPhrase + '\n';
				editor.replaceRange(textToInsert, docEnd, docEnd);
				const newEndPos = editor.offsetToPos(editor.posToOffset(docEnd) + textToInsert.length);
				editor.setCursor(newEndPos);

				log.debug("Executed 'cc' shortcut command, inserted phrase.");
				return true;
			}
		});
		if (this.settings.enableNnRibbonButton) {
			this.addRibbonIcon('message-square-plus', 'Create New Chat Note', () => {
				// @ts-ignore - Assuming 'commands' exists on app, potentially a typing issue
				this.app.commands.executeCommandById('simple-note-chat:create-new-chat-note');
			});
		}
	}

	onunload() {
		log.debug('Unloading Simple Note Chat plugin');
		// Ensure the listener is removed when the plugin unloads
		this.unregisterScopedKeyDownHandler();
	}

	// Helper to remove the active keydown listener
	private unregisterScopedKeyDownHandler() {
		if (this.activeEditorKeyDownTarget && this.boundKeyDownHandler) {
			this.activeEditorKeyDownTarget.removeEventListener('keydown', this.boundKeyDownHandler);
			log.debug("Unregistered scoped keydown handler");
		}
		this.activeMarkdownView = null;
		this.activeEditorKeyDownTarget = null;
		this.boundKeyDownHandler = null;
	}


	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Handles keydown events within an active Markdown view for stream cancellation and command triggers.
	 * This handler is now attached directly to the active view's container.
	 * @param view The MarkdownView instance where the event occurred.
	 * @param evt The keyboard event.
	 */
	private handleKeyDown(view: MarkdownView, evt: KeyboardEvent): void {
	 // --- Early Exit ---
	 // Only proceed if Escape or Enter was pressed
	 if (evt.key !== 'Escape' && evt.key !== 'Enter') {
	 	return;
	 }

	 // Ensure we have a file context
	 const file = view.file;
	 if (!file) {
	 	log.debug("Keydown ignored: No file associated with the view.");
	 	return;
	 }
	 const filePath = file.path;
	 const editor = view.editor; // Get editor from the view passed in

	 log.debug(`handleKeyDown triggered for key: ${evt.key}, file: ${filePath}`);

	 // --- Escape Key: Cancel active stream ---
	 if (evt.key === 'Escape') {
	 	if (this.chatService.isStreamActive(filePath)) {
	 		log.debug(`Escape key pressed, attempting to cancel stream for: ${filePath}`);
	 		// Pass the specific editor instance
	 		if (this.chatService.cancelStream(filePath, editor, this.settings)) {
	 			log.debug("Stream cancellation initiated by Escape key.");
	 			evt.preventDefault();
	 			evt.stopPropagation();
	 		} else {
	 			log.debug("Escape key pressed, but stream cancellation failed.");
	 		}
	 	} else {
	 		log.debug("Escape key pressed, but no stream active for this file.");
	 	}
	 	// We handled Escape, so we are done with this event.
	 	return;
	 }

	 // --- Enter Key: Trigger command phrases ---
	 // Note: evt.key === 'Enter' is implicitly true here due to the early exit logic
	 if (this.chatService.isStreamActive(filePath)) {
	 	log.debug("Enter key ignored: Stream active.");
	 	return; // Don't trigger commands if a stream is writing
	 }

	 const cursor = editor.getCursor();
	 const lineToCheck = cursor.line - 1;

	 // --- Command Matching ---
	 // If we identified a line to check (lineToCheck >= 0)
	 if (lineToCheck >= 1) {
		const prevLineText = editor.getLine(lineToCheck);
	 	const trimmedLineText = prevLineText.trim();
	 	let commandHandler: (() => void) | null = null;
	 	const commandLineIndex = lineToCheck; // Use the identified line index

	 	// Match against known command phrases
	 	if (trimmedLineText === this.settings.chatCommandPhrase) {
	 		commandHandler = () => this.editorHandler.triggerChatCommand(editor, view, this.settings, commandLineIndex);
	 	} else if (trimmedLineText === this.settings.archiveCommandPhrase) {
	 		commandHandler = () => this.editorHandler.triggerArchiveCommand(editor, view, this.settings, commandLineIndex);
	 	} else if (this.settings.enableNnCommandPhrase && trimmedLineText === this.settings.newChatCommandPhrase) {
	 		commandHandler = () => this.editorHandler.triggerNewChatCommand(editor, view, this.settings, commandLineIndex);
	 	} else if (trimmedLineText === this.settings.modelCommandPhrase) {
	 		commandHandler = () => this.editorHandler.triggerModelCommand(editor, view, this.settings, commandLineIndex);
	 	}

	 	// Execute if a command matched
	 	if (commandHandler) {
	 		// log.debug(`Enter key trigger conditions met for "${trimmedLineText}" on line ${commandLineIndex}. Executing command.`);
	 		evt.preventDefault(); // Prevent default Enter behavior (new line)
	 		evt.stopPropagation(); // Stop event propagation
	 		// Execute the command handler
	 		commandHandler();
	 	} else {
	 		// log.debug(`Enter key trigger conditions NOT met: No command phrase matched "${trimmedLineText}".`);
	 		// Let Enter proceed with its default behavior (insert newline) if no command matched
	 	}
	 }
	 // If lineToCheck remained -1, it means neither trigger scenario was met,
	 // so Enter proceeds normally by default (no return needed here).
	}
}

