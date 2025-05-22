# Contributing to Simple Note Chat

Thank you for your interest in contributing!

## Guidelines

Please follow these guidelines when contributing:

1. Open a Pull Request (PR) with a clear explanation of the changes or the feature being added.
2. Include a link to the issue that your PR is resolving.
3. Note that contributions adding third-party dependencies will not be accepted due to security risks.

## Development Setup

### Contributing with Pull Requests (PR Workflow)

You will need to fork the repository first in order to submit PRs. Follow these steps:

1. Fork the repository:
   - Go to https://github.com/aarons/obsidian-simple-chat
   - Click the "Fork" button in the upper right
   - Clone your fork to your local machine:
   ```bash
   git clone https://github.com/YOUR-USERNAME/obsidian-simple-chat.git
   cd obsidian-simple-chat
   ```

2. Add the upstream repository:
   ```bash
   git remote add upstream https://github.com/aarons/obsidian-simple-chat.git
   ```

3. Create a feature branch:
   ```bash
   git checkout -b my-new-feature
   ```

4. Set up your development environment:
   ```bash
   ./install.sh
   ```

   This script will:
   - Install all dependencies (including hot-reload plugin)
   - Create a test vault (if using the default)
   - Build the plugin and watch for changes
   - Update the plugin in `test-vault/` when it changes

   To use your own existing vault, specify the path:
   ```bash
   ./install.sh /path/to/your/vault
   ```

5. Write some code:
   - Edit code in the repo
   - Open the `test-vault/` in Obsidian
   - Validate that your changes work as expected

6. Commit your changes:
   ```bash
   git add .
   git commit -m "Add my new feature"
   git push origin my-new-feature
   ```

7. Submit a Pull Request:
   - Go to your fork on GitHub
   - Click "New Pull Request"
   - Select your feature branch
   - Provide a clear description of your changes
   - Link to any related issues

**Staying up to date**

Adding the upstream repository allows you to stay in sync with the latest code changes from the main project. It's recommended to sync with upstream before starting work on a new feature branch.

If you did this: `git remote add upstream https://github.com/aarons/obsidian-simple-chat.git` then you can:

```bash
# Switch to your main branch
git checkout main

# Fetch changes from the upstream repository
git fetch upstream

# Merge upstream changes into your main branch
git merge upstream/main

# Push the updates to your fork
git push origin main
```


### Local Development (Just Tinkering)

If you just want to tinker locally without submitting changes:

1. Clone the repository directly:
   ```bash
   git clone https://github.com/aarons/obsidian-simple-chat.git
   cd obsidian-simple-chat
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the plugin and watch for changes:
   ```bash
   npm run dev
   ```

4. Set up Obsidian for testing:
   - Option A: Use the included test vault:
     ```bash
     ./install.sh
     ```

   - Option B: Use your existing vault:
     ```bash
     ./install.sh /Users/name/my-vault
     ```
     Then enable the plugin in Obsidian settings under "Community plugins"

## Testing

Where are the automated tests?

Well... AIs are pretty miserable at writing tests, particularly for Obsidian plugins. This is on the roadmap, but I want them to be done well, and their existence to not overtake development efforts.

Until we have them, simple PRs are more likely to be accepted, as they are easier to validate.

## Additional NPM Commands

- Build for production:
  ```bash
  npm run build
  ```
- Lint code:
  ```bash
  npm run lint
  ```


## License

This project is licensed under the **Affero General Public License (AGPL) v3.0**.

The AGPL is a free software license. Key aspects:

**Network Use Clause**
If you modify AGPL-licensed software and make it accessible over a network (e.g., a web service), you must make the modified source code available to the users interacting with it.

**Distribution**
If you distribute the software (modified or unmodified), you must provide the source code under the same AGPL terms.

This ensures that modifications remain free and accessible to the community, even when used in network-based services. You can find the full license text in the [LICENSE](LICENSE) file or at [https://www.gnu.org/licenses/agpl-3.0.en.html](https://www.gnu.org/licenses/agpl-3.0.en.html).
