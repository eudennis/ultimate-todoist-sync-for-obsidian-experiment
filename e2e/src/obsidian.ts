import { type ChildProcess, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { type Browser, type Locator, type Page, chromium } from "@playwright/test";
import { PLUGIN_ID, REPO_ROOT, WORK_ROOT, assertIsolated } from "./env";
import type { ObsidianInstall } from "./obsidianInstall";

// Drives a real Obsidian process. Isolation guarantees (see README → "Safety"):
//   * XDG_CONFIG_HOME points at <workDir>/config, so Obsidian reads its vault
//     list, settings and localStorage from there — never ~/.config/obsidian.
//   * The only registered vault is <workDir>/vault, generated from scratch.
//   * assertIsolated() refuses any path outside the harness work dir.
//   * Only the process group this module spawned is ever killed.

export interface VaultSpec {
	/** Notes to create before launch: relative path → content. */
	notes?: Record<string, string>;
	/** Plugin data.json contents. `null` → no data.json (fresh install). */
	pluginData: Record<string, unknown> | null;
}

export interface NoticeRecord {
	t: number;
	text: string;
}

type ObsidianWindow = Window & {
	app: any; // eslint-disable-line @typescript-eslint/no-explicit-any
	__e2eNotices: NoticeRecord[];
};

export function buildVault(workDir: string, install: ObsidianInstall, spec: VaultSpec) {
	const vaultDir = path.join(workDir, "vault");
	const configRoot = path.join(workDir, "config");
	const obsidianConfig = path.join(configRoot, "obsidian");
	assertIsolated(vaultDir, "vault");
	assertIsolated(obsidianConfig, "Obsidian config dir");

	const pluginDir = path.join(vaultDir, ".obsidian", "plugins", PLUGIN_ID);
	fs.mkdirSync(pluginDir, { recursive: true });
	fs.mkdirSync(obsidianConfig, { recursive: true });

	for (const file of ["main.js", "manifest.json", "styles.css"]) {
		fs.copyFileSync(path.join(REPO_ROOT, file), path.join(pluginDir, file));
	}
	if (spec.pluginData) {
		fs.writeFileSync(path.join(pluginDir, "data.json"), JSON.stringify(spec.pluginData, null, "\t"));
	}
	fs.writeFileSync(path.join(vaultDir, ".obsidian", "community-plugins.json"), JSON.stringify([PLUGIN_ID]));
	// Typing through the harness must produce exactly the characters we send.
	fs.writeFileSync(
		path.join(vaultDir, ".obsidian", "app.json"),
		JSON.stringify({ autoPairBrackets: false, autoPairMarkdown: false, livePreview: true, promptDelete: false, spellcheck: false }),
	);
	for (const [rel, content] of Object.entries(spec.notes ?? {})) {
		const file = path.join(vaultDir, rel);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
	}

	// App package under test + a vault registry containing only our vault.
	fs.copyFileSync(install.asar, path.join(obsidianConfig, path.basename(install.asar)));
	const vaultId = crypto.randomBytes(8).toString("hex");
	fs.writeFileSync(
		path.join(obsidianConfig, "obsidian.json"),
		JSON.stringify({ vaults: { [vaultId]: { path: vaultDir, ts: Date.now(), open: true } }, updateDisabled: true }),
	);
	return { vaultDir, configRoot };
}

// ------------------------------------------------------------------ stale process safety net
// Fixture teardown normally closes Obsidian, but a killed worker (e.g. a hard
// timeout) can't run it. Every launch is recorded here and reapStaleObsidian()
// kills leftovers at the start of the next run — only after confirming the
// process is running with a config dir inside the harness work dir.

const PID_DIR = path.join(WORK_ROOT, "pids");

function registerPid(proc: ChildProcess) {
	if (proc.pid === undefined) return;
	fs.mkdirSync(PID_DIR, { recursive: true });
	fs.writeFileSync(path.join(PID_DIR, String(proc.pid)), "");
}

function unregisterPid(proc: ChildProcess) {
	if (proc.pid !== undefined) fs.rmSync(path.join(PID_DIR, String(proc.pid)), { force: true });
}

export function reapStaleObsidian(): number {
	if (!fs.existsSync(PID_DIR)) return 0;
	let reaped = 0;
	for (const entry of fs.readdirSync(PID_DIR)) {
		const pid = Number(entry);
		try {
			const env = fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
			const xdg = env.find((v) => v.startsWith("XDG_CONFIG_HOME="))?.slice("XDG_CONFIG_HOME=".length);
			if (xdg && path.resolve(xdg).startsWith(WORK_ROOT + path.sep)) {
				process.kill(-pid, "SIGKILL");
				reaped++;
			}
		} catch {
			/* process already gone (or not ours) */
		}
		fs.rmSync(path.join(PID_DIR, entry), { force: true });
	}
	return reaped;
}

/**
 * Runs in every Obsidian window (as an init script, and injected again after
 * connecting in case the window already existed). Obsidian shows a Notice in
 * whichever window is active, so every window records its own.
 */
function noticeRecorder() {
	const w = window as unknown as ObsidianWindow;
	if (w.__e2eNotices) return;
	w.__e2eNotices = [];
	const seen = new WeakSet<Element>();
	const scan = () => {
		for (const el of Array.from(document.querySelectorAll(".notice"))) {
			if (seen.has(el) || !el.textContent) continue;
			seen.add(el);
			w.__e2eNotices.push({ t: Date.now(), text: el.textContent });
		}
	};
	new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
	setInterval(scan, 100);
}

async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.listen(0, "127.0.0.1", () => {
			const port = (srv.address() as net.AddressInfo).port;
			srv.close(() => resolve(port));
		});
		srv.on("error", reject);
	});
}

export class ObsidianSession {
	readonly console: string[] = [];
	private exited = false;
	/**
	 * True when this launch had to accept "Trust author and enable plugins". On
	 * that first launch Obsidian 1.13 opens a Settings window and the plugin loads
	 * while that window is `activeDocument`, so its DOM listeners (keyup, click)
	 * bind to the Settings window. The fixture restarts Obsidian once to get the
	 * normal startup every user has after the first one.
	 */
	trustPromptAccepted = false;

	private constructor(
		readonly proc: ChildProcess,
		readonly browser: Browser,
		readonly page: Page,
		readonly vaultDir: string,
		private readonly logFile: string,
	) {
		proc.on("exit", () => {
			this.exited = true;
			unregisterPid(proc);
		});
	}

	static async launch(opts: { workDir: string; install: ObsidianInstall; logFile: string }): Promise<ObsidianSession> {
		const vaultDir = path.join(opts.workDir, "vault");
		const configRoot = path.join(opts.workDir, "config");
		assertIsolated(vaultDir, "vault");
		assertIsolated(path.join(configRoot, "obsidian"), "Obsidian config dir");

		const port = await freePort();
		const args = [`--remote-debugging-port=${port}`];
		if (process.getuid?.() === 0) args.push("--no-sandbox");
		const proc = spawn(opts.install.binary, args, {
			env: { ...process.env, XDG_CONFIG_HOME: configRoot },
			detached: true, // own process group → teardown can kill exactly this tree
			stdio: ["ignore", "pipe", "pipe"],
		});
		registerPid(proc);
		const log = (line: string) => fs.appendFileSync(opts.logFile, `${line}\n`);
		proc.stdout?.on("data", (d) => log(`[obsidian stdout] ${String(d).trimEnd()}`));
		proc.stderr?.on("data", (d) => log(`[obsidian stderr] ${String(d).trimEnd()}`));

		let browser: Browser | undefined;
		const deadline = Date.now() + 45_000;
		while (!browser) {
			if (proc.exitCode !== null) throw new Error(`Obsidian exited during startup (code ${proc.exitCode}); see ${opts.logFile}`);
			try {
				browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
			} catch (e) {
				if (Date.now() > deadline) {
					ObsidianSession.killGroup(proc);
					throw new Error(`Could not connect to Obsidian's DevTools port: ${String(e)}`);
				}
				// Poll fast: connecting before the window exists lets the init script
				// below catch the plugin's startup notices.
				await new Promise((r) => setTimeout(r, 100));
			}
		}
		await browser.contexts()[0]?.addInitScript(noticeRecorder);

		let page: Page | undefined;
		while (!page) {
			page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith("app://obsidian.md/index.html"));
			if (!page) {
				if (Date.now() > deadline) throw new Error("Obsidian main window never appeared");
				await new Promise((r) => setTimeout(r, 250));
			}
		}

		const session = new ObsidianSession(proc, browser, page, vaultDir, opts.logFile);
		page.on("console", (msg) => session.record(`[console.${msg.type()}] ${msg.text()}`));
		page.on("pageerror", (err) => session.record(`[pageerror] ${err.stack ?? err.message}`));
		// Log native dialogs instead of letting Playwright's default auto-dismiss race
		// them (it throws "No dialog is showing" when Obsidian closes one itself).
		page.on("dialog", (dialog) => {
			session.record(`[dialog.${dialog.type()}] ${dialog.message()}`);
			// beforeunload must be accepted or Obsidian's own reloads/quit get cancelled.
			(dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss()).catch(() => undefined);
		});
		await page.waitForFunction(() => document.body !== null);
		await session.installNoticeRecorder();
		session.trustPromptAccepted = await session.acceptVaultTrust();
		return session;
	}

	private record(line: string) {
		const stamped = `${new Date().toISOString()} ${line}`;
		this.console.push(stamped);
		fs.appendFileSync(this.logFile, `${stamped}\n`);
	}

	/** Remembers every Notice shown, since Obsidian removes them after a few seconds. */
	private async installNoticeRecorder(target: Page = this.page) {
		await target.evaluate(noticeRecorder);
	}

	/** First open of a vault that ships plugins shows "Do you trust the author of this vault?". */
	private async acceptVaultTrust(): Promise<boolean> {
		const trust = this.page.getByRole("button", { name: "Trust author and enable plugins" });
		const deadline = Date.now() + 30_000;
		while (Date.now() < deadline) {
			if (await trust.isVisible().catch(() => false)) {
				await trust.click();
				return true;
			}
			const pluginsOn = await this.page.evaluate((id) => Boolean((window as unknown as ObsidianWindow).app?.plugins?.plugins?.[id]), PLUGIN_ID);
			if (pluginsOn) return false; // relaunch of an already-trusted vault
			await this.page.waitForTimeout(250);
		}
		throw new Error("Neither the vault-trust prompt nor the plugin appeared within 30s");
	}

	/** Waits for the plugin to finish onLayoutReady; with `apiReady`, also for a successful Todoist init. */
	async waitForPlugin({ apiReady }: { apiReady: boolean }) {
		await this.page.waitForFunction(
			({ id, apiReady }) => {
				const plugin = (window as unknown as ObsidianWindow).app?.plugins?.plugins?.[id];
				if (!plugin?.settings) return false;
				return apiReady ? plugin.settings.apiInitialized === true && plugin.todoistSync !== undefined : true;
			},
			{ id: PLUGIN_ID, apiReady },
			{ timeout: 60_000 },
		);
	}

	/** Read-only view of the plugin's in-memory settings (for diagnostics and state assertions). */
	async pluginSettings<T = Record<string, unknown>>(): Promise<T> {
		return this.page.evaluate((id) => JSON.parse(JSON.stringify((window as unknown as ObsidianWindow).app.plugins.plugins[id].settings)), PLUGIN_ID);
	}

	// ---------------------------------------------------------------- notices

	/** Notices recorded in windows that have since closed (e.g. the Settings window). */
	private closedWindowNotices: NoticeRecord[] = [];

	async notices(): Promise<NoticeRecord[]> {
		const read = (p: Page) => p.evaluate(() => (window as unknown as ObsidianWindow).__e2eNotices ?? []).catch(() => [] as NoticeRecord[]);
		const all = [...this.closedWindowNotices, ...(await read(this.page))];
		if (this.settingsWindow && this.settingsWindow !== this.page) all.push(...(await read(this.settingsWindow)));
		return all.sort((a, b) => a.t - b.t);
	}

	async waitForNotice(pattern: RegExp, { since = 0, timeout = 30_000 } = {}): Promise<NoticeRecord> {
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			const hit = (await this.notices()).find((n) => n.t >= since && pattern.test(n.text));
			if (hit) return hit;
			await this.page.waitForTimeout(250);
		}
		const seen = (await this.notices()).filter((n) => n.t >= since).map((n) => n.text);
		throw new Error(`No notice matching ${pattern} within ${timeout}ms. Notices seen: ${JSON.stringify(seen)}`);
	}

	async now(): Promise<number> {
		return this.page.evaluate(() => Date.now());
	}

	// ---------------------------------------------------------------- notes & editor

	notePath(rel: string) {
		return path.join(this.vaultDir, rel);
	}

	/** Reads the note from disk (what Obsidian has saved), independently of the plugin. */
	readNote(rel: string): string {
		const file = this.notePath(rel);
		return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
	}

	/** Writes a note behind Obsidian's back, like a sync client (Syncthing, git pull) would. */
	writeNoteExternally(rel: string, content: string) {
		const file = this.notePath(rel);
		assertIsolated(file, "note");
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
	}

	listNotes(): string[] {
		const out: string[] = [];
		const walk = (dir: string) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				if (entry.name === ".obsidian") continue;
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) walk(full);
				else if (entry.name.endsWith(".md")) out.push(path.relative(this.vaultDir, full));
			}
		};
		walk(this.vaultDir);
		return out;
	}

	async openNote(rel: string) {
		await this.page.evaluate(async (p) => {
			const app = (window as unknown as ObsidianWindow).app;
			let file = app.vault.getAbstractFileByPath(p);
			if (!file) file = await app.vault.create(p, "");
			await app.workspace.getLeaf(false).openFile(file);
		}, rel);
		await this.page.waitForFunction((p) => (window as unknown as ObsidianWindow).app.workspace.activeEditor?.file?.path === p, rel);
		await this.focusEditor();
	}

	async focusEditor() {
		await this.page.evaluate(() => (window as unknown as ObsidianWindow).app.workspace.activeEditor?.editor?.focus());
	}

	/** Live editor buffer (may be ahead of disk by Obsidian's ~2s save debounce). */
	async editorText(): Promise<string> {
		return this.page.evaluate(() => (window as unknown as ObsidianWindow).app.workspace.activeEditor?.editor?.getValue() ?? "");
	}

	/** Places the caret at the end of the document, then inserts `text` on a new line as a paste would. */
	async appendLine(text: string, { typeSlowly = false } = {}) {
		// The line break itself goes through the editor API: a typed newline at the end
		// of a list item triggers Obsidian's list continuation, which would alter the text.
		await this.page.evaluate(() => {
			const editor = (window as unknown as ObsidianWindow).app.workspace.activeEditor.editor;
			editor.focus();
			let last = editor.lastLine();
			if (editor.getLine(last).length > 0) {
				editor.replaceRange("\n", { line: last, ch: editor.getLine(last).length });
				last += 1;
			}
			editor.setCursor({ line: last, ch: 0 });
		});
		if (typeSlowly) await this.page.keyboard.type(text, { delay: 30 });
		else await this.page.keyboard.insertText(text);
		await this.dismissSuggestions();
	}

	/** Index of the first line containing `needle`, or -1. */
	async findLine(needle: string): Promise<number> {
		return this.page.evaluate((n) => {
			const editor = (window as unknown as ObsidianWindow).app.workspace.activeEditor.editor;
			for (let i = 0; i <= editor.lastLine(); i++) if (editor.getLine(i).includes(n)) return i;
			return -1;
		}, needle);
	}

	/** Selects the whole line containing `needle` and types over it (keeps any trailing tid you include). */
	async replaceLine(needle: string, transform: (line: string) => string, { typeSlowly = false } = {}) {
		const original = await this.page.evaluate((n) => {
			const editor = (window as unknown as ObsidianWindow).app.workspace.activeEditor.editor;
			editor.focus();
			for (let i = 0; i <= editor.lastLine(); i++) {
				const line = editor.getLine(i);
				if (line.includes(n)) {
					editor.setSelection({ line: i, ch: 0 }, { line: i, ch: line.length });
					return line;
				}
			}
			return null;
		}, needle);
		if (original === null) throw new Error(`No editor line contains ${JSON.stringify(needle)}`);
		const next = transform(original);
		if (typeSlowly) await this.page.keyboard.type(next, { delay: 30 });
		else await this.page.keyboard.insertText(next);
		await this.dismissSuggestions();
		return { original, next };
	}

	/** Deletes the line containing `needle` with real Backspace key presses (fires the plugin's keyup handler). */
	async deleteLineWithKeyboard(needle: string) {
		const found = await this.page.evaluate((n) => {
			const editor = (window as unknown as ObsidianWindow).app.workspace.activeEditor.editor;
			editor.focus();
			for (let i = 0; i <= editor.lastLine(); i++) {
				const line = editor.getLine(i);
				if (line.includes(n)) {
					editor.setSelection({ line: i, ch: 0 }, { line: i, ch: line.length });
					return true;
				}
			}
			return false;
		}, needle);
		if (!found) throw new Error(`No editor line contains ${JSON.stringify(needle)}`);
		await this.page.keyboard.press("Backspace"); // clears the selected text
		await this.page.keyboard.press("Backspace"); // joins the now-empty line with the previous one
	}

	/** Moves the caret to another line with a real click, the way a user leaves a line. */
	async clickLine(needle: string) {
		const line = this.page.locator(".cm-line", { hasText: needle }).first();
		await line.click({ position: { x: 2, y: 5 } });
	}

	/** Clicks the Live Preview checkbox rendered for the line containing `needle`. */
	async clickCheckbox(needle: string) {
		await this.page.locator(".cm-line", { hasText: needle }).locator("input.task-list-item-checkbox").first().click();
	}

	private async dismissSuggestions() {
		if (await this.page.locator(".suggestion-container").isVisible().catch(() => false)) {
			await this.page.keyboard.press("Escape");
		}
	}

	// ---------------------------------------------------------------- commands & settings UI

	/** Runs a command through the real command palette (Ctrl+P). */
	async runCommand(name: string) {
		await this.focusEditor();
		const input = this.page.locator(".prompt input.prompt-input");
		await this.pressHotkey("Control+p", input);
		await input.fill(name);
		// 1.13 renders "<plugin>" and "<command>" as separate elements (no ": " in the text).
		const parts = name.split(": ");
		let item = this.page.locator(".prompt .suggestion-item");
		for (const part of parts) item = item.filter({ hasText: part });
		item = item.first();
		await item.waitFor({ timeout: 5_000 });
		await item.click();
	}

	/**
	 * Presses an app hotkey until `appears` is visible. Observed on Obsidian 1.13 over
	 * CDP: the first hotkey after startup is swallowed until an Escape has been pressed,
	 * so each attempt starts with Escape (a no-op in the editor). Keys are lowercase:
	 * "Control+P" is a different key event and Obsidian's hotkey matcher ignores it.
	 */
	private async pressHotkey(key: string, appears: Locator) {
		for (let attempt = 1; ; attempt++) {
			await this.page.keyboard.press("Escape");
			await this.page.keyboard.press(key);
			try {
				await appears.waitFor({ timeout: 2_000 });
				return;
			} catch (e) {
				if (attempt >= 3) throw new Error(`${key} did not open the expected UI after ${attempt} attempts: ${String(e)}`);
			}
		}
	}

	async triggerManualSync() {
		await this.runCommand("Another Simple Todoist Sync: Trigger the manual sync");
	}

	/** Settings window, while open. Obsidian 1.13 opens Settings in its own window. */
	private settingsWindow: Page | undefined;

	/** Opens Settings (via the palette) and selects this plugin's tab. */
	async openPluginSettings() {
		const before = new Set(this.browser.contexts().flatMap((c) => c.pages()));
		await this.runCommand("Open settings");
		const deadline = Date.now() + 10_000;
		let win: Page | undefined;
		while (!win) {
			win = this.browser
				.contexts()
				.flatMap((c) => c.pages())
				.find((p) => !before.has(p) && p !== this.page);
			if (!win) {
				// Older builds render Settings as a modal inside the main window.
				if (await this.page.locator(".modal .vertical-tab-nav-item").first().isVisible().catch(() => false)) {
					win = this.page;
					break;
				}
				if (Date.now() > deadline) throw new Error("Settings did not open (no new window, no modal)");
				await new Promise((r) => setTimeout(r, 200));
			}
		}
		this.settingsWindow = win;
		if (win !== this.page) {
			// Notices raised while Settings has focus render in the Settings window.
			await this.installNoticeRecorder(win);
			win.on("console", (msg) => this.record(`[settings console.${msg.type()}] ${msg.text()}`));
			win.on("pageerror", (err) => this.record(`[settings pageerror] ${err.stack ?? err.message}`));
		}
		const tab = win.locator(".vertical-tab-nav-item", { hasText: "Another Simple Todoist Sync" });
		await tab.click({ timeout: 10_000 });
		await win.locator(".vertical-tab-content .setting-item").first().waitFor({ timeout: 10_000 });
	}

	/** A row in the open Settings tab, by its exact name. */
	settingItem(name: string): Locator {
		const root = this.settingsWindow ?? this.page;
		const exact = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
		// Group headings are .setting-item too (e.g. the "Experimental features" group).
		return root.locator(".vertical-tab-content .setting-item:not(.setting-item-heading)").filter({ has: root.locator(".setting-item-name", { hasText: exact }) });
	}

	/** The visible <select> of a settings row (Obsidian keeps a hidden "is-measuring" twin). */
	settingDropdown(name: string): Locator {
		return this.settingItem(name).locator("select:not(.is-measuring)");
	}

	async setToggle(name: string, on: boolean) {
		const toggle = this.settingItem(name).locator(".checkbox-container");
		const isOn = await toggle.evaluate((el) => el.classList.contains("is-enabled"));
		if (isOn !== on) await toggle.click();
	}

	/** Closes Settings if open, otherwise the topmost modal in the main window. */
	async closeModal() {
		const win = this.settingsWindow;
		this.settingsWindow = undefined;
		if (win && win !== this.page) {
			this.closedWindowNotices.push(
				...(await win.evaluate(() => (window as unknown as ObsidianWindow).__e2eNotices ?? []).catch(() => [] as NoticeRecord[])),
			);
			await win.keyboard.press("Escape").catch(() => undefined);
			await win.waitForEvent("close", { timeout: 5_000 }).catch(() => win.close().catch(() => undefined));
			await this.focusEditor();
			return;
		}
		await this.page.keyboard.press("Escape");
		await this.page.locator(".modal-container").waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
	}

	// ---------------------------------------------------------------- lifecycle

	async screenshot(file: string) {
		await this.page.screenshot({ path: file });
	}

	async close() {
		if (this.exited) return;
		try {
			// Closing the only window quits Obsidian on Linux and runs plugin onunload.
			await this.page.evaluate(() => window.close()).catch(() => undefined);
			const deadline = Date.now() + 15_000;
			while (!this.exited && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
		} finally {
			await this.browser.close().catch(() => undefined);
			if (!this.exited) ObsidianSession.killGroup(this.proc);
		}
	}

	private static killGroup(proc: ChildProcess) {
		if (proc.pid === undefined || proc.exitCode !== null) return;
		try {
			process.kill(-proc.pid, "SIGKILL"); // negative pid = the group we spawned, nothing else
		} catch {
			/* already gone */
		}
	}
}
