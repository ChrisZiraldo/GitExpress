# SimpleGit

A cross-platform Electron desktop Git GUI built with React + TypeScript that wraps the local `git` CLI for everyday operations: status, stage/unstage, commit, fetch, pull, push, branch, and history.

## Requirements

- Node.js 18+
- `git` available on `PATH`

## Install

```bash
npm install
```

## Develop

```bash
npm run dev
```

Launches the Electron app with HMR for both the renderer (React) and main process.

## Build & package

```bash
npm run build           # type-check + bundle main / preload / renderer
npm run package         # bundle + create installer for the current OS
npm run package:mac     # macOS dmg + zip
npm run package:win     # Windows nsis
npm run package:linux   # AppImage + deb
```

Installers are written to `release/<version>/`.

## Project layout

```
src/
  main/        Electron main process: app lifecycle, IPC, git wrappers
  preload/     contextBridge exposing window.git typed API to the renderer
  renderer/    React + Tailwind UI
  shared/      Types and IPC channel constants shared across processes
```

## Architecture

- The renderer never touches the filesystem or child processes directly. It calls into `window.git.*`, which is implemented in the preload via `contextBridge` and forwards to IPC handlers in the main process.
- The main process shells out to `git` using `child_process.execFile` (no shell, no injection surface) with `GIT_TERMINAL_PROMPT=0` so the CLI never blocks on interactive prompts.
- All IPC handlers return a uniform `{ ok: true, data } | { ok: false, code, stderr }` result so the UI can surface errors via toasts uniformly.
- Window hardening: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.

## Layout

GitKraken-inspired four-region layout:

- **Top toolbar**: repo + current-branch popovers on the left; Fetch / Pull (split: FF / Rebase) / Push / Branch / Stash / Pop on the right.
- **Left sidebar**: collapsible sections for Working copy, Local branches, Remote branches (grouped by remote), and Stashes. Hover for inline actions, right-click for context menus.
- **Center**: SVG commit graph with colored lanes, ref pills, ahead/behind on HEAD, and a "Working copy" row at the top. Click a row to inspect; right-click for Checkout (detached) / Create branch from here / Copy hash.
- **Bottom drawer** (drag-resizable, height persisted): shows the working copy panel (Status + Diff + Commit composer) when no commit is selected, or the commit detail (changed files + per-file diff) when one is.

## Features

- Open / remember repositories (recents in toolbar popover)
- Commit graph across all local + remote branches (capped at 500 commits)
- Branch list, switch, create new branch, create branch from any commit, checkout detached, checkout remote tracking branch
- Stage / unstage individual files or all
- Per-file diff viewer (staged and unstaged) via `diff2html`
- Commit with subject + optional extended description (Cmd/Ctrl+Enter shortcut)
- Fetch, Pull (FF or rebase), Push (auto `--set-upstream` for new branches)
- Stash push (with optional message and `--include-untracked`), Pop, Apply, Drop
- Commit detail view: metadata, parents (clickable), changed files, file diff via `git show`
- Toast notifications for `git` stderr

## Out of scope (current)

- Tags display (refs structure ready, section just not rendered)
- Merge conflict resolution UI
- Interactive rebase, cherry-pick, reflog
- Drag-and-drop branch operations
- Submodules / LFS
- GitHub-specific features (PRs, issues)
