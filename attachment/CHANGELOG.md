## CHANGELOG

## 2026-06-04

### 0.6.2

- Upgraded `@doist/todoist-sdk` 9.1.1 → 10.3.0. This clears the only `npm audit` advisory in the dependency tree: the SDK 9.x line transitively depended on `uuid <11.1.1` (GHSA-w5hq-g745-h8pq, moderate). `npm audit` now reports 0 vulnerabilities. The SDK's used surface (`new TodoistApi()` and `deleteTask()`) is unchanged in v10, so sync behaviour is unaffected.
- Bumped dev dependencies: `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` 8.60.0 → 8.60.1; refreshed `obsidian` type definitions to 1.13.0.
- Removed the unused `@types/uuid` devDependency (`uuid` is never imported in the codebase).
- README: removed the stale "early April 2025" Caution callout and the v0.6.1 Note callout.

## 2026-06-02

### 0.6.1

- Fixed #53 — Plugin no longer writes `data.json` to disk on every keystroke or sync cycle when nothing has actually changed. A normalization + cache comparison now guards `saveSettings()`: tasks and projects are sorted by ID before comparison to absorb Todoist API ordering variance. This eliminates the thousands of duplicate files (`data 2.json`, `data 2495.json`, …) reported by users with iCloud and other cloud sync services.
- Translated all remaining Chinese-language code comments to English across `main.ts`, `syncModule.ts`, `cacheOperation.ts`, `fileOperation.ts`, `taskParser.ts`, and `settings.ts` to improve readability for future contributors.
- Fixed TypeScript definite-assignment assertions (`!`) on class properties in `main.ts` to resolve VSCode strict-mode warnings.
- Bumped safe devDependencies: `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` to 8.60.0, `builtin-modules` to 5.2.0, `@types/node` to 22.19.19, `obsidian` to 1.13.0.

## 2026-05-31

### 0.6.0

- Added **Import task from Todoist link** experimental feature — use the command palette to paste any Todoist task URL, preview the fetched task (content, due date, labels, priority), and insert it into the current note already formatted for bidirectional sync. Addressing issue #52
- URL parser handles modern Todoist slugged URLs (e.g. `task-name-ID`), project-scoped URLs, and `todoist://` app URIs
- Duplicate guard: warns and aborts if the task is already present in the current file
- Fixed date/time formatting to correctly split Todoist v1 API `due.date` (which carries the full datetime string) into `📅YYYY-MM-DD` and `⏰HH:MM` with proper timezone handling via `Intl.DateTimeFormat`
- Added `CLAUDE.md` to the repository — documents architecture, data flow, and gotchas for AI-assisted development
- Fixed #54 — Priority tags (e.g. `!!2`) are now recognized anywhere in the task line, not only when placed before the `#tdsync` tag

## 2026-04-13

### 0.5.11

- Updated key packages dependencies
- Fixing bug #51
-

## 2026-02-16

### 0.5.10

- Fixed #42 - Plugin now supports "#project_name/sub_project_name" on the tag, so it will assign for the "sub_project_name" instead of "project_name"
- Fixed #46 - Plugin was fetching just the first 50 projects, now it should retrieve all projects
- Fixed #45 - On settings, you have a new option to "Remove file name from description". By default the plugin still includes, as an example, "file.md" as the description for any task created via the plugin

## 2025-06-29

### 0.5.9

- Wrapped the main onLoad sync with Obsidian's onLayoutReady to improve startup time

## 2025-05-24

### 0.5.7

- Fixed a bug when updating the ask duration
- Several changes on old comments and improvements in functions

## 2025-05-24

### 0.5.6

- Added support to deadline dates

## 2025-05-10

### 0.5.5

- 0.5.4 had some issues with REGEX (who doens't love REGEX, right?)

## 2025-05-10

### 0.5.4

- Improved the support for non-conventional date formats (It should accept YY-M-D instead of just YYYY-MM-DD)
- Improved a few of the console.warn and logs for better debugging

## 2025-04-26

### 0.5.3

- Fixed issue #19 where a task with only dueDate, when changed, was replaced by its date + 23:59.
- Cleaned up some more outdated comments and console.logs

## 2025-04-24

### 0.5.2

- Improvements on the debugMode feature

## 2025-04-20

### 0.5.1

- Added a new option called "Clean old plugin data" to remove from cache any projects, recommended for anyone coming from 0.4.x, sections and tasks using old ID and replacing for new. This prevents the plugin from keep looking for old tasks which will not have the Id anymore
- Improved error handling with projects names and ids

## 2025-04-19

### 0.5.0

- Fixed the issue #24
- Added support for Todoist's new API (Moved from the old Rest API and Sync API to the Unified API)
- Most of the app was rewritten, so this is still being tested.

## 2025-02-23

### 0.4.15

- More bug fixes on the sync from Todoist back to Obsidian #17
  Note: It should be mostly functional, but more testing is needed.

## 2025-02-21

### 0.4.14

- Fixed issues where Todoist data was not being updated because it had an error on todoistSyncAPI method
- Fixed issue #17

## 2025-02-15

### 0.4.13

- Added support for Project sync via `%%[p::]%%` syntax

## 2025-01-26

### 0.4.12

- Fix null due date by @AlicVB in #12

## 2024-12-27

### 0.4.11

- Added a manual sync option to the action menu
- Added a delay first sync option to the action menu

## 2024-12-09

### 0.4.10

- There was an issue with 0.4.9 on the fix for #8.

## 2024-12-08

### 0.4.9

- Included an options to change links to todoist URI instead of brower link
- Fixed #8 where "Check Database" added duplicated "link" to the tasks

## 2024-11-23

### 0.4.8

- Included the "Task Reoder" feature within the Experimental Features.

## 2024-11-17

### 0.4.7

- Tasks with modified sections are updated via SyncAPI now

## 2024-11-03

### 0.4.6

- Added a debounced call for saving settings for the custom synctag
- Added a debounced call for the Sync Interval on settings

## 2024-11-02

### 0.4.5

- Added a "checkForTasksWithoutLink" to avoid deleting tasks that don't have link yet on the syncModule.ts
- Updated readme to include instructions to install from within Obsidian

## 2024-10-24

### 0.4.4

- Added a "sleep" on the new task check to avoid deleting the task before is registerd. Still not the final solution, is has a bug still.

### 0.4.3

- Had to move back the "quick check for new tasks" as without it, breaks the logic for new tasks in some cases.

#### 0.4.2

- Fixed all errors to comply with the publishing guildeines [highlighted here](https://github.com/obsidianmd/obsidian-releases/pull/4302#issuecomment-2429959930)
- Fixed more errors on the main.ts file
- Fixed the sections with chinese characters
- Removed the quick check on new tasks, while makes things faster, also creates many events too fast.
- Review on the settings tab, moved some features for the "Experimental Features" section until I have better way to test those

### 2024-10-21

#### 0.4.1

- Updated the README with details about the section, changed the main GIF;
- Cleaned up more errors;

### 2024-10-20

#### 0.4.0

- Add support for sections when creating the task

### 2024-10-18

#### 0.3.3

- Change the request method to requestURL (following [this rec](https://github.com/obsidianmd/obsidian-releases/pull/4302#issuecomment-2387574679))
- Hunting down more lost console.logs
- Cleaned errors on todoistSyncAPI and syncModule.ts

### 2024-10-18

#### 0.3.2

- Fixed an issue with the `hasTodoistId` function where was failing.
- Fixed more errors on files, most of the taskParser.ts is done
- Removed most of the Console.log that were not behind the debugMode
-

### 2024-10-15

#### 0.3.1

- Removing a lot of unused code and fixing errors, mostly on taskParser.ts
- Fixed the issue#3 where a task without duedate, when received the date from Todoist, break

### 2024-10-14

#### 0.3.0

- Priority order now follows the same pattern as the Todoist UI (eg.: !!1 = p1, !!4 = p4)
- Removed a bunch of unused code, old comments
-

### 2024-10-12

#### 0.2.1

- Fixed the issue where tasks without dueTime would be 11:59

### 2024-10-08

#### 0.2.0

- Removed some references to the original Ultimate Todoist Sync plugin
- Added the duration via ⏳ or &MMmin syntax
- Enabled @ for due date and $ for due time via Alternative Keywords settings option
- Update task duration if is added after task is already created
- Cleaned up more unecessary console.logs

### 2024-10-04

#### 0.1.5

- Change the default tag to `#tdsync` instead of `#todoist` to avoid conflict for installation over the Ultimate Todoist Sync plugin
- Commented most of the console.log to check if is going to pass on the Obsidian's community plugin submit validation

### 2024-10-01

#### 0.1.4

- Added a new feature flag that hide experimental or in-development features
- Cleanup on the regex function of the taskParser file

### 2024-09-30

#### 0.1.3

- Encapsulated some console.log on debugMode settings
- Fix an issue with the regex to look for links
- Removed the "link" keyword to have only the link within the TID property tag
- Fixed the issue where the text replace was not considering the **tid_link**

### 2024-09-24

#### 0.1.2

- Create a quick script to generate build numbers automatically

### 2024-09-23

#### 0.1.0

- bumped to v0.1, ready enough to be published
- when a reminder time is provided with the wrong hour or minute (H > 24 or M >59), it defaults to 11:59

#### 0.1.2

- Moved the link from the REGEX list to the function
- Now the `tid` also includes the link to the task. Next step is to remove the `link` text without break anything
-

### 2024-09-22

#### 0.0.8

- Encapsulated most of console.log itens inside the debugMode settings

### 2024-09-21

#### 0.0.7

- Added opacity to the todoist_tag after the tag id
- Renamed the todoist_tag to tid (task_id) for short
- Moved all the REGEX tests on the taskParser to functions
- There was something odd on how it compare due dates, which was fixed.
- Add the check to compare due time (reminder)
-

#### 0.0.6

- Fixed the issue where time with a single digit breaks the replace logic

#### 0.0.5

- Added the "Comments Sync" option. Enabled by default, once disabled, won't add the notes/comments from Todoist below the task on Obsidian
-

### 2024-09-20

#### 0.0.4

- Fixed the issue with with duedatetime, now it should be able to handle tasks with time, but is an overall simple solutions, needs more refinement
- Fixed the issue where tags with underscore were wrong parsed by REGEX
-

### 2024-08-13

#### 0.0.2

- Added the due date parser

### 2024-06-19

#### 0.0.1

- Initial code cleanup
