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

/**
 * Get a range that corresponds to the entire contents of the given document.
 *
 * @param document The document to consider
 * @returns A range corresponding to the entire document contents
 */
function getDocumentRange(document: TextDocument) {
  const firstLine = document.lineAt(0);
  const lastLine = document.lineAt(document.lineCount - 1);

  return new Range(firstLine.range.start, lastLine.range.end);
}

function getDocumentEnd(document: TextDocument) {
  return getDocumentRange(document).end;
}

type ReadingCommand = {
  kind: "ReadingCommand";
  commandStart: Position;
};

type WritingOutput = {
  kind: "WritingOutput";
};

type InteractiveInput = {
  kind: "InteractiveInput";
};

type State = ReadingCommand | WritingOutput | InteractiveInput;

export function activate(context: ExtensionContext) {
  let disposable = commands.registerCommand(
    "bash-editor.newBashEditor",
    async () => {
      // Current directory and prompt
      let directory = homedir();

      function getCurrentPrompt(): string {
        return `${directory} 🛫 `;
      }

      function changeDirectory(args: string[]) {
        assert(args.length === 1);
        const destination = args[0];
        if (destination.startsWith("~")) {
          directory = path.resolve(destination);
        } else if (path.isAbsolute(destination)) {
          directory = destination;
        } else {
          directory = path.join(directory, destination);
        }
      }

      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      const bashDocument = await workspace.openTextDocument({
        language: "bash",
        content: getCurrentPrompt(),
      });
      const editor = await window.showTextDocument(bashDocument);
      const end = getDocumentEnd(bashDocument);
      editor.selection = new Selection(end, end);

      let state: State = {
        kind: "ReadingCommand",
        commandStart: getDocumentEnd(bashDocument),
      };

      async function resetPrompt(retries = 1) {
        if (retries <= 0) {
          return;
        }

        // This is not representative of what we're actually doing,
        // but is good enough because it will ignore editor updates.
        state = { kind: "WritingOutput" };

        const end = getDocumentEnd(bashDocument);
        const success = await editor.edit((builder) => {
          const { start, end } = getDocumentRange(bashDocument);
          const startOnNewLine = !start.isEqual(end);
          builder.insert(
            end,
            (startOnNewLine ? "\n" : "") + getCurrentPrompt()
          );
        });
        revealTail();

        assert(success, "Resetting comment prompt failed, retrying");
        if (!success) {
          setTimeout(() => resetPrompt(retries - 1));
        }

        state = {
          kind: "ReadingCommand",
          commandStart: getDocumentEnd(bashDocument),
        };
      }

      function revealTail() {
        const end = getDocumentEnd(bashDocument);
        editor.revealRange(new Range(end, end));
      }

      let textDocumentChangesDisposable = workspace.onDidChangeTextDocument(
        ({ document, contentChanges }) => {
          if (document !== bashDocument) {
            return;
          }

          const documentEnd = getDocumentEnd(document);

          switch (state.kind) {
            case "ReadingCommand":
              let { commandStart } = state;
              const promptRange = new Range(
                commandStart.with({ character: 0 }),
                commandStart
              );
              // Potential comment position start changes:
              // 1. Command prompt was touched in some way, moved around etc.
              //   In this case we we reset the prompt.
              // 2. All changes happened either before or after command prompt range.
              //   In this case was shift command start position
              //   according to changes that happened before.
              if (
                contentChanges.some((change) =>
                  change.range.contains(promptRange)
                )
              ) {
                resetPrompt();
                return;
              } else {
                const commandStartOffset = document.offsetAt(commandStart);
                const changesBeforeCommandStart = contentChanges.filter(
                  (change) => change.rangeOffset < commandStartOffset
                );
                const newCommandStartOffset = changesBeforeCommandStart.reduce(
                  (currentOffset, change) =>
                    currentOffset - change.rangeLength + change.text.length,
                  commandStartOffset
                );
                commandStart = document.positionAt(newCommandStartOffset);
                state = {
                  kind: "ReadingCommand",
                  commandStart,
                };
              }

              const command = document.getText(
                new Range(commandStart, documentEnd)
              );
              const singleLineCommand = command.replace("\\\n", " ");

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

              // This remains very racy, ideally will want to chain these promises
              // to keep the order of edits and to wait for all promises
              let editPromise: Thenable<boolean> | null = null;
              async function pipeCommandOutputToEditor(chunk: any) {
                let commandOutput = "";
                if (chunk instanceof Buffer) {
                  commandOutput = chunk.toString("utf-8");
                } else {
                  throw Error("Command produced unexpected output type");
                }

                state = { kind: "WritingOutput" };

                const end = getDocumentEnd(bashDocument);

                editPromise = editor.edit((builder) => {
                  builder.insert(end, commandOutput);
                });

                const success = await editPromise;
                assert(success, "Command output writing failed");

                state = { kind: "InteractiveInput" };
              }

              let { stdin, stdout, stderr, addListener } = spawn(
                comamnd,
                args,
                {
                  shell: true,
                  stdio: ["pipe", "pipe", "pipe"],
                }
              );

              stdout.addListener("data", pipeCommandOutputToEditor);
              stderr.addListener("data", pipeCommandOutputToEditor);

              stdout.addListener("close", async () => {
                if (editPromise) {
                  await editPromise;
                }

                await resetPrompt();
              });

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

      context.subscriptions.push(textDocumentChangesDisposable);
    }
  );

  context.subscriptions.push(disposable);

  if (env.VSCODE_EXT_HOST_DEBUG_PORT) {
    setTimeout(
      () => commands.executeCommand("bash-editor.newBashEditor"),
      1000
    );
  }
}

// this method is called when your extension is deactivated
export function deactivate() {}
