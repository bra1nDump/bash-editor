# bash-editor

In-editor terminal. Usual vscode editing workflow for using the terminal.

Inspired by Bashbook https://github.com/AndreasArvidsson/bashbook. Simplifies the experience further by going from notebook to a single editor for both user input and command output. Major drawback is losing interactivity, major upside is is of editing commands and working with output of previous commands.

## Why?
I use voice control to code half the time to relieve stress from my hands. It is possible due to talonvoice.com + cursorless.org vscode extension, the latter not being available within the terminal. This makes editing terminal commands painful for me.

## Try it - from command pallet run
Bash Editor: Open new

## Features
- Run bash commands within a regular editor (tab) in vscode
- No third party dependencies - vscode + node apis only
- Keep the tail of the terminal always visible

## Not impelemented
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
