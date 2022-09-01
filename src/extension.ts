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
} from "vscode";
import { exec, spawn } from "node:child_process";
import { Readable, Stream, Writable } from "node:stream";
import { cwd, stdout } from "node:process";
import { assert } from "node:console";

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
      let currentWorkingDirectory = cwd();

      function getCurrentPrompt(): string {
        return `${currentWorkingDirectory} 🛫 `;
      }

      // Consider: Instead of keeping track of the current directory internally
      // I can span a bash process, keep it alive throughout the session,
      // and send input to it, this way I don't have to re implement cd, env etc.
      // To get the current prompt I can query bash by running a command
      // and not piping its output to the editor.
      function changeCurrentDirectory() {}

      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      const bashDocument = await workspace.openTextDocument({
        language: "bash",
        content: getCurrentPrompt(),
      });
      const editor = await window.showTextDocument(bashDocument);

      let state: State = {
        kind: "ReadingCommand",
        commandStart: getDocumentEnd(bashDocument),
      };

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

                const end = getDocumentEnd(bashDocument);
                const success = await editor.edit((builder) => {
                  builder.insert(end, "\n" + getCurrentPrompt());
                });

                assert(success);

                state = {
                  kind: "ReadingCommand",
                  commandStart: getDocumentEnd(bashDocument),
                };
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
