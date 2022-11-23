# bash-editor

In-editor terminal. Usual vscode editing workflow for using the terminal.

Inspired by Bashbook https://github.com/AndreasArvidsson/bashbook. Simplifies the experience further by going from notebook to a single editor for both user input and command output. Major drawback is losing interactivity, major upside is is of editing commands and working with output of previous commands.

## Why?

I use voice control to code half the time to relieve stress from my hands. It is possible due to talonvoice.com + cursorless.org vscode extension, the latter not being available within the terminal. This makes editing terminal commands painful for me.

## Try it - from command pallet run

Bash Editor: Open new

## Implemented

- Run bash commands within a regular editor (tab) in vscode
- No third party dependencies - vscode + node apis only
- Keep the tail of the terminal always visible

## To Do

- Instead of creating my own shell, use an existing shell. Ideally it will provide filepath completions and things of that nature automatically. I found this cold one. brew install nushell
  - To get it to work I need to create a tty, send input to the tell a typewriter, interpreting output will be more difficult, as I will need to process special sequences. For example clearing the line, clearing the entire screen etc.
  - Before jumping into this new shell, let's try to get the old set up working
  - Testing out the new shell should also be possible without changing how the extension works
  - Now that I can ship binary with the extension, I can use node-tty. It uses node-gyp under the hood.

## Maybe todo? ;D

🥼 - Effort units
📈 - Impact

- [🥼🥼 📈📈📈] Autocomplete
  - Old commands (also does not append to bash history)
  - Directories
- Interactive
  - [🥼 📈] Input. If a script requires further input midway of execution - it will simply hang
  - [🥼 📈📈] Interrupt. Control-C will not halt the program. Impossible to intercept keystrokes, can bind a command
- [🥼🥼🥼🥼 📈] Any terminal control like coloring output, clearning lines
  - This might be a deal breaker because buck for example seems to want to have an interactive terminal. Maybe if it cant detect a TTY to which its connected it just craps out 😢
- [🥼 📈📈] Visual appeal, usability
  - Initialized with markdown and prefix command prompts with # for easier folding
  - Other things like wrapping command that has ran in `backticks`
- [🥼🥼 📈📈] Debugger integration
  - The reason I started this in the first place was because lldb was terrible to use from a small single line debugging input field. I can basically swap out `spawn` command with `commands.run('lldb-extension.runCommand')`, and similarly get three streams in return.
- [🥼🥼 📈📈] Refactor
  - Flatten the god function
  - Starting hard to read
  - Need to add a separate command for lldb / bash

## Log

### November 23, blocking, nushell, colored

https://www.lihaoyi.com/post/BuildyourownCommandLinewithANSIescapecodes.html

https://stackoverflow.com/questions/36929209/read-ansi-escape-from-terminal

Instead of dealing with this escape sequence nonsense let's use xterm.js, headless version. Looks like it's used for almost this.
While reading the documentation I noticed UTF-16 for strings. Maybe I should use this to decode bite stream received from shell.

Clearly xterm.js has good potential to help with escape sequences https://github.com/xtermjs/xterm.js/blob/master/typings/xterm-headless.d.ts#L1072.

[Key] Documentation https://xtermjs.org/docs/guides/hooks/

Potential solution:

- Keep current one off command running
- Only use xterm.js headless as output. Create in new instance every time
- Use terminal right function to pipe text into terminal
- Get terminal buffer https://github.com/xtermjs/xterm.js/blob/master/typings/xterm-headless.d.ts#L1072
  - Hypotheses: I can get un formated string (or formated structured string ranges) and simply print to vscode (optionally include annotations)
  - From buffer get all lines, from each line get string, hopefully plain (or worst case scenario get cell. This actually has information about bold, color etcetera) https://github.com/xtermjs/xterm.js/blob/4.14.1/typings/xterm.d.ts#LL1338-L1338C26

Interactivity is still unsolved. Solving that by hand is definitely not great. Most likely I will still need to use xterm.js. Ideally I will subscribe to buffer change, or whatever event to be notified when application is asking for data (y/n), or input (for example arrow keys)

The question is is at worth my time right now?
Is tell a typewriter more important?)
