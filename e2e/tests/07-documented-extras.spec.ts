import { createTaskFromObsidian, expect, requireActivityLog, taskLine, test } from "../src/fixtures";
import { isoDate, lineContaining, syncUntil, waitFor } from "../src/helpers";

// Behaviour documented in README/CLAUDE.md or exposed in settings that the
// original test matrix did not list (added per the matrix's review note).

const NOTE = "Tasks.md";

test.describe("Suite 7 — Documented features not in the original matrix", () => {
	test.describe("custom sync tag", () => {
		test.use({ pluginSettings: { experimentalFeatures: true, customSyncTag: "#e2esync" } });

		test("custom sync tag replaces #tdsync as the sync trigger", async ({ obsidian, sandbox, todoist }) => {
			const content = `${sandbox.tok} custom tag`;
			const id = await createTaskFromObsidian(obsidian, NOTE, `- [ ] ${content} #e2esync`, content);
			expect((await todoist.getTask(id))!.content).toBe(content);

			const ignored = `${sandbox.tok} old tag ignored`;
			await obsidian.appendLine(taskLine(ignored)); // uses #tdsync
			await obsidian.page.waitForTimeout(20_000);
			expect(lineContaining(obsidian.readNote(NOTE), ignored)).not.toContain("[tid::");
		});
	});

	test.describe("sub-project tag", () => {
		test.use({ extraProjects: ["Sub"] });

		test("#Parent/SubProject matches the project named SubProject", async ({ obsidian, sandbox, todoist }) => {
			const content = `${sandbox.tok} nested tag`;
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `#${sandbox.tok}Area/${sandbox.projects.Sub.name}`), content);
			expect((await todoist.getTask(id))!.project_id).toBe(sandbox.projects.Sub.id);
		});
	});

	test.describe("frontmatter project", () => {
		test.use({ extraProjects: ["FM"], pluginSettings: { experimentalFeatures: true, enableFrontmatterProject: true } });

		test("`project:` in the note's frontmatter is used when the line names no project", async ({ obsidian, sandbox, todoist }) => {
			obsidian.writeNoteExternally("FM.md", `---\nproject: ${sandbox.projects.FM.name}\n---\n# Frontmatter note\n`);
			await obsidian.openNote("FM.md");
			await obsidian.page.waitForFunction(
				() => (window as any).app.metadataCache.getFileCache((window as any).app.vault.getAbstractFileByPath("FM.md"))?.frontmatter?.project,
			);
			const content = `${sandbox.tok} frontmatter project`;
			const id = await createTaskFromObsidian(obsidian, "FM.md", taskLine(content), content);
			expect((await todoist.getTask(id))!.project_id).toBe(sandbox.projects.FM.id);
		});
	});

	test.describe("completion date", () => {
		test.use({ pluginSettings: { experimentalFeatures: true, enableCompletionDate: true } });

		test("completing in Todoist adds ✅ YYYY-MM-DD to the line", async ({ obsidian, sandbox, todoist }) => {
			requireActivityLog();
			const content = `${sandbox.tok} completion date`;
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
			await todoist.closeTask(id);
			await syncUntil(obsidian, "✅ date appended", () => lineContaining(obsidian.readNote(NOTE), id) ?? "", (l) =>
				/^- \[x\] .* ✅ \d{4}-\d{2}-\d{2}$/.test(l),
			);
		});
	});

	test("tab-indented task under a synced task becomes a Todoist sub-task", async ({ obsidian, sandbox, todoist }) => {
		const parent = `${sandbox.tok} parent`;
		const child = `${sandbox.tok} child`;
		const parentId = await createTaskFromObsidian(obsidian, NOTE, taskLine(parent), parent);
		const childId = await createTaskFromObsidian(obsidian, NOTE, `\t${taskLine(child)}`, child);
		expect((await todoist.getTask(childId))!.parent_id).toBe(parentId);
	});

	test.describe("app URI links", () => {
		test.use({ pluginSettings: { experimentalFeatures: true, linksAppURI: true } });

		test("Change URL to app URI writes todoist:// links", async ({ obsidian, sandbox }) => {
			const content = `${sandbox.tok} app uri`;
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
			expect(lineContaining(obsidian.readNote(NOTE), content)).toContain(`%%[tid:: [${id}](todoist://task?id=${id})]%%`);
		});
	});

	test.describe("description without Obsidian link", () => {
		test.use({ pluginSettings: { experimentalFeatures: true, removeObsidianLinks: true } });

		test("Remove Obsidian file name from task description leaves the description empty", async ({ obsidian, sandbox, todoist }) => {
			const content = `${sandbox.tok} no backlink`;
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
			expect((await todoist.getTask(id))!.description).toBe("");
		});
	});

	test.describe("Obsidian Tasks integration", () => {
		test.use({ pluginSettings: { experimentalFeatures: true, changeDateOrder: true } });

		test("tid link is placed before the due date for Obsidian Tasks compatibility", async ({ obsidian, sandbox }) => {
			test.fail(true, "addTodoistLink tests `!this.plugin.taskParser?.hasTodoistLink` (a function reference, always truthy), so the reorder branch never runs");
			const content = `${sandbox.tok} tasks plugin order`;
			const date = isoDate(15);
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `📅 ${date}`), content);
			const line = lineContaining(obsidian.readNote(NOTE), content)!;
			expect(line.indexOf(`[tid:: [${id}]`)).toBeLessThan(line.indexOf(`📅 ${date}`));
		});
	});

	test.describe("first session after enabling the plugin", () => {
		// No restart after "Trust author and enable plugins": the plugin loads while
		// Obsidian's Settings window is activeDocument — the same situation as enabling
		// it from Settings → Community plugins.
		test.use({ restartAfterTrust: false });

		test("keyboard deletion syncs in the same session the plugin was enabled", async ({ obsidian, sandbox, todoist }) => {
			test.fail(
				true,
				"main.ts registers keyup/click with registerDomEvent(activeDocument, …) at load; when the plugin is enabled while the Settings window is active, both listeners bind to that window until Obsidian restarts",
			);
			const content = `${sandbox.tok} delete before restart`;
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
			await obsidian.deleteLineWithKeyboard(content);
			await waitFor(`task ${id} deleted in Todoist`, () => todoist.getTask(id), (t) => t === null, { timeout: 45_000 });
		});
	});

	test("renaming the note updates the Todoist task description", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} renamed note`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
		await waitFor("line saved", () => lineContaining(obsidian.readNote(NOTE), id), Boolean);
		await obsidian.page.evaluate(async () => {
			const app = (window as any).app;
			await app.fileManager.renameFile(app.vault.getAbstractFileByPath("Tasks.md"), "Renamed.md");
		});
		await waitFor(`task ${id} description points at Renamed.md`, () => todoist.getTask(id), (t) => Boolean(t?.description.includes("Renamed.md")));
	});
});
