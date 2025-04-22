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

Type `cc` on it's own line, then press enter/return.

This will parse the existing messages (if any) and send them to the chat model.

**Example to start a chat:**

```markdown
Tell me a haiku about rainbows.
cc [enter]

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
cc  <- need to press the enter or return key after typing 'cc'
```

```markdown
Becca was really nice today <- 'cc' is in someones name, so it won't work
```

### Using Hat Mode to Constrain Chat Context

You can limit which parts of your note are sent to the chat model by using hat mode. This is useful for long notes where you only want to chat about specific content.

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
What do you think about the moon landing?

cc
```

In this example, only the content after the `^^^` marker will be sent to the chat model. The content above the marker remains private.

If no `^^^` marker is found, the entire note content will be used.


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

A horizontal rule was used because it makes it easy to see where each message starts and ends. But you can configure any text sequence to be used as the separator in the settings menu.

The `<hr>` html tag was chosen because it is rarely used in markdown notes. The other horizontal rules (`---`, `___`, or `***`) also work just fine, but they are more likely to be part of an AI response, which the plugin would then parse incorrectly when attributing messages.


### Archiving a Chat (`gg`)

Type `gg` on it's own line at the end of a note, then press return.

The note will be moved to the archive directory.

Optionally, an LLM can generate a short title for the archived note, based on its content.

### Creating a New Chat (`nn`)

Type `nn` to create a new note for chatting.

Sometimes it's nice to quickly start a brand new note with the title already set for a new chat. This command does just that, creating a new chat note with a default title of todays date and time.

You can set the new note title behavior in settings.

By default:

- sets the title to the current year-month-day-hour-minute
- does not archive the note you were previously on
    - this can be enabled, in which case `nn` would archive the current note, then start a new one (like typing `gg` then `nn`)



### Stopping a Response

If the LLM response is not useful or going off track, you can stop it mid-stream by pressing the `Escape` key.

### Customizing Phrases

The command phrases (`cc`, `gg`, `nn`) and shortcut keys can be customized in the plugin settings.

### Trivia


`cc` stands for 'call chat'

`cm` change model

`gg` stands for 'good game' and signifies the chat is over. Other phrases considered were `ac` for archive chat, `ta` for thanks, or `aa` for aarchive

`nn` new-note wooooo

## License

This project is licensed under the **Affero General Public License (AGPL) v3.0 or later**. See the [contributing.md](contributing.md) file for more details.

## Contributing

Contributions are welcome!

In short:

*   Please open a Pull Request (PR) with a clear explanation of the changes.
*   Contributions that add third-party dependencies are unlikely to be accepted due to security risks.

Please see the [contributing.md](contributing.md) file for development setup and more guidelines.
