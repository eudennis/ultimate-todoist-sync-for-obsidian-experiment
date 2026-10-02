import { createTaskFromObsidian, expect, requireActivityLog, taskLine, test } from "../src/fixtures";
import { lineContaining, waitFor } from "../src/helpers";

const NOTE = "Tasks.md";
const INTERVAL_S = 20; // the settings UI rejects anything below 20s

test.describe("Suite 5 — Settings Behavior", () => {
	test.describe("sync interval (seeded before start)", () => {
		test.use({ pluginSettings: { automaticSynchronizationInterval: INTERVAL_S } });

		test("automatic sync runs on the configured interval and not earlier", async ({ obsidian, sandbox, todoist }) => {
			requireActivityLog();
			// No manual syncs here: every change below can only reach the note through the timer.
			const content = `${sandbox.tok} interval probe`;
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
			const lineOf = () => lineContaining(obsidian.readNote(NOTE), id) ?? "";
			const window = { timeout: (2 * INTERVAL_S + 30) * 1000, interval: 250 };

			await todoist.closeTask(id);
			await waitFor("timer sync ticks the checkbox", lineOf, (l) => l.startsWith("- [x] "), window);
			const firstTick = Date.now();

			await todoist.reopenTask(id);
			await waitFor("timer sync unticks the checkbox", lineOf, (l) => l.startsWith("- [ ] "), window);
			const gapS = (Date.now() - firstTick) / 1000;

			// The two observations came from two different timer ticks, so they must be
			// at least one interval apart (small tolerance for polling granularity).
			expect(gapS, "seconds between two automatic syncs").toBeGreaterThanOrEqual(INTERVAL_S * 0.8);
			expect(gapS).toBeLessThanOrEqual(2 * INTERVAL_S + 30);
		});
	});

	test("changing the interval in settings takes effect without a restart", async ({ obsidian, sandbox, todoist }) => {
		test.fail(true, "main.ts registers setInterval once in onload; a changed interval only applies after reloading the plugin");
		requireActivityLog();
		const content = `${sandbox.tok} interval change`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);

		await obsidian.openPluginSettings();
		const since = await obsidian.now();
		await obsidian.settingItem("Automatic sync interval time").locator("input").fill(String(INTERVAL_S));
		await obsidian.waitForNotice(/Settings have been updated/, { since });
		await obsidian.closeModal();
		expect((await obsidian.pluginSettings<{ automaticSynchronizationInterval: number }>()).automaticSynchronizationInterval).toBe(INTERVAL_S);

		await todoist.closeTask(id); // seeded interval is 3600s, so only the new interval can deliver this
		await waitFor("timer sync ticks the checkbox", () => lineContaining(obsidian.readNote(NOTE), id) ?? "", (l) => l.startsWith("- [x] "), {
			timeout: (2 * INTERVAL_S + 30) * 1000,
			interval: 500,
		});
	});

	test.describe("default project", () => {
		test.use({ extraProjects: ["Other"] });

		test("changing the default project in settings routes new tasks there", async ({ obsidian, sandbox, todoist }) => {
			const other = sandbox.projects.Other;
			await obsidian.openPluginSettings();
			await obsidian.settingDropdown("Default project").selectOption(other.id);
			await obsidian.closeModal();
			expect((await obsidian.pluginSettings<{ defaultProjectId: string }>()).defaultProjectId).toBe(other.id);

			await obsidian.openNote(NOTE);
			const content = `${sandbox.tok} goes to other`;
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
			expect((await todoist.getTask(id))!.project_id).toBe(other.id);
		});
	});

	test.describe("per-file default project", () => {
		test.use({ extraProjects: ["FileProj"], notes: { "Tasks.md": "# E2E tasks\n", "Other.md": "# Other note\n" } });

		test("per-file default overrides the global default only in that file", async ({ obsidian, sandbox, todoist }) => {
			const fileProj = sandbox.projects.FileProj;
			await obsidian.runCommand("Another Simple Todoist Sync: Set default project for Todoist task in the current file");
			const modal = obsidian.page.locator(".modal", { hasText: "Set default project for the current file" });
			await modal.locator("select:not(.is-measuring)").selectOption(fileProj.id);
			await expect(modal).toBeHidden();

			const inFile = `${sandbox.tok} per file project`;
			const id1 = await createTaskFromObsidian(obsidian, NOTE, taskLine(inFile), inFile);
			expect((await todoist.getTask(id1))!.project_id).toBe(fileProj.id);

			await obsidian.openNote("Other.md");
			const elsewhere = `${sandbox.tok} global default project`;
			const id2 = await createTaskFromObsidian(obsidian, "Other.md", taskLine(elsewhere), elsewhere);
			expect((await todoist.getTask(id2))!.project_id).toBe(sandbox.project.id);
		});
	});
});
