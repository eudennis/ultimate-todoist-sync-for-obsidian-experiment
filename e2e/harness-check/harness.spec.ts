import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { WORK_ROOT } from "../src/env";
import { ObsidianSession, buildVault, reapStaleObsidian } from "../src/obsidian";
import { resolveObsidian } from "../src/obsidianInstall";

// No Todoist token here: the plugin starts uninitialised, which is enough to
// exercise every UI primitive the real suites depend on.
test("harness can drive Obsidian", async () => {
	reapStaleObsidian();
	const install = await resolveObsidian();
	const workDir = path.join(WORK_ROOT, "harness-check");
	fs.rmSync(workDir, { recursive: true, force: true });
	buildVault(workDir, install, {
		notes: { "Tasks.md": "# E2E tasks\n", "Other.md": "other\n" },
		pluginData: { debugMode: true, experimentalFeatures: false },
	});
	const obsidian = await ObsidianSession.launch({ workDir, install, logFile: path.join(workDir, "console.log") });
	try {
		await obsidian.waitForPlugin({ apiReady: false });
		await obsidian.waitForNotice(/Please enter your Todoist API/);

		await test.step("typing and editing lines", async () => {
			await obsidian.openNote("Tasks.md");
			await obsidian.appendLine("- [ ] hello 📅2026-10-01 ⏰14:30 {{2026-12-01}} %%[p::X]%% #tdsync");
			await obsidian.appendLine("\t- [ ] child #tdsync");
			expect(await obsidian.editorText()).toBe(
				"# E2E tasks\n- [ ] hello 📅2026-10-01 ⏰14:30 {{2026-12-01}} %%[p::X]%% #tdsync\n\t- [ ] child #tdsync",
			);
			await obsidian.replaceLine("hello", (l) => l.replace("hello", "bye"));
			await obsidian.appendLine("- [ ] slow #tdsync", { typeSlowly: true });
			expect(await obsidian.editorText()).toContain("\n- [ ] slow #tdsync");
			await obsidian.deleteLineWithKeyboard("slow");
			expect(await obsidian.editorText()).not.toContain("slow");
		});

		await test.step("Live Preview checkbox", async () => {
			await obsidian.clickLine("E2E tasks");
			await obsidian.clickCheckbox("bye");
			await expect.poll(async () => (await obsidian.editorText()).split("\n")[1]).toMatch(/^- \[x\] bye/);
		});

		await test.step("command palette + plugin command", async () => {
			const since = await obsidian.now();
			await obsidian.triggerManualSync();
			await obsidian.waitForNotice(/Please set the Todoist API first|correct Todoist API token/, { since });
			await obsidian.runCommand("Another Simple Todoist Sync: Set default project for Todoist task in the current file");
			const modal = obsidian.page.locator(".modal", { hasText: "Set default project for the current file" });
			await expect(modal).toBeVisible();
			await obsidian.closeModal();
			await expect(modal).toBeHidden();
		});

		await test.step("settings window", async () => {
			await obsidian.openPluginSettings();
			await expect(obsidian.settingItem("Todoist API token")).toBeVisible();
			await expect(obsidian.settingItem("Custom sync tag")).toBeHidden();
			await obsidian.setToggle("Experimental features", true);
			await expect(obsidian.settingItem("Full vault sync")).toBeVisible();
			await expect(obsidian.settingDropdown("Default project")).toBeVisible();
			await obsidian.closeModal();
		});

		await test.step("saving to disk and external edits", async () => {
			await expect.poll(() => obsidian.readNote("Tasks.md"), { timeout: 10_000 }).toContain("- [x] bye");
			obsidian.writeNoteExternally("Other.md", "changed externally\n");
			await obsidian.openNote("Other.md");
			await expect.poll(() => obsidian.editorText()).toBe("changed externally\n");
		});
	} finally {
		await obsidian.close();
	}
	expect(obsidian.proc.exitCode !== null || obsidian.proc.signalCode !== null, "Obsidian process exited").toBe(true);
	fs.rmSync(workDir, { recursive: true, force: true });
});
