# Changelog

## [1.2.8](https://github.com/aarons/obsidian-simple-note-chat/compare/1.2.7...1.2.8) (2025-06-13)


### Bug Fixes

* **archive:** improve boundary marker detection and editor state ([52ecbd9](https://github.com/aarons/obsidian-simple-note-chat/commit/52ecbd9bb6b02557ffadd1440caf847138440471))
* **archive:** remove requirement for chat separator on archive ([0d42cc9](https://github.com/aarons/obsidian-simple-note-chat/commit/0d42cc96cacd106cd9a4ea6a486a3167e358ff1e))
* display logging toggle before level selection dropdown ([39f2db1](https://github.com/aarons/obsidian-simple-note-chat/commit/39f2db190a53633787fafca394d4640368f98537))
* **settings:** correctly toggle visibility of spacebar delay setting ([b3f4c5d](https://github.com/aarons/obsidian-simple-note-chat/commit/b3f4c5d1b0c8db22c3f4cdb8198e393aa54d0052))

## [1.2.7](https://github.com/aarons/obsidian-simple-note-chat/compare/1.2.6...1.2.7) (2025-06-06)


### Bug Fixes

* trigger github actions release flow ([30883be](https://github.com/aarons/obsidian-simple-note-chat/commit/30883be180e9eac5b4f82070c4db6e7c8d1edd96))

## [1.2.6](https://github.com/aarons/obsidian-simple-note-chat/compare/1.2.5...1.2.6) (2025-06-06)


### Bug Fixes

* attempt to fix issue with CI release title naming ([4e9a25a](https://github.com/aarons/obsidian-simple-note-chat/commit/4e9a25ac816fcb03d824721a63080e47fc80f332))
* potentially fix tag_name reference and add debug statement ([2488cb1](https://github.com/aarons/obsidian-simple-note-chat/commit/2488cb17b6144bd0054d800d312b031c67b8f031))

## [1.2.5](https://github.com/aarons/obsidian-simple-note-chat/compare/1.2.4...1.2.5) (2025-06-06)


### Bug Fixes

* remove redundant operator from run script ([1d30247](https://github.com/aarons/obsidian-simple-note-chat/commit/1d30247ec1a123c9fa23616f33eaca5a77f807e1))

## [1.2.4](https://github.com/aarons/obsidian-simple-note-chat/compare/1.2.3...1.2.4) (2025-06-06)


### Bug Fixes

* **ci:** use explicit string comparison for release-please output ([d6fff4a](https://github.com/aarons/obsidian-simple-note-chat/commit/d6fff4a0ef7bbe928c8c8b85e03ce07eda9ae6b5))

## [1.2.3](https://github.com/aarons/obsidian-simple-note-chat/compare/1.2.2...1.2.3) (2025-06-01)


### Bug Fixes

* **archive:** correctly modify original file via vault.process and use vault.getAbstractFileByPath for file checks ([70ec6e8](https://github.com/aarons/obsidian-simple-note-chat/commit/70ec6e86dd313ae1f1ccdc7cd0fe74c10d65c11b))
* improve target folder path normalization and handling ([15cf212](https://github.com/aarons/obsidian-simple-note-chat/commit/15cf21277cb2ad4afe8f0e979ddfad3df0568d72))
* minor validation test for release please automation ([fd65c6f](https://github.com/aarons/obsidian-simple-note-chat/commit/fd65c6f7ca0e429e58b99e9d1e58f8465da0fd1c))

## [1.2.2](https://github.com/aarons/obsidian-simple-chat/compare/1.2.1...1.2.2) (2025-06-01)


### Bug Fixes

* important doc and manifest updates ([3bef0fb](https://github.com/aarons/obsidian-simple-chat/commit/3bef0fbcef01c084ad7a22862c9239e53a56ccdc))

## [1.2.1](https://github.com/aarons/obsidian-simple-chat/compare/1.2.0...1.2.1) (2025-05-26)


### Bug Fixes

* **ci:** configure release-please to omit 'v' prefix from version tags ([63c0798](https://github.com/aarons/obsidian-simple-chat/commit/63c07988a11eaa999c72319358c84c06600849ce))

## [1.2.0](https://github.com/aarons/obsidian-simple-chat/compare/1.1.0...1.2.0) (2025-05-26)

## What's Changed
* chore(main): release 1.2.0 by @aarons in https://github.com/aarons/obsidian-simple-chat/pull/5
* fix(OpenRouterService): use type inference for readResult streaming(https://github.com/aarons/obsidian-simple-chat/commit/ed3ccfd80215087302df1c47f8a5d95c0aa86407)

**Full Changelog**: https://github.com/aarons/obsidian-simple-chat/compare/1.1.0...1.2.0

## [1.1.0](https://github.com/aarons/obsidian-simple-chat/compare/1.0.0...1.1.0) (2025-05-26)

## What's Changed
* chore(main): release simple-note-chat 1.1.0 by @aarons in https://github.com/aarons/obsidian-simple-chat/pull/4
* updated documentation and release-please configuration

**Full Changelog**: https://github.com/aarons/obsidian-simple-chat/compare/1.0.0...1.1.0

## 1.0.0 (2025-05-22)


### Features

* add background model cache refresh mechanism after 24 hours ([d47a735](https://github.com/aarons/obsidian-simple-chat/commit/d47a735f05ad5de9c878c4eeb1e0de59e41b6786))
* add CHANGELOG file ([a636101](https://github.com/aarons/obsidian-simple-chat/commit/a63610106cddb478661673842163ba456a4779fc))
* Add chat boundary marker to parse notes from a specific line. ([a7ff5ae](https://github.com/aarons/obsidian-simple-chat/commit/a7ff5ae9c3ef7c481f7ba02eefee6acd9262fa38))
* Add commands and hotkeys for archive and model selection ([cb2c188](https://github.com/aarons/obsidian-simple-chat/commit/cb2c188b83e6f7afb6264c2c0bc00faea404e3e9))
* add configurable target vault path for plugin output ([d4271a3](https://github.com/aarons/obsidian-simple-chat/commit/d4271a3f5e0bb4a3020fd02ad024f19b2d6a6627))
* Add debug logging for command phrase matching failure ([09e21dd](https://github.com/aarons/obsidian-simple-chat/commit/09e21dd2bbfee91814c6c6c78c5e7aaedcb9e2ac))
* Add debug logging for model cache updates ([ed6be8d](https://github.com/aarons/obsidian-simple-chat/commit/ed6be8d4f4f9bf7d949768fdb38d7676c1282787))
* Add FormattedModelInfo and formatPricePerMillion to OpenRouterService ([76bedf2](https://github.com/aarons/obsidian-simple-chat/commit/76bedf2b3261897324a81e3e2305824cbcef0fed))
* add logging for OpenRouterService model response messages ([257ceb1](https://github.com/aarons/obsidian-simple-chat/commit/257ceb19eb191b0d5da51a7ac43446be72045614))
* Add model selector dialog triggered by command ([cb9d749](https://github.com/aarons/obsidian-simple-chat/commit/cb9d749325e48b08212cceedde8abcb74e501607))
* Add new note settings section ([9605f5b](https://github.com/aarons/obsidian-simple-chat/commit/9605f5b5cc61e04c2c874e4b59db049d1c784a71))
* Add new ToDo items for cursor management and archive feature options ([1b6fb5a](https://github.com/aarons/obsidian-simple-chat/commit/1b6fb5a7a796fe8207d1262bea27bbb60b0fb79a))
* add NN command for creating new chat notes and ribbon icon support ([cbaaca7](https://github.com/aarons/obsidian-simple-chat/commit/cbaaca7af97c2c5beaf140372690c015d14f8506))
* add option to archive previous note on 'nn' command ([7a543dd](https://github.com/aarons/obsidian-simple-chat/commit/7a543dd3007c24102b7cd439b80bb3256b1f92e0))
* add release-please GitHub Actions workflow ([ee75435](https://github.com/aarons/obsidian-simple-chat/commit/ee75435c1779f1a4e67e9746cf7e217a85a96c96))
* add support for multiple sorting options in OpenRouterService ([dcb7639](https://github.com/aarons/obsidian-simple-chat/commit/dcb7639ba780f293f32c6958933cade8ea47b435))
* Add user-configurable logging settings ([b449af9](https://github.com/aarons/obsidian-simple-chat/commit/b449af99db31f9035dd9ebe751eda3caa6379384))
* Add welcome.md creation with template in install script ([d53b654](https://github.com/aarons/obsidian-simple-chat/commit/d53b654bb8539eb039271add16eeac1f3e10bf93))
* Allow empty command phrases to disable trigger ([810e69c](https://github.com/aarons/obsidian-simple-chat/commit/810e69c3be3741826cabd6c3f4f993dc01039e6c))
* Always trigger new chat from phrase and archive previous note asynchronously ([320f118](https://github.com/aarons/obsidian-simple-chat/commit/320f1185ff56eb966e2a9350f81632f694339cbc))
* Clarify apiKey refresh behavior with docstring ([5807bb8](https://github.com/aarons/obsidian-simple-chat/commit/5807bb8713b82671ebdd11696d838ce71071d1f4))
* Enhance New Chat Note creation and settings ([5aaccbf](https://github.com/aarons/obsidian-simple-chat/commit/5aaccbf75dea94ce426615bc85e6f70443273382))
* Format OpenRouter models for display with pricing info ([b8218a4](https://github.com/aarons/obsidian-simple-chat/commit/b8218a46ca8f364151c4c59d4f0091705f83640f))
* Implement Enter key command phrase trigger and refactor commands ([7e690c3](https://github.com/aarons/obsidian-simple-chat/commit/7e690c3ca07630ac9df62b514692a43475b0118c))
* implement model caching with 24-hour invalidation period ([587983f](https://github.com/aarons/obsidian-simple-chat/commit/587983f02fd65e80413e52f56068ae3f65c97725))
* Implement optional chat boundary marker for archiving ([64359a2](https://github.com/aarons/obsidian-simple-chat/commit/64359a2a2453acff3111d5d3a95d311950851379))
* Improve command phrase detection and handling in editor ([b2ee1e2](https://github.com/aarons/obsidian-simple-chat/commit/b2ee1e29d9e888dc605436d49b2ef11f73c2baaa))
* Improve Escape key handling for stream cancellation ([a466aac](https://github.com/aarons/obsidian-simple-chat/commit/a466aac01ec3c687eb8a3454b3aefa8b0a2a2b5d))
* Initiate chat stream directly from hotkey using current cursor position ([ff19b5f](https://github.com/aarons/obsidian-simple-chat/commit/ff19b5f2f8b700dcbe8f7772ca26159631521b07))
* Integrate hot-reload plugin installation and add stream logging ([86715ce](https://github.com/aarons/obsidian-simple-chat/commit/86715ce72121789d8405f522a7c90ee95c84e24f))
* Introduce ActiveStreamInfo and update activeStreams type ([43cf498](https://github.com/aarons/obsidian-simple-chat/commit/43cf49875800732077b1b78cf047cbaa0231adfe))
* Pass editor and settings to cancelStream, add status message pos ([187c20e](https://github.com/aarons/obsidian-simple-chat/commit/187c20ee5958861769fd8655094c1b87c67c3cc9))
* Post-archive renamemove status updates and content append ([aef9e8b](https://github.com/aarons/obsidian-simple-chat/commit/aef9e8bb6171e40faf11471913edcd3f9a26d5e9))
* Refine and organize settings tab ([7aa939e](https://github.com/aarons/obsidian-simple-chat/commit/7aa939e007b82a79c7d277c7fc407eb6fb238be7))
* Release 1.0.0 with AGPL-3.0 license and documentation updates ([7b4ec67](https://github.com/aarons/obsidian-simple-chat/commit/7b4ec67da86e1567ec6efe75e9b2aac633d95429))
* Remove commented description for archiveRenameDateFormat ([4d31b48](https://github.com/aarons/obsidian-simple-chat/commit/4d31b488a2cd0c0407c161f087b7a33a99c6ce01))
* Support current note location for new notes and create folder if needed ([2ac7cc6](https://github.com/aarons/obsidian-simple-chat/commit/2ac7cc6991841d78cfa321c17b9fc59140a687ef))


### Bug Fixes

* Add missing try block in ChatService streaming logic ([2992c24](https://github.com/aarons/obsidian-simple-chat/commit/2992c24ba146799d06c0e475aa28b08773c41a75))
* Address enter key trigger and status message replacement issues ([f1f6c7d](https://github.com/aarons/obsidian-simple-chat/commit/f1f6c7dc592076c1e8b8fab8e7f9497673065fbd))
* Allow clearing new chat and archive command phrases ([6309ef3](https://github.com/aarons/obsidian-simple-chat/commit/6309ef3d9fff20b01d3c6e0c526b66a5c20f3e56))
* Cast modelSortOrder to ModelSortOption to fix type error ([10b0d29](https://github.com/aarons/obsidian-simple-chat/commit/10b0d2932f6445c24ca448e5e79ae4d5c32c7612))
* Correct chat separator insertion logic in ChatService ([d9cb495](https://github.com/aarons/obsidian-simple-chat/commit/d9cb4953d4c3e8fac69d759b0f2af24332fabd93))
* Correct syntax errors in settings tab and move comment ([6c96375](https://github.com/aarons/obsidian-simple-chat/commit/6c9637594a71cb28af480efd731ee1765bba325e))
* Define and export ModelSortOption enum, fix sorting logic ([bf11770](https://github.com/aarons/obsidian-simple-chat/commit/bf117705addb186492b6a013d4c5744519aaef34))
* Ensure new notes are created directly in the archive folder ([f297f6c](https://github.com/aarons/obsidian-simple-chat/commit/f297f6c18522c0687eb2a5c0924295a2ac671e53))
* Handle enter key presses at the start of a new line ([4693b2c](https://github.com/aarons/obsidian-simple-chat/commit/4693b2cca752d65608494637d042244c79cdc49c))
* Improve chunk handling and status message removal in ChatService ([42adb46](https://github.com/aarons/obsidian-simple-chat/commit/42adb460bf17a7f2b361c5bc35da7037f4c0019b))
* Improve readability of model sort order options in settings ([04b6449](https://github.com/aarons/obsidian-simple-chat/commit/04b6449ef46c9080577fa9e91b49359a1d4febf2))
* Only trigger commands on exact match + newline in editor handler ([7fb7c6b](https://github.com/aarons/obsidian-simple-chat/commit/7fb7c6bb2096f978e33b752573c8a07e0ff896d5))
* Populate Settings with all model sort orders correctly ([acb4bfd](https://github.com/aarons/obsidian-simple-chat/commit/acb4bfdaf3a27bb02188db93938189e6a33a697e))
* Re-add initial chat separator insertion logic in ChatService ([99e4945](https://github.com/aarons/obsidian-simple-chat/commit/99e4945548c059f84483cec27fb6a9cd1d94048c))
* Remove duplicate variable declaration in handleKeyDown ([b082e0b](https://github.com/aarons/obsidian-simple-chat/commit/b082e0b94fc9a5782294a1917b6b4dc6df0ce1a2))
* Remove erroneous background refresh call in getChatCompletion ([901625c](https://github.com/aarons/obsidian-simple-chat/commit/901625c987dc90dc3a42e26795842cdaac011f83))
* remove extra closing curly brace in EditorHandler.ts ([e729262](https://github.com/aarons/obsidian-simple-chat/commit/e729262261da9c9d9d1011f6d5e631957fffc78c))
* Remove obsolete log message in startChat ([c7d3a90](https://github.com/aarons/obsidian-simple-chat/commit/c7d3a9075882e1fbc0fdc1e67b50011c6c9dfdb5))
* Revert sort option labels in settings dropdown to original format ([846724d](https://github.com/aarons/obsidian-simple-chat/commit/846724d83673dd87900dcf217e43c8b90eb18c67))
* Shorten "Alphabetical (A-Z)" to "Alphabetical" in sort dropdown ([4c1948b](https://github.com/aarons/obsidian-simple-chat/commit/4c1948b620d988cc07817c1c44ccbafec890e7ca))
