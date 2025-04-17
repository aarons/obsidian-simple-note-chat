# Simple Note Chat - Obsidian Plugin

Chat with Large Language Models (LLMs) directly within your Obsidian notes using a simple, mobile-friendly interface. This plugin allows you to interact with services like OpenRouter without needing keyboard shortcuts or UI elements, making it suitable for both desktop and mobile use.

## Features

*   Talk to LLMs with a simple text command.
*   Stream responses directly to the note.
*   Archive or delete chat notes easily.
*   Interrupt LLM responses when needed via keyboard shortcut or text sequence.
*   Highly configurable settings to tailor the experience.
*   Mobile-friendly design.

## Usage

### Starting a Chat (`cc`)

Type `cc` on it's own line at the end of a note, then press enter/return.

This will parse the existing messages (if any) and send them to the chat model.

**Example to start a chat:**

```markdown
Tell me a haiku about rainbows.
cc
    <-- notice a newline after 'cc'
```

After a moment, the note will be updated to look like:

> <br>
> Tell me a haiku about rainbows. <br><br>
>
> ---
> <br>
> Certainly!  <br>
> <br>
> Arch of light appears <br>
> After stormy clouds depart  <br>
> Sky paints seven hues <br> <br>
>
> ---
>  <br>
> ... continue the conversation here ... <br>
> <br>

<br>

**These will not trigger the chat, they are incorrect:**

```markdown
Tell me a haiku about rainbows. cc  <- 'cc' not on it's own line
```

```markdown
Tell me a haiku about rainbows.
cc  <- No newline after cc
```

```markdown
Becca was really nice today <- 'cc' is in someones name
```

### Using Hat Mode to Constrain Chat Context

You can limit which parts of your note are sent to the chat model by using the "hat mode" feature. This is useful for long notes where you only want to chat about specific content.

To use hat mode:
1. Add a line containing only `^^^` (three caret symbols) somewhere in your note
2. The chat will only consider content *below* this marker
3. Content above the marker will be ignored when sending to the LLM

**Example:**

```markdown
# Research Notes
These are my personal thoughts on the topic.
Some private notes I don't want to send to the LLM.

^^^

# Questions for AI
What's the relationship between temperature and pressure in a closed system?

cc
```

In this example, only the content after the `^^^` marker will be sent to the chat model. The content above the marker remains private.

If no `^^^` marker is found, the entire note content will be used as before.


### Conversation Structure

Conversations are structured using a horizontal line (default: `<hr>`). The plugin automatically adds these separators and uses them to distinguish between user messages and AI responses. The first message is assumed to be from the user, the next from the AI, and so on.

**Example (Source Mode view):**

```markdown
User's first message.

<hr>

AI's first response.

<hr>

User's second message.

<hr>

AI's second response.
```

This is configurable in settings.

A horizontal rule is used because it makes it easy to see where each message starts and ends. But you can configure any text sequence to be used as the separator.

The `<hr>` html tag was chosen because it is rarely used in markdown notes. The other horizontal rules (`---`, `___`, or `***`) also work just fine, but they are more likely to be part of an AI response or content, which the plugin would then parse incorrectly when attributing messages.


### Archiving a Chat (`gg`)

Type `gg` on it's own line at the end of a note, then press return.

**Example to archive a chat:**

```markdown
some content...
gg
    <-- notice a newline after 'gg'
```

The note will be moved to the archive directory.
Optionally, the plugin can ask an LLM to generate a short title for the archived note based on its content.

By default this only works on notes where a conversation with an LLM has taken place (with a horizontal rule detected).


### Creating a New Chat (`nn`)

Sometimes it's nice to quickly start a brand new note with the title already set for a new chat. This command does just that, creating a new chat note with a default title of todays date and time.

The command phrase is `nn`

You can set the new note title behavior in settings.

By default:

- sets the title to the current year-month-day-hour-minute
- does not archive the note you were previously on
    - this can be neabled, in which case `nn` would archive the current note, then start a new one (like typing `gg` then `nn`)




### Stopping a Response

If the LLM response is not useful or going off track, you can stop it mid-stream using one of the following methods while the response is actively being written to the note:

*   Press the `Escape` key
*   Type the sequence `stop`. The letters can be typed anywhere in the note during streaming.

Both the key and the sequence can be customized in the settings.

### Customizing Phrases

The default command phrases (`cc`, `gg`, `dd`, `nn`) and the stop sequence (`stop`) can be customized in the plugin settings.

### Trivia


`cc` stands for 'call chat'

`gg` stands for 'good game' and signifies the chat is over. Other phrases considered were `ac` for archive chat, `ta` for thanks, or `aa` for aarchive


`nn` new-note wooooo


## Settings

Configure the plugin via the Obsidian settings panel (`Settings` -> `Community Plugins` -> `Simple Note Chat`):

### LLM Setup
- **OpenRouter API Key**: Enter your API key from OpenRouter.ai
- **Refresh Model List**: Update the available models from OpenRouter
- **Sort Model Lists By**: Choose how to organize models (alphabetical or by price)
- **Default Chat Model**: Select which model to use for new chats

### Chat Command (cc)
- **Chat Command Phrase**: The text that triggers a chat completion (default: `cc`)
- **Enable Chat Keyboard Shortcut**: Make the command available for hotkey assignment
- **Stop Sequence**: Text to type during streaming to stop the response (default: `stop`)
- **Enable Viewport Scrolling**: Automatically scroll to follow the AI response
- **Chat Separator**: Markdown used to separate messages (default: `<hr>`)

### Archive Command (gg)
- **Archive Command Phrase**: Text that triggers archiving (default: `gg`)
- **Archive Folder**: Where archived notes are stored (default: `archived/`)
- **Rename Note on Archive**: Options for renaming notes when archived
  - Date/Time format (e.g., YYYY-MM-DD-HH-mm)
  - LLM-generated title based on note content
  - Word limit for generated titles
  - Option to include emojis
  - Model to use for title generation

### New Chat Command (nn)
- **New Chat Command Phrase**: Text that creates a new chat note (default: `nn`)
- **Enable New Chat Phrase Trigger**: Activate the command by typing the phrase
- **Enable Ribbon Button**: Add a button to the Obsidian sidebar
- **Enable Keyboard Shortcut**: Make the command available for hotkey assignment
- **Archive Current Note on New Chat**: Automatically archive the current note before creating a new one

## License

This project is licensed under the **Affero General Public License (AGPL) v3.0 or later**. See the `CONTRIBUTING.md` file for more details.

## Contributing

Contributions are welcome! Please see the [contributing.md](contributing.md) file for development setup instructions and contribution guidelines.
