
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

### Limiting what is sent to the AI

You can quickly limit what is sent to the model by adding a boundary marker. This is useful for notes where you have other things going on, and you only want to chat about something specific quickly.

The boundary marker is `^^^`, put that on it's own line and anything above the marker will be ignored and not sent to the AI.

**Example:**

```markdown
This is a personal journal note
With information that I don't want to send to the LLM.
But I thought of a quick question about pet adoption, let me ask...

^^^

What do I need to know about adopting a cat?

cc
```

In this example, the LLM will only see the question about adopting a cat, and not the personal notes. The AI response will be added below the `^^^` boundary.

If you archive the chat afterward (using `gg`), then only content up to the boundary will be cleared and saved to your archive. So it's a fast way to ask a question, save the response somewhere else, then move on with your day.

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

Each command stands for:

- `cc` call chat
- `cm` change model
- `nn` new note
- `gg` good game - and signifies the chat is over. Other phrases considered were `ac` for archive chat, `ta` for thanks and see-you-later, or `aa` for *a-archive*

## Contributing

Contributions are welcome!

Please see the [contributing.md](contributing.md) file for development setup and more guidelines.

In short:

* Open a Pull Request (PR) with a clear explanation of the changes.
* Contributions that add third-party dependencies are unlikely to be accepted.

## License

This project is licensed under the **Affero General Public License (AGPL) v3.0**

Key aspects:

**Network Use Clause**
If you modify AGPL-licensed software and make it accessible over a network (e.g., a web service), you must make the modified source code available to the users interacting with it.

**Distribution**
If you distribute the software (modified or unmodified), you must provide the source code under the same AGPL terms.

This ensures that modifications remain free and accessible to the community, even when used in network-based services. You can find the full license text in the [LICENSE](LICENSE.txt) file or at [https://www.gnu.org/licenses/agpl-3.0.en.html](https://www.gnu.org/licenses/agpl-3.0.en.html).
