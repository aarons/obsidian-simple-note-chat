
# Obsidian - Simple Note Chat

Chat with LLMs directly in a note using a simple phrase; type 'cc' to start the conversation. Designed for easy use on mobile or desktop, the phrases are configurable, and keyboard shortcuts can be assigned if preferred.

Chats are assigned user and assistant roles between messages, so the LLM can easily follow along, and any automatic caching the provider offers will be utilized as a side benefit.

This is an alternative to complex chat plugins for Obsidian. It also is a good replacement for running a self-hosted web interface for chatting with LLMs; since Obsidian is so lightweight and works across all devices.

The plugin uses OpenRouter for the API backend. You will need to bring an API key.

## Features

* Use simple text commands to chat with LLMs
	* cc - call chat
	* cm - change model
	* gg - archive chat
	* nn - new chat note
* Quickly mask content to prevent it from being brought into context
	* ^^^ - anything above this will be ignored
* Responses are streamed
* Press `Escape` to quickly stop a stream
* Nearly everything is configurable

## Examples

### Starting a Chat (`cc`)

Type `cc` on it's own line, then press enter/return.

```markdown
Tell me a haiku about kittens.
cc [enter]

```

After a moment, the note will be updated to look like:

```markdown
Tell me a haiku about kittens.

---

Soft paws on sunbeams
Curious eyes full of stars
Purring dreams unfold

---

```

The phrase needs to be on it's own line. So if it occurs inside a sentence it will not be recognized. So these are some anti-examples that won't work:

```markdown
Tell me a haiku about kittens. cc  <- 'cc' not on it's own line
```

```markdown
Tell me a haiku about kittens.
cc  <- need to press the enter key after typing 'cc'
```

### Using Hat Mode to Constrain Chat Context

You can limit which parts of a note are sent to the chat model by using hat mode. This is useful for long notes where you only want to chat about something specific quickly.

To use hat mode:
1. Add a line containing only `^^^` (three caret symbols)
2. The chat will only contain content below this marker

**Example:**

```markdown
# Research Notes
These are my personal thoughts on the topic.
Some private notes I don't want to send to the LLM.

^^^

# Questions for AI
What do I need to know about adopting a cat?

cc
```

In this example, the LLM will only see the question about the cat, and not the research notes.

If no `^^^` marker is found, then entire note content will be used.

### Stopping a Response

If the LLM response is not useful or going off track, you can stop it mid-stream by pressing the `Escape` key.

### Message Attribution

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

The `<hr>` html tag was chosen because it is rarely used in markdown notes. The other horizontal rules (`---`, `___`, or `***`) also work just fine, but they are more likely to be part of an AI response, which the plugin would then parse incorrectly when attributing messages.

### Changing the Model

Typing `cm` on it's own line will open a model modification modal, making it easy to quickly switch which model you are chatting with.

### Finished with a Chat (`gg`)

To archive, type `gg` on it's own line then press enter.

This phrase marks a chat as completed and optionally assigns a title, moving the note to an archive directory of your choice.

### Creating a New Chat Note (`nn`)

Type `nn` to quickly create a new note for chatting.

This provides a shortcut for adding a note to your chat or archive directory quickly. It has some default note title options as well (such as using today's date and time).

### Trivia

- `cc` stands for 'call chat'
- `cm` change model
- `gg` stands for 'good game' and signifies the chat is over. Other phrases considered were `ac` for archive chat, `ta` for thanks, or `aa` for aarchive
- `nn` new-note wooooo

## License

This project is licensed under the **Affero General Public License (AGPL) v3.0**

## Contributing

Contributions are welcome!

In short:

* Please open a Pull Request (PR) with a clear explanation of the changes.
* Contributions that add third-party dependencies are unlikely to be accepted due to security risks.

Please see the [contributing.md](contributing.md) file for development setup and more guidelines.
