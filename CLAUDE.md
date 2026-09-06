# CLAUDE.md — Another Simple Todoist Sync for Obsidian

This file documents the codebase for AI tools (Claude, Copilot, Cursor, etc.) reviewing or contributing to this repo.

## Project Overview

This is an Obsidian plugin that provides **bidirectional synchronization between Obsidian.md and Todoist**. Tasks written in Obsidian markdown files are synced to Todoist when tagged with a sync tag (default: `#tdsync`), and changes in Todoist are pulled back into Obsidian on a configurable interval.

This is a fork of [Ultimate Todoist Sync for Obsidian](https://github.com/HeroBlackInk/ultimate-todoist-sync-for-obsidian), with significant rewrites including migration to Todoist's Unified API (as of v0.5.0).

- **Plugin ID**: `another-simple-todoist-sync`
- **Plugin name**: Another Simple Todoist Sync
- **Current version**: 0.8.2
- **License**: GNU GPLv3

---

## Tech Stack

- **Language**: TypeScript
- **Build tool**: esbuild (via `npm_scripts/esbuild.config.mjs`)
- **Bundler entry**: `main.ts` → compiles to `main.js`
- **Obsidian API**: `obsidian` npm package
- **Todoist SDK**: `@doist/todoist-sdk` (Unified API)
- **Type checking**: `tsc -noEmit` (strict, no emit)
- **Min Obsidian version**: 1.2.3

---

## Project Structure

```
main.ts                  # Plugin entry point — registers events, commands, intervals
src/
  settings.ts            # Settings interface, defaults, and PluginSettingTab UI
  taskParser.ts          # Parses Obsidian markdown task lines into Todoist task objects
  syncModule.ts          # Core sync logic (Obsidian ↔ Todoist)
  todoistAPI.ts          # Wraps @doist/todoist-sdk for all Todoist API calls
  cacheOperation.ts      # Reads/writes plugin data (tasks, projects, sections, file metadata)
  fileOperation.ts       # Modifies Obsidian files (check/uncheck tasks, insert links/dates)
  modal.ts               # Modal for "Set default project for current file" command
  importTaskModal.ts     # Modal for "Import task from Todoist link" command
npm_scripts/
  esbuild.config.mjs     # Build configuration
  version-bump.mjs       # Bumps version in manifest.json and versions.json
  build-local.mjs        # Builds and copies output to LocalBuild/ for local testing
  bump-patch.mjs         # Bumps patch version in manifest.json after a production build
tests/                   # Vitest unit tests (see "Testing")
  __mocks__/             # Hand-written mocks for `obsidian` and `@doist/todoist-sdk`
  fixtures/              # Sample markdown lines, Todoist tasks, activity events
  helpers/mockPlugin.ts  # createMockPlugin / createMockApp factories
  setup.ts               # Forces TZ=UTC for deterministic date/time tests
  *.test.ts              # One suite per covered module
vitest.config.ts         # Vitest config (runtime module aliases → mocks, coverage)
tsconfig.test.json       # TypeScript config for type-checking the tests
attachment/
  CHANGELOG.md           # Release history
```

---

## Build & Development

```bash
# Development (watch mode)
npm run dev

# Production build (runs tsc check + bumps patch version)
npm run build

# Production build (skip tsc check)
npm run build-without-tsc

# Build and copy to LocalBuild/ for local Obsidian testing
npm run build-local

# Run the unit-test suite (Vitest)
npm test
npm run test:watch      # watch mode
npm run test:coverage   # with coverage report

# Bump version
npm run version
```

**Output**: `main.js` and `styles.css` at root — these are what Obsidian loads.

To test locally, copy `main.js`, `manifest.json`, and `styles.css` to your Obsidian vault's `.obsidian/plugins/another-simple-todoist-sync/` directory. `npm run build-local` does this automatically into `LocalBuild/another-simple-todoist-sync/`.

---

## Architecture & Data Flow

### Initialization sequence (`main.ts`)
1. `onload()` waits for `onLayoutReady` (avoids startup issues)
2. Loads settings from Obsidian's data store
3. If API token is set, calls `initializePlugin()`:
   - Creates `TodoistNewAPI`, `CacheOperation`, `TaskParser`, `FileOperation`, `TodoistSync`
   - Fetches all projects and sections from Todoist into cache
   - On first run, backs up all Todoist resources to vault
4. Registers DOM event listeners (keyup, click) and vault events (modify, rename)
5. Starts `scheduledSynchronization()` interval

### Sync lock (`syncLock`)
A boolean mutex (`this.syncLock`) serializes all sync operations. `checkAndHandleSyncLock()` waits up to 10 seconds for the lock, then sets it. **Always release the lock** (`this.syncLock = false`) in `catch` blocks and after each sync call.

### Task identity
Each synced task gets a `%%[tid:: [taskId](https://app.todoist.com/app/task/taskId)]%%` inline field appended to the markdown line. This ID is used to:
- Match Obsidian lines to Todoist tasks
- Detect deletions (task ID no longer present in file)
- Trigger updates when line content changes

### Settings & cache storage
All data is persisted via Obsidian's `this.loadData()` / `this.saveData()` (stored in `.obsidian/plugins/another-simple-todoist-sync/data.json`). The `settings` object holds:
- `todoistTasksData` — projects, sections, tasks cache, events, user data
- `fileMetadata` — per-file map of `{ todoistTasks: string[], todoistCount, defaultProjectId, defaultProjectName }`
- All plugin configuration settings

---

## Task Syntax Reference

The `TaskParser` class parses task lines using regex. Supported syntax:

| Syntax | Meaning | Example |
|---|---|---|
| `#tdsync` | Marks task for sync (configurable) | `- [ ] My task #tdsync` |
| `📅YYYY-MM-DD` | Due date (`📅`, `📆`, `🗓`, `@` if alt keywords on) | `- [ ] task 📅2025-06-01 #tdsync` |
| `⏰HH:MM` | Due time (`⏰`, `⏲`, `$` if alt keywords on) | `- [ ] task ⏰14:30 #tdsync` |
| `⏳NNmin` | Duration in minutes (`⏳`, `&` if alt keywords on) | `- [ ] task ⏳30min #tdsync` |
| `!!1`–`!!4` | Priority (!!1 = p1 urgent, !!4 = p4 default) | `- [ ] task !!2 #tdsync` |
| `///section_name` | Assign to section | `- [ ] task ///MySec #tdsync` |
| `#ProjectName` | First tag matching a project name sets the project | `- [ ] task #Work #tag #tdsync` |
| `%%[p::ProjectName]%%` | Explicit project assignment (case-sensitive) | `- [ ] task %%[p::Work]%% #tdsync` |
| `{{YYYY-MM-DD}}` | Deadline date (also `YY-MM-DD`, `MM-DD`) | `- [ ] task {{2025-12-31}} #tdsync` |

After sync, each line gets appended with `%%[tid:: [id](url)]%%` to track the Todoist task ID.

---

## Key Classes & Responsibilities

### `AnotherSimpleTodoistSync` (`main.ts`)
Plugin root. Owns all module instances. Handles:
- Obsidian lifecycle (`onload`, `onunload`)
- Event registration (keyup, click, editor-change, rename, modify)
- `scheduledSynchronization()` — full sync cycle run on interval
- `lineNumberCheck()` — detects when cursor moves off a changed line and triggers a task update check
- `checkboxEventHandler()` — handles checking/unchecking tasks in preview mode

### `TaskParser` (`src/taskParser.ts`)
Converts a markdown line string into a `Task` object. Pure parsing logic. Key methods:
- `convertTextToTodoistTaskObject()` — main entry, returns full task object
- `hasTodoistTag()`, `hasDueDate()`, `hasDueTime()`, `hasDuration()` — presence checks
- `getDueDateFromLineText()`, `getDueTimeFromLineText()`, `getTaskPriority()` — extraction
- `getTaskContentFromLineText()` — strips all metadata to get clean task content
- `keywords_function()` — returns regex alternation string for configurable keywords

### `TodoistSync` (`src/syncModule.ts`)
Orchestrates sync operations:
- `syncTodoistToObsidian()` — pulls changes from Todoist into vault
- `fullTextNewTaskCheck()` — scans a file for new tasks to push to Todoist
- `deletedTaskCheck()` — finds tasks removed from file and deletes from Todoist
- `fullTextModifiedTaskCheck()` — checks all tasks in a file for modifications
- `lineContentNewTaskCheck()` — checks current editor line for a new task (on Enter)
- `lineModifiedTaskCheck()` — checks a specific line for modifications (on cursor leave)

### `TodoistNewAPI` (`src/todoistAPI.ts`)
Wraps `@doist/todoist-sdk`. Key methods:
- `initializeNewAPI()` — returns a `TodoistApi` instance from the stored token
- `addTask()`, `updateTask()`, `deleteTask()`, `closeTask()`, `reopenTask()`
- `getTaskById(taskId)` — fetches a single task by ID (used by import modal); uses `throw: false` so the full error body is available on 4xx
- `getUserResource()` — fetches user profile (email, timezone, language)
- `getActivityLog()` — fetches Todoist events (used for Todoist→Obsidian sync)

### `CacheOperation` (`src/cacheOperation.ts`)
Reads/writes the `settings` data store. Manages:
- Task cache (load/save tasks by ID)
- Project cache (lookup by name or ID)
- Section cache (lookup by name, project)
- File metadata (tasks per file, default project per file)

### `FileOperation` (`src/fileOperation.ts`)
Modifies actual vault files:
- `completeTaskInTheFile()` / `incompleteTaskInTheFile()` — toggle `[ ]` ↔ `[x]`
- `addTodoistLinkToFile()` — appends `tid` metadata after task creation
- `addCurrentDateToTask()` — inserts today's date when only time is given

### `ImportTaskFromTodoistModal` (`src/importTaskModal.ts`)
Modal triggered by the "Import task from Todoist link" command. Flow:
1. User pastes a Todoist task URL (supports `app.todoist.com/app/task/SLUG`, project-scoped URLs, and `todoist://` app URIs)
2. `extractTaskId()` parses the URL — handles slugs like `task-name-ID` by taking the last alphanumeric segment as the ID
3. Checks the current editor content for `[taskId](` to prevent duplicate imports
4. Calls `todoistAPI.getTaskById()` and shows a preview (content, due date, labels, priority)
5. On confirm, `insertTask()` formats and inserts the markdown line at the cursor, then registers the task in cache and file metadata so bidirectional sync tracks it

**Date/time formatting in `importTaskModal.ts`**:
- Todoist REST API v1 returns `due.date` as a full datetime string (e.g. `"2026-05-31T18:00:00"`) when a time is set — the separate `due.datetime` field is a v2 REST API concept
- `formatTaskLine()` splits on `"T"` to get the date part for `📅YYYY-MM-DD` and passes the full string to `extractTime()` for `⏰HH:MM`
- `extractTime()` uses `Intl.DateTimeFormat` with `due.timezone` for correct timezone conversion; falls back to system local time when `due.timezone` is `null` (floating time)

---

## Experimental Features

These are gated behind the "Experimental features" toggle in settings:
- **Custom sync tag** — change the sync tag from `#tdsync` to anything
- **Alternative keywords** — `@` for date, `$` for time, `&` for duration
- **Delayed first sync** — waits 60 seconds before first sync on startup
- **Obsidian Tasks Integration** — reorders tid and date for compatibility with Obsidian Tasks plugin
- **Change URL to app URI** — uses `todoist://` links instead of `https://app.todoist.com/`
- **Remove Obsidian file name from task description** — omit vault file link from description
- **Full vault sync** — sync every markdown task, not just `#tdsync` tagged ones
- **Import task from Todoist link** — paste a Todoist task URL into a modal to import it directly into the current note with full sync metadata

---

## Common Gotchas & Known Issues

- **10-second delay on `editor-change` and arrow keys**: A `setTimeout(10000)` is intentionally present to avoid a race condition where tasks get deleted immediately after creation. This is a known workaround — the root cause hasn't been fully diagnosed.
- **`syncLock` must always be released**: Any code path that acquires the lock must release it in both success and error paths.
- **Task ID format**: The `%%[tid:: [id](url)]%%` pattern — be careful when writing regex to match these; the `%%` wrappers are present in the file content.
- **Priority inversion**: Todoist API uses 1=normal, 4=urgent. The plugin's `!!1`–`!!4` syntax maps `!!1` → API priority 4 (urgent). The inversion happens in `getTaskPriority()`.
- **Sub-project tag matching**: If a tag is `#Project/SubProject`, the plugin extracts only `SubProject` for project matching (split on `/`).
- **First tag = project**: When a task has multiple `#tags`, the first one that matches an existing Todoist project name is used as the project.
- **Todoist API pagination**: Projects and sections are fetched in paginated calls; the plugin retrieves all pages (fixed in v0.5.10).
- **Todoist v1 API `due` object**: Unlike the older v2 REST API, the v1 unified API puts the full datetime into `due.date` (e.g. `"2026-05-31T18:00:00"`) when a time is set. There is no separate `due.datetime` field. Always split on `"T"` before using `due.date` as a date string.

---

## Adding New Features

1. **New task syntax field**: Add detection in `TaskParser` (`hasFoo`, `getFooFromLineText`), add to `convertTextToTodoistTaskObject`, pass it through `Task` interface in `cacheOperation.ts`, and wire it in `TodoistNewAPI.addTask()` / `updateTask()`.
2. **New setting**: Add to `AnotherSimpleTodoistSyncSettings` interface and `DefaultAppSettings` in `settings.ts`, then add the UI control in `AnotherSimpleTodoistSyncPluginSettingTab.display()`.
3. **New sync direction (Todoist→Obsidian)**: Implement in `TodoistSync.syncTodoistToObsidian()` using activity log events, then update the file via `FileOperation`.
4. **New command with modal**: Follow the pattern in `importTaskModal.ts` — register the command in `main.ts` behind an experimental feature flag in `settings.ts`, implement the modal as a class extending `Modal`.

---

## Testing

### Automated tests (Vitest)

Run with `npm test` (`vitest run`), `npm run test:watch`, or `npm run test:coverage`. **CI (`.github/workflows/ci.yml`) runs `npm test` on every pull request and push to `master`.**

- **Runner**: Vitest (chosen over Jest because the project is ESNext/`isolatedModules` and Vitest uses esbuild — the same transform as the production build — with no extra transpilers).
- **Location**: all suites live in `tests/`, one `*.test.ts` per covered module.
- **Mocks** (`tests/__mocks__/`): `obsidian` and `@doist/todoist-sdk` have no usable runtime in Node, so they are aliased to hand-written stubs via `vitest.config.ts` `resolve.alias`. `TodoistNewAPI` calls `requestUrl` imported from `obsidian` directly, so the obsidian mock exports it as a `vi.fn()`; tests drive it with `vi.mocked(requestUrl).mockResolvedValueOnce(...)` / `mockRejectedValueOnce(...)`.
- **Helpers** (`tests/helpers/mockPlugin.ts`): `createMockPlugin()` / `createMockApp()` build the minimal `plugin`/`app` shapes the modules reach into. `createMockPlugin` spreads `DefaultAppSettings` (so `alternativeKeywords` defaults to `true`, `customSyncTag` to `#tdsync`) — override per test, e.g. `createMockPlugin({ alternativeKeywords: false })`.
- **Determinism**: `tests/setup.ts` sets `process.env.TZ = "UTC"` so `Intl`/`Date`-based code (`ISOStringToLocalClockTimeString`, `ImportTaskFromTodoistModal.extractTime`) is stable in CI.
- **Type-checking**: `tsconfig.test.json` type-checks the test files against the **real** obsidian/SDK types (the runtime mocks are aliased only by Vitest, not by tsc). The production build's `tsc` excludes `tests/`. Run `npx tsc -p tsconfig.test.json --noEmit` to type-check tests.
- **Covered**: `taskParser` (markdown parsing — the highest-value, near-pure logic), `cacheOperation` (in-memory cache/metadata), `importTaskModal` (URL parsing, priority inversion, line formatting; private methods are reached via `(modal as any).method()`), `todoistAPI` (request-payload assembly and `filterActivityEvents`).
- **Out of scope** (need a full Obsidian/integration environment, not unit-tested): `main.ts`, `syncModule.ts`, `fileOperation.ts`.

When adding a parsing/cache/import/API feature, add or update the matching `tests/*.test.ts` suite.

### Manual testing in Obsidian

For sync behaviour, file edits, and the settings UI:
1. Build with `npm run dev` (or `npm run build-local`)
2. Copy output files to the Obsidian vault plugin directory (or point the vault at `LocalBuild/`)
3. Reload Obsidian and exercise the feature
4. Enable **Debug mode** in settings (`settings.debugMode = true`) for verbose console logging
