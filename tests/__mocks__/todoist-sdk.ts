import { vi } from "vitest";

// TodoistNewAPI imports { TodoistApi } from "@doist/todoist-sdk" at the module
// level (a real value import). We only ever construct it in initializeNewAPI();
// every actual network call goes through obsidian's requestUrl, so a hollow stub
// is enough to keep the import resolvable without pulling in the real SDK.
export class TodoistApi {
	constructor(_token: string) {}
	getTask = vi.fn();
	getTasks = vi.fn();
	addTask = vi.fn();
	updateTask = vi.fn();
	deleteTask = vi.fn();
	closeTask = vi.fn();
	reopenTask = vi.fn();
	getProjects = vi.fn();
	getSections = vi.fn();
}
