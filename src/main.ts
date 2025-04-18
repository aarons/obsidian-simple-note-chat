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

		this.registerDomEvent(document, 'keydown', this.handleKeyDown.bind(this));

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
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Handles keydown events globally for stream cancellation and command triggers.
	 * @param evt The keyboard event.
	 */
	private handleKeyDown(evt: KeyboardEvent): void {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView || !activeView.file) {
			return; // No active markdown editor
		}
		const editor = activeView.editor;
		const filePath = activeView.file.path;

		// Escape Key: Cancel active stream
		if (evt.key === 'Escape') {
			if (this.chatService.isStreamActive(filePath)) {
				log.debug(`Escape key pressed, attempting to cancel stream for: ${filePath}`);
				if (this.chatService.cancelStream(filePath, editor, this.settings)) {
					log.debug("Stream cancellation initiated by Escape key.");
					evt.preventDefault();
					evt.stopPropagation();
				} else {
					log.debug("Escape key pressed, but no active stream found or cancellation failed.");
				}
			}
			return;
		}

		// Enter Key: Trigger command phrases
		if (evt.key === 'Enter') {
			if (this.chatService.isStreamActive(filePath)) {
				return;
			}

			const cursor = editor.getCursor();
			let lineToCheck = cursor.line;
			let lineText = editor.getLine(lineToCheck);

			// Handle cursor position after Enter press
			if (cursor.ch === 0 && cursor.line > 0) {
				const prevLineIndex = cursor.line - 1;
				const prevLineText = editor.getLine(prevLineIndex);
				log.debug(`Enter pressed, cursor at [${cursor.line}, 0]. Checking previous line (${prevLineIndex}): "${prevLineText}"`);

				if (lineText.trim() === '' && prevLineText.trim() !== '') {
					lineToCheck = prevLineIndex;
					lineText = prevLineText;
					log.debug(`Identified line ${lineToCheck} ("${lineText}") as the target for command check.`);
				} else {
					log.debug(`Cursor at [${cursor.line}, 0], but previous line or current line state doesn't suggest command trigger.`);
					return;
				}
			} else {
				log.debug(`Enter pressed, cursor at [${cursor.line}, ${cursor.ch}]. Checking current line (${lineToCheck}): "${lineText}"`);
				if (cursor.ch !== lineText.length) {
					log.debug("Enter key ignored: Cursor not at end of current line content.");
					return;
				}
			}

			const trimmedLineText = lineText.trim();

			let commandHandler: (() => void) | null = null;
			const commandLineIndex = lineToCheck;

			if (trimmedLineText === this.settings.chatCommandPhrase) {
				commandHandler = () => this.editorHandler.triggerChatCommand(editor, activeView, this.settings, commandLineIndex);
			} else if (trimmedLineText === this.settings.archiveCommandPhrase) {
				commandHandler = () => this.editorHandler.triggerArchiveCommand(editor, activeView, this.settings, commandLineIndex);
			} else if (this.settings.enableNnCommandPhrase && trimmedLineText === this.settings.newChatCommandPhrase) {
				commandHandler = () => this.editorHandler.triggerNewChatCommand(editor, activeView, this.settings, commandLineIndex);
			} else if (trimmedLineText === this.settings.modelCommandPhrase) {
				commandHandler = () => this.editorHandler.triggerModelCommand(editor, activeView, this.settings, commandLineIndex);
			}

			if (commandHandler) {
				log.debug(`Enter key trigger conditions met for "${trimmedLineText}" on line ${commandLineIndex}. Executing command.`);
				evt.preventDefault();
				evt.stopPropagation();
				commandHandler();
			} else {
				// Add logging here if no command handler was found after cursor check passed
				log.debug(`Enter key trigger conditions NOT met: No command phrase matched "${trimmedLineText}". Settings: cc='${this.settings.chatCommandPhrase}', gg='${this.settings.archiveCommandPhrase}', nn='${this.settings.newChatCommandPhrase}'`);
			}
		}
	}
}

