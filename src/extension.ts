// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
  workspace,
  window,
  commands,
  Range,
  TextDocument,
  ExtensionContext,
  Position,
  Selection,
} from "vscode";
import { exec, spawn } from "child_process";
import { PassThrough, Readable, Stream, Writable } from "stream";
import { cwd, env, stdout } from "process";
import { assert } from "console";
import * as path from "path";
import { homedir } from "os";
import { fstat } from "fs";

/**
 * Get a range that corresponds to the entire contents of the given document.
 *
 * @param document The document to consider
 * @returns A range corresponding to the entire document contents
 */
function getRange(document: TextDocument) {
  const firstLine = document.lineAt(0);
  const lastLine = document.lineAt(document.lineCount - 1);

  return new Range(firstLine.range.start, lastLine.range.end);
}

function getEnd(document: TextDocument) {
  return getRange(document).end;
}

function getEndOffset(document: TextDocument) {
  return document.offsetAt(getEnd(document));
}

type ReadingCommand = {
  kind: "ReadingCommand";
  commandStartOffset: number;
};

type WritingOutput = {
  kind: "WritingOutput";
};

type InteractiveInput = {
  kind: "InteractiveInput";
};

type State = ReadingCommand | WritingOutput | InteractiveInput;

async function run(lldbMode: boolean) {
  // Current directory and prompt
  let directory = workspace.workspaceFolders?.[0].uri.path ?? homedir();

  function getCurrentPrompt(): string {
    return `${directory} 🛫 `;
  }

  function changeDirectory(args: string[]) {
    assert(args.length === 1);
    const destination = args[0];
    if (destination.startsWith("~")) {
      directory = path.join(homedir(), destination.slice(1));
    } else if (path.isAbsolute(destination)) {
      directory = destination;
    } else {
      directory = path.join(directory, destination);
    }

    // TODO: Check new directory exists
  }

  // The code you place here will be executed every time your command is executed
  // Display a message box to the user
  const bashDocument = await workspace.openTextDocument({
    language: "bash",
    content: getCurrentPrompt(),
  });
  const editor = await window.showTextDocument(bashDocument);
  const end = getEnd(bashDocument);
  const endOffset = getEndOffset(bashDocument);
  editor.selection = new Selection(end, end);

  let scriptBridgeConnected = false;
  let state: State = {
    kind: "ReadingCommand",
    commandStartOffset: endOffset,
  };

  // Important! Used for all writes to output. Both prompt resetting & command outputs
  // This remains very racy, ideally will want to chain these promises
  // to keep the order of edits and to wait for all promises
  let pendingWrite: string | undefined = undefined;
  let editPromise: Thenable<boolean> | undefined = undefined;

  async function resetPrompt() {
    if (editPromise) {
      await editPromise;
    }

    // This is not representative of what we're actually doing,
    // but is good enough because it will ignore editor updates.
    state = { kind: "WritingOutput" };

    const newEditPromise = editor.edit((builder) => {
      const { start, end } = getRange(bashDocument);
      const startOnNewLine = !start.isEqual(end);
      builder.insert(end, (startOnNewLine ? "\n" : "") + getCurrentPrompt());
    });

    editPromise = newEditPromise;
    await editPromise;
    revealTail();

    state = {
      kind: "ReadingCommand",
      commandStartOffset: getEndOffset(bashDocument),
    };
  }

  function revealTail() {
    const end = getEnd(bashDocument);
    editor.revealRange(new Range(end, end));
  }

  const textDocumentChangesDisposable = workspace.onDidChangeTextDocument(
    ({ document, contentChanges }) => {
      if (document !== bashDocument) {
        return;
      }

      const documentEnd = getEnd(document);

      const executeCommand = commands.executeCommand;
      console.log(executeCommand);

      switch (state.kind) {
        case "ReadingCommand":
          let { commandStartOffset } = state;
          let commandStartPosition = document.positionAt(commandStartOffset);
          const promptRange = new Range(
            commandStartPosition.with({ character: 0 }),
            commandStartPosition.translate({ characterDelta: -1 })
          );
          // Potential comment position start changes:
          // 1. Command prompt was touched in some way, moved around etc.
          //   In this case we we reset the prompt.
          // 2. All changes happened either before or after command prompt range.
          //   In this case was shift command start position
          //   according to changes that happened before.
          if (
            contentChanges.some(
              (change) =>
                typeof change.range.intersection(promptRange) !== "undefined"
            )
          ) {
            resetPrompt();
            return;
          } else {
            const changesBeforeCommandStart = contentChanges.filter(
              (change) => change.rangeOffset < commandStartOffset
            );
            const newCommandStartOffset = changesBeforeCommandStart.reduce(
              (currentOffset, change) =>
                currentOffset - change.rangeLength + change.text.length,
              commandStartOffset
            );
            console.log(
              `Old command start offset ${commandStartOffset}, new ${newCommandStartOffset}`
            );
            commandStartOffset = newCommandStartOffset;
            commandStartPosition = document.positionAt(commandStartOffset);
            state = {
              kind: "ReadingCommand",
              commandStartOffset,
            };
          }

          const commandRange = new Range(commandStartPosition, documentEnd);
          const command = document.getText(commandRange);
          const singleLineCommand = command.replace("\\\n", " ");

          console.log("commandRange");
          console.log(commandRange.start);
          console.log(`command ${command}`);

          if (!singleLineCommand.endsWith("\n")) {
            // We are not done entering the command yet
            return;
          }

          let [comamnd, ...args] = singleLineCommand.trimEnd().split(" ");
          // Escape hatch for special commands like change directory.
          // We handled those natively.
          if (comamnd === "cd") {
            changeDirectory(args);
            resetPrompt();
            return;
          }

          if (comamnd === "") {
            resetPrompt();
            return;
          }

          async function pipeChunkToEditor(chunk: any) {
            if (chunk instanceof Buffer) {
              await writeToEditor(chunk.toString("utf-8"));
            } else {
              throw Error("Command produced unexpected output type");
            }
          }
          async function writeToEditor(commandOutput: string) {
            state = { kind: "WritingOutput" };

            // Ignoring control characters. https://stackoverflow.com/a/14693789
            // This regular expression actually works, although it still does not fix bold manual pages highlights.
            commandOutput = commandOutput.replace(
              /(\x9B|\x1B\[)[0-?]*[ -\/]*[@-~]/gi,
              ""
            );

            const end = getEnd(bashDocument);

            console.log(`Writing: ${commandOutput}`);
            if (editPromise) {
              console.log(
                `Blocked writing ${commandOutput}, awaiting last write: ${pendingWrite}`
              );
              await editPromise;
            }

            // Chain edits to avoid output race conditions
            const newEditPromise = editor.edit((builder) => {
              console.log(`Command output: ${commandOutput}`);
              builder.insert(end, commandOutput);
            });
            // Somehow the chaining breaks things saying it cant edit an editor that is closed ?..
            // if (editPromise) {
            //   editPromise = editPromise.then((_) => newEditPromise);
            // }
            editPromise = newEditPromise;
            pendingWrite = commandOutput;

            const success = await editPromise;

            // No matter if successful or not, stop blocking next right
            editPromise = undefined;
            pendingWrite = undefined;

            if (success) {
              console.log(
                `Command output writing success. Output: ${commandOutput}`
              );
            } else {
              // Todo: Learn how to rap cole consol log or other snippets around the string
              console.error(
                `Command output writing failed. Output: ${commandOutput}`
              );
            }

            state = { kind: "InteractiveInput" };
          }

          // For now we don't support lldb
          if (lldbMode) {
            // This needs to run only once
            if (!scriptBridgeConnected) {
              commands.executeCommand<string>("Connect  to lldb");
              scriptBridgeConnected = true;
            }

            const lldbCommand = [command, ...args].join(" ").trimEnd();
            commands
              .executeCommand<string>(
                "Run lldb command and return",
                lldbCommand
              )
              .then(writeToEditor, (error) => console.log(error))
              .then((_) => resetPrompt());
          } else {
            const { stdout, stderr } = spawn(comamnd, args, {
              shell: "/bin/sh",
              // eslint-disable-next-line @typescript-eslint/naming-convention
              // env: {
              //   TERM: "xterm-mono",
              //   PATH: env.PATH,
              //   TERM_PROGRAM: "Apple_Terminal",
              // },
              cwd: directory,
              stdio: ["pipe", "pipe", "pipe"],
            });

            stdout.addListener("data", pipeChunkToEditor);
            stderr.addListener("data", pipeChunkToEditor);

            stdout.addListener("close", async () => {
              if (editPromise) {
                await editPromise;
              }

              await resetPrompt();
            });
          }

          break;
        case "WritingOutput":
          // Noop, just ignore updates
          // Might race, can check what is the last thing we were writing
          break;
        case "InteractiveInput":
        // Send to stdin
      }

      revealTail();
    }
  );

  return textDocumentChangesDisposable;
}

export function activate(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand("bash-editor.newBashEditor", () => run(false))
  );

  context.subscriptions.push(
    commands.registerCommand("bash-editor.newLLDBEditor", () => run(true))
  );

  if (env.NODE_ENV === "development") {
    setTimeout(
      () => commands.executeCommand("bash-editor.newBashEditor"),
      1000
    );
  }
}

// this method is called when your extension is deactivated
export function deactivate() {}
