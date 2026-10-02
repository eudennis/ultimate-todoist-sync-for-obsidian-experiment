import { createTaskFromObsidian, expect, requireFreePlan, requirePremium, taskLine, test } from "../src/fixtures";
import { TID_RE, dueWallClock, isoDate, lineContaining, syncUntil, waitFor, waitForTaskId } from "../src/helpers";

const NOTE = "Tasks.md";

test.describe("Suite 2 — Core Task Sync (O→T)", () => {
	test("task line with #tdsync is created in Todoist @smoke", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} basic task`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
		const task = await todoist.getTask(id);
		expect(task).toMatchObject({ content, project_id: sandbox.project.id, checked: false });
		expect(task!.labels).toContain("tdsync");
		// Description links back to the note.
		expect(task!.description).toContain(`obsidian://open?vault=`);
		expect(task!.description).toContain(NOTE);
		// Tid link format written to the note.
		expect(lineContaining(obsidian.readNote(NOTE), content)).toMatch(
			new RegExp(`#tdsync %%\\[tid:: \\[${id}\\]\\(https://app\\.todoist\\.com/app/task/${id}\\)\\]%%`),
		);
	});

	test("due date 📅YYYY-MM-DD → due.date @smoke", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} due date`;
		const date = isoDate(10);
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `📅${date}`), content);
		const task = await todoist.getTask(id);
		expect(task!.due?.date).toBe(date);
		expect(task!.content).toBe(content);
	});

	test("due time ⏰HH:MM with a date → due date-time at that wall-clock time", async ({ obsidian, sandbox, todoist }) => {
		// The matrix asked for due.datetime; Todoist's v1 API puts the time into due.date instead.
		const content = `${sandbox.tok} due time`;
		const date = isoDate(11);
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `📅${date}`, "⏰14:30"), content);
		const task = await todoist.getTask(id);
		expect(dueWallClock(task!.due), JSON.stringify(task!.due)).toBe(`${date} 14:30`);
	});

	test("due time ⏰HH:MM without a date → today's date is added to the line and to Todoist", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} time only`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, "⏰21:15"), content);
		const today = isoDate(0);
		const task = await todoist.getTask(id);
		expect(dueWallClock(task!.due), JSON.stringify(task!.due)).toBe(`${today} 21:15`);
		await waitFor("today's date written into the line", () => lineContaining(obsidian.readNote(NOTE), content) ?? "", (l) =>
			l.includes(`🗓️${today}`),
		);
	});

	test("due date without a time defaults to 08:00 (README claim)", async ({ obsidian, sandbox, todoist }) => {
		test.fail(true, "README says time defaults to 08:00, but the plugin sends due_date only → Todoist creates an all-day task");
		const content = `${sandbox.tok} default time`;
		const date = isoDate(12);
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `📅${date}`), content);
		const task = await todoist.getTask(id);
		expect(dueWallClock(task!.due), JSON.stringify(task!.due)).toBe(`${date} 08:00`);
	});

	test("duration ⏳NNmin → duration {amount, unit: minute}", async ({ obsidian, sandbox, todoist }) => {
		requirePremium();
		const content = `${sandbox.tok} duration`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `📅${isoDate(13)}`, "⏰10:00", "⏳45min"), content);
		const task = await todoist.getTask(id);
		expect(task!.duration).toEqual({ amount: 45, unit: "minute" });
	});

	test("deadline {{YYYY-MM-DD}} and {{MM-DD}} → deadline.date", async ({ obsidian, sandbox, todoist }) => {
		requirePremium();
		const full = `${sandbox.tok} deadline full`;
		const date = isoDate(20);
		const id1 = await createTaskFromObsidian(obsidian, NOTE, taskLine(full, `{{${date}}}`), full);
		expect((await todoist.getTask(id1))!.deadline?.date).toBe(date);

		const short = `${sandbox.tok} deadline short`;
		const id2 = await createTaskFromObsidian(obsidian, NOTE, taskLine(short, "{{12-24}}"), short);
		expect((await todoist.getTask(id2))!.deadline?.date).toBe(`${new Date().getFullYear()}-12-24`);
	});

	test("priority !!1…!!4 → Todoist priority 4…1 (!!1 = p1 = most urgent)", async ({ obsidian, sandbox, todoist }) => {
		const expected: Record<string, number> = { "!!1": 4, "!!2": 3, "!!3": 2, "!!4": 1 };
		for (const [syntax, apiPriority] of Object.entries(expected)) {
			const content = `${sandbox.tok} priority ${syntax.slice(2)}`;
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, syntax), content);
			const task = await todoist.getTask(id);
			expect(task!.priority, `${syntax} → API priority`).toBe(apiPriority);
			expect(task!.content).toBe(content);
		}
	});

	test("tags #tagA #tagB → labels", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} labels`;
		const [a, b] = [sandbox.name("tagA"), sandbox.name("tagB")];
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `#${a}`, `#${b}`), content);
		const task = await todoist.getTask(id);
		expect(task!.labels.sort()).toEqual([a, b, "tdsync"].sort());
		expect(task!.content).toBe(content);
	});

	test.describe("projects", () => {
		test.use({ extraProjects: ["Work"] });

		test("first #tag matching a project name sets the project; tags still become labels", async ({ obsidian, sandbox, todoist }) => {
			const content = `${sandbox.tok} hashtag project`;
			const work = sandbox.projects.Work;
			const label = sandbox.name("label");
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `#${work.name}`, `#${label}`), content);
			const task = await todoist.getTask(id);
			expect(task!.project_id).toBe(work.id);
			expect(task!.labels).toEqual(expect.arrayContaining([work.name, label]));
		});

		test("%%[p::ProjectName]%% sets the project (exact case)", async ({ obsidian, sandbox, todoist }) => {
			const content = `${sandbox.tok} hidden field project`;
			const work = sandbox.projects.Work;
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `%%[p::${work.name}]%%`), content);
			expect((await todoist.getTask(id))!.project_id).toBe(work.id);
		});

		test("%%[p::ProjectName]%% with wrong case does not match — plugin creates a new project with that exact name", async ({
			obsidian,
			sandbox,
			todoist,
		}) => {
			const content = `${sandbox.tok} wrong case project`;
			const wrongCase = sandbox.projects.Work.name.toLowerCase();
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `%%[p::${wrongCase}]%%`), content);
			const task = await todoist.getTask(id);
			expect(task!.project_id).not.toBe(sandbox.projects.Work.id);
			const landedIn = (await todoist.listProjects()).find((p) => p.id === task!.project_id);
			expect(landedIn?.name, "fallback behaviour: a new, differently-cased project").toBe(wrongCase);
		});
	});

	test.describe("sections", () => {
		test.use({ sections: ["Sec"] });

		test("///section_name puts the task into that section", async ({ obsidian, sandbox, todoist }) => {
			const content = `${sandbox.tok} in section`;
			const section = sandbox.sections.Sec;
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `///${section.name}`), content);
			const task = await todoist.getTask(id);
			expect(task).toMatchObject({ section_id: section.id, project_id: sandbox.project.id, content });
		});
	});

	test("deleting the task line deletes the Todoist task @smoke", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} to delete`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
		await obsidian.deleteLineWithKeyboard(content);
		await waitFor(`task ${id} deleted in Todoist`, () => todoist.getTask(id), (t) => t === null, { timeout: 60_000 });
	});

	test("ticking the checkbox completes the Todoist task @smoke", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} to complete`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
		await obsidian.clickLine("E2E tasks"); // leave the line so Live Preview renders the checkbox widget
		await obsidian.clickCheckbox(content);
		await waitFor("checkbox ticked in the note", () => lineContaining(obsidian.readNote(NOTE), content) ?? "", (l) => l.startsWith("- [x] "));
		await syncUntil(obsidian, `task ${id} completed in Todoist`, () => todoist.getTask(id), (t) => t?.checked === true);
	});

	test("unticking a completed task reopens it in Todoist", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} to reopen`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
		await obsidian.clickLine("E2E tasks");
		await obsidian.clickCheckbox(content);
		await syncUntil(obsidian, `task ${id} completed`, () => todoist.getTask(id), (t) => t?.checked === true);
		await obsidian.clickCheckbox(content);
		await waitFor("checkbox unticked in the note", () => lineContaining(obsidian.readNote(NOTE), content) ?? "", (l) => l.startsWith("- [ ] "));
		await syncUntil(obsidian, `task ${id} reopened`, () => todoist.getTask(id), (t) => t?.checked === false);
	});

	test("ticking the checkbox completes the task immediately, without waiting for a sync", async ({ obsidian, sandbox, todoist }) => {
		test.fail(
			true,
			"checkboxEventHandler (main.ts) looks for the id with /\\[tid:: (\\d+)\\]/, which cannot match the current \"[tid:: [id](url)]\" format or alphanumeric v1 ids; the full-text fallback didn't pick up the change either, so it waits for the next sync",
		);
		const content = `${sandbox.tok} instant complete`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
		await obsidian.clickLine("E2E tasks");
		await obsidian.clickCheckbox(content);
		// No manual sync, and the seeded interval is 3600s.
		await waitFor(`task ${id} completed in Todoist`, () => todoist.getTask(id), (t) => t?.checked === true, { timeout: 45_000 });
	});

	test("editing task text updates the same Todoist task (no duplicate)", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} original text`;
		const edited = `${sandbox.tok} edited text`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content), content);
		await obsidian.replaceLine(content, (l) => l.replace(content, edited));
		await syncUntil(obsidian, `task ${id} content updated`, () => todoist.getTask(id), (t) => t?.content === edited);
		const tasks = (await todoist.listTasks(sandbox.project.id)).filter((t) => t.content.startsWith(sandbox.tok));
		expect(tasks.map((t) => t.id)).toEqual([id]);
	});

	test("editing the due date updates Todoist", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} move due`;
		const [before, after] = [isoDate(5), isoDate(9)];
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `📅${before}`), content);
		await obsidian.replaceLine(content, (l) => l.replace(before, after));
		await syncUntil(obsidian, `task ${id} due date updated`, () => todoist.getTask(id), (t) => t?.due?.date === after);
	});

	test("editing tags updates Todoist labels", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} relabel`;
		const [a, b] = [sandbox.name("old"), sandbox.name("new")];
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `#${a}`), content);
		await obsidian.replaceLine(content, (l) => l.replace(`#${a}`, `#${b}`));
		await syncUntil(obsidian, `task ${id} labels updated`, () => todoist.getTask(id), (t) =>
			JSON.stringify(t?.labels.slice().sort()) === JSON.stringify([b, "tdsync"].sort()),
		);
	});

	test("editing priority updates Todoist", async ({ obsidian, sandbox, todoist }) => {
		const content = `${sandbox.tok} reprioritise`;
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, "!!4"), content);
		expect((await todoist.getTask(id))!.priority).toBe(1);
		await obsidian.replaceLine(content, (l) => l.replace("!!4", "!!1"));
		await syncUntil(obsidian, `task ${id} priority updated`, () => todoist.getTask(id), (t) => t?.priority === 4);
	});

	test("adding a reminder to a task creates a Todoist reminder", async () => {
		test.fixme(true, "No reminder syntax exists in taskParser/README, so there is nothing to type. Add a test once the syntax is defined.");
	});

	test("alternative keywords @ $ & behave like 📅 ⏰ ⏳", async ({ obsidian, sandbox, todoist }) => {
		// alternativeKeywords defaults to true in DefaultAppSettings.
		const content = `${sandbox.tok} alt keywords`;
		const date = isoDate(14);
		const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `@${date}`, "$16:45", "&25min"), content);
		const task = await todoist.getTask(id);
		expect(task!.content).toBe(content);
		expect(dueWallClock(task!.due), JSON.stringify(task!.due)).toBe(`${date} 16:45`);
		// Todoist drops durations on a free plan, so `&` can only be checked end to end with Pro.
		if (process.env.E2E_PREMIUM === "1") expect(task!.duration).toEqual({ amount: 25, unit: "minute" });
	});

	test.describe("free Todoist plan", () => {
		test("a deadline is dropped with a warning; the task is still created", async ({ obsidian, sandbox, todoist }) => {
			requireFreePlan();
			const content = `${sandbox.tok} free deadline`;
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `{{${isoDate(20)}}}`), content);
			await obsidian.waitForNotice(/Deadlines require a Todoist Pro plan/);
			const task = await todoist.getTask(id);
			expect(task).toMatchObject({ content, deadline: null });
			// The deadline stays in the note, so it applies if the account is upgraded later.
			expect(lineContaining(obsidian.readNote(NOTE), content)).toContain(`{{${isoDate(20)}}}`);
		});

		test("a duration is dropped with a warning", async ({ obsidian, sandbox, todoist }) => {
			requireFreePlan();
			const content = `${sandbox.tok} free duration`;
			const id = await createTaskFromObsidian(obsidian, NOTE, taskLine(content, `📅${isoDate(13)}`, "⏰10:00", "⏳45min"), content);
			await obsidian.waitForNotice(/Task durations require a Todoist Pro plan/);
			expect((await todoist.getTask(id))!.duration).toBeNull();
		});
	});

	test.describe("full vault sync", () => {
		test.use({
			pluginSettings: { experimentalFeatures: true, enableFullVaultSync: true },
			notes: { "Tasks.md": "# E2E tasks\n", "Inbox.md": "# Inbox\n" },
		});

		test("tasks without #tdsync are picked up and tagged automatically", async ({ obsidian, sandbox, todoist }) => {
			const content = `${sandbox.tok} untagged task`;
			// A change arriving from outside Obsidian (e.g. a sync client) to a note that isn't open.
			obsidian.writeNoteExternally("Inbox.md", `# Inbox\n- [ ] ${content}\n`);
			const id = await waitForTaskId(obsidian, "Inbox.md", content, 90_000);
			expect(lineContaining(obsidian.readNote("Inbox.md"), content)).toContain("#tdsync");
			const task = await todoist.getTask(id);
			expect(task).toMatchObject({ content, project_id: sandbox.project.id });
			expect(TID_RE.test(lineContaining(obsidian.readNote("Inbox.md"), content)!)).toBe(true);
		});
	});
});
