import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PLUGIN_MANIFEST, REPO_ROOT, RESOURCE_PREFIX, requireEnv, todoistToken } from "./env";
import { reapStaleObsidian } from "./obsidian";
import { resolveObsidian } from "./obsidianInstall";
import { TodoistClient } from "./todoist";

export default async function globalSetup() {
	const runDir = process.env.E2E_RUN_DIR!;
	fs.mkdirSync(runDir, { recursive: true });

	const reaped = reapStaleObsidian();
	if (reaped) console.log(`[e2e] killed ${reaped} Obsidian process(es) left over from an interrupted run`);

	// 1. Account guard — the suite creates and deletes projects, so it must only
	//    ever run against the dedicated throwaway account.
	const todoist = new TodoistClient(todoistToken());
	const expected = requireEnv("TODOIST_E2E_EXPECTED_EMAIL").toLowerCase();
	const user = await todoist.getUser();
	if (user.email.toLowerCase() !== expected) {
		throw new Error(`TODOIST_E2E_TOKEN belongs to ${user.email}, but TODOIST_E2E_EXPECTED_EMAIL is ${expected}. Refusing to run.`);
	}

	// Todoist Pro features (durations, deadlines) are tested only on request, and
	// only against an account that actually has them.
	process.env.E2E_ACCOUNT_PREMIUM = user.is_premium ? "1" : "0";
	if (process.env.E2E_PREMIUM === "1" && !user.is_premium) {
		throw new Error("E2E_PREMIUM=1, but the Todoist account is not on a Pro plan. Upgrade it or unset E2E_PREMIUM.");
	}

	// 2. Remove leftovers from runs that crashed before their teardown.
	const swept = await todoist.sweep(RESOURCE_PREFIX);
	if (swept.projects || swept.labels) {
		console.log(`[e2e] swept ${swept.projects} stale project(s) and ${swept.labels} stale label(s)`);
	}

	// 3. Todoist→Obsidian sync reads /activities; record whether this account can.
	try {
		await todoist.getActivities();
		process.env.E2E_ACTIVITY_LOG = "ok";
	} catch (e) {
		process.env.E2E_ACTIVITY_LOG = String(e);
		console.warn(`[e2e] Activity log unavailable — Todoist→Obsidian tests will fail: ${String(e)}`);
	}

	// 4. Build the plugin exactly as it would ship (no version bump).
	if (!process.env.E2E_SKIP_BUILD) {
		execFileSync("node", ["npm_scripts/esbuild.config.mjs", "production"], { cwd: REPO_ROOT, stdio: "inherit" });
	}
	if (!fs.existsSync(path.join(REPO_ROOT, "main.js"))) throw new Error("main.js missing — build the plugin first");

	// 5. Resolve (and if needed download) the Obsidian version under test.
	const install = await resolveObsidian();
	process.env.E2E_OBSIDIAN_RESOLVED_VERSION = install.version;

	let gitSha = process.env.GITHUB_SHA?.slice(0, 7) ?? "";
	try {
		gitSha ||= execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
	} catch {
		/* not a git checkout */
	}
	process.env.E2E_GIT_SHA = gitSha;

	fs.writeFileSync(
		path.join(runDir, "run-info.json"),
		JSON.stringify(
			{
				runId: process.env.E2E_RUN_ID,
				pluginVersion: PLUGIN_MANIFEST.version,
				obsidianVersion: install.version,
				obsidianBinary: install.binary,
				gitSha,
				activityLog: process.env.E2E_ACTIVITY_LOG,
				accountPremium: process.env.E2E_ACCOUNT_PREMIUM === "1",
				premiumTests: process.env.E2E_PREMIUM === "1",
				startedAt: new Date().toISOString(),
			},
			null,
			2,
		),
	);
}
