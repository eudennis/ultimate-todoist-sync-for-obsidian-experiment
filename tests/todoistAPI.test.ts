import { requestUrl } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TodoistNewAPI } from "../src/todoistAPI";
import { activityEventFixtures } from "./fixtures/activityEvents";
import { taskFixtures } from "./fixtures/todoistTasks";
import { createMockApp, createMockPlugin } from "./helpers/mockPlugin";

let api: TodoistNewAPI;

beforeEach(() => {
	api = new TodoistNewAPI(
		createMockApp() as never,
		createMockPlugin() as never,
	);
});

// Parse the JSON body sent in the first requestUrl call.
function sentBody() {
	const call = vi.mocked(requestUrl).mock.calls[0][0] as { body?: string };
	return JSON.parse(call.body ?? "{}");
}

describe("TodoistNewAPI", () => {
	describe("addTask payload assembly", () => {
		const base = { project_id: "proj-123", content: "Test task" };

		it("drops due_date when due_datetime is also set", async () => {
			await api.addTask({
				...base,
				due_date: "2025-06-15",
				due_datetime: "2025-06-15T14:00:00",
			});
			const body = sentBody();
			expect(body).not.toHaveProperty("due_date");
			expect(body.due_datetime).toBe("2025-06-15T14:00:00");
		});

		it("omits section_id when it is an empty string", async () => {
			await api.addTask({ ...base, section_id: "" });
			expect(sentBody()).not.toHaveProperty("section_id");
		});

		it("omits parent_id when it is an empty string", async () => {
			await api.addTask({ ...base, parent_id: "" });
			expect(sentBody()).not.toHaveProperty("parent_id");
		});

		it("omits duration and duration_unit when duration is 0", async () => {
			await api.addTask({ ...base, duration: 0, duration_unit: "minute" });
			const body = sentBody();
			expect(body).not.toHaveProperty("duration");
			expect(body).not.toHaveProperty("duration_unit");
		});

		it("includes deadline_date when provided", async () => {
			await api.addTask({ ...base, deadline_date: "2025-12-31" });
			expect(sentBody().deadline_date).toBe("2025-12-31");
		});

		it("returns false (does not throw) on a network error", async () => {
			vi.mocked(requestUrl).mockRejectedValueOnce(new Error("network down"));
			await expect(api.addTask(base)).resolves.toBe(false);
		});
	});

	describe("getTaskById", () => {
		it("returns the parsed task JSON on status 200", async () => {
			vi.mocked(requestUrl).mockResolvedValueOnce({
				status: 200,
				json: taskFixtures.simpleTask,
				text: JSON.stringify(taskFixtures.simpleTask),
			} as never);
			await expect(api.getTaskById("6cfCcrHfXrFP6q3R")).resolves.toMatchObject({
				id: "6cfCcrHfXrFP6q3R",
				content: "Buy groceries",
			});
		});

		it("throws with the status code on a 404", async () => {
			vi.mocked(requestUrl).mockResolvedValueOnce({
				status: 404,
				json: { error: "Task not found" },
				text: "",
			} as never);
			await expect(api.getTaskById("missing")).rejects.toThrow("404");
		});

		it("throws on a 401 Unauthorized", async () => {
			vi.mocked(requestUrl).mockResolvedValueOnce({
				status: 401,
				json: { error: "Unauthorized" },
				text: "",
			} as never);
			await expect(api.getTaskById("x")).rejects.toThrow("401");
		});

		it("throws when no taskId is given", async () => {
			await expect(api.getTaskById("")).rejects.toThrow("taskId is required");
		});
	});

	describe("deleteTask", () => {
		it("returns true on a 204 No Content", async () => {
			vi.mocked(requestUrl).mockResolvedValueOnce({
				status: 204,
				json: {},
				text: "",
			} as never);
			await expect(api.deleteTask("6cfCcrHfXrFP6q3R")).resolves.toBe(true);
		});

		it("returns false on a non-204 status", async () => {
			vi.mocked(requestUrl).mockResolvedValueOnce({
				status: 200,
				json: {},
				text: "",
			} as never);
			await expect(api.deleteTask("6cfCcrHfXrFP6q3R")).resolves.toBe(false);
		});

		it("throws when no taskId is given", async () => {
			await expect(api.deleteTask("")).rejects.toThrow("taskId is required");
		});

		it("throws a wrapped error on a network failure", async () => {
			vi.mocked(requestUrl).mockRejectedValueOnce(new Error("network down"));
			await expect(api.deleteTask("6cfCcrHfXrFP6q3R")).rejects.toThrow(
				"Error deleting task: network down",
			);
		});
	});

	describe("filterActivityEvents", () => {
		const events = [
			activityEventFixtures.itemAdded,
			activityEventFixtures.itemCompletedFromObsidian,
			activityEventFixtures.itemUpdated,
			activityEventFixtures.projectUpdated,
		];

		it("filters by event_type only", () => {
			const result = api.filterActivityEvents(events, {
				event_type: "completed",
			});
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("evt-002");
		});

		it("filters by object_type only", () => {
			const result = api.filterActivityEvents(events, { object_type: "project" });
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("evt-005");
		});

		it("filters by both fields (AND logic)", () => {
			const result = api.filterActivityEvents(events, {
				event_type: "updated",
				object_type: "item",
			});
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("evt-003");
		});

		it("returns every event when no filter is given", () => {
			expect(api.filterActivityEvents(events, {})).toHaveLength(events.length);
		});

		it("returns an empty array when nothing matches", () => {
			expect(
				api.filterActivityEvents(events, { event_type: "archived" }),
			).toEqual([]);
		});

		it("does not mutate the input array", () => {
			const before = events.length;
			api.filterActivityEvents(events, { event_type: "completed" });
			expect(events).toHaveLength(before);
		});
	});
});
