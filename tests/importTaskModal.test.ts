import { describe, expect, it } from "vitest";
import { ImportTaskFromTodoistModal } from "../src/importTaskModal";
import { taskFixtures } from "./fixtures/todoistTasks";
import { createMockApp, createMockPlugin } from "./helpers/mockPlugin";

// All the methods under test are `private`, which is compile-time only — at
// runtime they are ordinary properties reachable via the instance.
function makeModal(settingsOverrides: Record<string, unknown> = {}) {
	const modal = new ImportTaskFromTodoistModal(
		createMockApp() as never,
		createMockPlugin(settingsOverrides) as never,
		null as never, // editor — unused by the pure methods under test
		"note.md",
	);
	// biome-ignore lint/suspicious/noExplicitAny: reach private methods in tests
	return modal as any;
}

describe("ImportTaskFromTodoistModal", () => {
	describe("extractTaskId", () => {
		it("parses a bare task URL", () => {
			expect(
				makeModal().extractTaskId("https://app.todoist.com/app/task/12345"),
			).toBe("12345");
		});
		it("parses a slugged URL by taking the trailing id segment", () => {
			expect(
				makeModal().extractTaskId(
					"https://app.todoist.com/app/task/my-task-name-12345678",
				),
			).toBe("12345678");
		});
		it("parses a project-scoped URL", () => {
			expect(
				makeModal().extractTaskId(
					"https://app.todoist.com/app/project/proj-1/task/6cfCcrHfXrFP6q3R",
				),
			).toBe("6cfCcrHfXrFP6q3R");
		});
		it("parses a todoist:// app uri", () => {
			expect(makeModal().extractTaskId("todoist://task?id=12345")).toBe("12345");
		});
		it("returns null for an empty string", () => {
			expect(makeModal().extractTaskId("")).toBeNull();
		});
		it("returns null for a non-Todoist URL", () => {
			expect(makeModal().extractTaskId("https://example.com/task/123")).toBeNull();
		});
	});

	describe("invertPriority (display label)", () => {
		it("maps API 4 → urgent label", () => {
			expect(makeModal().invertPriority(4)).toBe("!!1 (Urgent)");
		});
		it("maps API 3 → high label", () => {
			expect(makeModal().invertPriority(3)).toBe("!!2 (High)");
		});
		it("maps API 2 → medium label", () => {
			expect(makeModal().invertPriority(2)).toBe("!!3 (Medium)");
		});
		it("returns empty string for the default priority", () => {
			expect(makeModal().invertPriority(1)).toBe("");
		});
	});

	describe("invertPriorityToSyntax (line syntax)", () => {
		it("maps API 4 → ' !!1'", () => {
			expect(makeModal().invertPriorityToSyntax(4)).toBe(" !!1");
		});
		it("returns empty string for the default priority", () => {
			expect(makeModal().invertPriorityToSyntax(1)).toBe("");
		});
	});

	describe("extractTime (TZ=UTC)", () => {
		it("formats HH:MM in the task timezone", () => {
			expect(makeModal().extractTime("2025-06-15T14:30:00", "UTC")).toBe("14:30");
		});
		it("zero-pads the hour", () => {
			expect(makeModal().extractTime("2025-06-15T09:05:00", "UTC")).toBe("09:05");
		});
		it("handles a trailing-Z datetime", () => {
			expect(makeModal().extractTime("2025-06-15T14:30:00Z", "UTC")).toBe("14:30");
		});
		it("falls back to system local time for an invalid timezone", () => {
			// Invalid timeZone throws inside Intl → catch branch uses local time (UTC here)
			expect(makeModal().extractTime("2025-06-15T14:30:00", "Not/AZone")).toBe(
				"14:30",
			);
		});
	});

	describe("formatTaskLine", () => {
		it("formats a plain task with the sync tag and tid metadata", () => {
			const id = taskFixtures.simpleTask.id;
			expect(makeModal().formatTaskLine(taskFixtures.simpleTask)).toBe(
				`- [ ] Buy groceries #tdsync %%[tid:: [${id}](https://app.todoist.com/app/task/${id})]%%`,
			);
		});
		it("includes date, time, priority and labels", () => {
			const line = makeModal().formatTaskLine(taskFixtures.taskWithDue);
			expect(line).toContain("📅2025-06-15");
			expect(line).toContain("⏰14:00");
			expect(line).toContain("!!2");
			expect(line).toContain("#work");
			expect(line).toContain("#tdsync");
		});
		it("omits the time for a date-only task and inverts priority 4 to !!1", () => {
			const line = makeModal().formatTaskLine(taskFixtures.urgentTask);
			expect(line).toContain("📅2025-06-01");
			expect(line).not.toContain("⏰");
			expect(line).toContain("!!1");
			expect(line).toContain("#urgent");
			expect(line).toContain("#engineering");
		});
		it("uses a todoist:// uri when linksAppURI is enabled", () => {
			const id = taskFixtures.simpleTask.id;
			const line = makeModal({ linksAppURI: true }).formatTaskLine(
				taskFixtures.simpleTask,
			);
			expect(line).toContain(`todoist://task?id=${id}`);
			expect(line).not.toContain("https://app.todoist.com");
		});
	});
});
