import path from "node:path";
import { defineConfig } from "@playwright/test";

// Checks that this machine can run the E2E suite (Obsidian installed, display
// available, UI automation working) without touching Todoist. Run it first when
// setting up a new runner: `npm run check:harness`.
export default defineConfig({
	testDir: ".",
	workers: 1,
	timeout: 3 * 60_000,
	reporter: "list",
	outputDir: path.join(__dirname, "..", "results", "harness-check"),
});
