# End-to-end tests

This suite runs the plugin inside **real Obsidian** against the **real Todoist API**. Playwright drives the Obsidian window: it types into notes, clicks checkboxes, and uses the command palette and the settings window. The Todoist API is then checked to confirm each sync really happened. Nothing is mocked.

It complements the Vitest unit tests at the repo root (`npm test`). Those check the parsing and payload logic; this suite checks the plugin as a user experiences it.

- [Safety: your own vaults and Todoist data](#safety)
- [One-time setup (Ubuntu)](#setup)
- [Environment variables](#environment-variables)
- [Running](#running)
- [Reading the results](#results)
- [How the harness works](#how-it-works)
- [Coverage and known gaps](#coverage)

<a id="safety"></a>
## Safety: your own vaults and Todoist data

- **Your Obsidian vaults are never opened.** Each test starts Obsidian with `XDG_CONFIG_HOME` pointed at a fresh folder under `e2e/.work/`. That folder's `obsidian.json` lists only one vault, which is generated for the test. The launcher refuses to start if the config dir or vault path resolves to anything outside `e2e/.work/`, or anywhere under `~/.config/obsidian`. The only thing it reads from your real config is an `obsidian-X.Y.Z.asar` app package, which it copies. It never writes there.
- **Test windows run alongside your own Obsidian.** Each test window is a separate Obsidian instance. Teardown kills only the process group the harness started itself. PIDs are recorded, so if a run is killed hard, the next run reaps the leftovers. Before killing anything, it checks that the process's config dir is inside `e2e/.work/`.
- **Only the dedicated Todoist account is touched.** The run refuses to start unless the token's account email equals `TODOIST_E2E_EXPECTED_EMAIL`. Everything the suite creates is named with an `e2e…` prefix and deleted in teardown, even when a test fails. At startup, the suite also deletes every `e2e*` project and label on that account, which clears leftovers from crashed runs. **Never point this at your real Todoist account.**

<a id="setup"></a>
## One-time setup (Ubuntu 22.04 / 24.04)

```bash
# 1. Node 22+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs

# 2. Obsidian (.deb). The installer version doesn't matter much: the Obsidian
#    version under test comes from the app package (see E2E_OBSIDIAN_VERSION).
wget https://github.com/obsidianmd/obsidian-releases/releases/download/v1.9.14/obsidian_1.9.14_amd64.deb
sudo apt-get install -y ./obsidian_1.9.14_amd64.deb

# 3. Virtual display for headless machines, plus fonts so emoji render in screenshots
sudo apt-get install -y xvfb fonts-noto-color-emoji

# 4. Dependencies (plugin build + harness)
npm ci              # repo root
npm ci --prefix e2e

# 5. Credentials
cp e2e/.env.example e2e/.env   # then fill in the two Todoist values

# 6. Smoke-check the machine (no Todoist needed)
cd e2e && xvfb-run -a npm run check:harness
```

**Todoist account.** Create a separate, free-to-throw-away account and copy its API token from Settings → Integrations → Developer. Todoist→Obsidian sync (Suite 3 and a few Suite 5/7 tests) reads the account's **activity log**, and task durations (`⏳`) and deadlines (`{{…}}`) are Todoist Pro features. By default the account can be on the free plan: the Pro tests are skipped, and free-plan tests check that the plugin warns the user instead. To test the Pro features, upgrade the account and set `E2E_PREMIUM=1`. If the activity log isn't available to the account, those tests fail with an explicit message. The run summary also records whether it was available.

<a id="environment-variables"></a>
## Environment variables

Put these in `e2e/.env` (gitignored). Real environment variables take precedence over `.env`.

| Variable | Required | Meaning |
|---|---|---|
| `TODOIST_E2E_TOKEN` | yes | API token of the throwaway Todoist account |
| `TODOIST_E2E_EXPECTED_EMAIL` | yes | That account's email. The run aborts if the token belongs to anyone else |
| `E2E_PREMIUM` | no | `1`: run the Todoist Pro tests (task duration, deadlines). The run aborts if the account isn't on Pro. Unset: they're skipped, and the free-plan warning tests run instead |
| `E2E_OBSIDIAN_VERSION` | no | Obsidian version to test, e.g. `1.13.7`. It's downloaded once into `e2e/.cache/`. If unset, the newest `obsidian-*.asar` in `e2e/.cache/` is used, then the newest in `~/.config/obsidian/` (copied, read-only). It must be ≥ the plugin's `minAppVersion` |
| `E2E_OBSIDIAN_ASAR` | no | Explicit path to an `obsidian-X.Y.Z.asar` |
| `E2E_OBSIDIAN_BIN` | no | Obsidian executable. Default: `/opt/Obsidian/obsidian`, then `which obsidian` |
| `E2E_SKIP_BUILD` | no | `1`: test the existing `main.js` instead of rebuilding |
| `E2E_KEEP_WORK` | no | `1`: keep each test's vault under `e2e/.work/` even when it passes. Failed tests' vaults are always kept |
| `E2E_RETRIES` | no | Retries per failed test (default 0). A test that passes on retry shows as ⚠️ FLAKY |
| `E2E_HISTORY_FILE` | no | Where to append the per-run history line. Default: `e2e/results/history.csv` |

The vault path is not configurable on purpose: every test builds its own vault under `e2e/.work/`.

<a id="running"></a>
## Running

All commands run from `e2e/`. On a desktop session the Obsidian windows appear on screen. Prefix a command with `xvfb-run -a` to keep them off-screen (and on machines without a display).

```bash
npm run test:e2e                       # full matrix (62 tests; estimated 45–70 min)
npm run test:smoke                     # @smoke subset (8 tests, ~5 min)
npx playwright test --grep "Suite 3"   # one suite
npx playwright test -g "priority"      # tests whose title matches
npm run check:harness                  # verify Obsidian automation works on this machine
npm run report                         # open the last HTML report

# as a release gate:
npm run test:e2e || echo "DO NOT RELEASE"
```

The run exits non-zero if any test fails, times out, or unexpectedly passes (see "known gaps" below).

<a id="results"></a>
## Reading the results

Every run writes to `e2e/results/<timestamp>-v<plugin version>/`. `e2e/results/latest` points at the newest run.

| File | What it is |
|---|---|
| `summary.md` | **Start here.** Pass/fail verdict, plugin and Obsidian versions, git commit, totals, and a table with Suite, Test, Status, Duration, and links to artifacts for each failure |
| `html/` | Playwright HTML report with attachments (`npm run report`) |
| `results.json` | Playwright JSON reporter output, for diffing between runs |
| `run-info.json` | Versions, binary path, and whether the activity log was available |
| `artifacts/<test>/` | For a failed test: `failure.png` (screenshot), `obsidian-console.log` (the Obsidian dev console with the plugin's Debug mode on), `evidence.json` (the last Todoist response or note content the assertion saw), `todoist-state.json` (tasks in the test's projects plus the last API requests), `vault-notes.json`, `plugin-settings.json` (token removed), `notices.json` |

`e2e/results/history.csv` gets one line per run: date, plugin version, Obsidian version, commit, pass/fail/known-gap/flaky/skip counts, and duration. Use it to spot a feature that started flaking across releases.

Status legend: ✅ PASS · ❌ FAIL · ⏱️ TIMEOUT · ⚠️ FLAKY (passed on retry) · ⏭️ SKIP · 🟡 KNOWN GAP · ❗ UNEXPECTED PASS.

**Known gaps** are matrix items the plugin doesn't implement yet. They're written as real tests marked `test.fail(...)` with the reason, so they count as expected failures and don't block a release. If one starts passing, the run reports ❗ UNEXPECTED PASS and fails: the feature now works, so remove the marker. Items with nothing concrete to assert, such as reminders, which have no markdown syntax, are `test.fixme` and show as skipped.

<a id="how-it-works"></a>
## How the harness works

```
tests/*.spec.ts          one suite per file; one Playwright test per matrix item
src/fixtures.ts          per-test Todoist sandbox + isolated vault + Obsidian session, teardown & failure artifacts
src/obsidian.ts          launches Obsidian (CDP), drives editor / palette / settings window, records notices
src/obsidianInstall.ts   picks the Obsidian binary and the app package (asar) under test
src/todoist.ts           Todoist API v1 client (fetch, retries on 429/5xx)
src/helpers.ts           waitFor / syncUntil polling, date helpers, tid parsing
src/globalSetup.ts       account guard, stale-resource sweep, activity-log probe, plugin build
src/summaryReporter.ts   summary.md, history.csv
harness-check/           Todoist-free self-test of the UI automation
```

For each test:

1. **Todoist sandbox.** A project named `e2e<random>_Main` is created, plus any extra projects or sections the test asks for, so they're already in the plugin's project cache at startup. Teardown deletes every project and label carrying that prefix, including ones the plugin created itself.
2. **Vault.** A fresh vault gets the freshly built `main.js`, `manifest.json` and `styles.css`, and a `data.json` seeded with the token, the sandbox as default project, Debug mode on, and a 3600s sync interval. Tests then trigger syncs explicitly with the plugin's own "Trigger the manual sync" command. Tests that need other settings override them, and the first-run tests start with no `data.json` at all.
3. **Obsidian** is started with `--remote-debugging-port`, and Playwright attaches over CDP. Playwright's Electron launcher can't attach to Obsidian's binary. The harness accepts the "Trust author and enable plugins" prompt, **restarts Obsidian once**, and waits for the plugin to report a successful Todoist init. The restart matters: on that first launch Obsidian opens a Settings window and the plugin loads while it's `activeDocument` (see known gaps). Tests should run against the normal startup a user has every day after that. One Suite 7 test sets `restartAfterTrust: false` on purpose to cover the first-session case.

**Timing.** Creating a task relies on the plugin's `editor-change` handler, which deliberately waits 10 seconds before it acts. Tests type the line, keep the caret on it the way a user would, and poll the note on disk until the `%%[tid:: …]%%` link appears, for up to 60s. Todoist→Obsidian changes are pulled by running the manual sync command repeatedly until the note changes (`syncUntil`), because the activity log lags a few seconds behind API writes. Only the sync-interval tests rely on the plugin's timer.

**What drives what.** Text reaches the editor as keystrokes (`keyboard.type`) or as a paste (`keyboard.insertText`). Lines are deleted with real Backspace presses, which fire the plugin's keyup handler. Checkboxes are clicked in Live Preview, and commands and settings go through the palette and the settings window. The harness calls Obsidian's own API from the page only for navigation and caret placement (opening a note, putting the cursor on a line, renaming a file) and for read-only inspection of plugin state.

**Obsidian quirks the harness handles (1.13.x):** Settings opens in its own window, not a modal. The first app hotkey after startup is swallowed until Escape has been pressed. `Control+P` must be sent as `Control+p`. Dropdowns have a hidden "is-measuring" twin `<select>`. Notices raised while Settings is focused render in the Settings window.

**Deviations from the original matrix, and why:**
- *Due time → `due.datetime`*: Todoist's v1 API has no `due.datetime`. The time is inside `due.date`, and tests compare the wall-clock time the user would see.
- *10s sync interval*: the settings UI rejects anything under 20s, so the interval tests use 20s.
- *Revoking the token mid-sync*: revoking the harness's real token would break the harness. The test swaps the plugin's in-memory token for a dead one, so every request still really goes to Todoist and is really rejected.
- *Full vault sync*: the untagged task arrives as an external edit to a note that isn't open (like Syncthing or git pull), because that's the path where the plugin tags and creates tasks automatically.

<a id="coverage"></a>
## Coverage and known gaps

Suites 1–6 implement the requested matrix one test per item. Suite 7 adds behaviour that's documented in the README or CLAUDE.md, or exposed in settings, but missing from the matrix: custom sync tag, `#Parent/Sub` project tags, frontmatter `project:`, completion date, sub-tasks, `todoist://` links, removing the backlink from descriptions, the Obsidian Tasks ordering option, and rename → description update.

Known gaps found while writing the suite (🟡 in reports):

| Test | Why it's expected to fail |
|---|---|
| Due date without time defaults to 08:00 | README claims it; the plugin sends only `due_date`, so Todoist creates an all-day task |
| Task created in Todoist appears in the vault | Todoist→Obsidian only updates tasks the vault already tracks |
| Changing the interval in settings takes effect without restart | `setInterval` is registered once in `onload` |
| Obsidian Tasks integration reorders tid before date | `addTodoistLink` checks `!this.plugin.taskParser?.hasTodoistLink` (a function reference, always truthy), so the branch never runs |
| Ticking a checkbox completes the task immediately (without a sync) | `checkboxEventHandler` matches ids with `/\[tid:: (\d+)\]/`, which can't match the `[tid:: [id](url)]` format or alphanumeric v1 ids; the change only reaches Todoist on the next sync |
| Keyboard deletion works in the session the plugin was enabled | the keyup/click listeners are registered on `activeDocument` at load; when the plugin loads while the Settings window is active (first launch after trusting the vault, and very likely when enabling it from Settings → Community plugins), they bind to the Settings window until Obsidian restarts |

Skipped (`test.fixme`): reminders in either direction, because the plugin has no reminder syntax or markdown representation to assert against.

Skipped unless `E2E_PREMIUM=1`: duration (`⏳`) and deadline (`{{…}}`) sync, and the duration half of the alternative-keywords test. On a free account the "free Todoist plan" tests run instead. They check that the task is still created and that the plugin shows a "requires a Todoist Pro plan" notice. Those tests are skipped when the account is on Pro.
