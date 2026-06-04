import { beforeEach, describe, expect, it } from "vitest";
import { CacheOperation, type Task } from "../src/cacheOperation";
import { createMockApp, createMockPlugin } from "./helpers/mockPlugin";

let cache: CacheOperation;

beforeEach(() => {
	// Fresh in-memory state per test (everything lives in plugin.settings).
	cache = new CacheOperation(
		createMockApp() as never,
		createMockPlugin() as never,
	);
});

const task = (id: string, content = `Task ${id}`): Task => ({ id, content });

describe("CacheOperation", () => {
	describe("task cache: append / load / delete", () => {
		it("appendTaskToCache then loadTaskFromCacheID round-trips", () => {
			cache.appendTaskToCache(task("t1", "Buy milk"));
			expect(cache.loadTaskFromCacheID("t1")?.content).toBe("Buy milk");
		});
		it("loadTaskFromCacheID returns undefined for an unknown id", () => {
			expect(cache.loadTaskFromCacheID("nope")).toBeUndefined();
		});
		it("deleteTaskFromCache removes the target and leaves the rest", () => {
			cache.appendTaskToCache(task("t1"));
			cache.appendTaskToCache(task("t2"));
			cache.deleteTaskFromCache("t1");
			expect(cache.loadTaskFromCacheID("t1")).toBeUndefined();
			expect(cache.loadTaskFromCacheID("t2")?.id).toBe("t2");
		});
		it("deleteTaskFromCache is a no-op for an unknown id", () => {
			cache.appendTaskToCache(task("t1"));
			cache.deleteTaskFromCache("nope");
			expect(cache.loadTasksFromCache()).toHaveLength(1);
		});
	});

	describe("updateTaskToCacheByID", () => {
		it("replaces the task in place without creating duplicates", () => {
			cache.appendTaskToCache(task("t1", "old content"));
			cache.updateTaskToCacheByID(task("t1", "new content"));
			expect(cache.loadTaskFromCacheID("t1")?.content).toBe("new content");
			expect(
				cache.loadTasksFromCache().filter((t) => t.id === "t1"),
			).toHaveLength(1);
		});
	});

	describe("project cache", () => {
		it("getProjectIdByNameFromCache returns the id when present", () => {
			expect(cache.getProjectIdByNameFromCache("Inbox")).toBe("proj-123");
		});
		it("getProjectIdByNameFromCache is case-sensitive and returns null otherwise", () => {
			expect(cache.getProjectIdByNameFromCache("inbox")).toBeNull();
		});
		it("checkIfProjectExistOnCache returns the id when present", () => {
			expect(cache.checkIfProjectExistOnCache("Inbox")).toBe("proj-123");
		});
		it("checkIfProjectExistOnCache returns false when absent", () => {
			expect(cache.checkIfProjectExistOnCache("Work")).toBe(false);
		});
		it("addProjectToCache makes a new project findable", () => {
			cache.addProjectToCache("Work", "proj-999");
			expect(cache.getProjectIdByNameFromCache("Work")).toBe("proj-999");
		});
	});

	describe("section cache", () => {
		beforeEach(() => {
			cache.addSectionToCache("MySection", "sec-1", "proj-123");
		});
		it("checkIfSectionExistOnCache matches on name and projectId", () => {
			expect(cache.checkIfSectionExistOnCache("MySection", "proj-123")).toBe(
				"sec-1",
			);
		});
		it("returns false when the projectId does not match", () => {
			expect(cache.checkIfSectionExistOnCache("MySection", "proj-999")).toBe(
				false,
			);
		});
		it("returns false when the section name is unknown", () => {
			expect(cache.checkIfSectionExistOnCache("Other", "proj-123")).toBe(false);
		});
	});

	describe("file metadata", () => {
		it("creates metadata for a new file", async () => {
			await cache.updateFileMetadata("note.md", {
				todoistTasks: ["t1"],
				todoistCount: 1,
			});
			expect(await cache.getFileMetadataByFilePath("note.md")).toEqual({
				todoistTasks: ["t1"],
				todoistCount: 1,
			});
		});
		it("updates the task list and count for an existing file", async () => {
			await cache.updateFileMetadata("note.md", {
				todoistTasks: ["t1"],
				todoistCount: 1,
			});
			await cache.updateFileMetadata("note.md", {
				todoistTasks: ["t1", "t2"],
				todoistCount: 2,
			});
			const md = await cache.getFileMetadataByFilePath("note.md");
			expect(md?.todoistTasks).toEqual(["t1", "t2"]);
			expect(md?.todoistCount).toBe(2);
		});
		it("returns null for an unknown file", async () => {
			expect(await cache.getFileMetadataByFilePath("missing.md")).toBeNull();
		});
		it("deleteTaskIdFromMetadata removes one id and decrements the count", async () => {
			await cache.updateFileMetadata("note.md", {
				todoistTasks: ["t1", "t2"],
				todoistCount: 2,
			});
			await cache.deleteTaskIdFromMetadata("note.md", "t1");
			const md = await cache.getFileMetadataByFilePath("note.md");
			expect(md?.todoistTasks).toEqual(["t2"]);
			expect(md?.todoistCount).toBe(1);
		});
	});

	describe("default project per file", () => {
		it("setDefaultProjectIdForFilepath then read it back", () => {
			cache.setDefaultProjectIdForFilepath("note.md", "proj-123", "Inbox");
			expect(cache.getDefaultProjectIdForFilepath("note.md")).toBe("proj-123");
			expect(cache.getDefaultProjectNameForFilepath("note.md")).toBe("Inbox");
		});
		it("falls back to the global default for an unknown file", () => {
			expect(cache.getDefaultProjectIdForFilepath("other.md")).toBe("proj-123");
		});
	});

	describe("bulk task helpers and status toggles", () => {
		it("saveTasksToCache overwrites and loadTasksFromCache reads back", () => {
			cache.saveTasksToCache([task("t1"), task("t2")]);
			expect(cache.loadTasksFromCache().map((t) => t.id)).toEqual(["t1", "t2"]);
		});
		it("deleteTaskFromCacheByIDs removes every listed id", () => {
			cache.saveTasksToCache([task("t1"), task("t2"), task("t3")]);
			cache.deleteTaskFromCacheByIDs(["t1", "t3"]);
			expect(cache.loadTasksFromCache().map((t) => t.id)).toEqual(["t2"]);
		});
		it("closeTaskToCacheByID and reopenTaskToCacheByID flip isCompleted", () => {
			cache.appendTaskToCache(task("t1"));
			cache.closeTaskToCacheByID("t1");
			expect(cache.loadTaskFromCacheID("t1")?.isCompleted).toBe(true);
			cache.reopenTaskToCacheByID("t1");
			expect(cache.loadTaskFromCacheID("t1")?.isCompleted).toBe(false);
		});
		it("modifyTaskToCacheByID updates content", () => {
			cache.appendTaskToCache(task("t1", "old"));
			cache.modifyTaskToCacheByID("t1", { content: "new" });
			expect(cache.loadTaskFromCacheID("t1")?.content).toBe("new");
		});
		it("appendPathToTaskInCache records the source file on a task", () => {
			cache.appendTaskToCache(task("t1"));
			cache.appendPathToTaskInCache("t1", "note.md");
			expect(cache.loadTaskFromCacheID("t1")?.path).toBe("note.md");
		});
	});

	describe("projects, sections and events by id", () => {
		it("getProjectNameByIdFromCache resolves a known id", () => {
			expect(cache.getProjectNameByIdFromCache("proj-123")).toBe("Inbox");
			expect(cache.getProjectNameByIdFromCache("nope")).toBeNull();
		});
		it("section name/id round-trip via the cache", () => {
			cache.addSectionToCache("MySection", "sec-1", "proj-123");
			expect(cache.getSectionIdByNameFromCache("MySection")).toBe("sec-1");
			expect(cache.getSectionNameByIdFromCache("sec-1")).toBe("MySection");
		});
		it("appendEventsToCache then loadEventsFromCache", () => {
			cache.appendEventsToCache([
				{
					id: "e1",
					object_type: "item",
					object_id: "t1",
					event_type: "added",
					event_date: "2025-06-01T00:00:00Z",
				},
			]);
			expect(cache.loadEventsFromCache()).toHaveLength(1);
		});
	});

	describe("checkTaskIdIsOld", () => {
		it("flags 10-digit legacy ids and passes new alphanumeric ids", () => {
			expect(cache.checkTaskIdIsOld("1234567890")).toBe(true);
			expect(cache.checkTaskIdIsOld("6cfCcrHfXrFP6q3R")).toBe(false);
		});
	});
});
