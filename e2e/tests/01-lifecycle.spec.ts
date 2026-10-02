import fs from "node:fs";
import { PLUGIN_ID, todoistToken } from "../src/env";
import { expect, test } from "../src/fixtures";

test.describe("Suite 1 — Installation & Plugin Lifecycle", () => {
	test("plugin loads without console errors in a fresh vault @smoke", async ({ obsidian }) => {
		// Setup: seeded vault with a valid token. Action: launch (fixture).
		// Assert: plugin reports successful init and logged no errors of its own.
		await obsidian.waitForNotice(/Another Simple Todoist Sync loaded successfully/);
		const pluginErrors = obsidian.console.filter(
			(l) => (l.includes("[console.error]") || l.includes("[pageerror]")) && /todoist|another simple|plugin:another-simple-todoist-sync/i.test(l),
		);
		expect(pluginErrors, "plugin-related console errors during startup").toEqual([]);
		const settings = await obsidian.pluginSettings<{ apiInitialized: boolean }>();
		expect(settings.apiInitialized).toBe(true);
	});

	test.describe("settings UI", () => {
		test.use({ pluginSettings: { experimentalFeatures: false } });

		test("settings tab renders all documented fields @smoke", async ({ obsidian }) => {
			await obsidian.openPluginSettings();
			for (const name of ["Todoist API token", "Automatic sync interval time", "Default project", "Sync comments", "Experimental features"]) {
				await expect(obsidian.settingItem(name), `setting "${name}"`).toBeVisible();
			}
			// Experimental settings are hidden until the master toggle is on.
			await expect(obsidian.settingItem("Custom sync tag")).toBeHidden();
			await obsidian.setToggle("Experimental features", true);
			for (const name of [
				"Custom sync tag",
				"Delayed first sync",
				"Alternative keywords",
				"Obsidian Tasks integration",
				"Change URL to app URI",
				"Remove Obsidian file name from task description",
				"Full vault sync",
				"Import task from Todoist link",
				"Task ID metadata opacity",
				"Project from note frontmatter",
				"Add completion date",
			]) {
				await expect(obsidian.settingItem(name), `experimental setting "${name}"`).toBeVisible();
			}
			expect((await obsidian.pluginSettings<{ experimentalFeatures: boolean }>()).experimentalFeatures).toBe(true);
		});
	});

	test.describe("first-time setup", () => {
		test.use({ freshInstall: true, expectApiReady: false });

		test("valid API token entered in settings persists across an Obsidian restart", async ({ obsidian, relaunchObsidian }) => {
			await obsidian.waitForNotice(/Please enter your Todoist API/);
			await obsidian.openPluginSettings();
			const since = await obsidian.now();
			await obsidian.settingItem("Todoist API token").locator("input").fill(todoistToken());
			await obsidian.settingItem("Todoist API token").getByRole("button", { name: "Submit" }).click();
			await obsidian.waitForNotice(/loaded successfully/, { since, timeout: 60_000 });
			// First successful init backs up all Todoist data into the vault.
			await obsidian.waitForNotice(/Todoist backup data is saved/, { since });
			expect(fs.readdirSync(obsidian.vaultDir).filter((f) => f.startsWith("todoist-backup-"))).toHaveLength(1);
			await obsidian.closeModal();

			const again = await relaunchObsidian();
			await again.waitForPlugin({ apiReady: true });
			await again.openPluginSettings();
			await expect(again.settingItem("Todoist API token").locator("input")).toHaveValue(todoistToken());
			const settings = await again.pluginSettings<{ apiInitialized: boolean; initialized: boolean }>();
			expect(settings).toMatchObject({ apiInitialized: true, initialized: true });
			expect(
				fs.readdirSync(again.vaultDir).filter((f) => f.startsWith("todoist-backup-")),
				"backup is only written on the very first init",
			).toHaveLength(1);
		});

		test("invalid API token shows a visible error instead of failing silently", async ({ obsidian }) => {
			await obsidian.openPluginSettings();
			const since = await obsidian.now();
			await obsidian.settingItem("Todoist API token").locator("input").fill("e2e-invalid-token-0000000000000000");
			await obsidian.settingItem("Todoist API token").getByRole("button", { name: "Submit" }).click();
			await obsidian.waitForNotice(/initialization failed, please check the Todoist API/, { since, timeout: 60_000 });
			const settings = await obsidian.pluginSettings<{ apiInitialized: boolean }>();
			expect(settings.apiInitialized).toBe(false);
			// Obsidian and the plugin are still alive.
			expect(await obsidian.page.evaluate((id) => Boolean((window as any).app.plugins.plugins[id]), PLUGIN_ID)).toBe(true);
		});
	});
});
