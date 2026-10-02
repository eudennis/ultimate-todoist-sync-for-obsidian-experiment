import path from "node:path";
import { defineConfig } from "@playwright/test";
import { E2E_ROOT, PLUGIN_MANIFEST } from "./src/env";

// One results folder per run: results/<timestamp>-v<plugin version>/.
// Set once in the runner process; workers inherit it through the environment.
if (!process.env.E2E_RUN_ID) {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	process.env.E2E_RUN_ID = `${stamp}-v${PLUGIN_MANIFEST.version}`;
}
const runDir = (process.env.E2E_RUN_DIR ??= path.join(E2E_ROOT, "results", process.env.E2E_RUN_ID));

export default defineConfig({
	testDir: "./tests",
	// A single Todoist account is shared by every test (and the plugin reads the
	// account-wide activity log), so tests run strictly one at a time.
	workers: 1,
	fullyParallel: false,
	retries: Number(process.env.E2E_RETRIES ?? 0),
	timeout: 5 * 60_000,
	expect: { timeout: 15_000 },
	outputDir: path.join(runDir, "artifacts"),
	globalSetup: "./src/globalSetup.ts",
	reporter: [
		["list"],
		["json", { outputFile: path.join(runDir, "results.json") }],
		["html", { outputFolder: path.join(runDir, "html"), open: "never" }],
		["./src/summaryReporter.ts"],
	],
});
