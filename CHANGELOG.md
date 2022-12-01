# Change Log

All notable changes to the "bash-editor" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.0.4]

### Fixed:

- Bug, TextEditor#edit not possible on closed editors. Stops being able to write to editor on unfocus it seems
  - TextEditor is closed/disposed??

### Added:

- Need to create temporary file every time. Instead save with a new extension like in-editor-terminal.md. If already in directory simply open the existing one. If opened by other means - start listingin to edits
