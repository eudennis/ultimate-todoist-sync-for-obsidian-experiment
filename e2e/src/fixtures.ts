import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test as base } from "@playwright/test";
import { RESOURCE_PREFIX, WORK_ROOT, redactSecrets, requireEnv, todoistToken } from "./env";
import { evidence, waitForTaskId } from "./helpers";
import { ObsidianSession, buildVault } from "./obsidian";
import { type ObsidianInstall, resolveObsidian } from "./obsidianInstall";
import { TodoistClient, type TodoistProject, type TodoistSection } from "./todoist";

export { expect } from "@playwright/test";

/** Per-test Todoist sandbox. Everything in it is deleted in teardown, pass or fail. */
export interface TodoistSandbox {
	/** Unique token for this test, e.g. "e2ek3x9a1"; prefixes every resource name. */
	tok: string;
	/** Name helper: `${tok}_${suffix}` — tag-safe, so it can double as a #ProjectName. */
	name(suffix: string): string;
	/** The test's default project (`${tok}_Main`), pre-selected in the plugin settings. */
	project: TodoistProject;
	/** Extra projects requested via the `extraProjects` option, keyed by suffix. */
	projects: Record<string, TodoistProject>;
	/** Sections requested via the `sections` option (created in `project`), keyed by suffix. */
	sections: Record<string, TodoistSection>;
}

interface Options {
	/** Overrides merged over the seeded plugin data.json. */
	pluginSettings: Record<string, unknown>;
	/** true → no data.json at all, as after installing the plugin from the community store. */
	freshInstall: boolean;
	/** Wait for a successful Todoist init before the test starts. */
	expectApiReady: boolean;
	/** Notes created before launch. */
	notes: Record<string, string>;
	/** Note opened in the editor once the plugin is ready (null → none). */
	initialNote: string | null;
	/** Project suffixes created before Obsidian starts, so they are in the plugin's project cache. */
	extraProjects: string[];
	/** Section suffixes created in the main project before Obsidian starts. */
	sections: string[];
	/**
	 * Restart Obsidian once after accepting the vault-trust prompt (default), so the
	 * test runs against a normal startup. See ObsidianSession.trustPromptAccepted.
	 */
	restartAfterTrust: boolean;
}

interface Fixtures {
	sandbox: TodoistSandbox;
	obsidian: ObsidianSession;
	/** Closes Obsidian gracefully and starts it again on the same vault + config dir. */
	relaunchObsidian: () => Promise<ObsidianSession>;
	workDir: string;
}

interface WorkerFixtures {
	install: ObsidianInstall;
	todoist: TodoistClient;
}

const DEFAULT_NOTES = { "Tasks.md": "# E2E tasks\n" };

export const test = base.extend<Options & Fixtures, WorkerFixtures>({
	pluginSettings: [{}, { option: true }],
	freshInstall: [false, { option: true }],
	expectApiReady: [true, { option: true }],
	notes: [DEFAULT_NOTES, { option: true }],
	initialNote: ["Tasks.md", { option: true }],
	extraProjects: [[], { option: true }],
	sections: [[], { option: true }],
	restartAfterTrust: [true, { option: true }],

	install: [async ({}, use) => use(await resolveObsidian()), { scope: "worker" }],

	todoist: [
		async ({}, use) => {
			const client = new TodoistClient(todoistToken());
			// Belt and braces: global setup already checked this, but never touch an unexpected account.
			const user = await client.getUser();
			if (user.email.toLowerCase() !== requireEnv("TODOIST_E2E_EXPECTED_EMAIL").toLowerCase()) {
				throw new Error(`Todoist token belongs to ${user.email}, not TODOIST_E2E_EXPECTED_EMAIL. Refusing to run.`);
			}
			await use(client);
		},
		{ scope: "worker" },
	],

	workDir: async ({}, use, testInfo) => {
		const runId = process.env.E2E_RUN_ID ?? "adhoc";
		const slug = `${testInfo.titlePath.slice(1).join("-")}`.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 80);
		const dir = path.join(WORK_ROOT, runId, `${slug}-${testInfo.retry}`);
		fs.rmSync(dir, { recursive: true, force: true });
		fs.mkdirSync(dir, { recursive: true });
		await use(dir);
		const passed = testInfo.status === testInfo.expectedStatus;
		if (passed && !process.env.E2E_KEEP_WORK) fs.rmSync(dir, { recursive: true, force: true });
	},

	sandbox: async ({ todoist, extraProjects, sections }, use, testInfo) => {
		evidence.clear();
		const tok = `${RESOURCE_PREFIX}${crypto.randomBytes(4).toString("hex").slice(0, 6)}`;
		const name = (suffix: string) => `${tok}_${suffix}`;
		try {
			const project = await todoist.createProject(name("Main"));
			const projects: Record<string, TodoistProject> = {};
			for (const suffix of extraProjects) projects[suffix] = await todoist.createProject(name(suffix));
			const sectionMap: Record<string, TodoistSection> = {};
			for (const suffix of sections) sectionMap[suffix] = await todoist.createSection(name(suffix), project.id);
			await use({ tok, name, project, projects, sections: sectionMap });
		} finally {
			// Runs on pass, fail and timeout. Also catches projects the plugin created
			// itself (e.g. from %%[p::...]%%), since they carry the same token.
			try {
				await todoist.sweep(tok);
			} catch (e) {
				testInfo.annotations.push({ type: "cleanup-error", description: String(e) });
			}
		}
	},

	// Depends on `obsidian` so the first session exists (and is torn down after this).
	relaunchObsidian: async ({ obsidian: _first, workDir, install, expectApiReady }, use, testInfo) => {
		await use(async () => {
			const holder = sessions.get(testInfo.testId)!;
			await holder.current.close();
			holder.current = await ObsidianSession.launch({ workDir, install, logFile: holder.logFile });
			await holder.current.waitForPlugin({ apiReady: expectApiReady });
			return holder.current;
		});
	},

	obsidian: async (
		{ sandbox, workDir, install, pluginSettings, freshInstall, expectApiReady, notes, initialNote, restartAfterTrust, todoist },
		use,
		testInfo,
	) => {
		const pluginData = freshInstall
			? null
			: {
					todoistAPIToken: todoistToken(),
					defaultProjectId: sandbox.project.id,
					defaultProjectName: sandbox.project.name,
					initialized: true, // skip the first-run backup file except in the lifecycle tests
					automaticSynchronizationInterval: 3600, // tests drive syncs explicitly unless they opt in
					debugMode: true,
					...pluginSettings,
				};
		buildVault(workDir, install, { notes, pluginData });

		const logFile = path.join(testInfo.outputDir, "obsidian-console.log");
		fs.mkdirSync(testInfo.outputDir, { recursive: true });
		const holder = { current: await ObsidianSession.launch({ workDir, install, logFile }), logFile };
		sessions.set(testInfo.testId, holder);
		try {
			if (holder.current.trustPromptAccepted && restartAfterTrust) {
				await holder.current.waitForPlugin({ apiReady: false });
				await holder.current.page.waitForTimeout(2_000); // let the first init finish writing data.json
				await holder.current.close();
				fs.appendFileSync(logFile, "---- restarting Obsidian after accepting the vault-trust prompt ----\n");
				holder.current = await ObsidianSession.launch({ workDir, install, logFile });
			}
			await holder.current.waitForPlugin({ apiReady: expectApiReady });
			if (initialNote && notes[initialNote] !== undefined) await holder.current.openNote(initialNote);
			await use(holder.current);
		} finally {
			const session = holder.current;
			if (testInfo.status !== testInfo.expectedStatus) {
				await captureFailure(session, testInfo.outputDir, todoist, sandbox, testInfo).catch((e) =>
					testInfo.annotations.push({ type: "artifact-error", description: String(e) }),
				);
			}
			if (fs.existsSync(logFile)) fs.writeFileSync(logFile, redactSecrets(fs.readFileSync(logFile, "utf8")));
			await testInfo.attach("obsidian-console.log", { path: logFile, contentType: "text/plain" }).catch(() => undefined);
			await session.close();
			sessions.delete(testInfo.testId);
		}
	},
});

const sessions = new Map<string, { current: ObsidianSession; logFile: string }>();

async function captureFailure(
	session: ObsidianSession,
	outDir: string,
	todoist: TodoistClient,
	sandbox: TodoistSandbox,
	testInfo: import("@playwright/test").TestInfo,
) {
	const shot = path.join(outDir, "failure.png");
	await session.screenshot(shot).then(() => testInfo.attach("screenshot", { path: shot, contentType: "image/png" }));

	const writeJson = async (name: string, data: unknown) => {
		const file = path.join(outDir, name);
		fs.writeFileSync(file, redactSecrets(JSON.stringify(data, null, 2)));
		await testInfo.attach(name, { path: file, contentType: "application/json" });
	};

	// The evidence first: what the failing assertion last saw.
	await writeJson("evidence.json", Object.fromEntries(evidence));

	const vault: Record<string, string> = {};
	for (const note of session.listNotes()) vault[note] = session.readNote(note);
	vault["<editor buffer>"] = await session.editorText().catch(() => "<unavailable>");
	await writeJson("vault-notes.json", vault);

	const settings: Record<string, unknown> = await session.pluginSettings().catch(() => ({}));
	delete settings.todoistAPIToken;
	await writeJson("plugin-settings.json", settings);

	await writeJson("notices.json", await session.notices().catch(() => []));

	const tasks: Record<string, unknown> = {};
	for (const project of (await todoist.listProjects()).filter((p) => p.name.startsWith(sandbox.tok))) {
		tasks[`${project.name} (${project.id})`] = await todoist.listTasks(project.id);
	}
	await writeJson("todoist-state.json", { tasks, recentRequests: todoist.log.slice(-20) });
}

// ------------------------------------------------------------------ line builders

/** `- [ ] <content> <parts…> #tdsync` */
export function taskLine(content: string, ...parts: string[]) {
	return ["- [ ]", content, ...parts, "#tdsync"].join(" ");
}

/**
 * Types a task line into the open note the way a user would (caret stays on
 * the line) and waits for the plugin to create it in Todoist and write back
 * the tid link. Returns the Todoist task id.
 */
export async function createTaskFromObsidian(obsidian: ObsidianSession, note: string, line: string, needle: string) {
	await obsidian.appendLine(line);
	return waitForTaskId(obsidian, note, needle);
}

/**
 * Skips a test of a Todoist Pro feature (task duration, deadlines) unless the
 * run opted in with E2E_PREMIUM=1 — global setup then guarantees a Pro account.
 */
export function requirePremium() {
	test.skip(process.env.E2E_PREMIUM !== "1", "Todoist Pro feature — set E2E_PREMIUM=1 (needs a Pro account) to test it");
}

/** Skips a test of the plugin's free-plan fallback when the account is on Todoist Pro. */
export function requireFreePlan() {
	test.skip(process.env.E2E_ACCOUNT_PREMIUM === "1", "Free-plan behaviour — the Todoist account is on a Pro plan");
}

/** Todoist→Obsidian sync depends on the account's activity log (checked in global setup). */
export function requireActivityLog() {
	if (process.env.E2E_ACTIVITY_LOG !== "ok") {
		throw new Error(
			`Todoist activity log is not accessible for this account (${process.env.E2E_ACTIVITY_LOG ?? "not checked"}). ` +
				"The plugin's Todoist→Obsidian sync cannot work without it — see README → Todoist account.",
		);
	}
}
