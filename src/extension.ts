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
import { cwd, stdout } from "process";
import { assert } from "console";
import path = require("path");

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
      let directory = cwd();

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

      async function resetPrompt() {
        const end = getDocumentEnd(bashDocument);
        const success = await editor.edit((builder) => {
          builder.insert(end, "\n" + getCurrentPrompt());
        });

        assert(success);

        state = {
          kind: "ReadingCommand",
          commandStart: getDocumentEnd(bashDocument),
        };
      }

      let textDocumentChangesDisposable = workspace.onDidChangeTextDocument(
        ({ document, contentChanges }) => {
          if (document !== bashDocument) {
            return;
          }

          const documentEnd = getDocumentEnd(document);

          switch (state.kind) {
            case "ReadingCommand":
              // Make sure we don't mess up the position start.
              const validCommandRange = new Range(
                state.commandStart,
                documentEnd
              );
              contentChanges.forEach((change) =>
                assert(
                  typeof change.range.intersection(validCommandRange) !==
                    "undefined",
                  "Changes were done outside of the command editing area - between 🛫 and end of file"
                )
              );

              const command = document.getText(
                new Range(state.commandStart, documentEnd)
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

              let { stdout, stdin, stderr } = spawn(comamnd, args, {
                stdio: ["pipe", "pipe", "pipe"],
              });

              let editPromise: Thenable<boolean> | null = null;
              stdout.addListener("data", async (chunk: Buffer) => {
                state = { kind: "WritingOutput" };

                const commandOutput = chunk.toString("utf-8");
                const end = getDocumentEnd(bashDocument);

                editPromise = editor.edit((builder) => {
                  builder.insert(end, commandOutput);
                });

                const success = await editPromise;
                assert(success);

                state = { kind: "InteractiveInput" };
              });

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
        }
      );

      context.subscriptions.push(textDocumentChangesDisposable);
    }
  );

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
