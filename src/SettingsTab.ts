import { App, PluginSettingTab, Setting, Notice, DropdownComponent, moment, Platform } from 'obsidian';
import SimpleNoteChatPlugin from './main';
import { ModelSortOption } from './OpenRouterService';
import { ProviderModel, populateModelOptions } from './ModelProvider';
import { PluginSettings, ReasoningEffort } from './types';
import { log, initializeLogger } from './utils/logger';
import {
	DEFAULT_ARCHIVE_FOLDER,
	DEFAULT_NN_TITLE_FORMAT,
	CHAT_COMMAND_DEFAULT,
	ARCHIVE_COMMAND_DEFAULT,
	NEW_CHAT_COMMAND_DEFAULT,
	MODEL_COMMAND_DEFAULT
} from './constants';
import { LogLevel } from './types'; // Import LogLevel
import { normalizeNoteLinkDepth } from './LinkedNoteContext';

export class SimpleNoteChatSettingsTab extends PluginSettingTab {
	plugin: SimpleNoteChatPlugin;
	private availableModels: ProviderModel[] = [];
	private fetchGeneration = 0;
	private displayGeneration = 0;
	private modelDropdown: DropdownComponent | null = null;
	private llmModelDropdown: DropdownComponent | null = null;
	private newNotePreviewEl: HTMLElement | null = null;

	constructor(app: App, plugin: SimpleNoteChatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const displayGeneration = ++this.displayGeneration;

		// ========== CONNECTIONS ==========
		new Setting(containerEl).setName('Connections').setHeading();
		containerEl.createEl('p', { text: 'Connect ChatGPT, OpenRouter, or both. Choose which connection to use by selecting a model.', cls: 'snc-setting-section-description' });

		new Setting(containerEl)
			.setName('OpenRouter API key')
			.setDesc('Enter your OpenRouter API key; you can get one from openrouter.ai')
			.addText(text => {
				text
					.setPlaceholder('sk-or-v1-...')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						const trimmedValue = value.trim();
						if (this.plugin.settings.apiKey !== trimmedValue) {
							this.plugin.settings.apiKey = trimmedValue;
							await this.plugin.saveSettings();
							new Notice('API key saved. Refreshing models...');
							this.availableModels = [];
							this.populateModelDropdowns();
							// Force a refresh so the new key is actually used (the service
							// cache may still hold models fetched with the old key).
							await this.fetchAndStoreModels(false, true);
						}
					});
				text.inputEl.setAttribute('type', 'password');
			});

		new Setting(containerEl)
			.setName('ChatGPT subscription')
			.setDesc(Platform.isDesktopApp
				? 'Connect your ChatGPT account to use your plan allowance directly. Available models depend on your account.'
				: 'Sign in with ChatGPT requires Obsidian desktop. Use OpenRouter on mobile.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.chatGptEnabled)
				.setDisabled(!Platform.isDesktopApp)
				.onChange(async enabled => {
					this.plugin.settings.chatGptEnabled = enabled;
					if (!enabled) this.plugin.chatGptService.dispose();
					await this.plugin.saveSettings();
					this.display();
				}));

		if (Platform.isDesktopApp && this.plugin.settings.chatGptEnabled) {
			const accountSetting = new Setting(containerEl)
				.setName('ChatGPT account')
				.setDesc('Checking connection…');
			void this.plugin.chatGptService.getAccount().then(account => {
				if (displayGeneration !== this.displayGeneration) return;
				accountSetting.setDesc(account
					? `Connected${account.email ? ` as ${account.email}` : ''}. Uses subscription limits.`
					: 'Not connected. Sign in with your ChatGPT account.');
			}).catch(error => {
				if (displayGeneration === this.displayGeneration) accountSetting.setDesc(error.message);
			});
			accountSetting.addButton(button => button.setButtonText('Continue with ChatGPT').onClick(async () => {
				button.setDisabled(true);
				accountSetting.setDesc('Finish signing in using your browser.');
				try {
					await this.plugin.chatGptService.signIn(url => { window.open(url); });
					new Notice('ChatGPT connected. Requests use your ChatGPT plan allowance. Select a model from the ChatGPT subscription section.');
					this.display();
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					accountSetting.setDesc(message);
					new Notice(message);
				} finally { button.setDisabled(false); }
			}));
			new Setting(containerEl).setName('ChatGPT plan usage').setDesc('Manage how much of your plan this connection can use.').addButton(button => button.setButtonText('Manage usage').onClick(() => { window.open('https://chatgpt.com/settings/usage'); }));
			accountSetting.addButton(button => button.setButtonText('Sign out').onClick(async () => {
				button.setDisabled(true);
				try {
					await this.plugin.chatGptService.signOut();
					new Notice('ChatGPT signed out.');
					this.display();
				} catch (error) {
					new Notice(error instanceof Error ? error.message : String(error));
					this.display();
				}
				finally { button.setDisabled(false); }
			}));
		}

		// ========== MODEL MANAGEMENT ==========
		new Setting(containerEl).setName('Model management').setHeading();
		containerEl.createEl('p', { text: 'Configure model selection and sorting options.', cls: 'snc-setting-section-description' });

		new Setting(containerEl)
			.setName('Model sorting')
			.setDesc('Sort the OpenRouter section. ChatGPT plan models appear first in the order returned by OpenAI.')
			.addDropdown(dropdown => {
				// Add options based on the ModelSortOption enum
				dropdown
					.addOption(ModelSortOption.ALPHABETICAL, 'Alphabetical')
					.addOption(ModelSortOption.PROMPT_PRICE_ASC, 'Prompt price: ascending')
					.addOption(ModelSortOption.PROMPT_PRICE_DESC, 'Prompt price: descending')
					.addOption(ModelSortOption.COMPLETION_PRICE_ASC, 'Completion price: ascending')
					.addOption(ModelSortOption.COMPLETION_PRICE_DESC, 'Completion price: descending')
					// Set the current value from settings
					.setValue(this.plugin.settings.modelSortOrder)
					.onChange(async (value) => {
						this.plugin.settings.modelSortOrder = value as ModelSortOption;
						await this.plugin.saveSettings();
						new Notice(`Model sort order set to: ${dropdown.selectEl.selectedOptions[0]?.text || value}`);
						// Re-populate dropdowns with new sort order
						await this.fetchAndStoreModels(false);
					});
			});

		const modelSetting = new Setting(containerEl)
			.setName('Chat model')
			.setDesc('Select the AI model to use for new chats.');

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
		.setName('Refresh model list')
		.setDesc('Refresh models from connected providers. ChatGPT subscription models appear in their own section above OpenRouter models.')
		.addButton(button => button
			.setButtonText('Refresh models')
			.setCta()
			.onClick(async () => {
				await this.fetchAndStoreModels(true, true);
			}));

		new Setting(containerEl).setName('Linked notes').setHeading();
		new Setting(containerEl)
			.setName('Include linked notes')
			.setDesc('Send the text and reference images from notes linked in your conversation, such as [[note.md]].')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.followNoteLinks)
				.onChange(async value => {
					this.plugin.settings.followNoteLinks = value;
					await this.plugin.saveSettings();
				}));

		const linkDepth = normalizeNoteLinkDepth(this.plugin.settings.noteLinkDepth);
		let finiteDepth = linkDepth === 'unlimited' ? this.plugin.settings.lastNoteLinkDepth : linkDepth;
		if (!Number.isSafeInteger(finiteDepth) || finiteDepth < 1) finiteDepth = 2;
		new Setting(containerEl)
			.setName('Linked note depth')
			.setDesc('Control how far to follow links from your conversation. Greater depth includes more distantly connected notes by following links inside linked notes.')
			.addText(text => {
				text.setValue(String(finiteDepth))
					.setDisabled(linkDepth === 'unlimited')
					.onChange(async value => {
						const depth = Number(value);
						const valid = Number.isSafeInteger(depth) && depth >= 1;
						text.inputEl.setCustomValidity(valid ? '' : 'Enter a whole number of at least 1.');
						if (!valid) {
							text.inputEl.reportValidity();
							return;
						}
						finiteDepth = depth;
						this.plugin.settings.noteLinkDepth = depth;
						this.plugin.settings.lastNoteLinkDepth = depth;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = 'number';
				text.inputEl.min = '1';
				text.inputEl.step = '1';
			});
		new Setting(containerEl)
			.setName('Unlimited depth')
			.setDesc('Keep following links through connected notes without a depth limit. This overrides the above setting and can result in a large amount of text sent to the AI.')
			.addToggle(toggle => toggle
				.setValue(linkDepth === 'unlimited')
				.onChange(async value => {
					this.plugin.settings.lastNoteLinkDepth = finiteDepth;
					this.plugin.settings.noteLinkDepth = value ? 'unlimited' : finiteDepth;
					await this.plugin.saveSettings();
					this.display();
				}));

		// ========== COMMAND PHRASES ==========
		new Setting(containerEl).setName('Command phrases').setHeading();
		containerEl.createEl('p', { text: 'The plugin will look for these command phrases in order to take action. Phrases are recognzied when entered on their own line, and will activate after you hit the <enter> key. Deleting the phrase will disable it from being recognized, although the hotkey (if set) will still work.', cls: 'snc-setting-section-description' });

		new Setting(containerEl)
			.setName('Chat phrase')
			.setDesc(`This phrase will call the AI model and get a response. Previous conversation in the note is included and parsed into user and assistant messages, so the model can clearly follow the conversation. Default: (${CHAT_COMMAND_DEFAULT})`)
			.addText(text => text
				.setPlaceholder(CHAT_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.chatCommandPhrase)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					this.plugin.settings.chatCommandPhrase = trimmedValue;
					await this.plugin.saveSettings();
					this.updateNewNotePathPreview(); // Update preview
				}));

		new Setting(containerEl)
			.setName('Change model phrase')
			.setDesc(`This will open an AI model selection dialog, to enable quickly changing the active model used for chats. Default: (${MODEL_COMMAND_DEFAULT}).`)
			.addText(t => t
				.setPlaceholder(MODEL_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.modelCommandPhrase)
				.onChange(async (v) => {
					const trimmed = v.trim();
					this.plugin.settings.modelCommandPhrase = trimmed;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
		.setName('New chat phrase')
		.setDesc(`This quickly creates a new chat note, for when you want to start a new chat from anywhere in your vault. By default, the chat note is created in the archive directory with the current date and time. It's behavior can be configured in the New note settings section below. Default: (${NEW_CHAT_COMMAND_DEFAULT}).`)
		.addText(text => text
			.setPlaceholder(NEW_CHAT_COMMAND_DEFAULT)
			.setValue(this.plugin.settings.newChatCommandPhrase)
			.onChange(async (value) => {
				const trimmedValue = value.trim();
				if (this.plugin.settings.newChatCommandPhrase !== trimmedValue) {
					this.plugin.settings.newChatCommandPhrase = trimmedValue;
					await this.plugin.saveSettings();
				}
			}));

		new Setting(containerEl)
			.setName('Archive phrase')
			.setDesc(`This phrase, when typed on its own line, will archive the current chat note. Leave blank to disable this phrase trigger (command still available via hotkey/palette). Default: (${ARCHIVE_COMMAND_DEFAULT}).`)
			.addText(text => text
				.setPlaceholder(ARCHIVE_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.archiveCommandPhrase)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (this.plugin.settings.archiveCommandPhrase !== trimmedValue) {
						this.plugin.settings.archiveCommandPhrase = trimmedValue;
						await this.plugin.saveSettings();
					}
				}));

		// ========== BEHAVIOR SETTINGS ==========
		new Setting(containerEl).setName('Behavior').setHeading();
		containerEl.createEl('p', { text: 'Configure how the plugin reacts to user input.', cls: 'snc-setting-section-description' });

		let spacebarDelaySetting: Setting; // Declare here to be accessible in both scopes

		new Setting(containerEl)
			.setName('Enable spacebar command detection')
			.setDesc('Detect command phrases after pressing spacebar. Defaults to 0.5 seconds wait before acting (configurable below).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableSpacebarDetection)
				.onChange(async (value) => {
					this.plugin.settings.enableSpacebarDetection = value;
					await this.plugin.saveSettings();
					new Notice(`Spacebar command detection ${value ? 'enabled' : 'disabled'}.`);
					if (spacebarDelaySetting) { // Check if spacebarDelaySetting is initialized
						spacebarDelaySetting.settingEl.toggleClass('snc-hidden', !value);
					}
				}));

		spacebarDelaySetting = new Setting(containerEl) // Assign here
			.setName('Spacebar detection delay')
			.setDesc('Wait time in seconds before acting after spacebar detection (e.g., 0.5 for half a second).')
			.addText(text => text
				.setPlaceholder('0.5')
				.setValue(String(this.plugin.settings.spacebarDetectionDelay))
				.onChange(async (value) => {
					const floatValue = parseFloat(value);
					if (!isNaN(floatValue) && floatValue >= 0) {
						this.plugin.settings.spacebarDetectionDelay = floatValue;
						await this.plugin.saveSettings();
					} else {
						new Notice('Please enter a valid number (e.g., 0.5).');
						text.setValue(String(this.plugin.settings.spacebarDetectionDelay));
					}
				}))
			.then(setting => {
				const inputEl = setting.controlEl.querySelector('input');
				if (inputEl) {
					inputEl.setAttribute('type', 'number');
					inputEl.setAttribute('step', '0.1');
					inputEl.setAttribute('min', '0');
				}
			});

		// Set initial visibility of the delay setting
		if (spacebarDelaySetting) { // Check if spacebarDelaySetting is initialized
			spacebarDelaySetting.settingEl.toggleClass('snc-hidden', !this.plugin.settings.enableSpacebarDetection);
		}


		// ========== ARCHIVE SETTINGS ==========
		new Setting(containerEl).setName('Archiving').setHeading();
		containerEl.createEl('p', { text: 'Configure how notes are handled when using the Archive command phrase.', cls: 'snc-setting-section-description' });

		new Setting(containerEl)
			.setName('Archive folder')
			.setDesc('Move notes to this directory when the archive command is used.')
			.addText(text => text
				.setPlaceholder(DEFAULT_ARCHIVE_FOLDER)
				.setValue(this.plugin.settings.archiveFolderName)
				.onChange(async (value) => {
					const trimmedValue = value.trim();

					if (this.plugin.settings.archiveFolderName !== trimmedValue) {
						this.plugin.settings.archiveFolderName = trimmedValue;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Rename note on archive (date/time)')
			.setDesc('When this is enabled, the archived note will be renamed using the current date and time.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableArchiveRenameDate)
				.onChange(async (value) => {
					this.plugin.settings.enableArchiveRenameDate = value;
					await this.plugin.saveSettings();
					new Notice(`Archive renaming ${value ? 'enabled' : 'disabled'}.`);
					// Show/hide the date format setting
					if (dateTimeFormatSetting) {
						dateTimeFormatSetting.settingEl.toggleClass('snc-hidden', !value);
					}
				}));

		// Store the setting instance to control its visibility
		const dateTimeFormatSetting = new Setting(containerEl)
			.setName('Date and time format')
			.setDesc('This uses moment.js for specifying the date and time format to use on the archived note. Default: (YYYY-MM-DD-HH-mm)')
			.addText(text => text
				.setPlaceholder(DEFAULT_NN_TITLE_FORMAT)
				.setValue(this.plugin.settings.archiveRenameDateFormat)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (trimmedValue) {
						this.plugin.settings.archiveRenameDateFormat = trimmedValue;
						await this.plugin.saveSettings();
					} else {
						new Notice('Archive rename format cannot be empty.');
						text.setValue(this.plugin.settings.archiveRenameDateFormat);
					}
				}));

		// Set initial visibility based on the toggle state
		dateTimeFormatSetting.settingEl.toggleClass('snc-hidden', !this.plugin.settings.enableArchiveRenameDate);

		new Setting(containerEl)
			.setName('Generate a title')
			.setDesc(`This will generate a title based on the note's content. This is added after the date if both are enabled.`)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableArchiveRenameLlm)
				.onChange(async (value) => {
					this.plugin.settings.enableArchiveRenameLlm = value;
					await this.plugin.saveSettings();
					new Notice(`LLM title renaming ${value ? 'enabled' : 'disabled'}.`);
					// No need to update description here anymore
					llmSettingsContainer.toggleClass('snc-hidden', !value);
				}));

		const llmSettingsContainer = containerEl.createDiv('llm-archive-rename-settings');

		new Setting(llmSettingsContainer)
			.setName('Note title model')
			.setDesc('Choose which model will generate the note title. By default, it uses the same model as your chat conversations.')
			.addDropdown(dropdown => {
				this.llmModelDropdown = dropdown; // Assign to the class property
				dropdown.addOption('', 'Use current chat model');
				dropdown.setValue(this.plugin.settings.llmRenameModel);
				dropdown.onChange(async (value) => {
					this.plugin.settings.llmRenameModel = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(llmSettingsContainer)
			.setName('Title word limit')
			.setDesc('The maximum number of words allowed for the generated title.')
			.addText(text => text
				.setPlaceholder('3')
				.setValue(String(this.plugin.settings.llmRenameWordLimit))
				.onChange(async (value) => {
					const numValue = parseInt(value, 10);
					if (!isNaN(numValue) && numValue >= 1) {
						this.plugin.settings.llmRenameWordLimit = numValue;
						await this.plugin.saveSettings();
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
			.setName('Title reasoning effort')
			.setDesc(`For OpenRouter, how much internal reasoning the model may use before answering. ChatGPT uses its model defaults. 'None' asks the model not to reason; models that can't disable reasoning fall back to their default behavior.`)
			.addDropdown(dropdown => {
				dropdown
					.addOption('none', 'None')
					.addOption('minimal', 'Minimal')
					.addOption('low', 'Low')
					.addOption('medium', 'Medium')
					.addOption('high', 'High')
					.addOption('xhigh', 'Extra high')
					.addOption('max', 'Max')
					.setValue(this.plugin.settings.llmRenameReasoningEffort)
					.onChange(async (value) => {
						this.plugin.settings.llmRenameReasoningEffort = value as ReasoningEffort;
						await this.plugin.saveSettings();
						if (reasoningTokensSetting) {
							reasoningTokensSetting.settingEl.toggleClass('snc-hidden', value === 'none');
						}
					});
			});

		const reasoningTokensSetting = new Setting(llmSettingsContainer)
			.setName('Reasoning token limit')
			.setDesc('For OpenRouter, roughly limits reasoning tokens while generating titles. ChatGPT uses its model defaults for token limits. Higher values allow deeper reasoning but cost more.')
			.addText(text => text
				.setPlaceholder('1000')
				.setValue(String(this.plugin.settings.llmRenameReasoningMaxTokens))
				.onChange(async (value) => {
					const numValue = parseInt(value, 10);
					if (!isNaN(numValue) && numValue >= 1) {
						this.plugin.settings.llmRenameReasoningMaxTokens = numValue;
						await this.plugin.saveSettings();
					} else {
						new Notice('Please enter a valid number (1 or greater).');
						text.setValue(String(this.plugin.settings.llmRenameReasoningMaxTokens));
					}
				}))
			.then(setting => {
				const inputEl = setting.controlEl.querySelector('input');
				if (inputEl) {
					inputEl.setAttribute('type', 'number');
					inputEl.setAttribute('min', '1');
				}
			});

		reasoningTokensSetting.settingEl.toggleClass('snc-hidden', this.plugin.settings.llmRenameReasoningEffort === 'none');

		new Setting(llmSettingsContainer)
			.setName('Allow emojis in LLM title?')
			.setDesc(`For those that like the occasional flair. This feature works on MacOS, I'm unsure about: iOS, Android, Linux, and Windows. Note that this doesn't actually ask for emojis; so you will only see them if the model likes to use them.`)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.llmRenameIncludeEmojis)
				.onChange(async (value) => {
					this.plugin.settings.llmRenameIncludeEmojis = value;
					await this.plugin.saveSettings();
					new Notice(`LLM title emoji inclusion ${value ? 'enabled' : 'disabled'}.`);
				}));

		llmSettingsContainer.toggleClass('snc-hidden', !this.plugin.settings.enableArchiveRenameLlm);


				// ========== NEW NOTE SETTINGS ==========
		new Setting(containerEl).setName('New chat notes').setHeading();
		containerEl.createEl('p', { text: 'Configure how new chat notes are created and where they are placed in your vault.', cls: 'snc-setting-section-description' });
		this.newNotePreviewEl = containerEl.createEl('p', { cls: 'snc-setting-section-description' });

		// Initial update for the consolidated preview
		this.updateNewNotePathPreview();

		new Setting(containerEl)
			.setName('New note folder')
			.setDesc('Choose where new chat notes should be created.')
			.addDropdown(dropdown => {
				dropdown
					.addOption('archive', 'Archive folder')
					.addOption('current', 'Current folder')
					.addOption('custom', 'Custom folder')
					.setValue(this.plugin.settings.newNoteLocation)
					.onChange(async (value) => {
						this.plugin.settings.newNoteLocation = value as PluginSettings['newNoteLocation'];
						await this.plugin.saveSettings();
						new Notice(`New note location set to: ${dropdown.selectEl.selectedOptions[0]?.text || value}`);
						customFolderSetting.settingEl.toggleClass('snc-hidden', value !== 'custom');
						this.updateNewNotePathPreview(); // Update the consolidated preview
					});
			});

		// --- Custom Folder Setting (only shown when location is 'custom') ---
		const customFolderSetting = new Setting(containerEl)
			.setName('Custom folder')
			.setDesc(`Which folder should new chat notes be placed in? If the folder doesn't exist then it will get created when the next chat note is created.`)
			.addText(text => text
				.setPlaceholder('e.g., chats/')
				.setValue(this.plugin.settings.newNoteCustomFolder)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (this.plugin.settings.newNoteCustomFolder !== trimmedValue) {
						this.plugin.settings.newNoteCustomFolder = trimmedValue;
						await this.plugin.saveSettings();
						this.updateNewNotePathPreview(); // Update preview when custom folder changes
					}
				}));

		// Initially hide the custom folder setting
		customFolderSetting.settingEl.toggleClass('snc-hidden', this.plugin.settings.newNoteLocation !== 'custom');

		// --- New Note Date & Time ---
		new Setting(containerEl) // Store the setting instance
			.setName('Optional date & time')
			.setDesc('Uses moment.js format for date/time in the title. Leave empty if no date/time is desired. Default: (YYYY-MM-DD-HH-mm)')
			.addText(text => { text
				.setPlaceholder('YYYY-MM-DD-HH-mm')
				.setValue(this.plugin.settings.newNoteTitleFormat)
				.onChange(async (value) => {
					this.plugin.settings.newNoteTitleFormat = value.trim();
					await this.plugin.saveSettings();
					this.updateNewNotePathPreview();
				});
			});

		// --- New Note Title Prefix ---
		new Setting(containerEl) // Store the setting instance
		.setName('Optional prefix')
		.setDesc('Text to add before the date/time in the new chat note title.')
		.addText(text => { text
			.setPlaceholder('e.g., Chat-')
			.setValue(this.plugin.settings.newNoteTitlePrefix)
			.onChange(async (value) => {
				this.plugin.settings.newNoteTitlePrefix = value;
				await this.plugin.saveSettings();
				this.updateNewNotePathPreview();
			});
		});

		// --- New Note Title Suffix ---
		new Setting(containerEl) // Store the setting instance
			.setName('Optional suffix')
			.setDesc('Text to add after the date/time in the new chat note title.')
			.addText(text => { text
				.setPlaceholder('e.g., -Meeting')
				.setValue(this.plugin.settings.newNoteTitleSuffix)
				.onChange(async (value) => {
					this.plugin.settings.newNoteTitleSuffix = value;
					await this.plugin.saveSettings();
					this.updateNewNotePathPreview();
				});
			});

		// Initial update for the consolidated preview
		this.updateNewNotePathPreview();

		// Fetch models and populate dropdowns on display (handles missing API key internally)
		this.fetchAndStoreModels(false);
		new Setting(containerEl).setName('Logging').setHeading();
		containerEl.createEl('p', {
			text: 'Enable logging to help troubleshoot issues. Logs will appear in the developer console (View -> Toggle Developer Tools -> Console).',
			cls: 'snc-setting-section-description'
		});

		let loggingLevelSetting: Setting;

		new Setting(containerEl)
			.setName('Enable logging')
			.setDesc('Turn on logging to the developer console.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableLogging)
				.onChange(async (value) => {
					this.plugin.settings.enableLogging = value;
					await this.plugin.saveSettings();
					initializeLogger(this.plugin.settings); // Update logger immediately
					if (loggingLevelSetting) {
						loggingLevelSetting.settingEl.toggleClass('snc-hidden', !value); // Show/hide level dropdown
					}
					new Notice(`Logging ${value ? 'enabled' : 'disabled'}.`);
				}));

		loggingLevelSetting = new Setting(containerEl)
			.setName('Logging level')
			.setDesc('Select the level of detail for logs.')
			.addDropdown(dropdown => {
				dropdown
					.addOption(LogLevel.ERROR, 'Errors only')
					.addOption(LogLevel.WARN, 'Warnings & errors')
					.addOption(LogLevel.INFO, 'Info, warnings & errors')
					.addOption(LogLevel.DEBUG, 'Debug (all logs)')
					.setValue(this.plugin.settings.logLevel)
					.onChange(async (value) => {
						this.plugin.settings.logLevel = value as LogLevel;
						await this.plugin.saveSettings();
						initializeLogger(this.plugin.settings); // Update logger immediately
						new Notice(`Log level set to ${value}`);
					});
			});

		// Set initial visibility of the logging level dropdown
		if (loggingLevelSetting) {
			loggingLevelSetting.settingEl.toggleClass('snc-hidden', !this.plugin.settings.enableLogging);
		}
	} // End of display() method

	/** Generates a preview filename based on current settings */
	private generateFilenamePreview(): { filename: string, error: boolean } {
		const format = this.plugin.settings.newNoteTitleFormat;
		const prefix = this.plugin.settings.newNoteTitlePrefix;
		const suffix = this.plugin.settings.newNoteTitleSuffix;

		if (!prefix && !suffix && !format) {
			return { filename: 'Untitled.md', error: false };
		}

		let formattedDate = '';
		if (format) {
			try {
				formattedDate = moment().format(format);
			} catch (e) {
				log.warn("SettingsTab: Invalid moment format string for title preview:", format, e);
				return { filename: 'Invalid date format', error: true };
			}
		}

		const filename = `${prefix}${formattedDate}${suffix}.md`;

		// Basic check for potentially invalid characters in filename
		if (/[\\/:]/.test(filename)) {
			log.warn("SettingsTab: Generated filename contains potentially invalid characters:", filename);
			return { filename: 'Invalid characters in filename', error: true };
		}

		return { filename: filename, error: false };
	}

	/** Updates the new note path preview */
	private updateNewNotePathPreview(): void {
		if (!this.newNotePreviewEl) {
			log.warn("SettingsTab: New Note Preview element not available for update.");
			return;
		}

		const { filename, error: filenameError } = this.generateFilenamePreview();
		let folderPath = '';
		let previewText = '';
		let previewClass = 'snc-filename-preview';

		const location = this.plugin.settings.newNoteLocation;

		if (filenameError) {
			previewText = `Preview: ${filename}`;
			previewClass = 'snc-preview-error';
		} else {
			switch (location) {
				case 'archive':
					folderPath = this.plugin.settings.archiveFolderName || DEFAULT_ARCHIVE_FOLDER;
					if (folderPath && !folderPath.endsWith('/')) {
						folderPath += '/';
					}
					previewText = `Preview: ${folderPath}${filename}`;
					break;
				case 'custom':
					folderPath = this.plugin.settings.newNoteCustomFolder || '';
					// Ensure trailing slash if folder path exists and doesn't have one
					if (folderPath && !folderPath.endsWith('/')) {
						folderPath += '/';
					}
					previewText = `Preview: ${folderPath}${filename}`;
					break;
				case 'current':
				default:
					previewText = `Preview: ${filename} (created in the folder of the currently active note, or root folder if none)`;
					break;
			}
			// Basic check for invalid characters in folder path (relevant for custom/archive)
			if ((location === 'custom' || location === 'archive') && /[\\:*?"<>|]/.test(folderPath)) {
				previewText = `Preview: Invalid characters in folder path: ${folderPath}`;
				previewClass = 'snc-preview-error';
			}
		}

		this.newNotePreviewEl.textContent = previewText;
		this.newNotePreviewEl.className = `snc-setting-section-description ${previewClass}`;
	}

	private populateModelDropdowns(): void {
		if (this.modelDropdown) {
			populateModelOptions(this.modelDropdown.selectEl, this.availableModels, this.plugin.settings.defaultModel, '-- Select a model --', this.plugin.settings.favoriteModels);
		}
		if (this.llmModelDropdown) {
			populateModelOptions(this.llmModelDropdown.selectEl, this.availableModels, this.plugin.settings.llmRenameModel, 'Use default chat model', this.plugin.settings.favoriteModels);
		}
	}

	private async fetchAndStoreModels(showNotices = true, forceRefresh = false): Promise<void> {
		const generation = ++this.fetchGeneration;
		const loadingNotice = showNotices ? new Notice('Fetching models from connected providers…', 0) : undefined;
		try {
			const { models, errors } = await this.plugin.providerService.fetchModels(forceRefresh);
			if (generation !== this.fetchGeneration) return;
			this.availableModels = models;
			this.populateModelDropdowns();
			errors.forEach(message => new Notice(message));
			if (showNotices && !errors.length) new Notice(models.length ? 'Model list updated.' : 'Connect ChatGPT or OpenRouter to load models.');
		} finally { loadingNotice?.hide(); }
	}
}
