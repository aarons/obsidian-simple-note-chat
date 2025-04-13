// src/SettingsTab.ts
import { App, PluginSettingTab, Setting, Notice, DropdownComponent } from 'obsidian';
import SimpleNoteChatPlugin from './main';
import { OpenRouterService, OpenRouterModel } from './OpenRouterService';
import { DEFAULT_STOP_SEQUENCE, DEFAULT_ARCHIVE_FOLDER } from './constants'; // Import constants

export class SimpleNoteChatSettingsTab extends PluginSettingTab {
    plugin: SimpleNoteChatPlugin;
    openRouterService: OpenRouterService;
    modelDropdown: DropdownComponent | null = null; // To hold reference for updates

    constructor(app: App, plugin: SimpleNoteChatPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.openRouterService = new OpenRouterService();
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Simple Note Chat - Settings' });

        // --- API Key Setting ---
        new Setting(containerEl)
            .setName('OpenRouter API Key')
            .setDesc('Enter your OpenRouter API key. Get one from openrouter.ai')
            .addText(text => {
                text
                    .setPlaceholder('sk-or-v1-...')
                    .setValue(this.plugin.settings.apiKey)
                    .onChange(async (value) => { // Use onChange for saving when input loses focus or Enter is pressed
                        const trimmedValue = value.trim();
                        if (this.plugin.settings.apiKey !== trimmedValue) {
                            this.plugin.settings.apiKey = trimmedValue;
                            await this.plugin.saveSettings();
                            // Optionally trigger model refresh after key change, maybe with a small delay or confirmation
                            // Consider adding a visual indicator that the key needs saving or validation
                            new Notice('API Key saved. Refresh models if needed.');
                            // Auto-refresh models or prompt user? Let's keep it manual for now via the button.
                            // If the key is cleared, disable/clear the dropdown
                             if (!trimmedValue && this.modelDropdown) {
                                 this.populateModelDropdown(this.modelDropdown, []);
                             } else if (trimmedValue && this.modelDropdown) {
                                 // Re-enable dropdown if it was disabled
                                 this.modelDropdown.setDisabled(false);
                                 // Maybe trigger a silent refresh?
                             }
                        }
                    });
                // Set the input type *after* creating the text component
                text.inputEl.setAttribute('type', 'password');
            });
                // Consider adding an 'onblur' event as well if debouncing isn't used,
                // or a dedicated button to validate/save the key.

        // --- Default Model Setting ---
        const modelSetting = new Setting(containerEl)
            .setName('Default Chat Model')
            .setDesc('Select the default model to use for new chats.');

        modelSetting.addDropdown(dropdown => {
            this.modelDropdown = dropdown; // Store reference
            dropdown.addOption('', '-- Select a model --'); // Initial placeholder
            dropdown.setValue(this.plugin.settings.defaultModel);
            dropdown.onChange(async (value) => {
                this.plugin.settings.defaultModel = value;
                await this.plugin.saveSettings();
            });
            // Dropdown will be populated by initial load or refresh button
        });

        // --- Refresh Models Button ---
        new Setting(containerEl)
            .setName('Refresh Model List')
            .setDesc('Fetch the latest available models from OpenRouter using your API key.')
            .addButton(button => button
                .setButtonText('Refresh Models')
                .setCta() // Make button more prominent
                .onClick(async () => {
                    await this.refreshModels();
                   }));

                 // --- Stop Sequence Setting ---
                 new Setting(containerEl)
                  .setName('Stop Sequence')
                  .setDesc('Type this sequence anywhere in the note while a response is streaming to stop it.')
                  .addText(text => text
                   .setPlaceholder(DEFAULT_STOP_SEQUENCE)
                   .setValue(this.plugin.settings.stopCommandSequence)
                   .onChange(async (value) => {
                    const trimmedValue = value.trim(); // Trim whitespace
                    if (trimmedValue) { // Ensure it's not empty
                    	this.plugin.settings.stopCommandSequence = trimmedValue;
                    	await this.plugin.saveSettings();
                    	new Notice('Stop sequence saved.');
                    } else {
                    	// Optionally revert to default or show error if empty
                    	new Notice('Stop sequence cannot be empty.');
                    	// Revert UI to current saved setting if user tries to clear it
                    	text.setValue(this.plugin.settings.stopCommandSequence);
                    }
                   }));

                 // --- Archive Folder Setting ---
                 new Setting(containerEl)
                  .setName('Archive Folder')
                  .setDesc('Folder where notes will be moved when using the archive command (relative to vault root).')
                  .addText(text => text
                   .setPlaceholder(DEFAULT_ARCHIVE_FOLDER)
                   .setValue(this.plugin.settings.archiveFolderName)
                   .onChange(async (value) => {
                    const trimmedValue = value.trim();
                    // Ensure it ends with a slash if not empty, or is empty
                    const normalizedValue = trimmedValue ? (trimmedValue.endsWith('/') ? trimmedValue : `${trimmedValue}/`) : '';

                    if (this.plugin.settings.archiveFolderName !== normalizedValue) {
                        this.plugin.settings.archiveFolderName = normalizedValue;
                        await this.plugin.saveSettings();
                        new Notice('Archive folder setting saved.');
                        // Update the input field to show the normalized value (e.g., added slash)
                        text.setValue(normalizedValue);
                    }
                   }));

                 // --- Enable Delete Command (dd) Setting ---
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

                // --- New Chat (nn) Command Settings ---
                containerEl.createEl('h3', { text: 'New Chat (`nn`) Command Triggers' });

                new Setting(containerEl)
                 .setName('Enable `nn` Phrase Trigger')
                 .setDesc('Type \'nn\' at the end of any note to trigger the \'Create New Chat Note\' command.')
                 .addToggle(toggle => toggle
                  .setValue(this.plugin.settings.enableNnCommandPhrase)
                  .onChange(async (value) => {
                   this.plugin.settings.enableNnCommandPhrase = value;
                   await this.plugin.saveSettings();
                   new Notice(`'nn' phrase trigger ${value ? 'enabled' : 'disabled'}.`);
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

                 // --- Initial Model Load ---
        // Attempt to load models when the tab is displayed if an API key exists
        if (this.plugin.settings.apiKey) {
            // Load models silently in the background on initial display
            this.loadAndPopulateModels(false); // false = don't show explicit notices unless error
        } else {
             // Ensure dropdown is cleared and shows appropriate message if no key
             if (this.modelDropdown) {
                this.populateModelDropdown(this.modelDropdown, []);
             }
        }
    }

    /**
     * Helper function to populate the model dropdown menu.
     * @param dropdown The DropdownComponent instance.
     * @param models Array of models (OpenRouterModel) to populate with.
     */
    private populateModelDropdown(dropdown: DropdownComponent, models: OpenRouterModel[]): void {
        dropdown.selectEl.empty(); // Clear existing options first

        if (!this.plugin.settings.apiKey) {
             dropdown.addOption('', 'Enter API Key to load models');
             dropdown.setDisabled(true);
             return;
        }

        if (models.length === 0) {
            // This case handles API errors or if the key is valid but returns no models
            dropdown.addOption('', 'No models found or API key invalid');
            dropdown.setDisabled(true); // Disable if no models to select
            return;
        }

        // If we have models, enable the dropdown and add the placeholder first
        dropdown.setDisabled(false);
        dropdown.addOption('', '-- Select a model --');

        // Add each model to the dropdown
        models.forEach(model => {
            // Display format: "Model Name (model/id)"
            const displayName = model.name ? `${model.name} (${model.id})` : model.id;
            dropdown.addOption(model.id, displayName);
        });

        // Try to re-select the currently saved model
        const savedModel = this.plugin.settings.defaultModel;
        if (savedModel && models.some(m => m.id === savedModel)) {
            dropdown.setValue(savedModel);
        } else {
            // If saved model isn't in the list (or no model saved), keep placeholder selected
            dropdown.setValue('');
        }
    }

    /**
     * Fetches models from OpenRouter, sorts them, and updates the dropdown.
     * Handles showing notices to the user during the process.
     * @param showNotices If true, displays "Fetching..." and success/error notices.
     */
    private async loadAndPopulateModels(showNotices: boolean = true): Promise<void> {
        if (!this.plugin.settings.apiKey) {
            if (showNotices) {
                new Notice('Please enter your OpenRouter API key first.');
            }
             if (this.modelDropdown) {
                 this.populateModelDropdown(this.modelDropdown, []); // Clear/disable dropdown
             }
            return;
        }

        let loadingNotice;
        if (showNotices) {
            // Persistent notice while loading
            loadingNotice = new Notice('Fetching models from OpenRouter...', 0);
        }

        try {
            const models = await this.openRouterService.fetchModels(this.plugin.settings.apiKey);

            // fetchModels now returns [] on error and shows its own Notice for API errors.
            // So, we just need to check the length.
            const sortedModels = this.openRouterService.sortModels(models, 'name', 'asc'); // Default sort by name

            if (this.modelDropdown) {
                this.populateModelDropdown(this.modelDropdown, sortedModels);
                if (showNotices && models.length > 0) {
                    new Notice('Model list updated successfully.');
                } else if (showNotices && models.length === 0) {
                    // Notice for empty list was already shown by fetchModels or populateDropdown handles it
                }
            } else {
                 console.error("SettingsTab: Model dropdown reference is null. Cannot populate.");
                 if (showNotices) new Notice('Error: Could not update model dropdown UI element.');
            }

        } catch (error) {
            // Catch unexpected errors during sorting or populating
            console.error("SettingsTab: Error processing models:", error);
            if (showNotices) {
                new Notice('An unexpected error occurred while updating model list.');
            }
             if (this.modelDropdown) {
                 this.populateModelDropdown(this.modelDropdown, []); // Clear dropdown on error
             }
        } finally {
            // Hide the persistent "Fetching..." notice
            loadingNotice?.hide();
        }
    }

     /**
      * Public method called by the refresh button's onClick handler.
      */
     public async refreshModels(): Promise<void> {
         // Always show notices when the button is clicked manually
         await this.loadAndPopulateModels(true);
     }
}
