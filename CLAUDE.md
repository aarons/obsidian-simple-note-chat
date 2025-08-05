# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm install` - Install dependencies
- `npm run dev` - Build plugin and watch for changes
- `npm run build` - Build for production (TypeScript check + esbuild)
- `./install.sh` - Set up development environment with a test vault and hot-reload
- `./install.sh /path/to/vault` - Set up with existing vault

### Git workflow
- Uses Release Please for automated releases
- Commits follow conventional format (feat:, fix:, chore:, etc.)

## Architecture

### Core Components

**Plugin Entry Point** (`src/main.ts`)
- Extends Obsidian Plugin class
- Manages plugin lifecycle, settings, and command registration
- Handles keyboard event detection for command triggers (cc, gg, cm, nn)
- Coordinates between services

**OpenRouterService** (`src/OpenRouterService.ts`)
- Manages API communication with OpenRouter LLM service
- Handles streaming responses and model selection
- Implements caching for model lists

**ChatService** (`src/ChatService.ts`)
- Core chat functionality - parsing notes, managing message flow
- Handles stream lifecycle and cancellation
- Parses note content into user/assistant messages using separators

**EditorHandler** (`src/EditorHandler.ts`)
- Processes command triggers from editor
- Manages cursor positioning and text replacement
- Bridges between keyboard detection and service actions

**FileSystemService** (`src/FileSystemService.ts`)
- Handles file operations (archiving, creating new notes)
- Manages folder creation and path normalization
- Implements title generation for archived notes

### Key Patterns

**Command Detection**: Commands (cc, cm, gg, nn) must be on their own line. Plugin listens for Enter key (and optionally Space with delay) to trigger commands.

**Message Separation**: Uses `<hr message-from="chat">` as separator between user/assistant messages. Messages alternate user → assistant → user.

**Streaming**: Responses stream directly into the note. Escape key cancels active streams.

**Boundary Marker**: `^^^` on its own line limits what gets sent to the LLM (content above is ignored).

### Settings Storage
Settings stored via Obsidian's data API. Key settings include:
- API key for OpenRouter
- Command phrases (customizable)
- Archive folder configuration
- Model selection
- New note creation options

## Development Tips

- Plugin uses esbuild for bundling with Obsidian externals
- No third-party runtime dependencies (security requirement)
- TypeScript 4.7.4 for type checking
- Hot-reload enabled via `.hotreload` file in development
- The test vault is included for easier manual validation
- Currently no automated tests (will add these soon)

## API Documentation

Important: use context7 for API documentation

It's important to check assumptions about how Obsidian's API works with their actual documentation. It's ok to slow down problem solving or new features to double check that the API is being used correctly.

Context7 Library IDs:

1. Obsidian Developer Docs (/obsidianmd/obsidian-developer-docs) - 1300 code snippets
2. Obsidian API (/obsidianmd/obsidian-api) - Type definitions for the latest Obsidian API
3. Obsidian Help (/obsidianmd/obsidian-help) - General help documentation

Key API Components:

Core Classes:
- App - Central entry point for the API
- Plugin - Base class for creating plugins
- Vault - Working with files/folders
- Workspace - Managing application layout
- MetadataCache - File metadata and links
- Editor - Text editing interface
- MarkdownView - Markdown file views
- Modal - Creating dialogs
- Setting - Plugin settings UI

Important Functions:
- requestUrl() - Making HTTP requests (CORS-free)
- prepareFuzzySearch() - Fuzzy text searching
- parseYaml()/stringifyYaml() - YAML processing
- loadMathJax()/loadPrism() - Loading libraries

Best Practices Highlighted:
- Use Vault API over Adapter API for file operations
- Use requestUrl instead of fetch for network requests
- Register intervals/events properly for cleanup
- Use FileManager#processFrontMatter for frontmatter modifications
