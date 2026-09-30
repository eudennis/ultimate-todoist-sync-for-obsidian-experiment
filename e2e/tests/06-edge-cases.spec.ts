import { createTaskFromObsidian, expect, taskLine, test } from "../src/fixtures";
import { TID_RE, isoDate, lineContaining, syncUntil, waitFor, waitForTaskId } from "../src/helpers";

const NOTE = "Tasks.md";

test.describe("Suite 6 — Edge Cases / Regression Guards", () => {
	test("identical text with different metadata syncs as two distinct tasks", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} same text`;
		const [d1, d2] = [isoDate(4), isoDate(7)];
		await obsidian.appendLine(taskLine(content, `📅${d1}`));
		const id1 = await waitForTaskId(obsidian, NOTE, `📅${d1}`);
		await obsidian.appendLine(taskLine(content, `📅${d2}`));
		const id2 = await waitForTaskId(obsidian, NOTE, `📅${d2}`);

		expect(id1).not.toBe(id2);
		const tasks = (await todoist.listTasks(sandbox.project.id)).filter((t) => t.content === content);
		expect(tasks.map((t) => [t.id, t.due?.date]).sort()).toEqual([[id1, d1], [id2, d2]].sort());
	});

	test("rapid create + immediate edit before the first sync → exactly one Todoist task", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} rapid`;
		// Real keystrokes: each fires the plugin's delayed editor-change handler.
		await obsidian.appendLine(taskLine(content), { typeSlowly: true });
		await obsidian.page.keyboard.type(" edited", { delay: 30 });
		await waitForTaskId(obsidian, NOTE, content);
		await syncUntil(
			obsidian,
			"single task with the edited content",
			async () => (await todoist.listTasks(sandbox.project.id)).filter((t) => t.content.startsWith(sandbox.tok)),
			(tasks) => tasks.length === 1 && tasks[0].content === `${content} edited`,
		);
		// Let every pending 10s editor-change handler fire, then re-check for late duplicates.
		await obsidian.page.waitForTimeout(15_000);
		const tasks = (await todoist.listTasks(sandbox.project.id)).filter((t) => t.content.startsWith(sandbox.tok));
		expect(tasks).toHaveLength(1);
		expect(obsidian.readNote(NOTE).match(new RegExp(TID_RE.source, "g"))).toHaveLength(1);
	});

	test.describe("moving a task between files", () => {
		test.use({ notes: { "Tasks.md": "# E2E tasks\n", "Other.md": "# Other note\n" } });

		test("cut/paste into another note does not crash, corrupt or duplicate (moving is unsupported)", async ({ obsidian, sandbox, todoist }, testInfo) => {
			const content = `${sandbox.tok} moved task`;
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
			await waitFor("line saved", () => lineContaining(obsidian.readNote(NOTE), id), Boolean);
			const fullLine = lineContaining(obsidian.readNote(NOTE), id)!;

			await obsidian.deleteLineWithKeyboard(content);
			await obsidian.openNote("Other.md");
			await obsidian.appendLine(fullLine);
			await obsidian.triggerManualSync();
			await obsidian.page.waitForTimeout(15_000);
			await obsidian.triggerManualSync();
			await obsidian.page.waitForTimeout(15_000);

			const other = obsidian.readNote("Other.md");
			expect(other.split("\n").filter((l) => l.includes(id)), "line pasted exactly once, unmodified").toEqual([fullLine]);
			expect(obsidian.readNote(NOTE)).not.toContain(id);
			const active = (await todoist.listTasks(sandbox.project.id)).filter((t) => t.content === content);
			expect(active.length, "no duplicate Todoist task").toBeLessThanOrEqual(1);
			const remote = await todoist.getTask(id);
			testInfo.annotations.push({
				type: "observed",
				description: remote ? "Todoist task survived the move" : "Todoist task was deleted when the line left the original note",
			});
			expect(obsidian.console.filter((l) => l.includes("[pageerror]"))).toEqual([]);
		});
	});

	test("API failure (token revoked mid-session) surfaces an error and leaves the note intact", async ({ obsidian, sandbox, todoist }) => {
		const good = `${sandbox.tok} before revoke`;
		const bad = `${sandbox.tok} after revoke`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(good), good);
		await waitFor("first line saved", () => lineContaining(obsidian.readNote(NOTE), id), Boolean);

		// Revoking the harness's own token would break the harness, so the plugin's
		// in-memory token is swapped for a dead one; every request below still goes to
		// the real Todoist API and really gets rejected.
		await obsidian.page.evaluate(() => {
			(window as any).app.plugins.plugins["another-simple-todoist-sync"].settings.todoistAPIToken = "e2e-revoked-token";
		});
		const since = await obsidian.now();
		await obsidian.appendLine(taskLine(bad));
		await obsidian.page.waitForTimeout(12_000); // let the editor-change handler attempt the create
		await obsidian.triggerManualSync();
		await obsidian.waitForNotice(/fail|error|token/i, { since, timeout: 60_000 });

		await obsidian.page.waitForTimeout(3_000);
		const note = obsidian.readNote(NOTE);
		expect(lineContaining(note, bad), "unsynced line kept as typed").toBe(taskLine(bad));
		expect(lineContaining(note, good)).toContain(`[tid:: [${id}]`);
		expect(note.startsWith("# E2E tasks\n")).toBe(true);
		expect((await todoist.listTasks(sandbox.project.id)).map((t) => t.content)).toEqual([good]);
	});

	test.describe("large batch", () => {
		test.use({ notes: { "Tasks.md": "# E2E tasks\n", "Inbox.md": "# Inbox\n" } });

		test("25 tasks arriving at once all sync, none dropped or duplicated", async ({ obsidian, sandbox, todoist }) => {
			test.setTimeout(8 * 60_000);
			const contents = Array.from({ length: 25 }, (_, i) => `${sandbox.tok} batch ${String(i + 1).padStart(2, "0")}`);
			obsidian.writeNoteExternally("Inbox.md", `# Inbox\n${contents.map((c) => taskLine(c)).join("\n")}\n`);

			await waitFor(
				"all 25 lines have tid links",
				() => obsidian.readNote("Inbox.md").split("\n").filter((l) => TID_RE.test(l)).length,
				(n) => n === 25,
				{ timeout: 5 * 60_000, interval: 3_000 },
			);
			const remote = (await todoist.listTasks(sandbox.project.id)).map((t) => t.content).sort();
			expect(remote).toEqual(contents.slice().sort());
			const ids = obsidian.readNote("Inbox.md").split("\n").map((l) => TID_RE.exec(l)?.[1]).filter(Boolean);
			expect(new Set(ids).size).toBe(25);
		});
	});

	test.describe("non-task content", () => {
		const PREAMBLE = [
			"# E2E tasks",
			"",
			"Intro paragraph with a #hashtag, a [[wikilink]] and `inline code`.",
			"",
			"```dataview",
			"TASK FROM \"\" WHERE !completed",
			"```",
			"",
			"| col | value |",
			"| --- | ----- |",
			"| a   | 1     |",
			"",
			"> [!note] Callout",
			"> - [ ] not a synced task inside a callout",
			"",
			"- [ ] plain unsynced task",
			"",
		].join("\n");
		test.use({ notes: { "Tasks.md": PREAMBLE } });

		test("Dataview blocks and other content in the same file are left untouched", async ({ obsidian, sandbox, todoist }) => {
			const content = `${sandbox.tok} next to dataview`;
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
			await obsidian.triggerManualSync();
			await obsidian.page.waitForTimeout(10_000);
			const note = obsidian.readNote(NOTE);
			expect(note.startsWith(PREAMBLE), "everything before the new task is byte-identical").toBe(true);
			expect((await todoist.listTasks(sandbox.project.id)).map((t) => t.id)).toEqual([id]);
		});
	});
});
