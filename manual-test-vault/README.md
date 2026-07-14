# Manual Test Vault - Simple Chat Plugin

## Overview

This vault is designed for manual testing and quality assurance. It provides structured scenarios and test cases to validate functionality through real user interaction.

This is separate from the automated integration testing framework described in `dev-plan.md`. This vault is for manual experiential testing and UI/UX validation.

## Vault Structure

```
manual-test-vault/
├── scenarios/              # Organized test scenarios
│   ├── basic-commands/     # Core plugin functionality
│   └── error-conditions/   # Network failures, API errors
├── playground/             # Free-form testing area
├── archive/                # Test archived conversations
└── new_chats/              # Test new note creation
```

## Testing Workflow

### Before Testing
1. Ensure the Simple Chat plugin is installed and enabled
2. Configure your API key in plugin settings
3. Select a test model (recommend using a fast, inexpensive model for testing)

### Basic Testing Checklist

#### Core Commands (`scenarios/basic-commands/`)
- [ ] **test-cc-command.md** - Chat continuation command
- [ ] **test-cm-command.md** - Chat with model selection
- [ ] **test-gg-command.md** - Generate new conversation
- [ ] **test-nn-command.md** - New note creation
- [ ] **test-custom-commands.md** - Custom command phrases
- [ ] **test-archive-note.md** - Note archiving functionality
- [ ] **test-folder-creation.md** - Automatic folder creation
- [ ] **test-naming-pattern.md** - File naming conventions
- [ ] **test-model-selection.md** - Model switching
- [ ] **test-new-note-trigger.md** - New note triggers

#### Error Conditions (`scenarios/error-conditions/`)
- Test cases for network failures, API errors, and invalid configurations

### Testing Scenarios by Category

#### Performance Testing
Test with:
- Very long notes (>10,000 words)
- Multiple rapid commands
- Network interruption during streaming
- Large chat histories with many message separators

#### Error Conditions
Test these scenarios:
- Invalid API key
- Network disconnection during chat
- API rate limiting
- Malformed message separators
- Commands in middle of lines vs. on own lines

#### User Experience
Validate:
- Cursor positioning after commands
- Streaming response smoothness
- Command cancellation (Escape key)
- Settings UI functionality
- Archive folder creation and file naming

## Manual Testing Best Practices

### Test Execution
1. **One scenario at a time** - Focus on single test case to identify specific issues
2. **Real-time validation** - Observe streaming behavior, don't just check end results
3. **Error state testing** - Intentionally trigger error conditions
4. **Multi-platform testing** - Test on different operating systems if available

### Documentation
- Note any unexpected behavior in the test files
- Create new test files for discovered edge cases
- Update this README with new testing scenarios

### Cleanup
- Archive completed test conversations
- Reset plugin settings between major test runs
- Clear API cache if testing different models

## Integration with Automated Tests

This manual testing vault complements the automated testing framework:

- **Manual tests** catch UX issues, timing problems, and real-world edge cases
- **Automated tests** catch regressions and validate specific code paths
- Both are essential for plugin quality assurance

## Common Issues to Watch For

### Command Detection
- Commands not triggering (check line positioning)
- Commands triggering in wrong contexts
- Timing issues with Enter vs. Space triggers

### Streaming Responses
- Text insertion at wrong cursor position
- Streaming interruption or corruption
- Cancellation not working properly

### File Operations
- Archive folder not created
- File naming conflicts
- Permission issues on different systems

### API Integration
- Rate limiting behavior
- Error handling and user feedback
- Model switching mid-conversation

## Creating New Test Scenarios

When adding new test files:

1. **Choose appropriate folder** based on test category
2. **Use descriptive filenames** (e.g., `test-boundary-marker-behavior.md`)
3. **Include test instructions** in file comments
4. **Document expected vs. actual results**

### Example Test File Template

```markdown
# Test: [Feature Name]

## Purpose
Brief description of what this test validates.

## Setup
1. Pre-conditions needed
2. Settings configuration
3. Initial file state

## Test Steps
1. Step-by-step instructions
2. Expected behavior at each step
3. Key things to observe

## Success Criteria
- [ ] Specific outcomes that indicate success
- [ ] Performance expectations
- [ ] Error handling validation

## Notes
- Common issues to watch for
- Platform-specific considerations
- Related test scenarios
```

## Troubleshooting

### Plugin Not Responding
- Check Obsidian console for errors (Ctrl/Cmd + Shift + I)
- Verify API key configuration
- Test with simple command first

### Commands Not Triggering
- Ensure command is on its own line
- Check custom command phrases in settings
- Verify cursor position after typing command

### Streaming Issues
- Test network connectivity
- Check API rate limits
- Verify model selection is valid

## Contributing

When contributing new test scenarios:

1. Test the scenario manually first
2. Document clear reproduction steps
3. Note any platform-specific behavior
4. Update this README if adding new categories

## Support

For issues with the testing process:
- Check the main plugin documentation
- Reference the automated testing plan in `dev-plan.md`
- Report bugs through the project's issue tracker