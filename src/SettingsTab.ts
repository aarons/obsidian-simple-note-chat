// src/SettingsTab.ts
import { App, PluginSettingTab, Setting, Notice, DropdownComponent } from 'obsidian';
import SimpleNoteChatPlugin from './main';
import { OpenRouterService, OpenRouterModel, FormattedModelInfo, ModelSortOption } from './OpenRouterService'; // Import FormattedModelInfo and ModelSortOption
import { PluginSettings } from './types';
import { log } from './utils/logger';
import {
	DEFAULT_STOP_SEQUENCE,
	DEFAULT_ARCHIVE_FOLDER,
	DEFAULT_NN_TITLE_FORMAT,
	CHAT_COMMAND_DEFAULT,
	ARCHIVE_COMMAND_DEFAULT,
	DELETE_COMMAND_DEFAULT,
	NEW_CHAT_COMMAND_DEFAULT,
	CHAT_SEPARATOR_DEFAULT
} from './constants';

export class SimpleNoteChatSettingsTab extends PluginSettingTab {
	plugin: SimpleNoteChatPlugin;
	openRouterService: OpenRouterService;
	private availableModels: OpenRouterModel[] = [];
	private modelDropdown: DropdownComponent | null = null;
	private llmModelDropdown: DropdownComponent | null = null;
	private sortDropdown: DropdownComponent | null = null;

	constructor(app: App, plugin: SimpleNoteChatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.openRouterService = plugin.openRouterService || new OpenRouterService();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Simple Note Chat - Settings' });

		new Setting(containerEl)
			.setName('OpenRouter API Key')
			.setDesc('Enter your OpenRouter API key. Get one from openrouter.ai')
			.addText(text => {
				text
					.setPlaceholder('sk-or-v1-...')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						const trimmedValue = value.trim();
						if (this.plugin.settings.apiKey !== trimmedValue) {
							this.plugin.settings.apiKey = trimmedValue;
							await this.plugin.saveSettings();
							new Notice('API Key saved. Refreshing models...');
							this.availableModels = [];
							this.populateModelDropdowns();
							await this.fetchAndStoreModels(false);
						}
					});
				text.inputEl.setAttribute('type', 'password');
			});

		new Setting(containerEl)
			.setName('Refresh Model List')
			.setDesc('Fetch the latest available models from OpenRouter using your API key.')
			.addButton(button => button
				.setButtonText('Refresh Models')
				.setCta()
				.onClick(async () => {
					await this.fetchAndStoreModels(true);
				}));

		new Setting(containerEl)
			.setName('Sort Model Lists By')
			.setDesc('Choose how to sort the OpenRouter model lists in the dropdowns below.')
			.addDropdown(dropdown => {
				this.sortDropdown = dropdown;
				// Add options based on the ModelSortOption enum
				dropdown
					.addOption(ModelSortOption.ALPHABETICAL, 'Alphabetical (A-Z)')
					.addOption(ModelSortOption.PROMPT_PRICE_ASC, 'Prompt Price: Ascending')
					.addOption(ModelSortOption.PROMPT_PRICE_DESC, 'Prompt Price: Descending')
					.addOption(ModelSortOption.COMPLETION_PRICE_ASC, 'Completion Price: Ascending')
					.addOption(ModelSortOption.COMPLETION_PRICE_DESC, 'Completion Price: Descending')
					// Set the current value from settings
					.setValue(this.plugin.settings.modelSortOrder)
					.onChange(async (value) => {
						// Ensure the value is a valid ModelSortOption before saving
						if (Object.values(ModelSortOption).includes(value as ModelSortOption)) {
							this.plugin.settings.modelSortOrder = value as ModelSortOption;
							await this.plugin.saveSettings();
							new Notice(`Model sort order set to: ${dropdown.selectEl.selectedOptions[0]?.text || value}`);
							// Re-populate dropdowns with new sort order
							this.populateModelDropdowns();
						} else {
							log.warn(`SettingsTab: Invalid sort option selected: ${value}`);
							// Optionally revert dropdown to saved setting or default
							dropdown.setValue(this.plugin.settings.modelSortOrder);
						}
					});
			});

		const modelSetting = new Setting(containerEl)
			.setName('Default Chat Model')
			.setDesc('Select the default model to use for new chats.');

		modelSetting.addDropdown(dropdown => {
			this.modelDropdown = dropdown;
			dropdown.addOption('', '-- Select a model --');
			dropdown.setValue(this.plugin.settings.defaultModel);
			dropdown.onChange(async (value) => {
				this.plugin.settings.defaultModel = value;
				await this.plugin.saveSettings();
			});
		});


		new Setting(containerEl)
			.setName('Stop Sequence')
			.setDesc('Type this sequence anywhere in the note while a response is streaming to stop it.')
			.addText(text => text
				.setPlaceholder(DEFAULT_STOP_SEQUENCE)
				.setValue(this.plugin.settings.stopCommandSequence)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (trimmedValue) {
						this.plugin.settings.stopCommandSequence = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('Stop sequence saved.');
					} else {
						new Notice('Stop sequence cannot be empty.');
						text.setValue(this.plugin.settings.stopCommandSequence);
					}
				}));

		new Setting(containerEl)
			.setName('Enable Viewport Scrolling')
			.setDesc('Automatically scroll the note to the bottom as the chat response streams in.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableViewportScrolling)
				.onChange(async (value) => {
					this.plugin.settings.enableViewportScrolling = value;
					await this.plugin.saveSettings();
					new Notice(`Viewport scrolling ${value ? 'enabled' : 'disabled'}.`);
				}));

		new Setting(containerEl)
			.setName('Archive Folder')
			.setDesc('Folder where notes will be moved when using the archive command (relative to vault root).')
			.addText(text => text
				.setPlaceholder(DEFAULT_ARCHIVE_FOLDER)
				.setValue(this.plugin.settings.archiveFolderName)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					const normalizedValue = trimmedValue ? (trimmedValue.endsWith('/') ? trimmedValue : `${trimmedValue}/`) : '';

					if (this.plugin.settings.archiveFolderName !== normalizedValue) {
						this.plugin.settings.archiveFolderName = normalizedValue;
						await this.plugin.saveSettings();
						new Notice('Archive folder setting saved.');
						text.setValue(normalizedValue);
					}
				}));

		new Setting(containerEl)
			.setName('Enable Delete Command (`dd`)')
			.setDesc('Allow deleting notes using the \'dd\' command. Notes are moved to system trash. USE WITH CAUTION!')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDeleteCommand)
				.onChange(async (value) => {
					this.plugin.settings.enableDeleteCommand = value;
					await this.plugin.saveSettings();
					new Notice(`Delete command ('dd') ${value ? 'enabled' : 'disabled'}.`);
				}));

		new Setting(containerEl)
			.setName('Bypass Separator Check for `dd`')
			.setDesc('Allow the \'dd\' command to work even if the note doesn\'t contain a chat separator. USE WITH EXTREME CAUTION!')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.ddBypassSeparatorCheck)
				.onChange(async (value) => {
					this.plugin.settings.ddBypassSeparatorCheck = value;
					await this.plugin.saveSettings();
					new Notice(`'dd' separator bypass ${value ? 'enabled' : 'disabled'}.`);
				}));

		containerEl.createEl('h3', { text: 'Custom Phrases & Separator' });

		new Setting(containerEl)
			.setName('Chat Command Phrase')
			.setDesc(`Phrase to trigger chat completion (Default: ${CHAT_COMMAND_DEFAULT}).`)
			.addText(text => text
				.setPlaceholder(CHAT_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.chatCommandPhrase)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (trimmedValue && this.plugin.settings.chatCommandPhrase !== trimmedValue) {
						this.plugin.settings.chatCommandPhrase = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('Chat command phrase saved.');
					} else if (!trimmedValue) {
						new Notice('Command phrase cannot be empty.');
						text.setValue(this.plugin.settings.chatCommandPhrase); // Revert if empty
					}
				}));

		new Setting(containerEl)
			.setName('Enable Chat Keyboard Shortcut')
			.setDesc(`Make the 'Trigger Chat Completion (${CHAT_COMMAND_DEFAULT})' command available for assigning a keyboard shortcut in Obsidian's hotkey settings.`)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableCcShortcut) // Keep internal setting name for command ID link
				.onChange(async (value) => {
					this.plugin.settings.enableCcShortcut = value;
					await this.plugin.saveSettings();
					new Notice(`Chat keyboard shortcut command ${value ? 'enabled' : 'disabled'}. Configure in Obsidian Hotkeys.`);
				}));

		new Setting(containerEl)
			.setName('Archive Command Phrase')
			.setDesc(`Phrase to trigger archiving the current chat note (Default: ${ARCHIVE_COMMAND_DEFAULT}).`)
			.addText(text => text
				.setPlaceholder(ARCHIVE_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.archiveCommandPhrase)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (trimmedValue && this.plugin.settings.archiveCommandPhrase !== trimmedValue) {
						this.plugin.settings.archiveCommandPhrase = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('Archive command phrase saved.');
					} else if (!trimmedValue) {
						new Notice('Command phrase cannot be empty.');
						text.setValue(this.plugin.settings.archiveCommandPhrase); // Revert if empty
					}
				}));

		new Setting(containerEl)
			.setName('Delete Command Phrase')
			.setDesc(`Phrase to trigger deleting the current chat note (if enabled) (Default: ${DELETE_COMMAND_DEFAULT}).`)
			.addText(text => text
				.setPlaceholder(DELETE_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.deleteCommandPhrase)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (trimmedValue && this.plugin.settings.deleteCommandPhrase !== trimmedValue) {
						this.plugin.settings.deleteCommandPhrase = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('Delete command phrase saved.');
					} else if (!trimmedValue) {
						new Notice('Command phrase cannot be empty.');
						text.setValue(this.plugin.settings.deleteCommandPhrase); // Revert if empty
					}
				}));

		new Setting(containerEl)
			.setName('New Chat Command Phrase')
			.setDesc(`Phrase to trigger creating a new chat note (if enabled) (Default: ${NEW_CHAT_COMMAND_DEFAULT}).`)
			.addText(text => text
				.setPlaceholder(NEW_CHAT_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.newChatCommandPhrase)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (trimmedValue && this.plugin.settings.newChatCommandPhrase !== trimmedValue) {
						this.plugin.settings.newChatCommandPhrase = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('New chat command phrase saved.');
					} else if (!trimmedValue) {
						new Notice('Command phrase cannot be empty.');
						text.setValue(this.plugin.settings.newChatCommandPhrase); // Revert if empty
					}
				}));

		new Setting(containerEl)
			.setName('Chat Separator')
			.setDesc(`Markdown or text used to separate messages in chat notes. Default: ${CHAT_SEPARATOR_DEFAULT}`)
			.addText(text => text
				.setPlaceholder(CHAT_SEPARATOR_DEFAULT)
				.setValue(this.plugin.settings.chatSeparator)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (this.plugin.settings.chatSeparator !== trimmedValue) {
						this.plugin.settings.chatSeparator = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('Chat separator saved.');
					}
				}));

		new Setting(containerEl)
			.setName('Note on Custom Phrases & Separator')
			.setDesc('Changing command phrases or the separator may require Obsidian to be reloaded for the changes to take full effect in the editor detection.');

		containerEl.createEl('h3', { text: 'Archive Chat (`gg`) Command Settings' });

		new Setting(containerEl)
			.setName('Rename Note on Archive (Date/Time)')
			.setDesc('Rename the note using a date/time format when archiving.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableArchiveRenameDate)
				.onChange(async (value) => {
					this.plugin.settings.enableArchiveRenameDate = value;
					await this.plugin.saveSettings();
					new Notice(`Archive renaming ${value ? 'enabled' : 'disabled'}.`);
				}));

		new Setting(containerEl)
			.setName('Date/Time Format')
			.setDesc('Moment.js format string for renaming archived notes (e.g., YYYY-MM-DD-HH-mm).')
			.addText(text => text
				.setPlaceholder(DEFAULT_NN_TITLE_FORMAT)
				.setValue(this.plugin.settings.archiveRenameDateFormat)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (trimmedValue) {
						this.plugin.settings.archiveRenameDateFormat = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('Archive rename format saved.');
					} else {
						new Notice('Archive rename format cannot be empty.');
						text.setValue(this.plugin.settings.archiveRenameDateFormat);
					}
				}));

		const llmSettingsContainer = containerEl.createDiv('llm-archive-rename-settings');

		new Setting(containerEl)
			.setName('Rename Note on Archive (LLM Title)')
			.setDesc('Use an LLM to generate a title based on note content when archiving. This happens *after* date renaming if both are enabled.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableArchiveRenameLlm)
				.onChange(async (value) => {
					this.plugin.settings.enableArchiveRenameLlm = value;
					await this.plugin.saveSettings();
					new Notice(`LLM title renaming ${value ? 'enabled' : 'disabled'}.`);
					llmSettingsContainer.style.display = value ? 'block' : 'none';
				}));

		new Setting(llmSettingsContainer)
			.setName('LLM Title Word Limit')
			.setDesc('Approximate maximum words for the generated title.')
			.addText(text => text
				.setPlaceholder('5')
				.setValue(String(this.plugin.settings.llmRenameWordLimit))
				.onChange(async (value) => {
					const numValue = parseInt(value, 10);
					if (!isNaN(numValue) && numValue >= 1) {
						this.plugin.settings.llmRenameWordLimit = numValue;
						await this.plugin.saveSettings();
						new Notice('LLM title word limit saved.');
					} else {
						new Notice('Please enter a valid number (1 or greater).');
						text.setValue(String(this.plugin.settings.llmRenameWordLimit));
					}
				}))
			.then(setting => {
				const inputEl = setting.controlEl.querySelector('input');
				if (inputEl) {
					inputEl.setAttribute('type', 'number');
					inputEl.setAttribute('min', '1');
				}
			});


		new Setting(llmSettingsContainer)
			.setName('Include Emojis in LLM Title')
			.setDesc('Allow the LLM to include relevant emojis in the title.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.llmRenameIncludeEmojis)
				.onChange(async (value) => {
					this.plugin.settings.llmRenameIncludeEmojis = value;
					await this.plugin.saveSettings();
					new Notice(`LLM title emoji inclusion ${value ? 'enabled' : 'disabled'}.`);
				}));

		const llmModelSetting = new Setting(llmSettingsContainer)
			.setName('LLM Title Model')
			.setDesc('Model to use for generating the title. Uses default chat model if left blank.');

		llmModelSetting.addDropdown(dropdown => {
			this.llmModelDropdown = dropdown;
			dropdown.addOption('', 'Use Default Chat Model');
			dropdown.setValue(this.plugin.settings.llmRenameModel);
			dropdown.onChange(async (value) => {
				this.plugin.settings.llmRenameModel = value;
				await this.plugin.saveSettings();
			});
		});

		llmSettingsContainer.style.display = this.plugin.settings.enableArchiveRenameLlm ? 'block' : 'none';


		containerEl.createEl('h3', { text: 'New Chat Command Triggers' });

		new Setting(containerEl)
			.setName('Enable New Chat Phrase Trigger')
			.setDesc(`Type the 'New Chat' phrase (default: ${NEW_CHAT_COMMAND_DEFAULT}) at the end of any note to trigger the 'Create New Chat Note' command.`)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableNnCommandPhrase) // Keep internal setting name for consistency
				.onChange(async (value) => {
					this.plugin.settings.enableNnCommandPhrase = value;
					await this.plugin.saveSettings();
					new Notice(`New Chat phrase trigger ${value ? 'enabled' : 'disabled'}.`);
				}));

		new Setting(containerEl)
			.setName('Enable Ribbon Button Trigger')
			.setDesc('Add a button to the left ribbon bar to trigger the \'Create New Chat Note\' command.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableNnRibbonButton)
				.onChange(async (value) => {
					this.plugin.settings.enableNnRibbonButton = value;
					await this.plugin.saveSettings();
					new Notice(`Ribbon button trigger ${value ? 'enabled' : 'disabled'}. Reload Obsidian for the change to take full effect.`);
				}));

		new Setting(containerEl)
			.setName('Enable Keyboard Shortcut Trigger')
			.setDesc('Allow assigning a keyboard shortcut in Obsidian\'s hotkey settings for the \'Create New Chat Note\' command.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableNnKeyboardShortcut)
				.onChange(async (value) => {
					this.plugin.settings.enableNnKeyboardShortcut = value;
					await this.plugin.saveSettings();
					new Notice(`Keyboard shortcut availability ${value ? 'enabled' : 'disabled'}. Configure the shortcut in Obsidian Hotkeys.`);
				}));

		new Setting(containerEl)
			.setName('Archive Current Note on New Chat')
			.setDesc(`Automatically archive the current note (like using the Archive command) before creating the new one when using the New Chat command/phrase/button.`)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.archivePreviousNoteOnNn) // Keep internal setting name
				.onChange(async (value) => {
					this.plugin.settings.archivePreviousNoteOnNn = value;
					await this.plugin.saveSettings();
					new Notice(`Archive on New Chat ${value ? 'enabled' : 'disabled'}.`);
				}));

		if (this.plugin.settings.apiKey) {
			this.fetchAndStoreModels(false);
		} else {
			this.populateModelDropdowns();
		}
	}

	/**
	 * Populates a single model dropdown menu.
	 * @param dropdown The DropdownComponent instance
	 * @param formattedModels Array of formatted models to populate with
	 * @param settingKey The key in PluginSettings that this dropdown controls
	 * @param noApiKeyText Text to display when API key is missing
	 * @param placeholderText Default placeholder text when models are loaded
	 */
	private populateModelDropdown(
		dropdown: DropdownComponent | null,
		formattedModels: FormattedModelInfo[],
		settingKey: keyof PluginSettings,
		noApiKeyText: string,
		placeholderText: string
	): void {
		if (!dropdown) {
			log.warn(`SettingsTab: Dropdown for setting key "${String(settingKey)}" is null.`);
			return;
		}

		const currentSelectedValue = dropdown.getValue();
		dropdown.selectEl.empty();

		if (!this.plugin.settings.apiKey) {
			dropdown.addOption('', noApiKeyText);
			dropdown.setDisabled(true);
			dropdown.setValue('');
			return;
		}

		dropdown.setDisabled(false);

		if (formattedModels.length === 0) {
			dropdown.addOption('', 'No models found or API key invalid');
			dropdown.setValue('');
			return;
		}

		dropdown.addOption('', placeholderText);

		formattedModels.forEach(model => {
			// Use the pre-formatted displayName directly
			dropdown.addOption(model.id, model.displayName);
		});

		// @ts-ignore - Dynamic setting access
		const savedModel = this.plugin.settings[settingKey] as string;
		// Check if the current or saved model ID exists in the formatted list
		const valueToSelect = formattedModels.some(m => m.id === currentSelectedValue) ? currentSelectedValue : savedModel;

		if (valueToSelect && formattedModels.some(m => m.id === valueToSelect)) {
			dropdown.setValue(valueToSelect);
		} else {
			// If the saved model is no longer valid or wasn't set, default to empty/placeholder
			dropdown.setValue('');
		}
	}

	/**
	 * Sorts models, formats them, and populates dropdowns
	 */
	private populateModelDropdowns(): void {
		let formattedModels: FormattedModelInfo[] = [];
		if (this.plugin.settings.apiKey && this.availableModels.length > 0) {
			try {
				// 1. Sort the raw models
				const sortedModels = this.openRouterService.sortModels(
					this.availableModels,
					this.plugin.settings.modelSortOrder
				);
				// 2. Format the sorted models for display
				formattedModels = this.openRouterService.getFormattedModels(sortedModels);

			} catch (error) {
				log.error("SettingsTab: Error sorting or formatting models:", error);
				new Notice("Error preparing model list. Check console.");
				// Attempt to format unsorted models as a fallback
				try {
					formattedModels = this.openRouterService.getFormattedModels(this.availableModels);
				} catch (formatError) {
					log.error("SettingsTab: Fallback formatting failed:", formatError);
					formattedModels = []; // Ensure it's an empty array on complete failure
				}
			}
		}

		// Pass the formatted models to the dropdown population function
		this.populateModelDropdown(
			this.modelDropdown,
			formattedModels,
			'defaultModel',
			'Enter API Key to load models',
			'-- Select a model --'
		);
		this.populateModelDropdown(
			this.llmModelDropdown,
			formattedModels,
			'llmRenameModel',
			'Enter API Key to load models',
			'Use Default Chat Model'
		);
	}


	/**
	 * @param showNotices If true, displays loading and result notices
	 */
	private async fetchAndStoreModels(showNotices: boolean = true): Promise<void> {
		if (!this.plugin.settings.apiKey) {
			if (showNotices) {
				new Notice('Please enter your OpenRouter API key first.');
			}
			this.availableModels = [];
			this.populateModelDropdowns();
			return;
		}

		let loadingNotice;
		if (showNotices) {
			loadingNotice = new Notice('Fetching models from OpenRouter...', 0);
		}

		try {
			const models = await this.openRouterService.fetchModels(this.plugin.settings.apiKey);
			this.availableModels = models;

			this.populateModelDropdowns();

			if (showNotices) {
				if (this.availableModels.length > 0) {
					new Notice('Model list updated successfully.');
				}
			}

		} catch (error) {
			log.error("SettingsTab: Error fetching or storing models:", error);
			if (showNotices) {
				new Notice('An unexpected error occurred while updating model list.');
			}
			this.availableModels = [];
			this.populateModelDropdowns();
		} finally {
			loadingNotice?.hide();
		}
	}

	public async refreshModels(): Promise<void> {
		await this.fetchAndStoreModels(true);
	}
}
