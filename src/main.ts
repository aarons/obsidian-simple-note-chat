import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Define the settings interface
interface PluginSettings {
	apiKey: string;
	defaultModel: string;
}

// Define the default settings
const DEFAULT_SETTINGS: PluginSettings = {
	apiKey: '',
	defaultModel: ''
}

export default class SimpleNoteChatPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		console.log('Loading Simple Note Chat plugin');
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SimpleNoteChatSettingTab(this.app, this));

		// Add plugin commands or other initialization logic here
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
}

// Basic Setting Tab (can be expanded later)
class SimpleNoteChatSettingTab extends PluginSettingTab {
	plugin: SimpleNoteChatPlugin;

	constructor(app: App, plugin: SimpleNoteChatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Simple Note Chat Settings'});

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Your API Key for the LLM service (e.g., OpenRouter)')
			.addText(text => text
				.setPlaceholder('Enter your API key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Model')
			.setDesc('The default LLM model to use for chats')
			.addText(text => text
				.setPlaceholder('Enter default model ID')
				.setValue(this.plugin.settings.defaultModel)
				.onChange(async (value) => {
					this.plugin.settings.defaultModel = value;
					await this.plugin.saveSettings();
				}));
	}
}