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
- [Essential, medium] Autocomplete
  - Old commands (also does not append to bash history)
  - Directories
- Interactive
  - [Easy, not needed rn] Input. If a script requires further input midway of execution - it will simply hang
  - [Bind custom command, good to have] Interrupt. Control-C will not halt the program
- [High effort, low impact] Any terminal control like coloring output, clearning lines

## Potentially desired features
-
