
Some planned updates:

- remove context about separators at the bottom of settings, show when modifying a setting that needs it
- chat command shortcut key should not modify the note (plus it's broken)
- blank phrase == no activation
- always enable the keyboard shortcuts; don't have settings for them
- better attribution method for user/ai messages (maybe use html tags?)
- styling of messages (pro feature)
- Enable Keyboard Shortcut Trigger for new note and archive note and change model

Cursor Management:
- move cursor to the bottom of the viewport, if it's within view (how to tell?), regardless of scroll viewport setting
- otherwise, if content scrolls beyond viewport, leave cursor in current position
    - or move it, but don't shift the viewport down, it's jarring
- leave alone if not
- when codeblocks are being streamed, scrolling gets messed up; anyway to fix that?

Feature: when archiving a note, we append a string (moved not to: folder/note-name.md), allow users to suppress that