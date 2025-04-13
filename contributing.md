# Contributing to Simple Note Chat

Thank you for your interest in contributing! We welcome improvements and bug fixes.

## Development Setup

Follow these steps to set up your development environment:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/aarons/obsidian-simple-chat.git
    cd obsidian-simple-chat
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Build the plugin (and watch for changes):**
    ```bash
    npm run dev
    ```
4.  **Set up Obsidian for testing:**
    *   **Option A (Recommended): Use the included `test-vault`:**
        *   Open the `test-vault` directory within this repository as an Obsidian vault.
        *   The plugin is likely already linked or can be easily enabled in the community plugins section. This vault contains sample notes for testing.
    *   **Option B (Manual Setup): Copy plugin files to your main Obsidian vault:**
        *   Create a folder named `simple-note-chat` inside your vault's `.obsidian/plugins/` directory.
        *   Copy the generated `main.js` and the `manifest.json` file into the `.obsidian/plugins/simple-note-chat/` directory. (Note: `styles.css` will be added later if needed).
        *   Enable the plugin in Obsidian:
            *   Open Obsidian settings.
            *   Go to "Community plugins".
            *   Make sure "Restricted mode" is off.
            *   Find "Simple Note Chat" in the list of installed plugins and toggle it on.

## Contribution Guidelines

*   Please open a Pull Request (PR) with a clear explanation of the changes or the feature being added.
*   Ensure your code follows the existing style and conventions.
*   Contributions that add third-party dependencies will be carefully reviewed and may not be accepted due to potential risks.

## Implementation Notes (High-Level)

*   **Chat Initiation (`cc`):** Detects the phrase, parses existing messages using the configured separator, calls the LLM API, streams the response back, and updates the note content.
*   **Archiving (`gg`):** Detects the phrase, optionally asks an LLM for a title, moves the note to the archive folder, renames it, and cleans up the trigger phrase.

## License

This project is licensed under the **Affero General Public License (AGPL) v3.0 or later**.

The AGPL is a free software license. Key aspects:

*   **Network Use Clause:** If you modify AGPL-licensed software and make it accessible over a network (e.g., a web service), you must make the modified source code available to the users interacting with it.
*   **Distribution:** If you distribute the software (modified or unmodified), you must provide the source code under the same AGPL terms.

This ensures that modifications remain free and accessible to the community, even when used in network-based services. You can find the full license text in the `LICENSE` file (to be added) or at [https://www.gnu.org/licenses/agpl-3.0.en.html](https://www.gnu.org/licenses/agpl-3.0.en.html).