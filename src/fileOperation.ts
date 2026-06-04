import type { App } from "obsidian";
import { TFile, Notice } from "obsidian";
import type AnotherSimpleTodoistSync from "../main";
export class FileOperation {
	app: App;
	plugin: AnotherSimpleTodoistSync;

	constructor(app: App, plugin: AnotherSimpleTodoistSync) {
		this.app = app;
		this.plugin = plugin;
	}

	// Complete a task to mark it as completed
	async completeTaskInTheFile(taskId: string) {
		// Get the task file path
		const currentTask =
			await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId);
		const filepath = currentTask?.path;
		if (!filepath) return;
		const file = this.app.vault.getAbstractFileByPath(filepath);

		// Get the file object and update the content
		let content: string | undefined;
		if (file instanceof TFile) {
			content = await this.app.vault.read(file);
		} else {
			return;
		}

		const lines = content.split("\n");
		let modified = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (
				line.includes(taskId) &&
				this.plugin.taskParser?.hasTodoistTag(line)
			) {
				lines[i] = line.replace("[ ]", "[x]");
				modified = true;
				break;
			}
		}

		if (modified) {
			const newContent = lines.join("\n");
			await this.app.vault.modify(file, newContent);
		}
	}

	// uncheck Completed tasks，
	async incompleteTaskInTheFile(taskId: string) {
		// Get the task file path
		const currentTask =
			await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId);
		const filepath = currentTask?.path;
		if (!filepath) return;
		const file = this.app.vault.getAbstractFileByPath(filepath);

		// Get the file object and update the content
		let content: string | undefined;
		if (file instanceof TFile) {
			content = await this.app.vault.read(file);
		} else {
			return;
		}

		const lines = content.split("\n");
		let modified = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (
				line.includes(taskId) &&
				this.plugin.taskParser?.hasTodoistTag(line)
			) {
				lines[i] = line.replace(/- \[(x|X)\]/g, "- [ ]");
				modified = true;
				break;
			}
		}

		if (modified) {
			const newContent = lines.join("\n");
			await this.app.vault.modify(file, newContent);
		}
	}

	//add #todoist at the end of task line, if full vault sync enabled
	async addTodoistTagToFile(filepath: string) {
		// Get the file object and update the content
		const file = this.app.vault.getAbstractFileByPath(filepath);
		// Check if the returned file is a TFile
		let content: string | undefined;
		if (file instanceof TFile) {
			content = await this.app.vault.read(file);
		} else {
			return;
		}

		const lines = content.split("\n");
		let modified = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!this.plugin.taskParser?.isMarkdownTask(line)) {
				continue;
			}
			//if content is empty
			if (this.plugin.taskParser?.getTaskContentFromLineText(line) === "") {
				continue;
			}
			if (
				!this.plugin.taskParser?.hasTodoistId(line) &&
				!this.plugin.taskParser?.hasTodoistTag(line)
			) {
				const newLine = this.plugin.taskParser?.addTodoistTag(line);
				lines[i] = newLine;
				modified = true;
			}
		}

		if (modified) {
			const newContent = lines.join("\n");
			await this.app.vault.modify(file, newContent);

			//update file metadata
			const metadata =
				await this.plugin.cacheOperation?.getFileMetadataByFilePath(filepath);
			if (!metadata) {
				await this.plugin.cacheOperation?.newEmptyFileMetadata(filepath);
			}
		}
	}

	//add Todoist at the line
	async addTodoistLinkToFile(filepath: string) {
		// Get the file object and update the content
		const file = this.app.vault.getAbstractFileByPath(filepath);
		// Check if the returned file is a TFile
		let content: string | undefined;
		if (file instanceof TFile) {
			content = await this.app.vault.read(file);
		} else {
			return;
		}

		const lines = content.split("\n");
		let modified = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (
				this.plugin.taskParser?.hasTodoistId(line) &&
				this.plugin.taskParser?.hasTodoistTag(line)
			) {
				if (this.plugin.taskParser?.hasTodoistLink(line)) {
					return;
				}
				const taskID = this.plugin.taskParser?.getTodoistIdFromLineText(line);
				if (!taskID) continue;
				const taskObject =
					this.plugin.cacheOperation?.loadTaskFromCacheID(taskID);
				const todoistLink = taskObject?.url;
				const link = `%%tid:: [${taskID}](${todoistLink})%%`;
				const newLine = this.plugin.taskParser?.addTodoistLink(line, link);
				lines[i] = newLine;
				modified = true;
			}
		}

		if (modified) {
			const newContent = lines.join("\n");
			await this.app.vault.modify(file, newContent);
		}
	}

	async addCurrentDateToTask(
		taskLine: number,
		filepath: string,
		currentDate: string,
		dueTime: string,
	) {
		const file = this.app.vault.getAbstractFileByPath(filepath);
		if (file instanceof TFile) {
			const content = await this.app.vault.read(file);
			const lines = content.split("\n");
			lines[taskLine] = lines[taskLine]
				.replace("⏰", "")
				.replace("⏲", "")
				.replace("$", "")
				.replace(`${dueTime}`, `🗓️${currentDate} ⏰${dueTime}`);
			const newContent = lines.join("\n");
			await this.app.vault.modify(file, newContent);
		}
	}

	//add #todoist at the end of task line, if full vault sync enabled
	async addTodoistTagToLine(
		filepath: string,
		lineText: string,
		lineNumber: number,
		fileContent: string,
	) {
		// Get the file object and update the content
		const file = this.app.vault.getAbstractFileByPath(filepath);
		// const content = fileContent
		// Check if the returned file is a TFile
		let content: string | undefined;
		if (file instanceof TFile) {
			content = fileContent;
		} else {
			return;
		}

		const lines = content.split("\n");
		let modified = false;

		const line = lineText;
		if (!this.plugin.taskParser?.isMarkdownTask(line)) {
			return;
		}
		//if content is empty
		if (this.plugin.taskParser?.getTaskContentFromLineText(line) === "") {
			return;
		}
		if (
			!this.plugin.taskParser?.hasTodoistId(line) &&
			!this.plugin.taskParser?.hasTodoistTag(line)
		) {
			const newLine = this.plugin.taskParser?.addTodoistTag(line);
			lines[lineNumber] = newLine;
			modified = true;
		}

		if (modified) {
			const newContent = lines.join("\n");
			await this.app.vault.modify(file, newContent);

			//update file metadata
			const metadata =
				await this.plugin.cacheOperation?.getFileMetadataByFilePath(filepath);
			if (!metadata) {
				await this.plugin.cacheOperation?.newEmptyFileMetadata(filepath);
			}
		}
	}

	// sync updated task content  to file
	async syncUpdatedTaskContentToTheFile(evt: {
		object_id: string;
		extra_data: { content: string };
	}) {
		const taskId = evt.object_id;
		// Get the task file path
		const currentTask =
			await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId);
		const filepath = currentTask?.path;
		if (!filepath) return;
		const file = this.app.vault.getAbstractFileByPath(filepath);

		// Get the file object and update its content
		let content: string | undefined;
		if (file instanceof TFile) {
			content = await this.app.vault.read(file);
		} else {
			return;
		}

		const lines = content.split("\n");
		let modified = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (
				line.includes(taskId) &&
				this.plugin.taskParser?.hasTodoistTag(line)
			) {
				const oldTaskContent =
					this.plugin.taskParser?.getTaskContentFromLineText(line);
				const newTaskContent = evt.extra_data.content;

				lines[i] = line.replace(oldTaskContent, newTaskContent);
				modified = true;
				new Notice(`Content changed for task ${taskId}.`);
				break;
			}
		}

		if (modified) {
			const newContent = lines.join("\n");
			await this.app.vault.modify(file, newContent);
		}
	}

	// sync updated task due date  to the file
	async syncUpdatedTaskDueDateToTheFile(evt: {
		object_id: string;
		extra_data: { due_date: string, last_due_date: string };
	}) {
		const taskId = evt.object_id;

		// Get the task file path
		const currentTask =
			await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId);
		const filepath = currentTask?.path;
		if (!filepath) return;
		const file = this.app.vault.getAbstractFileByPath(filepath);

		// Get the file object and update the content
		let content: string | undefined;
		if (file instanceof TFile) {
			content = await this.app.vault.read(file);
		} else {
			return;
		}

		const lines = content.split("\n");
		let modified = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			if (
				line.includes(taskId) &&
				this.plugin.taskParser?.hasTodoistTag(line)
			) {
				const lineTaskDueDate =
					this.plugin.taskParser?.getDueDateFromLineText(line) || "";
				const newTaskDueDate =
					this.plugin.taskParser?.ISOStringToLocalDateString(
						evt.extra_data.due_date,
					) || "";
				const lineTaskTime =
					this.plugin.taskParser?.getDueTimeFromLineText(line) || "";

				// If the task on the file doesn't have time, doesn't need to find the new time from the cache
				let newTaskTime = "";
				if (lineTaskTime === "") {
					newTaskTime =
						this.plugin.taskParser?.ISOStringToLocalClockTimeString(
							evt.extra_data.due_date,
						) || "";
				}
				if(lineTaskTime !== "" && newTaskTime === ""){
					newTaskTime = this.plugin.taskParser?.ISOStringToLocalClockTimeString(
						evt.extra_data.due_date,
					) || "";
				}
				// TODO how to handle when the task has the new "time slot" with start + finish time?

				if (this.plugin.taskParser && lineTaskDueDate === "") {
					const userDefinedTag =
						this.plugin.taskParser?.keywords_function("TODOIST_TAG");
					const tagWithDateAndSymbol = ` 🗓️${newTaskDueDate} ${userDefinedTag}`;
					lines[i] = lines[i].replace(userDefinedTag, tagWithDateAndSymbol);
					modified = true;
					new Notice(`New due date found for ${taskId}.`);
				}

				if (lineTaskTime === "" && newTaskTime !== "") {
					const userDefinedTag =
						this.plugin.taskParser?.keywords_function("TODOIST_TAG");
					const tagWithTimeAndSymbol = `⏰${newTaskTime} ${userDefinedTag}`;
					lines[i] = lines[i].replace(userDefinedTag, tagWithTimeAndSymbol);
					modified = true;
					new Notice(`Due datetime included for ${taskId}.`);
				}

				if (newTaskDueDate === "") {
					// Remove date from text
					const regexRemoveDate = /(🗓️|📅|📆|🗓|@)\s?\d{4}-\d{2}-\d{2}/; // Match date format like 🗓️YYYY-MM-DD
					lines[i] = line.replace(regexRemoveDate, "");
					modified = true;
					new Notice(`Due date removed from ${taskId}.`);
				}

				if (lineTaskDueDate !== "" && lineTaskDueDate !== newTaskDueDate) {
					lines[i] = lines[i].replace(
						lineTaskDueDate.trim(),
						newTaskDueDate.trim(),
					);
					modified = true;
					new Notice(`Due date for ${taskId} changed to ${newTaskDueDate}.`);
				}

				if (
					lineTaskTime !== "" &&
					newTaskTime !== "" &&
					lineTaskTime !== newTaskTime
				) {
					lines[i] = lines[i].replace(lineTaskTime.trim(), newTaskTime.trim());
					lines[i] = lines[i].replace(
						lineTaskDueDate.trim(),
						newTaskDueDate.trim(),
					);
					modified = true;
					new Notice(`Due datetime for ${taskId} changed to ${newTaskTime}.`);
				}

				break;
			}
		}

		if (modified) {
			const newContent = lines.join("\n");
			await this.app.vault.modify(file, newContent);
		}
	}

	// sync new task note to file
	async syncAddedTaskNoteToTheFile(evt: {
		parent_item_id: string;
		event_date: string;
		extra_data: { content: string; event_date: string };
	}) {
		const taskId = evt.parent_item_id;
		const note = evt.extra_data.content;
		const datetime = this.plugin.taskParser?.ISOStringToLocalDatetimeString(
			evt.event_date,
		);
		// Get the task file path
		const currentTask =
			await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId);
		const filepath = currentTask?.path;
		if (!filepath) return;
		const file = this.app.vault.getAbstractFileByPath(filepath);

		// Get the file object and update its content
		let content: string | undefined;
		if (file instanceof TFile) {
			content = await this.app.vault.read(file);
		} else {
			return;
		}

		const lines = content.split("\n");
		let modified = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (
				line.includes(taskId) &&
				this.plugin.taskParser?.hasTodoistTag(line)
			) {
				const indent = "\t".repeat(line.length - line.trimStart().length + 1);
				const noteLine = `${indent}- ${datetime} ${note}`;
				lines.splice(i + 1, 0, noteLine);
				modified = true;
				break;
			}
		}

		if (modified) {
			if (this.plugin.settings.commentsSync) {
				const newContent = lines.join("\n");
				await this.app.vault.modify(file, newContent);
			}
		}
	}

	// Avoid this approach; use the editor view to get a live-updated value instead
	async readContentFromFilePath(filepath: string) {
		try {
			const file = this.app.vault.getAbstractFileByPath(filepath);
			// const content = await this.app.vault.read(file);
			let content: string | undefined;
			if (file instanceof TFile) {
				content = await this.app.vault.read(file);
			} else {
				return;
			}
			return content;
		} catch (error) {
			console.error(`Error loading content from ${filepath}: ${error}`);
			return false;
		}
	}

	//get line text from file path
	//Please use view.editor.getLine，read Method has delay
	async getLineTextFromFilePath(filepath: string, lineNumber: number) {
		const file = this.app.vault.getAbstractFileByPath(filepath);
		// const content = await this.app.vault.read(file)
		let content: string | undefined;
		if (file instanceof TFile) {
			content = await this.app.vault.read(file);
		} else {
			return;
		}

		const lines = content.split("\n");
		return lines[lineNumber];
	}

	//search todoist_id by content
	async searchTodoistIdFromFilePath(
		filepath: string,
		searchTerm: string,
	): Promise<string | null> {
		const file = this.app.vault.getAbstractFileByPath(filepath);
		// const fileContent = await this.app.vault.read(file)
		// const content = await this.app.vault.read(file);
		let fileContent: string | undefined;
		if (file instanceof TFile) {
			fileContent = await this.app.vault.read(file);
		} else {
			fileContent = "";
		}
		const fileLines = fileContent.split("\n");
		let todoistId: string | null = null;

		for (let i = 0; i < fileLines.length; i++) {
			const line = fileLines[i];

			if (line.includes(searchTerm)) {
				// const regexResult = /\[todoist_id::\s*(\w+)\]/.exec(line);
				const regexResult = /\[tid::\s*(\w+)\]/.exec(line);

				if (regexResult) {
					todoistId = regexResult[1];
				}

				break;
			}
		}

		return todoistId;
	}

	//get all files in the vault
	async getAllFilesInTheVault() {
		const files = this.app.vault.getFiles();
		return files;
	}

	//search filepath by taskId in vault
	async searchFilePathsByTaskIdInVault(taskId: string) {
		const files = await this.getAllFilesInTheVault();
		const tasks = files.map(async (file) => {
			if (!this.isMarkdownFile(file.path)) {
				return;
			}
			const fileContent = await this.app.vault.cachedRead(file);
			if (fileContent.includes(taskId)) {
				return file.path;
			}
		});

		const results = await Promise.all(tasks);
		const filePaths = results.filter((filePath) => filePath !== undefined);
		return filePaths[0] || null;
		//return filePaths || null
	}

	isMarkdownFile(filename: string) {
		// Get the file extension
		let extension = filename.split(".").pop();

		// Convert the extension to lowercase (Markdown files usually have .md extension)
		extension = extension?.toLowerCase();

		// Check if the extension is .md
		if (extension === "md") {
			return true;
		}
		return false;
	}
}
