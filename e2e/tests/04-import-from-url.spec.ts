import type { ObsidianSession } from "../src/obsidian";
import { expect, test } from "../src/fixtures";
import { isoDate, waitFor } from "../src/helpers";
import type { TodoistClient, TodoistTask } from "../src/todoist";

const NOTE = "Tasks.md";
const COMMAND = "Another Simple Todoist Sync: Import task from Todoist link";

async function createRemoteTask(todoist: TodoistClient, projectId: string, tok: string): Promise<TodoistTask> {
	return todoist.createTask({
		content: `${tok} imported task`,
		project_id: projectId,
		due_date: isoDate(6),
		labels: [`${tok}_lbl`],
		priority: 3, // → !!2
	});
}

async function fetchInModal(obsidian: ObsidianSession, url: string) {
	await obsidian.runCommand(COMMAND);
	const modal = obsidian.page.locator(".modal", { hasText: "Import task from Todoist link" });
	await modal.locator("input[type=text]").fill(url);
	await modal.getByRole("button", { name: "Fetch task" }).click();
	return modal;
}

/** Fetch → preview → insert, then assert the exact markdown line and that sync now tracks the task. */
async function importAndVerify(obsidian: ObsidianSession, task: TodoistTask, url: string) {
	const modal = await fetchInModal(obsidian, url);
	await expect(modal).toContainText(task.content);
	await expect(modal).toContainText("!!2 (High)");
	await expect(modal).toContainText(`#${task.labels[0]}`);
	await modal.getByRole("button", { name: "Insert task" }).click();
	await expect(modal).toBeHidden();

	const expectedLine = `- [ ] ${task.content} 📅${task.due!.date} !!2 #${task.labels[0]} #tdsync %%[tid:: [${task.id}](https://app.todoist.com/app/task/${task.id})]%%`;
	await waitFor("imported line saved to the note", () => obsidian.readNote(NOTE).split("\n"), (lines) => lines.includes(expectedLine), {
		timeout: 15_000,
		interval: 500,
	});
	const settings = await obsidian.pluginSettings<{ fileMetadata: Record<string, { todoistTasks: string[] }> }>();
	expect(settings.fileMetadata[NOTE]?.todoistTasks, "imported task is tracked for bidirectional sync").toContain(task.id);
}

test.describe("Suite 4 — Import from URL (Experimental)", () => {
	test.describe("feature disabled", () => {
		test.use({ pluginSettings: { experimentalFeatures: false } });

		test("command explains how to enable the feature; enabling it in settings makes it work", async ({ obsidian }) => {
			const since = await obsidian.now();
			await obsidian.runCommand(COMMAND);
			await obsidian.waitForNotice(/Enable "import task from Todoist link"/, { since });
			await expect(obsidian.page.locator(".modal", { hasText: "Import task from Todoist link" })).toHaveCount(0);

			await obsidian.openPluginSettings();
			await obsidian.setToggle("Experimental features", true);
			await obsidian.setToggle("Import task from Todoist link", true);
			await obsidian.closeModal();
			await obsidian.openNote(NOTE);
			await obsidian.runCommand(COMMAND);
			await expect(obsidian.page.locator(".modal", { hasText: "Import task from Todoist link" })).toBeVisible();
		});
	});

	test.describe("feature enabled", () => {
		test.use({ pluginSettings: { experimentalFeatures: true, enableImportFromTodoistLink: true } });

		test("standard task URL …/app/task/ID @smoke", async ({ obsidian, sandbox, todoist }) => {
			const task = await createRemoteTask(todoist, sandbox.project.id, sandbox.tok);
			await importAndVerify(obsidian, task, `https://app.todoist.com/app/task/${task.id}`);
		});

		test("slugged task URL …/app/task/task-name-ID", async ({ obsidian, sandbox, todoist }) => {
			const task = await createRemoteTask(todoist, sandbox.project.id, sandbox.tok);
			const slug = task.content.toLowerCase().replace(/[^a-z0-9]+/g, "-");
			await importAndVerify(obsidian, task, `https://app.todoist.com/app/task/${slug}-${task.id}`);
		});

		test("project-scoped URL …/app/project/PROJECT/task/ID", async ({ obsidian, sandbox, todoist }) => {
			const task = await createRemoteTask(todoist, sandbox.project.id, sandbox.tok);
			const projectSlug = `${sandbox.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${sandbox.project.id}`;
			await importAndVerify(obsidian, task, `https://app.todoist.com/app/project/${projectSlug}/task/${task.id}`);
		});

		test("app URI todoist://task?id=ID", async ({ obsidian, sandbox, todoist }) => {
			const task = await createRemoteTask(todoist, sandbox.project.id, sandbox.tok);
			await importAndVerify(obsidian, task, `todoist://task?id=${task.id}`);
		});

		test("invalid or nonexistent task → graceful error, nothing inserted", async ({ obsidian }) => {
			const before = await obsidian.editorText();

			let since = await obsidian.now();
			let modal = await fetchInModal(obsidian, "not a todoist link");
			await obsidian.waitForNotice(/Invalid Todoist URL/, { since });
			await expect(modal).toBeVisible();
			await obsidian.closeModal();

			since = await obsidian.now();
			modal = await fetchInModal(obsidian, "https://app.todoist.com/app/task/zzzzzzzzzzzzzzzz");
			await obsidian.waitForNotice(/Could not fetch task/, { since });
			await expect(modal.getByRole("button", { name: "Fetch task" })).toBeEnabled();
			await expect(modal.getByRole("button", { name: "Insert task" })).toHaveCount(0);
			await obsidian.closeModal();

			expect(await obsidian.editorText()).toBe(before);
			const errors = obsidian.console.filter((l) => l.includes("[pageerror]"));
			expect(errors, "uncaught exceptions").toEqual([]);
		});
	});
});
