import { Modal, Setting, Notice } from 'obsidian';
import SimpleNoteChatPlugin from './main';
import { populateModelOptions } from './ModelProvider';
import { log } from './utils/logger';

export class ModelSelectorModal extends Modal {
	plugin: SimpleNoteChatPlugin;

	constructor(plugin: SimpleNoteChatPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Select default chat model' });
		contentEl.createEl('p', {
			text: 'This changes the default model used for all chat notes. Currently, setting models per-note is not supported (but maybe someday!). You can change this default model again at any time using this dialog or the settings.'
		});

		const notice = new Notice('Loading models…', 0); // Indefinite notice

		try {
			const { models: formatted, errors } = await this.plugin.providerService.fetchModels();
			errors.forEach(message => contentEl.createEl('p', { text: message }));
			if (formatted.length === 0) {
				contentEl.createEl('p', { text: 'No models available. Connect ChatGPT or OpenRouter in plugin settings.' });
				return;
			}

			new Setting(contentEl)
				.setName('Default model')
				.setDesc('Choose the LLM to use for chat completions.')
				.addDropdown(dd => {
					populateModelOptions(dd.selectEl, formatted, this.plugin.settings.defaultModel, '-- Select a model --');
					dd.setValue(this.plugin.settings.defaultModel);
					dd.onChange(async (val) => {
						if (!val) return;
						this.plugin.settings.defaultModel = val;
						await this.plugin.saveSettings();
						// Find the display name for the notice
						const selectedModelInfo = formatted.find(m => m.id === val);
						const modelDisplayName = selectedModelInfo ? selectedModelInfo.displayName.split('|')[0].trim() : val; // Extract name before price
						new Notice(`Default chat model set to "${modelDisplayName}".`);
						this.close();
					});
				});

		} catch (error) {
			log.error('Error loading models in modal:', error);
			const message = error instanceof Error ? error.message : String(error);
			contentEl.createEl('p', { text: `Failed to load models: ${message}` });
		} finally {
			notice.hide();
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
