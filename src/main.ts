import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, moment } from 'obsidian';
import { SimpleNoteChatSettingsTab } from './SettingsTab';
import { ChatService } from './ChatService';
import { OpenRouterService } from './OpenRouterService';
import { EditorHandler } from './EditorHandler';
import { FileSystemService } from './FileSystemService';
import { PluginSettings, DEFAULT_SETTINGS } from './types';
import { DEFAULT_NN_TITLE_FORMAT } from './constants';

// Settings interface and defaults are now imported from './types'

export default class SimpleNoteChatPlugin extends Plugin {
	settings: PluginSettings;
	chatService: ChatService;
	openRouterService: OpenRouterService;
	editorHandler: EditorHandler;
	fileSystemService: FileSystemService;

	async onload() {
		console.log('Loading Simple Note Chat plugin');
		await this.loadSettings();

		this.openRouterService = new OpenRouterService();
		this.chatService = new ChatService(this, this.openRouterService);
		this.fileSystemService = new FileSystemService(this.app);
		this.editorHandler = new EditorHandler(this.app, this);

		this.addSettingTab(new SimpleNoteChatSettingsTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('editor-change', this.editorHandler.handleEditorChange)
		);

		// Register Escape key listener for stopping streams
		this.registerDomEvent(document, 'keydown', this.handleKeyDown.bind(this));

		// --- Add New Chat Command ---
		this.addCommand({
			id: 'create-new-chat-note',
			name: 'Create New Chat Note',
			callback: async () => {
				try {
					const parentPath = this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path || '').path;
					const title = moment().format(DEFAULT_NN_TITLE_FORMAT);
					// Ensure parentPath ends with a slash if it's not the root
					const separator = parentPath === '/' ? '' : '/';
					const fullPath = `${parentPath}${separator}${title}.md`;

					const newFile = await this.app.vault.create(fullPath, '');
					this.app.workspace.openLinkText(newFile.path, '', false); // Open in current leaf
					new Notice(`Created new chat note: ${title}.md`);
				} catch (error) {
					console.error("Error creating new chat note:", error);
					new Notice("Error creating new chat note. Check console for details.");
				}
			}
		});
		// --- End New Chat Command ---

		// --- Conditionally Add Ribbon Icon for New Chat ---
		if (this.settings.enableNnRibbonButton) {
			this.addRibbonIcon('message-square-plus', 'Create New Chat Note', () => {
				// @ts-ignore - Assuming 'commands' exists on app, potentially a typing issue
				this.app.commands.executeCommandById('simple-note-chat:create-new-chat-note');
			});
		}
		// --- End Ribbon Icon ---
	}

	onunload() {
		console.log('Unloading Simple Note Chat plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
		* Handles keydown events globally to catch the Escape key for stream cancellation.
		* @param evt The keyboard event.
		*/
	private handleKeyDown(evt: KeyboardEvent): void {
		if (evt.key === 'Escape') {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView && activeView.file) {
				const filePath = activeView.file.path;
				if (this.chatService.isStreamActive(filePath)) {
					console.log(`Escape key pressed, attempting to cancel stream for: ${filePath}`);
					if (this.chatService.cancelStream(filePath)) {
						new Notice("Chat stream cancelled.");
						// Optionally prevent other Escape key handlers
						// evt.preventDefault();
						// evt.stopPropagation();
					}
				}
			}
		}
	}
}

// The SimpleNoteChatSettingTab class has been moved to src/SettingsTab.ts
// The import statement at the top of the file now brings it in.
// The this.addSettingTab call in onload() will now use the imported class.
