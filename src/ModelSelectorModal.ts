import { Modal, Notice, setIcon } from 'obsidian';
import type SimpleNoteChatPlugin from './main';
import { getModelSections, ProviderModel } from './ModelProvider';
import { log } from './utils/logger';

export class ModelSelectorModal extends Modal {
	private models: ProviderModel[] = [];
	private listEl: HTMLElement;
	private query = '';
	private saving = false;
	private closed = false;

	constructor(public plugin: SimpleNoteChatPlugin) {
		super(plugin.app);
	}

	async onOpen() {
		this.closed = false;
		this.query = '';
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('snc-model-selector');
		contentEl.createEl('h2', { text: 'Select default chat model' });
		contentEl.createEl('p', {
			text: 'Choose the default model for all chat notes. Star models to keep them in Favorites.'
		});

		const notice = new Notice('Loading models…', 0);
		try {
			const { models, errors } = await this.plugin.providerService.fetchModels();
			if (this.closed) return;
			this.models = models;
			errors.forEach(message => contentEl.createEl('p', { text: message }));
			if (models.length === 0) {
				contentEl.createEl('p', { text: 'No models available. Connect ChatGPT or OpenRouter in plugin settings.' });
				return;
			}
			const selected = this.plugin.settings.defaultModel;
			if (selected && !models.some(model => model.id === selected)) {
				contentEl.createEl('p', { text: `Current model: ${selected} (unavailable — check connection)` });
			}

			const search = contentEl.createEl('input', {
				type: 'search', placeholder: 'Search models…', cls: 'snc-model-search',
				attr: { 'aria-label': 'Search models' },
			});
			this.listEl = contentEl.createDiv({ cls: 'snc-model-list' });
			search.addEventListener('input', () => {
				this.query = search.value.trim().toLowerCase();
				this.renderModels();
			});
			this.renderModels();
			search.focus();
		} catch (error) {
			log.error('Error loading models in modal:', error);
			const message = error instanceof Error ? error.message : String(error);
			if (!this.closed) contentEl.createEl('p', { text: `Failed to load models: ${message}` });
		} finally {
			notice.hide();
		}
	}

	private renderModels() {
		if (this.closed) return;
		const focused = this.listEl.ownerDocument.activeElement as HTMLElement | null;
		const focusedFavorite = focused?.dataset.favoriteModel;
		const scrollTop = this.listEl.scrollTop;
		this.listEl.empty();
		this.listEl.setAttribute('aria-busy', String(this.saving));
		const models = this.models.filter(model =>
			`${model.displayName} ${model.id} ${model.provider}`.toLowerCase().includes(this.query));
		const favorites = this.plugin.settings.favoriteModels;
		const sections = getModelSections(models, favorites);
		if (!sections.length) this.listEl.createEl('p', { text: 'No models match your search.', attr: { role: 'status' } });

		for (const { label, entries } of sections) {
			const section = this.listEl.createEl('section', { attr: { 'aria-label': label } });
			section.createEl('h3', { text: label, cls: 'snc-model-section-title' });
			for (const model of entries) {
				const isFavorite = favorites.includes(model.id);
				const isSelected = model.id === this.plugin.settings.defaultModel;
				const row = section.createDiv({ cls: `snc-model-row${isSelected ? ' is-selected' : ''}` });
				const name = model.displayName.split('|')[0].trim();
				const starLabel = `${isFavorite ? 'Unfavorite' : 'Favorite'} ${name}`;
				const star = row.createEl('button', {
					cls: `snc-model-star${isFavorite ? ' is-favorite' : ''}`,
					attr: { type: 'button', 'aria-label': starLabel, title: starLabel, 'aria-pressed': String(isFavorite), 'aria-disabled': String(this.saving) },
				});
				star.dataset.favoriteModel = model.id;
				setIcon(star, 'star');
				star.addEventListener('click', () => { void this.toggleFavorite(model.id); });
				const select = row.createEl('button', {
					cls: 'snc-model-choice',
					attr: { type: 'button', 'aria-pressed': String(isSelected), 'aria-disabled': String(this.saving) },
				});
				select.createSpan({ text: model.displayName });
				// Favorites combine providers, so keep the connection explicit on each row.
				select.createSpan({ text: model.provider === 'chatgpt' ? 'ChatGPT subscription' : 'OpenRouter', cls: 'snc-model-provider' });
				select.addEventListener('click', () => { void this.selectModel(model); });
				if (focusedFavorite === model.id) star.focus({ preventScroll: true });
			}
		}
		this.listEl.scrollTop = scrollTop;
	}

	private async toggleFavorite(id: string) {
		if (this.saving) return;
		const previous = this.plugin.settings.favoriteModels;
		this.plugin.settings.favoriteModels = previous.includes(id)
			? previous.filter(favorite => favorite !== id) : [...previous, id];
		this.saving = true;
		this.renderModels();
		try {
			await this.plugin.saveSettings();
		} catch (error) {
			this.plugin.settings.favoriteModels = previous;
			log.error('Error saving favorite models:', error);
			new Notice('Could not save model favorites. Please try again.');
		} finally {
			this.saving = false;
			this.renderModels();
		}
	}

	private async selectModel(model: ProviderModel) {
		if (this.saving) return;
		const previous = this.plugin.settings.defaultModel;
		this.saving = true;
		this.plugin.settings.defaultModel = model.id;
		try {
			await this.plugin.saveSettings();
			new Notice(`Default chat model set to "${model.displayName.split('|')[0].trim()}".`);
			this.close();
		} catch (error) {
			this.plugin.settings.defaultModel = previous;
			log.error('Error saving default model:', error);
			new Notice('Could not save the default model. Please try again.');
		} finally {
			this.saving = false;
			this.renderModels();
		}
	}

	onClose() {
		this.closed = true;
		this.contentEl.empty();
	}
}
