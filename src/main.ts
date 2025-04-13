import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { SimpleNoteChatSettingsTab } from './SettingsTab';
import { ChatService } from './ChatService';
import { OpenRouterService } from './OpenRouterService';
import { EditorHandler } from './EditorHandler';
import { FileSystemService } from './FileSystemService';
import { PluginSettings, DEFAULT_SETTINGS } from './types';

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
