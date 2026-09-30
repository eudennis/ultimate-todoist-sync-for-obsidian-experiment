import { createTaskFromObsidian, expect, requireActivityLog, taskLine, test } from "../src/fixtures";
import { isoDate, lineContaining, syncUntil } from "../src/helpers";

const NOTE = "Tasks.md";

// The plugin pulls Todoist changes from the account activity log on each sync
// and only for tasks it already tracks. Each test therefore creates its task
// from Obsidian first, changes it through the Todoist API, then runs the real
// "Trigger the manual sync" command until the note reflects the change.

test.describe("Suite 3 — Core Task Sync (T→O)", () => {
	test.beforeEach(() => requireActivityLog());

	test("task created in Todoist appears in the vault", async ({ obsidian, sandbox, todoist }) => {
		test.fail(true, "syncTodoistToObsidian only handles events for tasks already tracked in the vault; it never creates new lines");
		const content = `${sandbox.tok} created in todoist`;
		await todoist.createTask({ content, project_id: sandbox.project.id });
		await syncUntil(
			obsidian,
			"Todoist-created task written to any note",
			() => obsidian.listNotes().some((n) => obsidian.readNote(n).includes(content)),
			(found) => found,
			{ timeout: 90_000 },
		);
	});

	test("content changed in Todoist updates the Obsidian line @smoke", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} before rename`;
		const renamed = `${sandbox.tok} renamed in todoist`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
		await todoist.updateTask(id, { content: renamed });
		const line = await syncUntil(obsidian, "renamed content in note", () => lineContaining(obsidian.readNote(NOTE), id) ?? "", (l) =>
			l.includes(renamed),
		);
		expect(line).not.toContain(content);
		expect(line).toContain("#tdsync");
	});

	test("due date changed in Todoist updates the 📅 date", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} due moved in todoist`;
		const [before, after] = [isoDate(3), isoDate(8)];
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `📅${before}`), content);
		await todoist.updateTask(id, { due_date: after });
		const line = await syncUntil(obsidian, "new due date in note", () => lineContaining(obsidian.readNote(NOTE), id) ?? "", (l) =>
			l.includes(after),
		);
		expect(line).not.toContain(before);
	});

	test("task completed in Todoist becomes - [x]", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} completed in todoist`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
		await todoist.closeTask(id);
		await syncUntil(obsidian, "checkbox ticked in note", () => lineContaining(obsidian.readNote(NOTE), id) ?? "", (l) => l.startsWith("- [x] "));
	});

	test("task reopened in Todoist becomes - [ ] again", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} reopened in todoist`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
		await todoist.closeTask(id);
		await syncUntil(obsidian, "checkbox ticked in note", () => lineContaining(obsidian.readNote(NOTE), id) ?? "", (l) => l.startsWith("- [x] "));
		await todoist.reopenTask(id);
		await syncUntil(obsidian, "checkbox unticked in note", () => lineContaining(obsidian.readNote(NOTE), id) ?? "", (l) => l.startsWith("- [ ] "));
	});

	test("comment added in Todoist appears below the task (Sync comments on)", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} commented`;
		const comment = `${sandbox.tok} a comment from todoist`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
		await todoist.addComment(id, comment);
		const lines = await syncUntil(obsidian, "comment line under the task", () => obsidian.readNote(NOTE).split("\n"), (ls) => {
			const i = ls.findIndex((l) => l.includes(id));
			return i >= 0 && (ls[i + 1] ?? "").includes(comment);
		});
		const commentLine = lines[lines.findIndex((l) => l.includes(id)) + 1];
		expect(commentLine).toMatch(/^\t- .+/); // indented list item: "<tab>- <datetime> <comment>"
	});

	test.describe("comments disabled", () => {
		test.use({ pluginSettings: { commentsSync: false } });

		test("with Sync comments off, Todoist comments are not pulled in", async ({ obsidian, sandbox, todoist }) => {
			const content = `${sandbox.tok} not commented`;
			const control = `${sandbox.tok} control rename`;
			const comment = `${sandbox.tok} must not appear`;
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
			await todoist.addComment(id, comment);
			// Positive control in the same sync window: proves the sync that should have
			// carried the comment really ran.
			await todoist.updateTask(id, { content: control });
			await syncUntil(obsidian, "control rename in note", () => obsidian.readNote(NOTE), (t) => t.includes(control));
			await obsidian.triggerManualSync();
			await obsidian.page.waitForTimeout(15_000);
			expect(obsidian.readNote(NOTE)).not.toContain(comment);
		});
	});

	test("reminder added in Todoist is reflected in Obsidian", async () => {
		test.fixme(true, "The plugin has no reminder representation in markdown, so there is no defined expected output to assert.");
	});
});
