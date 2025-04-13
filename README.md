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

The `<hr>` html tag was chosen as it's rarely used in an actual markdown note, and makes it easy to see where each message starts and ends. The other horizontal lines (`---`, `___`, or `***`) could be part of a message or response, so the plugin would parse it incorrectly.

If you are using an LLM to write html code and it writes a horizontal rule, then the parsing would probably break. An option could be added to not parse anything in codeblocks, but for now the parsing code is kept simple.


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


### Deleting a Chat (`dd`)

This feature is **disabled by default**. Enabling it allows **permanent deletion** of notes from your vault. Use with caution.

To delete the current chat note (if enabled in settings):

1.  Go to the end of the note.
2.  On a **new, separate line**, type `dd`.
3.  Ensure there is a **newline** *after* `dd`.

For safety, by default, this command only works on notes that contain chat separators (`<hr>`, or your custom separator). This check can be disabled in the settings, but doing so increases the risk of accidentally deleting non-chat notes.


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

`dd` inspired by the vim command to delete (cut) a line of text

`nn` new-note wooooo


## Settings

Configure the plugin via the Obsidian settings panel (`Settings` -> `Community Plugins` -> `Simple Note Chat`):

*   **OpenRouter Authentication:** Enter your OpenRouter API key. Using OpenRouter's application authentication pathway is recommended for better security and usage tracking if applicable.
*   **Default Chat Model:** Choose the default LLM to use for chats. Includes a button to refresh the list of available models from OpenRouter.
*   **Archived Chats Directory:** Specify the folder path (relative to your vault root) where chats moved using the archive command (`gg`) should be stored. Archiving is disabled if this field is left blank.
*   **Chat Separator:** Customize the markdown used to separate messages (default: `<hr>`). *Warning:* Using common markdown like `---` might interfere with parsing if the LLM includes it in its response. `<hr>` is generally safer.
*   **New Chat Note Creation:** Enable one or more methods for quickly creating new chat notes:
    *   `Ribbon Button`: Adds an icon to the Obsidian ribbon.
    *   `Keyboard Shortcut`: Allows you to set a custom hotkey.
    *   `Phrase Command`: Enables a text command (`nn` by default) placed on its own line.
*   **Call Chat Phrase:** Customize the phrase to trigger the LLM call (default: `cc`).
*   **Scroll Viewport:** Choose whether the note view automatically scrolls down as the response streams (`true` by default). Set to `false` to allow scrolling manually or navigating away while the response generates in the background.
*   **Archive Chat Phrase:** Customize the phrase to archive the chat (default: `gg`).
*   **Archive Title Generation:**
    *   `Enable Title Generation`: Checkbox to enable/disable automatic title generation for archived notes (default: `false`).
    *   `Title Word Limit`: Maximum number of words for the generated title (default: 3).
    *   `Include Emojis in Title`: Allow emojis in the generated title (default: `false`).
    *   `Title Generation Model`: Select the LLM used specifically for titling (defaults to the main chat model if not set).
*   **Delete Chat Phrase:**
    *   `Enable Delete Command`: Checkbox to enable/disable the delete command (default: `false`). **Requires restart/reload.**
    *   `Delete Phrase`: Customize the phrase for deletion (default: `dd`).
    *   `Bypass Separator Check`: Disable the safety check that requires chat separators for deletion (default: `false`). **Use with extreme caution.**
*   **Stop Streaming:**
    *   `Stop Shortcut Key`: Customize the keyboard shortcut to stop streaming (default: `Escape`).
    *   `Stop Typed Sequence`: Customize the typed sequence to stop streaming (default: `stop`).

## Contributing

Developers interested in contributing can find a `test-vault` directory within the codebase. This vault contains sample notes and configurations to facilitate testing and development of the plugin. Please refer to Obsidian's official documentation for general plugin development guidelines.