Obsidian Plugin for chatting with LLMs within a note
It has a simplified interface, to support mobile platforms (no buttons or key chords needed)

`cc` to call the model
`gg` to archive the note

More advanced options:
`nn` to create a new chat note
`dd` to delete the note (disabled by default)
`escape` key to interrupt the process
`stop` or literally type this sequence while streaming is in process to stop it

Each phrase can be modified, it just needs to be on its own line at the bottom of the note.

Correct:
```example
Hello, please tell me a haiku about rainbows
cc
       <-- notice a newline is needed after cc
```

These will not work:
```not-working-example
Hello, please tell me a haiku about rainbows cc
cc     <-- no newline after cc
```

We use an `<hr>` tag to dilineate messages from the user and the AI. The first message is always attributed to the user, the next message to the ai, then back to the user, and so forth.

This allows the AI to understand the proper message context, as well as use each LLM providers caching caching when available for older messages.

For example, here's what a conversation looks like in a markdown file in source mode, after two back and forths. The `# user` and `# ai` tags were added afterward to just show how each segment is identified, those are not added in a real chat:

```
Hello, please tell me a haiku about rainbows  # user

<hr>

Certainly!  # ai

Arch of light appears
After stormy clouds depart
Sky paints seven hues

<hr>

That was lovely, what about ice cream?  # user

<hr>

Cold sweet summer treat  # ai
Melting quickly in the sun
Sticky fingers smile
```


### Settings

Openrouter authentication (ideally use openrouter application auth pathway)
Default chat model to use (update list of models available button)
Archived chats directory
- optionally disabled, archiving not available then
Chat separator (default `<hr>` but user could do anything they want)
- should warn that more common separators like --- might be returned by the AI, then mess up later parsing of the note messages


**Method to create new chat note**
This is an optional helper for quickly creating a new chat note with today's date-hour-minute prefilled in the note title.

Check all the methods you would like to use:
- ribbon button
- keyboard shortcut
- phrase ('nn' default)

## Development

There is a test-vault available in the code base to make testing easier
It has a couple sample notes that can be tested
more instructions needed on how to do development of an obsidian plugin


## Implementation Notes

**cc**

This calls the LLM, then streams the response back after a new `<hr>` tag
Algorithm wise:
- once cc phrase is detected on standalone line in a note (ideally in the active leaf)
	- replace 'cc' text with 'Calling {model name}...'
	- parse separators in the note to build the individual messages for the API call
		- do not include the separators in the message (ie, they should not have hr tags in the body of any of the messages)
		- send api call (with caching enabled where possible)
	- streams API response back to the note
		- remove 'Calling {model name}...'
		- insert new hr tag
		- stream API response content
		- add hr tag
		- add two newlines, so user cursor is at the bottom

Configuration Options:
- a different phrase than 'cc' (recommend using something unique)
- scroll viewport with the response and move cursor to bottom
- do not scroll viewport with the response; update file in the background
	- allows user to scroll down at their own pace, or to navigate away to another file until this one is updated
- keyboard shortcut to call chat


**gg**

This will move the active chat note to an archived directory. And optionally title the note with a short subject line.

Algorithm is:
- gg is detected at the end of the note
- note content sent to model to ask for a title
	- limit to max words
- move note to archive, retitle it, and remove gg from the last line of the note

Configuration Options:
- a different phrase than 'gg'
- archived notes directory
- include date-hour-min
	- custom date format string
- generate a subject title (default false)
	- limit to X words (default 3)
	- include emojies (default false)
	- model to use for titling the note
		- default the same model
		- optional select a different model for titles

**dd**

This will delete the current chat instead of archiving it.

Warning: The chat file will be deleted from your computer!

For safety, it will look for the chat dilieanators; if they are not present then it will do nothing.

Configuration Options:
- enable this shortcut (default is disabled)
- use a different phrase than 'dd' - be very careful if changing this to something common
- do not look for chat dilineators (will enable deleting ANY note in vault when using the phrase)

**Stop Sequences**

Sometimes the AI starts responding in a way that is going off track. You can use this to stop the stream and cancel the response.

You can either tap Escape or literally type the keys s-t-o-p, even if they are entered haphhazardly in the note, they will be registered while the plugin is streaming.

Keyboard shortcut: `Escape`
Typed sequence: `stop`

Configuration Options:
- change the stop shortcut key
- change the stop typed sequence

