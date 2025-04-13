## Testing & Release Prep

**Goal:** Ensure stability, polish the user experience, and prepare for release.

*   [ ] Thoroughly test all command phrases (`cc`, `gg`, `dd`, `nn`) and edge cases (empty notes, notes without separators, incorrect phrase placement, file conflicts).
*   [ ] Test all settings options individually and in combination (API keys, models, sorting, commands, separator, scrolling, archive options, new chat options, delete options, stop options).
*   [ ] Test stop sequence and stop shortcut key during active streaming.
+ 180 |     *   [ ] *Corner Case:* Test typing stop sequence slowly vs quickly.
*   [ ] Test API error handling (invalid API key, network issues, model errors).
*   [ ] Test file operation errors (permissions, non-existent folders).
+ 182 |     *   [ ] *Corner Case:* Test file conflict handling during archive (`gg`).
*   [ ] Test on different platforms if possible (Desktop Mac/Win/Linux, Mobile - consider limitations like Node/Electron APIs). Check regex compatibility (lookbehind).
+ 183 |     *   [ ] *Refinement:* Specifically test settings UI components for responsiveness and usability on mobile devices.
*   [ ] Review code for clarity, efficiency, and adherence to Obsidian API best practices. Minimize console logging.
*   [ ] Update `README.md` with final usage instructions, settings explanations, and screenshots.
*   [ ] Ensure `test-vault` is up-to-date and useful for testing/contributors.
*   [ ] Prepare for release (update `manifest.json` version, check `versions.json`, build process).
+ 187 | *   [ ] *Performance:* Test `cc` command with very long notes to check parsing performance (non-blocking for MVP, but good to know).
+ 188 | *   [ ] *Validation:* Test `cc`, `gg`, `dd`, `nn` detection logic against the specific incorrect examples provided in `README.md`.
