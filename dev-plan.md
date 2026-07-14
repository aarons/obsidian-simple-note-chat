# Test Framework Implementation Plan

## Executive Summary

This document outlines a comprehensive testing strategy for the Obsidian Simple Chat plugin, based on analysis of successful approaches from Templater and CSS Editor plugins. The strategy emphasizes **zero-mock integration testing** within the actual Obsidian environment, supplemented by focused unit tests for pure logic functions.

## Core Philosophy: Zero-Mock Integration Testing

### Why Zero Mocks?

**Traditional Problem with Mocking Obsidian APIs:**
- Obsidian's API is complex and frequently evolving
- Mock implementations can diverge from real behavior
- Edge cases in file operations, async behavior, and UI interactions are impossible to simulate accurately
- False positives from tests that pass with mocks but fail in production

**Our Solution:**
- Run tests within actual Obsidian environment
- Use real Vault, Workspace, and Plugin APIs
- Test actual file system operations and streaming behaviors
- Validate complete user workflows end-to-end

### Integration Testing Focus Areas

For our plugin, integration testing is especially critical because:

1. **Chat Parsing Logic** - Complex note parsing with message separators and boundary markers
2. **Streaming Responses** - Real-time text insertion and cancellation behavior
3. **Command Detection** - Keyboard event handling and cursor positioning
4. **File Operations** - Archive creation, path normalization, title generation
5. **API Integration** - OpenRouter streaming responses and error handling

## Testing Architecture

### Dual-Layer Strategy

```
tests/
├── integration/              # Zero-mock Obsidian environment tests
│   ├── main.test.ts         # Test plugin entry point
│   ├── chat-workflow.test.ts # End-to-end chat scenarios
│   ├── command-detection.test.ts # Keyboard triggers and editor handling
│   ├── file-operations.test.ts # Archive, create, path handling
│   └── streaming.test.ts    # Response streaming and cancellation
└── unit/                    # Pure function tests (minimal)
    ├── utils.test.ts        # Path normalization, title generation
    └── parsing.test.ts      # Message parsing without file I/O
```

### Test Plugin Architecture

**Core Test Plugin** (`tests/integration/main.test.ts`):
```typescript
export default class TestSimpleChatPlugin extends Plugin {
    plugin: SimpleChatPlugin;
    testFiles: TFile[] = [];
    
    async onload() {
        this.addCommand({
            id: "run-simple-chat-tests",
            name: "Run Simple Chat Tests",
            callback: async () => {
                await this.setup();
                await this.runAllTests();
                await this.cleanup();
            },
        });
    }
}
```

## Implementation Plan

### Phase 1: Foundation Setup

#### 1.1 Dependencies Installation
```json
{
  "devDependencies": {
    "@types/chai": "^4.3.5",
    "@types/chai-as-promised": "^7.1.5", 
    "chai": "^4.3.7",
    "chai-as-promised": "^7.1.1",
    "vitest": "^1.0.0"
  }
}
```

#### 1.2 Build Configuration
Modify `esbuild.config.mjs` to handle test builds:
```javascript
const isTest = process.argv[2] === "test";
const entryPoint = isTest ? "tests/integration/main.test.ts" : "src/main.ts";
```

#### 1.3 NPM Scripts
```json
{
  "scripts": {
    "test:unit": "vitest run tests/unit",
    "test:integration": "node esbuild.config.mjs test",
    "test": "npm run test:unit && echo 'Run integration tests via Obsidian command: Run Simple Chat Tests'"
  }
}
```

### Phase 2: Core Test Infrastructure

#### 2.1 Test Helper Utilities (`tests/integration/test-helpers.ts`)
```typescript
export class ChatTestHelper {
    constructor(private app: App, private plugin: SimpleChatPlugin) {}

    // File management with cleanup tracking
    async createTestNote(name: string, content: string): Promise<TFile> {
        const filename = `test-${Date.now()}-${name}.md`;
        return await this.app.vault.create(filename, content);
    }

    // Chat scenario helpers
    async simulateCommand(command: string, editor: Editor): Promise<void> {
        // Simulate typing command + Enter
        editor.replaceRange(command, editor.getCursor());
        // Trigger command detection logic
    }

    async waitForStreamCompletion(timeout: number = 5000): Promise<void> {
        // Wait for streaming to complete or timeout
    }

    // Cleanup utilities
    async cleanup(): Promise<void> {
        // Remove test files, reset plugin state
    }
}
```

#### 2.2 Test Framework Foundation (`tests/integration/main.test.ts`)
```typescript
export default class TestSimpleChatPlugin extends Plugin {
    private tests: Array<{ name: string; fn: () => Promise<void> }> = [];
    private helper: ChatTestHelper;
    
    async onload() {
        this.addCommand({
            id: "run-simple-chat-tests",
            name: "Run Simple Chat Tests", 
            callback: this.runTests.bind(this)
        });
    }

    async runTests() {
        await this.setup();
        
        // Import test modules
        ChatWorkflowTests(this);
        CommandDetectionTests(this);
        FileOperationTests(this);
        StreamingTests(this);
        
        // Execute tests
        let passed = 0, failed = 0;
        for (const test of this.tests) {
            try {
                await test.fn();
                console.log(`✅ ${test.name}`);
                passed++;
            } catch (error) {
                console.error(`❌ ${test.name}:`, error);
                failed++;
            }
        }
        
        await this.cleanup();
        console.log(`\n📊 Tests completed: ${passed} passed, ${failed} failed`);
    }
}
```

### Phase 3: Test Implementation by Domain

#### 3.1 Chat Workflow Tests (`tests/integration/chat-workflow.test.ts`)

**Focus Areas:**
- Complete user chat flow (cc command → response → continuation)
- Message parsing with `<hr message-from="chat">` separators
- Boundary marker (`^^^`) behavior
- Message alternation validation

**Example Test:**
```typescript
export function ChatWorkflowTests(t: TestSimpleChatPlugin) {
    t.test("complete chat workflow with cc command", async () => {
        // Create test note with existing chat history
        const content = `Previous message\n\n<hr message-from="chat">\n\nAssistant response\n\ncc`;
        const file = await t.helper.createTestNote("chat-test", content);
        
        // Open in editor and trigger command
        const leaf = await t.app.workspace.getLeaf(false);
        await leaf.openFile(file);
        const editor = leaf.view.editor;
        
        // Simulate Enter key press
        await t.helper.simulateCommand("cc", editor);
        
        // Verify response streaming begins
        await t.helper.waitForStreamCompletion();
        
        // Verify message separator was added
        const updatedContent = await t.app.vault.read(file);
        expect(updatedContent).to.contain('<hr message-from="chat">');
        
        // Cleanup
        await t.app.vault.delete(file);
    });

    t.test("boundary marker limits context", async () => {
        const content = `Ignored content\n\n^^^\n\nIncluded message\n\ncc`;
        const file = await t.helper.createTestNote("boundary-test", content);
        
        // Test that only content after ^^^ is sent to API
        // This requires intercepting the API call or checking parsed messages
        
        await t.app.vault.delete(file);
    });
}
```

#### 3.2 Command Detection Tests (`tests/integration/command-detection.test.ts`)

**Focus Areas:**
- Keyboard event detection (Enter key, Space with delay)
- Command phrase recognition (cc, cm, gg, nn)
- Cursor positioning and text replacement
- Command customization via settings

#### 3.3 File Operations Tests (`tests/integration/file-operations.test.ts`)

**Focus Areas:**
- Archive note creation and naming
- Folder creation with `getFolderByPath` API
- Path normalization and conflict resolution
- Title generation from content

**Example Test:**
```typescript
t.test("archive note with generated title", async () => {
    // Create note with chat content
    const content = `How do I implement async functions?\n\n<hr message-from="chat">\n\nTo implement async functions...`;
    const file = await t.helper.createTestNote("chat-session", content);
    
    // Trigger archive command
    await t.plugin.fileSystemService.archiveCurrentNote(file);
    
    // Verify archive file was created
    const archiveFolder = t.app.vault.getAbstractFileByPath("Archive");
    expect(archiveFolder).to.exist;
    
    // Verify title was generated from first message
    const archiveFiles = archiveFolder.children.filter(f => f.name.includes("async-functions"));
    expect(archiveFiles).to.have.length(1);
});
```

#### 3.4 Streaming Tests (`tests/integration/streaming.test.ts`)

**Focus Areas:**
- Real streaming response insertion
- Escape key cancellation
- Error handling during streams
- Multiple concurrent stream prevention

### Phase 4: Unit Tests (Minimal)

#### 4.1 Pure Function Testing (`tests/unit/`)

**Focus on logic without Obsidian dependencies:**
- Path normalization utilities
- Title generation algorithms  
- Message parsing helpers
- URL validation

**Example:**
```typescript
// tests/unit/utils.test.ts
import { describe, it, expect } from 'vitest';
import { generateTitleFromContent, normalizePath } from '../../src/utils';

describe('Utility Functions', () => {
    it('should generate title from first user message', () => {
        const content = `How do I test async functions?\n\n<hr message-from="chat">\n\nResponse...`;
        expect(generateTitleFromContent(content)).toBe('How do I test async functions');
    });

    it('should normalize paths correctly', () => {
        expect(normalizePath('Archive/Chat Sessions')).toBe('Archive/Chat Sessions');
        expect(normalizePath('Archive//Chat  Sessions')).toBe('Archive/Chat Sessions');
    });
});
```

## Test Execution Strategy

### Development Workflow

1. **Local Development:**
   ```bash
   npm run test:unit           # Quick feedback loop
   npm run test:integration    # Build test plugin
   # Open Obsidian → Run command: "Run Simple Chat Tests"
   ```

2. **Test-Driven Development:**
   - Write integration test describing desired workflow
   - Implement feature to make test pass
   - Verify with real user interaction

### Test Data Management

**File Naming Convention:**
```typescript
const timestamp = Date.now();
const testFile = `test-${timestamp}-${scenarioName}.md`;
```

**Cleanup Strategy:**
- Track all created files during test run
- Automatic cleanup in test teardown
- Manual cleanup command for orphaned test files

## Success Metrics

### Coverage Goals
- **Integration Coverage**: 100% of user-facing workflows
- **Command Coverage**: All command types (cc, cm, gg, nn)
- **Error Scenarios**: API failures, network issues, file conflicts
- **Edge Cases**: Empty notes, malformed separators, concurrent operations

### Quality Indicators
- Tests run successfully in clean Obsidian vault
- Tests catch real regressions during development
- Test failures clearly indicate problem area
- Tests complete within reasonable time (< 30 seconds)

## Future Enhancements

### Potential Extensions
1. **Visual Testing**: Screenshot comparisons for UI elements
2. **Performance Testing**: Streaming response benchmarks  
3. **Accessibility Testing**: Screen reader compatibility
4. **Cross-Platform Testing**: Windows/Mac/Linux behavior differences
5. **Settings Testing**: All configuration combinations

### CI/CD Integration Considerations
While current approach requires Obsidian environment, future options:
- Headless Obsidian testing environment
- Docker containers with Obsidian
- GitHub Actions with desktop environment simulation

## Implementation Timeline

### Week 1: Foundation
- [ ] Install dependencies and configure build
- [ ] Create test plugin structure and basic helpers
- [ ] Implement first simple integration test

### Week 2: Core Workflows  
- [ ] Chat workflow tests (cc, cm commands)
- [ ] Command detection and editor integration
- [ ] File operations and archiving

### Week 3: Advanced Scenarios
- [ ] Streaming behavior and cancellation
- [ ] Error handling and edge cases
- [ ] Unit tests for utility functions

### Week 4: Polish & Documentation
- [ ] Comprehensive test coverage review
- [ ] Performance optimization
- [ ] Documentation updates

## Conclusion

This testing strategy provides **high confidence** in plugin reliability while maintaining **development velocity**. By testing within the actual Obsidian environment, we catch integration issues that traditional unit tests miss, while the focused unit tests provide quick feedback for pure logic functions.

The zero-mock approach is particularly valuable for our plugin because:
- **Chat parsing** involves complex text manipulation that benefits from real editor behavior
- **Streaming responses** require actual async coordination that mocks can't simulate
- **File operations** have platform-specific edge cases that real testing reveals
- **Command detection** depends on Obsidian's event system timing

This foundation will support confident development and reliable releases while providing clear feedback when changes break existing functionality.