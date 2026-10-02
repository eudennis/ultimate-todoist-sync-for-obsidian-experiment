// Minimal Todoist Unified API (v1) client used by the harness to arrange state
// and to assert on what the plugin did. Real HTTP only — nothing is stubbed.

import { redactSecrets } from "./env";

const BASE = "https://api.todoist.com/api/v1";

export interface TodoistDue {
	date: string;
	string?: string;
	timezone?: string | null;
	is_recurring?: boolean;
	lang?: string;
}

export interface TodoistTask {
	id: string;
	content: string;
	description: string;
	project_id: string;
	section_id: string | null;
	parent_id: string | null;
	labels: string[];
	priority: number;
	due: TodoistDue | null;
	deadline: { date: string } | null;
	duration: { amount: number; unit: "minute" | "day" } | null;
	checked: boolean;
	is_deleted?: boolean;
}

export interface TodoistProject {
	id: string;
	name: string;
}

export interface TodoistSection {
	id: string;
	name: string;
	project_id: string;
}

export class TodoistApiError extends Error {
	constructor(
		readonly status: number,
		readonly method: string,
		readonly url: string,
		readonly body: string,
	) {
		super(`Todoist ${method} ${url} → HTTP ${status}: ${body.slice(0, 500)}`);
	}
}

type Paginated<T> = { results: T[]; next_cursor: string | null };

export class TodoistClient {
	/** Last few request/response pairs, attached to failing tests as evidence. */
	readonly log: Array<{ at: string; method: string; url: string; status: number; body: string }> = [];

	constructor(private readonly token: string) {}

	private async request<T>(method: string, pathAndQuery: string, body?: unknown): Promise<T> {
		const url = `${BASE}${pathAndQuery}`;
		for (let attempt = 1; ; attempt++) {
			const res = await fetch(url, {
				method,
				headers: {
					Authorization: `Bearer ${this.token}`,
					...(body !== undefined ? { "Content-Type": "application/json" } : {}),
				},
				body: body !== undefined ? JSON.stringify(body) : undefined,
			});
			const text = await res.text();
			this.log.push({ at: new Date().toISOString(), method, url, status: res.status, body: redactSecrets(text).slice(0, 2000) });
			if (this.log.length > 50) this.log.shift();

			// Rate limit / transient server errors: back off and retry.
			if ((res.status === 429 || res.status >= 500) && attempt < 6) {
				const retryAfter = Number(res.headers.get("retry-after"));
				const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
				await new Promise((r) => setTimeout(r, Math.min(delayMs, 60_000)));
				continue;
			}
			if (!res.ok) throw new TodoistApiError(res.status, method, url, text);
			return (text ? JSON.parse(text) : undefined) as T;
		}
	}

	private async paginate<T>(pathAndQuery: string): Promise<T[]> {
		const out: T[] = [];
		let cursor: string | null = null;
		do {
			const sep = pathAndQuery.includes("?") ? "&" : "?";
			const page: Paginated<T> = await this.request("GET", `${pathAndQuery}${sep}limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
			out.push(...page.results);
			cursor = page.next_cursor;
		} while (cursor);
		return out;
	}

	getUser() {
		return this.request<{ id: string; email: string; full_name: string; is_premium?: boolean; tz_info?: { timezone: string } }>(
			"GET",
			"/user",
		);
	}

	listProjects() {
		return this.paginate<TodoistProject>("/projects");
	}

	createProject(name: string) {
		return this.request<TodoistProject>("POST", "/projects", { name });
	}

	async deleteProject(id: string) {
		try {
			await this.request("DELETE", `/projects/${id}`);
		} catch (e) {
			if (!(e instanceof TodoistApiError && e.status === 404)) throw e;
		}
	}

	createSection(name: string, projectId: string) {
		return this.request<TodoistSection>("POST", "/sections", { name, project_id: projectId });
	}

	listSections(projectId: string) {
		return this.paginate<TodoistSection>(`/sections?project_id=${projectId}`);
	}

	/** Active (uncompleted) tasks in a project. */
	listTasks(projectId: string) {
		return this.paginate<TodoistTask>(`/tasks?project_id=${projectId}`);
	}

	/** Returns null when the task no longer exists (deleted). Completed tasks are returned with checked=true. */
	async getTask(id: string): Promise<TodoistTask | null> {
		try {
			const task = await this.request<TodoistTask>("GET", `/tasks/${id}`);
			return task.is_deleted ? null : task;
		} catch (e) {
			if (e instanceof TodoistApiError && e.status === 404) return null;
			throw e;
		}
	}

	createTask(task: {
		content: string;
		project_id: string;
		section_id?: string;
		labels?: string[];
		priority?: number;
		due_date?: string;
		due_datetime?: string;
		due_string?: string;
		description?: string;
	}) {
		return this.request<TodoistTask>("POST", "/tasks", task);
	}

	updateTask(id: string, updates: Partial<{ content: string; due_date: string; due_string: string; labels: string[]; priority: number }>) {
		return this.request<TodoistTask>("POST", `/tasks/${id}`, updates);
	}

	closeTask(id: string) {
		return this.request<void>("POST", `/tasks/${id}/close`);
	}

	reopenTask(id: string) {
		return this.request<void>("POST", `/tasks/${id}/reopen`);
	}

	addComment(taskId: string, content: string) {
		return this.request<{ id: string; content: string }>("POST", "/comments", { task_id: taskId, content });
	}

	listLabels() {
		return this.paginate<{ id: string; name: string }>("/labels");
	}

	async deleteLabel(id: string) {
		try {
			await this.request("DELETE", `/labels/${id}`);
		} catch (e) {
			if (!(e instanceof TodoistApiError && e.status === 404)) throw e;
		}
	}

	/** The plugin's Todoist→Obsidian sync reads this endpoint. Throws if the account can't access it. */
	getActivities() {
		return this.request<{ results: unknown[] }>("GET", "/activities");
	}

	/** Reminders are only exposed through the Sync endpoint. */
	async listReminders(): Promise<Array<{ id: string; item_id: string; type: string; due?: TodoistDue }>> {
		const res = await this.request<{ reminders?: Array<{ id: string; item_id: string; type: string; due?: TodoistDue; is_deleted?: boolean }> }>(
			"POST",
			"/sync",
			{ sync_token: "*", resource_types: ["reminders"] },
		);
		return (res.reminders ?? []).filter((r) => !r.is_deleted);
	}

	async addReminder(taskId: string, dueDatetimeUtc: string) {
		const uuid = crypto.randomUUID();
		await this.request("POST", "/sync", {
			commands: [
				{
					type: "reminder_add",
					uuid,
					temp_id: crypto.randomUUID(),
					args: { item_id: taskId, type: "absolute", due: { date: dueDatetimeUtc } },
				},
			],
		});
	}

	/**
	 * Deletes every project and personal label whose name starts with `prefix`
	 * (case-insensitive). Only ever called with the harness prefix, on an account
	 * that already passed the email guard.
	 */
	async sweep(prefix: string, filter: (name: string) => boolean = () => true) {
		const lower = prefix.toLowerCase();
		const projects = (await this.listProjects()).filter((p) => p.name.toLowerCase().startsWith(lower) && filter(p.name));
		for (const p of projects) await this.deleteProject(p.id);
		const labels = (await this.listLabels()).filter((l) => l.name.toLowerCase().startsWith(lower) && filter(l.name));
		for (const l of labels) await this.deleteLabel(l.id);
		return { projects: projects.length, labels: labels.length };
	}
}
