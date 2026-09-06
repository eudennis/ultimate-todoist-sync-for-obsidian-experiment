import { type App, Modal, Notice, Setting } from "obsidian";
import type { Editor } from "obsidian";
import type AnotherSimpleTodoistSync from "../main";
import type { FileMetadata, Task } from "./cacheOperation";

export class ImportTaskFromTodoistModal extends Modal {
	plugin: AnotherSimpleTodoistSync;
	editor: Editor;
	filepath: string;

	constructor(app: App, plugin: AnotherSimpleTodoistSync, editor: Editor, filepath: string) {
		super(app);
		this.plugin = plugin;
		this.editor = editor;
		this.filepath = filepath;
		this.open();
	}

	onOpen() {
		this.renderUrlInput();
	}

	onClose() {
		this.contentEl.empty();
	}

	private renderUrlInput() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h5", { text: "Another Simple Todoist Sync: Import task from Todoist link" });

		let url = "";

		new Setting(contentEl)
			.setName("Todoist task URL")
			.setDesc("Paste the URL of the Todoist task you want to import.")
			.addText((text) =>
				text
					.setPlaceholder("https://app.todoist.com/app/task/...")
					.onChange((value) => {
						url = value.trim();
					}),
			)
			.addButton((button) =>
				button
					.setButtonText("Fetch task")
					.setCta()
					.onClick(async () => {
						const taskId = this.extractTaskId(url);
						if (!taskId) {
							new Notice("Invalid Todoist URL. Please paste a valid task link.");
							return;
						}
						if (this.editor.getValue().includes(`[${taskId}](`)) {
							new Notice("This task is already imported in this file.");
							return;
						}
						try {
							button.setButtonText("Fetching…").setDisabled(true);
							const task = await this.plugin.todoistNewAPI?.getTaskById(taskId);
							if (!task) {
								new Notice("Could not fetch task. Check the URL and your API token.");
								return;
							}
							this.renderPreview(task);
						} catch (error) {
							new Notice("Could not fetch task. Check the URL and your API token.");
							console.error("ImportTaskFromTodoistModal fetch error:", error);
							button.setButtonText("Fetch task").setDisabled(false);
						}
					}),
			);
	}

	private renderPreview(task: Record<string, unknown>) {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h5", { text: "Another Simple Todoist Sync: Import task from Todoist link" });

		const due = task.due as { date?: string; datetime?: string; timezone?: string } | null | undefined;
		const labels = (task.labels as string[] | undefined) ?? [];
		const priority = (task.priority as number | undefined) ?? 1;
		const priorityLabel = this.invertPriority(priority);

		new Setting(contentEl).setName("Task content").setDesc(String((task.content as string | undefined) ?? "")).setDisabled(true);

		if (due?.date) {
			const dateOnly = due.date.split("T")[0];
			const datetimeStr = due.datetime ?? (due.date.includes("T") ? due.date : undefined);
			const timeStr = datetimeStr ? this.extractTime(datetimeStr, due.timezone) : "";
			new Setting(contentEl).setName("Due date").setDesc(timeStr ? `${dateOnly} ${timeStr}` : dateOnly).setDisabled(true);
		}

		if (labels.length > 0) {
			new Setting(contentEl).setName("Labels").setDesc(labels.map((l) => `#${l}`).join(" ")).setDisabled(true);
		}

		if (priorityLabel) {
			new Setting(contentEl).setName("Priority").setDesc(priorityLabel).setDisabled(true);
		}

		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText("Insert task")
					.setCta()
					.onClick(async () => {
						await this.insertTask(task);
					}),
			)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => {
					this.close();
				}),
			);
	}

	private extractTaskId(url: string): string | null {
		// app URI: todoist://task?id=ID
		const appUriMatch = url.match(/todoist:\/\/task\?id=([a-zA-Z0-9]+)/);
		if (appUriMatch?.[1]) return appUriMatch[1];

		// Web URL: .../task/SLUG where SLUG may be "task-name-ID" or just "ID"
		// The ID is always the last hyphen-delimited segment (pure alphanumeric, length > 4)
		const webMatch = url.match(/(?:app\.)?todoist\.com\/app\/(?:project\/[^/]+\/)?task\/([a-zA-Z0-9-]+)/);
		if (webMatch?.[1]) {
			const parts = webMatch[1].split("-");
			// Walk from the end: find the last segment that looks like a Todoist ID
			for (let i = parts.length - 1; i >= 0; i--) {
				if (/^[a-zA-Z0-9]{5,}$/.test(parts[i])) {
					return parts[i];
				}
			}
			return webMatch[1]; // fallback: return the whole slug if no clear ID found
		}
		return null;
	}

	private invertPriority(apiPriority: number): string {
		// Todoist API: 1=normal/default, 4=urgent. Plugin syntax: !!1=urgent, !!4=normal (omit default).
		switch (apiPriority) {
			case 4: return "!!1 (Urgent)";
			case 3: return "!!2 (High)";
			case 2: return "!!3 (Medium)";
			default: return "";
		}
	}

	private invertPriorityToSyntax(apiPriority: number): string {
		switch (apiPriority) {
			case 4: return " !!1";
			case 3: return " !!2";
			case 2: return " !!3";
			default: return "";
		}
	}

	private extractTime(datetime: string, timezone?: string): string {
		// datetime is an ISO string like "2025-06-01T14:30:00Z".
		// Use the task's own timezone so the displayed time matches what Todoist shows,
		// regardless of the machine's local timezone. Falls back to system local time.
		try {
			const date = new Date(datetime);
			const formatted = new Intl.DateTimeFormat("en-US", {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
				timeZone: timezone,
			}).format(date);
			// Intl produces "HH:MM" in 24h; normalise edge case "24:00" → "00:00"
			const [h, m] = formatted.split(":").map(Number);
			const hh = String(h % 24).padStart(2, "0");
			const mm = String(m).padStart(2, "0");
			return `${hh}:${mm}`;
		} catch {
			// Invalid or absent timezone — fall back to system local time
			const date = new Date(datetime);
			return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
		}
	}

	private formatTaskLine(task: Record<string, unknown>): string {
		const content = String((task.content as string | undefined) ?? "");
		const due = task.due as { date?: string; datetime?: string; timezone?: string } | null | undefined;
		const labels = (task.labels as string[] | undefined) ?? [];
		const priority = (task.priority as number | undefined) ?? 1;
		const taskId = String((task.id as string | undefined) ?? "");
		const syncTag = this.plugin.settings.customSyncTag ?? "#tdsync";

		const taskUrl = this.plugin.settings.linksAppURI
			? `todoist://task?id=${taskId}`
			: `https://app.todoist.com/app/task/${taskId}`;

		let line = `- [ ] ${content}`;

		if (due?.date) {
			// Todoist REST API v1 puts the full datetime into due.date (e.g. "2026-05-31T19:00:00Z")
			// when a time is set; due.datetime is a v2-era field that may not be present.
			const dateOnly = due.date.split("T")[0];
			line += ` 📅${dateOnly}`;

			const datetimeStr = due.datetime ?? (due.date.includes("T") ? due.date : undefined);
			if (datetimeStr) {
				const time = this.extractTime(datetimeStr, due.timezone);
				if (time) {
					line += ` ⏰${time}`;
				}
			}
		}

		line += this.invertPriorityToSyntax(priority);

		if (labels.length > 0) {
			line += ` ${labels.map((l) => `#${l}`).join(" ")}`;
		}

		line += ` ${syncTag} %%[tid:: [${taskId}](${taskUrl})]%%`;

		return line;
	}

	private async insertTask(task: Record<string, unknown>) {
		const taskId = String((task.id as string | undefined) ?? "");
		if (!taskId) {
			new Notice("Task ID is missing, cannot insert.");
			return;
		}

		if (this.editor.getValue().includes(`[${taskId}](`)) {
			new Notice("This task is already imported in this file.");
			this.close();
			return;
		}

		const formattedLine = this.formatTaskLine(task);

		// Insert at current cursor position
		const cursor = this.editor.getCursor();
		this.editor.replaceRange(`${formattedLine}\n`, cursor);

		// Save task to cache
		this.plugin.cacheOperation?.appendTaskToCache(task as unknown as Task);
		this.plugin.cacheOperation?.appendPathToTaskInCache(taskId, this.filepath);

		// Update file metadata so deletedTaskCheck and fullTextModifiedTaskCheck track this task
		const current = await this.plugin.cacheOperation?.getFileMetadataByFilePath(this.filepath);
		const newMetadata: FileMetadata = {
			todoistTasks: [...(current?.todoistTasks ?? []), taskId],
			todoistCount: (current?.todoistCount ?? 0) + 1,
		};
		await this.plugin.cacheOperation?.updateFileMetadata(this.filepath, newMetadata);

		await this.plugin.saveSettings();

		new Notice(`Task "${String((task.content as string | undefined) ?? "")}" imported successfully.`);
		this.close();
	}
}
