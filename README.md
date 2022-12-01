# In-editor terminal for VSCode

Use a regular text tab in vscode as your terminal. Use the same extensions and shortcuts between your text editing and terminal usage.

Inspired by [Bashbook](https://github.com/AndreasArvidsson/bashbook) which does roughly the same thing but instead uses a notebook view within vscode.

## Why?

I use voice control to code half the time to relieve stress from my hands. It is possible due to talonvoice.com + cursorless.org which allows me to effectively move around in vscode editor. Unfortunately it is not available in terminal.

## How to use

- Run it from command pallet `Bash Editor: Open new`
- This will open a new tab, simply type any bash command for example `ls`
- Press enter to run the command as in normal terminal
- Command's output will be appended to the same editor

# Features and shortcomings

- No third party dependencies - vscode + node apis only
- Keep the tail of the terminal always visible
- Does not support interactivity yet (for example if the comment your running requires input)
- Does not support colors yet (will attempt to strip down colors and other special symbols from command output)
- Does not have autocomplete for paths, or anything else for that matter
- Does not have history yet

See Todo four things I'm considering to add.

## Publishing

Publisher url https://marketplace.visualstudio.com/manage/publishers/bra1ndump
Run `vsce publish` from the project root.
It will ask for authentication token which you can get from azure here https://dev.azure.com/bra1ndump/_usersSettings/tokens. You can't access as the old one, just generate the new one (look at the scopes requested on the old one. Market Place > Manage).

## To Do

🥼 - Effort units
📈 - Impact

- Bug, race conditions went printing command output.
  - For example try `git log`.
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
  - Maybe send directly to debugger using vscode API :) ?
  - Daaaamn I don't need lldb! This can work with any provider :D https://code.visualstudio.com/api/references/vscode-api#DebugSession:~:text=customRequest(command%3A%20string%2C%20args%3F%3A%20any)%3A%20Thenable%3Cany%3E
  - #key Debug Adaptor Protocol, Vscode <-> lldb / other debuggers Damn. https://microsoft.github.io/debug-adapter-protocol/specification
    - Request Evaluate is the custom request (see above) to send to debug adaptor https://microsoft.github.io/debug-adapter-protocol/specification#Requests_Evaluate
- Instead of creating my own shell, use an existing shell. Ideally it will provide filepath completions and things of that nature automatically. I found this cold one. brew install nushell
  - To get it to work I need to create a tty, send input to the tell a typewriter, interpreting output will be more difficult, as I will need to process special sequences. For example clearing the line, clearing the entire screen etc.
  - Before jumping into this new shell, let's try to get the old set up working
  - Testing out the new shell should also be possible without changing how the extension works
  - Now that I can ship binary with the extension, I can use node-tty. It uses node-gyp under the hood.
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
- Once I have the current buffer, I can diff it with the previous buffer (should be synchronized with what vscode editor has starting from command output mark)
- Simply override range
  - This should support fancy commandline applications that update in line, for example loading bars

Interactivity is still unsolved. Solving that by hand is definitely not great. Most likely I will still need to use xterm.js. Ideally I will subscribe to buffer change, or whatever event to be notified when application is asking for data (y/n), or input (for example arrow keys)

This will also take care of actually handling the command sequences. For example clearing a line.
Modifying algorithm outlined above

The question is is at worth my time right now?
Is tell a typewriter more important?)

- This will allow support for nushell, single line commands are not interactive
