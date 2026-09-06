import type AnotherSimpleTodoistSync from "../main";
import type { App } from "obsidian";
import { Notice } from "obsidian";
import type { Task } from "./cacheOperation";
export class TaskParser {
	app: App;
	plugin: AnotherSimpleTodoistSync;

	constructor(app: App, plugin: AnotherSimpleTodoistSync) {
		//super(app,settings);
		this.app = app;
		this.plugin = plugin;
	}

	// Builds a " (File x.md on line y)" suffix for warnings/errors tied to a specific task line
	private locationSuffix(filepath?: string, lineNumber?: number): string {
		if (!filepath || lineNumber === undefined) {
			return "";
		}
		return ` (File ${filepath} on line ${lineNumber})`;
	}

	//convert line text to a task object
	async convertTextToTodoistTaskObject(
		lineText: string,
		filepath: string,
		lineNumber?: number,
		fileContent?: string,
	) {
		let hasParent = false;
		let parentId = null;
		let parentTaskObject = null;
		let textWithoutIndentation = lineText;
		// TODO need to remove any empty spaces from the task
		if (this.getTabIndentation(lineText) > 0) {
			textWithoutIndentation = this.removeTaskIndentation(lineText);
			const lines = fileContent?.split("\n") || "";

			for (let i = Number(lineNumber) - 1; i >= 0; i--) {
				const line = lines[i];
				if (this.isLineBlank(line)) {
					break;
				}
				if (this.getTabIndentation(line) >= this.getTabIndentation(lineText)) {
					continue;
				}
				if (this.getTabIndentation(line) < this.getTabIndentation(lineText)) {
					if (this.hasTodoistId(line)) {
						parentId = this.getTodoistIdFromLineText(line);
						hasParent = true;
						parentTaskObject = this.plugin.cacheOperation?.loadTaskFromCacheID(
							parentId ?? "",
						);
						break;
					}
					break;
				}
			}
		}

		let dueDateVsDatetime = "";
		if(this.hasCalendarEmoji(textWithoutIndentation) && !this.hasDueDate(textWithoutIndentation, filepath, lineNumber)){
			console.warn(`Task has calendar emoji trigger, but due date seems to be missing. Please provide a valid due date.${this.locationSuffix(filepath, lineNumber)}`);
		}
		if (
			this.hasDueDateTime(textWithoutIndentation) &&
			this.hasDueDate(textWithoutIndentation, filepath, lineNumber)
		) {
			dueDateVsDatetime = "datetime";
		}
		if (
			this.hasDueDate(textWithoutIndentation, filepath, lineNumber) &&
			!this.hasDueDateTime(textWithoutIndentation)
		) {
			dueDateVsDatetime = "date";
		}
		if (
			!this.hasDueDate(textWithoutIndentation, filepath, lineNumber) &&
			this.hasDueTime(textWithoutIndentation)
		) {
			dueDateVsDatetime = "time";
		}
		if(!this.hasDueDate(textWithoutIndentation, filepath, lineNumber) && this.hasDueTime(textWithoutIndentation) && this.hasCalendarEmoji(textWithoutIndentation)){
			console.warn(`Task has calendar emoji trigger and time, but due date seems to be missing. Please provide a valid due date.${this.locationSuffix(filepath, lineNumber)}`);
			dueDateVsDatetime = "";
		}

		let dueDate = "";
		let dueDatetime = "";
		let dueTime = "";
		if (dueDateVsDatetime === "datetime") {
			dueDate = this.getDueDateFromLineText(textWithoutIndentation) ?? "";
			dueTime = this.getDueTimeFromLineText(textWithoutIndentation, filepath, lineNumber) ?? "";
			dueDate = this.convertDueDateToProperFormat(dueDate, filepath, lineNumber);
			dueDatetime = `${dueDate}T${dueTime}:00`;
		}
		if (dueDateVsDatetime === "time") {
			dueTime = this.getDueTimeFromLineText(textWithoutIndentation, filepath, lineNumber) ?? "";
			const currentDate = new Date().toISOString().split("T")[0];
			dueDatetime = `${currentDate}T${dueTime}:00`;
			await this.plugin.fileOperation?.addCurrentDateToTask(
				lineNumber ?? 0,
				filepath,
				currentDate,
				dueTime,
			);
		}
		if (dueDateVsDatetime === "date") {
			dueDate = this.getDueDateFromLineText(textWithoutIndentation) ?? "";
			dueDate = this.convertDueDateToProperFormat(dueDate, filepath, lineNumber);
		}

		const labels = this.getAllTagsFromLineText(textWithoutIndentation);

		const section = this.getFirstSectionFromLineText(textWithoutIndentation);

		let project_name = this.getProjectNameFromCommentOnLineText(
			textWithoutIndentation,
		);
		let sectionId: string | undefined | null;

		const hasDuration = this.hasDuration(textWithoutIndentation);

		let durationTime = 0;
		if (hasDuration) {
			durationTime = Number(
				this.getTaskDurationFromLineText(textWithoutIndentation, filepath, lineNumber),
			);
		}

		let durationUnit = "";
		if (durationTime > 1440) {
			durationUnit = "day";
		} else {
			durationUnit = "minute";
		}

		let projectId = this.plugin.cacheOperation?.getDefaultProjectIdForFilepath(
			filepath,
		);
		if (!projectId) {
			console.error(`projectId was not found.${this.locationSuffix(filepath, lineNumber)}`);
			new Notice(
				"ProjectId was not found. Please select a default project on settings",
			);
		}

		if (!project_name && projectId) {
			project_name =
				this.plugin.cacheOperation?.getProjectNameByIdFromCache(projectId) ??
				"";
		}

		if (project_name) {
			const hasProjectOnCache =
				this.plugin.cacheOperation?.checkIfProjectExistOnCache(project_name);
			if (hasProjectOnCache) {
				projectId = hasProjectOnCache.toString();
			}
			if (!hasProjectOnCache) {
				const newProject =
					await this.plugin.todoistNewAPI?.createNewProject(project_name);
				projectId = newProject?.id;
				if (newProject) {
					this.plugin.cacheOperation?.addProjectToCache(
						project_name,
						newProject?.id,
					);
				}
			}
		}
		if (!projectId) {
			console.error(`projectId was not found.${this.locationSuffix(filepath, lineNumber)}`);
		}
		if (!project_name) {
			console.error(`project_name was not found.${this.locationSuffix(filepath, lineNumber)}`);
		}

		// If the task has section, it tries to retrieve from cache, if don't find, create a new one and store it on cache.
		if (section) {
			let hasSectionOnCache = false;
			if (projectId) {
				hasSectionOnCache = Boolean(
					this.plugin.cacheOperation?.checkIfSectionExistOnCache(
						section,
						projectId,
					),
				);
				if (hasSectionOnCache) {
					sectionId =
						this.plugin.cacheOperation?.getSectionIdByNameFromCache(section);
				}
			}
			if (!hasSectionOnCache) {
				if (projectId) {
					const newSection = await this.plugin.todoistNewAPI?.createNewSection(
						section,
						projectId,
					);
					sectionId = newSection?.id;
					if (newSection) {
						this.plugin.cacheOperation?.addSectionToCache(
							section,
							newSection?.id,
							projectId,
						);
					}
				}
			}
		}

		if (hasParent) {
			projectId = parentTaskObject?.project_id ?? "";
		}

		if (!hasParent && labels) {
			// Matching tags and projects
			for (const label of labels) {
				let labelName = label.replace(/#/g, "");
				if (labelName.includes("/")) {
					labelName = labelName.split("/").pop() ?? labelName;
				}
				const hasProjectId =
					this.plugin.cacheOperation?.getProjectIdByNameFromCache(labelName);
				if (!hasProjectId) {
					continue;
				}
				projectId = hasProjectId.toString();
				break;
			}
		}

		let content = this.getTaskContentFromLineText(textWithoutIndentation);
		if (content === "") {
			// We use the obsidian's note as default task content
			content = filepath.replace(/^.*[\\/]/, "").replace(".md", "");
		}
		const isCompleted = this.isTaskCheckboxChecked(textWithoutIndentation);
		let description = "";
		const todoist_id = this.getTodoistIdFromLineText(textWithoutIndentation);
		const priority = this.getTaskPriority(textWithoutIndentation);

		const deadlineDate = this.getDeadlineDateFromLineText(textWithoutIndentation, filepath, lineNumber);

		if (filepath) {
			const url = encodeURI(
				`obsidian://open?vault=${this.app.vault.getName()}&file=${filepath}`,
			);
			description = `[${filepath}](${url})`;
		}

		const todoistTask: Task = {
			id: todoist_id || "",
			project_id: projectId ?? "",
			content: content || "",
			parent_id: parentId || "",
			section_id: sectionId || undefined,
			due_date: dueDate || undefined,
			due_datetime: dueDatetime || undefined,
			labels: labels || [],
			description: description,
			isCompleted: isCompleted,
			priority: priority,
			path: filepath,
			duration: durationTime || undefined,
			duration_unit: durationUnit as "minute" | "day" | undefined,
			url: `https://todoist.com/app/task/${todoist_id || ""}`,
			...(deadlineDate ? { deadline_date: deadlineDate } : {}),
		};

		return todoistTask;
	}

	convertDueDateToProperFormat(text:string, filepath?: string, lineNumber?: number){
		const regexCorrectFormat = /(\d{4})-(\d{2})-(\d{2})/;
		const regex = /(\d{2,4})-(\d{1,2})-(\d{1,2})/;
		const hasCorrectFormat = regexCorrectFormat.test(text)
		if(hasCorrectFormat) {
			return text
		}

		const findAllGroups = text.match(regex)

		if (findAllGroups === null) {
			console.error(`Due date format is incorrect, task won't be created. Expected format: YYYY-MM-DD.${this.locationSuffix(filepath, lineNumber)}`);
			return ""
		}

		const year = findAllGroups[1];
		const month = findAllGroups[2];
		const day = findAllGroups[3];
		
		
		const fullYear = year.length === 2 ? `20${year}` : year;
		const fullMonth = month.length === 1 ? `0${month}` : month;
		const fullDay = day.length === 1 ? `0${day}` : day;
		return `${fullYear}-${fullMonth}-${fullDay}`;
	}

	keywords_function(text: string) {
		if (text === "TODOIST_TAG") {
			const customSyncTagValue = this.plugin.settings.customSyncTag;

			return customSyncTagValue;
		}
		if (text === "DUE_DATE") {
			if (this.plugin.settings.alternativeKeywords) {
				return "🗓️|📅|📆|🗓|@";
			}
			return "🗓️|📅|📆|🗓";
		}
		// TODO add keywords for duration
		if (text === "DURATION") {
			if (this.plugin.settings.alternativeKeywords) {
				return "⏳|&";
			}
			return "⏳";
		}
		if (text === "DUE_TIME") {
			if (this.plugin.settings.alternativeKeywords) {
				return "⏰|⏲|\\$";
			}
			return "⏰|⏲";
		}
		return "No such keyword";
	}

	//   Return true or false if the text has a Todoist tag
	hasTodoistTag(text: string) {
		const regex_test = new RegExp(
			`^[\\s]*[-] \\[[x ]\\] [\\s\\S]*${this.keywords_function("TODOIST_TAG")}[\\s\\S]*$`,
			"i",
		);

		return regex_test.test(text);
	}

	// Return true/false if the text has a duration
	hasDuration(text: string) {
		const regex_test = new RegExp(
			`(${this.keywords_function("DURATION")})\\d+min`,
		);
		return regex_test.test(text);
	}

	//   Return true or false if the text has a Todoist id
	hasTodoistId(text: string) {
		if (text === "") {
			return null;
		}
		const regex_tag_test = new RegExp(
			/tid:: \[[a-zA-Z0-9]+\]\((?:https:\/\/app.todoist.com\/app\/task\/[a-zA-Z0-9]+|todoist:\/\/task\?id=[a-zA-Z0-9]+)\)/,
		).test(text);
		return regex_tag_test;
	}

	hasCalendarEmoji(text:string){
		const regex_test = new RegExp(
			`(${this.keywords_function("DUE_DATE")})`,
		);
		if(regex_test){
			return true;
		}
		return false;
	}

	//   Return true or false if the text has a due date
	hasDueDate(text: string, filepath?: string, lineNumber?: number) {
		const regex_test = new RegExp(
			`(${this.keywords_function("DUE_DATE")})\\s?(\\d{2}(?:\\d{2})?)-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\\d|3[01])`,
		);
		if(this.hasCalendarEmoji(text) && !regex_test.test(text)){
			console.warn(`Task has due date trigger, but date format seems to be wrong. Please provide a valid YYYY-MM-DD format.${this.locationSuffix(filepath, lineNumber)}`);
		}

		return regex_test.test(text);
	}
	hasDueTime(text: string) {
		const regex_test = new RegExp(
			`(${this.keywords_function("DUE_TIME")})\\s?\\d{1,2}:\\d{2}`,
		);

		return regex_test.test(text);
	}
	hasDueDateTime(text: string) {
		const regex_test = new RegExp(
			`(${this.keywords_function("DUE_TIME")})\\s?\\d{1,2}:\\d{2}`,
		);
		const regex_test_datetime = new RegExp(
			`(?:${this.keywords_function("DUE_DATE")})\\s?(\\d{2}(?:\\d{2})?)-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\\d|3[01])`,
		);
		if (regex_test.test(text) && regex_test_datetime.test(text)) {
			return true;
		}

		return false;
	}

	// Get the due date from the text
	getDueDateFromLineText(text: string) {
		const regex_test = new RegExp(
			`(?:${this.keywords_function("DUE_DATE")})\\s?(?:\\d{4}|\\d{2})-(?:0[1-9]|1[0-2]|[1-9])-(?:0[1-9]|[12]\\d|3[01]|2[1-9]|[1-9])`,
		);

		const dueDateKeywords = this.keywords_function("DUE_DATE").split("|");

		const due_date = regex_test.exec(text);

		// If no due date is found, return null
		if (due_date === null) {
			return null;
		}

		// Remove the emoji from the due date
		for (const keyword of dueDateKeywords) {
			due_date[0] = due_date[0].replace(keyword, "");
		}
		const dueDateWithoutEmoji = due_date[0].trim();

		return dueDateWithoutEmoji;
	}



	// Get the task duration from the text
	getTaskDurationFromLineText(text: string, filepath?: string, lineNumber?: number) {
		const regex_text = new RegExp(
			`(?:${this.keywords_function("DURATION")})\\d+min`,
		);
		const extract_duration = regex_text.exec(text)?.toString();
		const extract_duration_number = Number(extract_duration?.match(/\d+/g));

		if (extract_duration_number === null) {
			return null;
		}
		// The duration is more than 24 hours. It will be ignored.
		if (extract_duration_number && extract_duration_number > 1440) {
			console.error(`Duration above 24 hours is ignored.${this.locationSuffix(filepath, lineNumber)}`);
			return null;
		}
		return extract_duration_number;
	}

	transformDurationToObject(text: number) {
		const amount = text;
		const unit = "minute";

		const duration_object = { duration: { amount: amount, unit: unit } };

		return duration_object;
	}

	// Get the due time from the text
	getDueTimeFromLineText(text: string, filepath?: string, lineNumber?: number) {
		const regex_search_for_due_time = new RegExp(
			`(?:${this.keywords_function("DUE_TIME")})\\s?(\\d{1,2}:\\d{2})`,
		);

		const current_time = regex_search_for_due_time.exec(text);
		if (current_time === null) {
			if (this.plugin.settings.debugMode) {
				console.error(`Due time not found in the line text.${this.locationSuffix(filepath, lineNumber)}`);
			}
			return "";
		}
		// if current_time is H:MM instead of HH:MM, convert to HH:MM adding a 0 by checking the string length
		if (current_time) {
			if (current_time[1].length === 4) {
				current_time[1] = `0${current_time[1]}`;
			}
		}

		if (current_time) {
			if (
				Number(current_time[1].slice(0, 2)) > 24 ||
				Number(current_time[1].slice(3, 5)) > 59
			) {
				// TODO when it defaults the reminder time, it needs to change the text on Obsidian to reflect that
				return "";
			}
			return current_time[1];
		}
		// TODO Needs to find a better solution, because when it converts to UTC it can change the date, which create a loop of updates
		return "";
	}

	//   Get the Todoist id from the text
	getTodoistIdFromLineText(text: string) {
		const regex = /\[tid:: \[(.*?)\]/;

		// Use the match method to find the pattern in the string
		const match = text.match(regex);

		let taskId = null;
		// Check if a match was found
		if (match?.[1]) {
			// The captured ID is in the first capturing group (index 1 of the match array)
			taskId = match[1];
		}

		return taskId;
	}

	// get the due date from dataview
	getDueDateFromDataview(dataviewTask: { due?: string }) {
		if (!dataviewTask.due) {
			return "";
		}
		const dataviewTaskDue = dataviewTask.due.toString().slice(0, 10);
		return dataviewTaskDue;
	}

	//   Remove everything that is not the task content
	getTaskContentFromLineText(lineText: string) {
		const regex_remove_rules = {
			remove_priority: /\s!!([1-4])(?:\s|$)/,
			remove_tags: /(^|\s)(#[\w\u4e00-\u9fa5\-/]+)/g,
			remove_space: /^\s+|\s+$/g,
			remove_date: /((🗓️|📅|📆|🗓|@)\s?\d{2,4}-\d{1,2}-\d{1,2})/,
			remove_time: /((⏰|⏲|\$)\s?\d{2}:\d{2})/,
			remove_inline_metadata: /%%\[\w+::\s*\w+\]%%/,
			remove_checkbox: /^(-|\*)\s+\[(x|X| )\]\s/,
			remove_checkbox_with_indentation: /^([ \t]*)?(-|\*)\s+\[(x|X| )\]\s/,
			remove_todoist_tid_link:
				/%%\[tid::\s\[[a-zA-Z0-9]+\]\(https:\/\/app.todoist.com\/app\/task\/[a-zA-Z0-9]+\)\]%%/,
			remove_todoist_app_link_metadata:
				/%%\[tid::\s\[[a-zA-Z0-9]+\]\(todoist:\/\/task\?id=[a-zA-Z0-9]+\)\]%%/,
			remove_todoist_duration: /(⏳|&)\d+min/,
			remove_todoist_section: /\/\/\/\w*/,
			remove_todoist_project_comment: /%%\[p::\s*([^\]]+?)\s*\]%%+/,
			remove_todoist_deadline_date_format1: /\{\{(\d{2}-\d{2})\}\}/,
			remove_todoist_deadline_date_format2: /\{\{(\d{2}-\d{2}-\d{2})\}\}/,
			remove_todoist_deadline_date_format3: /\{\{(\d{4}-\d{2}-\d{2})\}\}/,
		};

		const TaskContent = lineText
			.replace(regex_remove_rules.remove_inline_metadata, "")
			.replace(regex_remove_rules.remove_todoist_tid_link, "")
			.replace(regex_remove_rules.remove_todoist_app_link_metadata, "")
			.replace(regex_remove_rules.remove_priority, " ")
			.replace(regex_remove_rules.remove_tags, "")
			.replace(regex_remove_rules.remove_date, "")
			.replace(regex_remove_rules.remove_time, "")
			.replace(regex_remove_rules.remove_checkbox, "")
			.replace(regex_remove_rules.remove_checkbox_with_indentation, "")
			.replace(regex_remove_rules.remove_space, "")
			.replace(regex_remove_rules.remove_todoist_duration, "")
			.replace(regex_remove_rules.remove_todoist_section, "")
			.replace(regex_remove_rules.remove_todoist_project_comment, "")
			.replace(regex_remove_rules.remove_todoist_deadline_date_format1, "")
			.replace(regex_remove_rules.remove_todoist_deadline_date_format2, "")
			.replace(regex_remove_rules.remove_todoist_deadline_date_format3, "")
			.trim();

		return TaskContent;
	}

	//get all tags from task text
	getAllTagsFromLineText(lineText: string) {
		const regex_tags_search = /#[\w\u4e00-\u9fa5\-/]+/g;
		let tags: string[] = lineText.match(regex_tags_search) || [];

		if (tags) {
			// Remove '#' from each tag
			tags = tags.map((tag) => tag.replace("#", ""));
		}

		return tags;
	}

	// Get the first match to user as a section
	getFirstSectionFromLineText(line_text: string) {
		const regex_section_search = /\/\/\/[\w\u4e00-\u9fa5\-/]+/g;
		const section = line_text.match(regex_section_search) || [];

		const section_raw = section.toString().replace("///", "");

		return section_raw;
	}

	// find the project name from the line text
	getProjectNameFromCommentOnLineText(line_text: string) {
		const regex_project_search = /%%\[p::\s*([^\]]+?)\s*\]%%+/g;
		const project = line_text.match(regex_project_search) || [];

		const project_raw = project
			.toString()
			.replace("%%", "")
			.replace("%%", "")
			.replace("[p::", "")
			.replace("]", "");

		return project_raw;
	}

	//get checkbox status
	isTaskCheckboxChecked(lineText: string) {
		const checkbox_status_search = /- \[(x|X)\] /;
		return checkbox_status_search.test(lineText);
	}

	//task content compare
	taskContentCompare(
		lineTask: { content: string },
		todoistTask: { content: string },
	) {
		const lineTaskContent = lineTask.content;

		const todoistTaskContent = todoistTask.content;

		// TODO remove all spaces and compare both strings without any spaces

		const lineContentWithoutSpaces = lineTaskContent.replace(/\s/g, "");
		const todoistContentWithoutSpaces = todoistTaskContent.replace(/\s/g, "");

		if (lineContentWithoutSpaces === todoistContentWithoutSpaces) {
			// If the content is the same, return true
			return true;
		}
		// If content is not the same, returns false
		return false;
	}

	//tag compare
	taskTagCompare(
		lineTask: { labels: string[] },
		todoistTask: { labels: string[] },
	) {
		const lineTaskTags = lineTask.labels;

		const todoistTaskTags = todoistTask.labels;

		// Check if tags were modified
		const tagsModified =
			lineTaskTags.length === todoistTaskTags.length &&
			lineTaskTags
				.sort()
				.every((val, index) => val === todoistTaskTags.sort()[index]);
		return tagsModified;
	}

	//task deadline compare
	taskDeadlineCompare(
		lineTask: { deadline_date: string },
		todoistTask: { deadline_date: string },
	) {
		
		const lineTaskDateFormat = this.taskDeadlineFormatCheck(lineTask.deadline_date);
		let finalLineTaskDueDate = ""

		if(lineTaskDateFormat === "YYYY-MM-DD"){
			finalLineTaskDueDate = lineTask.deadline_date;
		}
		if (lineTaskDateFormat === "YY-MM-DD") {
			finalLineTaskDueDate = `20${lineTask.deadline_date}`;
		}
		if (lineTaskDateFormat === "MM-DD") {
			finalLineTaskDueDate = `${new Date().getFullYear()}-${lineTask.deadline_date}`;
		}

		const deadlineModified = finalLineTaskDueDate === todoistTask.deadline_date;
		if(finalLineTaskDueDate === "" && todoistTask.deadline_date === "") {
			return true;
		}
		return deadlineModified;
	}
	taskDeadlineFormatCheck(deadline_string: string){
		const format_1 = /^\d{4}-\d{2}-\d{2}$/;
		const format_2 = /^\d{2}-\d{2}-\d{2}$/;
		const format_3 = /^\d{2}-\d{2}$/;
		
		if (format_1.test(deadline_string)) {
			return "YYYY-MM-DD";
		}
		if (format_2.test(deadline_string)) {
			return "YY-MM-DD";
		}
		if (format_3.test(deadline_string)) {
			return "MM-DD";
		}
	}

	//task status compare
	taskStatusCompare(
		lineTask: { isCompleted: boolean },
		todoistTask: { isCompleted: boolean },
	) {
		// Check if status was modified
		const statusModified = lineTask.isCompleted === todoistTask.isCompleted;
		return statusModified;
	}

	//Compare if the due date from Obsidian is the same due date from Todoist
	async compareTaskDueDate(
		lineTaskDueDate: string,
		todoistTaskDueDate: string,
	): Promise<boolean> {
		// remove any white spaces from the due date
		const lineTaskDueDateWithoutSpaces = lineTaskDueDate.replace(/\s/g, "");
		const todoistTaskDueDateWithoutSpaces = todoistTaskDueDate.replace(/\s/g, "");
		return lineTaskDueDateWithoutSpaces.slice(0, 10) === todoistTaskDueDateWithoutSpaces.slice(0, 10);
	}

	// Compare if the due time from Obsidian is the same due time from Todoist
	async compareTaskDueTime(
		lineTaskDueTime: string,
		todoistTaskDueTime: string,
	): Promise<boolean> {
		if (lineTaskDueTime.length > 10) {
			return lineTaskDueTime.slice(-8) === todoistTaskDueTime.slice(-8);
		}
		return false;
	}

	async compareTaskDuration(
		lineTaskDuration: number | undefined,
		todoistTaskDuration: {amount: number, unit: string} | undefined,
	): Promise<boolean> {

		const todoistTaskDurationAmount = todoistTaskDuration?.amount

		if (lineTaskDuration && todoistTaskDurationAmount === undefined) {
			return true;
		}

		// If the line duration was removed or updated in Todoist, needs to update on the lineTask as well
		if (lineTaskDuration && todoistTaskDurationAmount) {
			// TODO it should check if there is a duration on the lineTask, if does not, retrieve the task duration and add it. If it has, check if matches the current duration on Todoist
			const lineTaskDurationNumber = Number(lineTaskDuration);
			const todoistCacheTaskDurationNumber = Number(todoistTaskDurationAmount);

			if (lineTaskDurationNumber === todoistCacheTaskDurationNumber) {
				return false;
			}
			return true;
		}
		return false;
	}

	async compareSection(
		lineTask: { sectionId: string },
		todoistTask: { sectionId: string },
	) {
		const lineTaskSectionName =
			this.plugin.cacheOperation?.getSectionNameByIdFromCache(
				lineTask.sectionId,
			);
		const todoistTaskSectionName =
			this.plugin.cacheOperation?.getSectionNameByIdFromCache(
				todoistTask.sectionId,
			);

		// If there is no section defined on the task, should not try to compare.
		// TODO if there was a section and it was removed, needs to remove it from that section
		if (lineTaskSectionName === "") {
			return false;
		}

		if (lineTaskSectionName !== todoistTaskSectionName) {
			return true;
		}
		return false;
	}

	//task project id compare
	async taskProjectCompare(
		line_project_id: string,
		todoist_project_id: string,
	) {
		// Check if project was modified
		return line_project_id === todoist_project_id;
	}

	// Check if the task is indented
	isIndentedTask(text: string) {
		// TASK_INDENTATION: /^(\s{2,}|\t)(-|\*)\s+\[(x|X| )\]/,
		const check_indentation = /^(\s{2,}|\t)(-|\*)\s+\[(x|X| )\]/;

		return check_indentation.test(text);
	}

	// Count the number of leading tab characters
	getTabIndentation(lineText: string) {
		// TAB_INDENTATION: /^(\t+)/,
		const tab_indentation_search = /^(\t+)/;
		const match = tab_indentation_search.exec(lineText);
		return match ? match[1].length : 0;
	}

	//	Task priority from 1 (for urgent) up to 4 (default priority).
	getTaskPriority(lineText: string): number {
		// Space before; space or end-of-line after (fixes priority at end of line, issue #54)
		const regex_test_priority_rule = /\s!!([1-4])(?:\s|$)/;
		const regex_priority_check = regex_test_priority_rule.exec(lineText);

		function invertPriorityOrder(priority: number) {
			switch (priority) {
				case 1:
					return 4;
				case 2:
					return 3;
				case 3:
					return 2;
				case 4:
					return 1;
			}
		}

		if (
			regex_priority_check &&
			typeof Number(regex_priority_check[1]) === "number"
		) {
			const inverted_priority_return = invertPriorityOrder(
				Number(regex_priority_check[1]),
			);

			return Number(inverted_priority_return);
		}
		return 1;
	}

	//remove task indentation
	removeTaskIndentation(text: string) {
		const regex = /^([ \t]*)?- \[(x| )\] /;
		return text.replace(regex, "- [$2] ");
	}

	// Determine whether line is a blank line
	isLineBlank(lineText: string) {
		const blank_line_regex = /^\s*$/;
		return blank_line_regex.test(lineText);
	}

	// Insert the date in line text
	insertDueDateBeforeTodoist(text: string, dueDate: string) {
		const tagToLookFor = this.keywords_function("TODOIST_TAG");
		return text.replace(tagToLookFor, `📅 ${dueDate} ${tagToLookFor}`);
	}

	insertDueTimeBeforeTodoistTag(text: string, dueTime: string) {
		const tagToLookFor = this.keywords_function("TODOIST_TAG");

		return text.replace(tagToLookFor, `⏰ ${dueTime} ${tagToLookFor}`);
	}

	replaceDueDate(text: string, oldDueDate: string, newDueDate: string) {
		return text.replace(oldDueDate, newDueDate);
	}

	replaceDueTime(text: string, oldDueTime: string, newDueTime: string) {
		return text.replace(oldDueTime, newDueTime);
	}

	//extra date from obsidian event
	ISOStringToLocalDateString(utcTimeString: string) {
		try {
			if (utcTimeString === null) {
				return null;
			}
			const utcDateString = utcTimeString;
			const dateObj = new Date(utcDateString); // Convert a UTC format string to a Date object

			const year = dateObj.getFullYear();
			const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
			const date = dateObj.getDate().toString().padStart(2, "0");
			const localDateString = `${year}-${month}-${date}`;

			return localDateString;
		} catch (error) {
			console.error(
				`Error extracting date from string '${utcTimeString}': ${error}`,
			);
			return null;
		}
	}

	//This is a dup from ISOStringToLocalDateString, but parse the time
	ISOStringToLocalClockTimeString(utcTimeString: string) {
		try {
			if (utcTimeString === null) {
				return null;
			}
			const utcDateString = utcTimeString;
			const dateObj = new Date(utcDateString); // Convert a UTC format string to a Date object

			const timeHour = dateObj.getHours();
			const timeMinute = dateObj.getMinutes();
			const timeSecond = dateObj.getSeconds();

			let timeHourString: string;
			let timeMinuteString: string;

			if (timeMinute < 10) {
				timeMinuteString = `0${JSON.stringify(dateObj.getMinutes())}`;
			} else {
				timeMinuteString = JSON.stringify(dateObj.getMinutes());
			}

			//   If the hour or minutes have a single digit, add a 0 in front of it
			if (timeHour < 10) {
				timeHourString = `0${JSON.stringify(dateObj.getHours())}`;
			} else {
				timeHourString = JSON.stringify(dateObj.getHours());
			}

			// While converting the time to local time, if the time is 23:59:59 it is very likely that it isn't a user input, and for that, default as not having time
			if (timeHour === 23 && timeMinute === 59 && timeSecond === 59) {
				if (this.plugin.settings.debugMode) {
					console.error(
						"Due time is 23:59:59, which is very likely not a user input, defaulting to not having time",
					);
				}
				return "";
			}

			const localTimeString = `${timeHourString}:${timeMinuteString}`;
			console.log("Parsed local time string:", timeHourString, timeMinuteString);
			console.log("Parsed local time string:", localTimeString);
			return localTimeString;
		} catch (error) {
			console.error(
				`Error extracting date from string '${utcTimeString}': ${error}`,
			);
			return null;
		}
	}

	// Convert UTC ISO string to local datetime string
	ISOStringToLocalDatetimeString(utcTimeString: string) {
		try {
			if (utcTimeString === null) {
				return null;
			}
			const utcDateString = utcTimeString;
			const dateObj = new Date(utcDateString); // Convert a UTC format string to a Date object
			const result = dateObj.toString();
			return result;
		} catch (error) {
			console.error(
				`Error extracting date from string '${utcTimeString}': ${error}`,
			);
			return null;
		}
	}

	// Convert local datetime string to UTC ISO string
	localDateStringToUTCDatetimeString(localDatetimeString: string) {
		try {
			if (localDatetimeString === null) {
				return null;
			}
			//   localDatetimeString = localDatetimeString;
			const localDateObj = new Date(localDatetimeString);
			const ISOString = localDateObj.toISOString();
			return ISOString;
		} catch (error) {
			console.error(
				`Error extracting date from string '${localDatetimeString}': ${error}`,
			);
			return null;
		}
	}

	// Convert local date string to UTC date string
	localDateStringToUTCDateString(localDateString: string) {
		try {
			if (localDateString === null) {
				return null;
			}
			//   localDateString = localDateString;
			const localDateObj = new Date(localDateString);
			const ISOString = localDateObj.toISOString();
			//   let utcDateString = ISOString.slice(0,10)
			return ISOString;
		} catch (error) {
			console.error(
				`Error extracting date from string '${localDateString}': ${error}`,
			);
			return null;
		}
	}

	isMarkdownTask(str: string): boolean {
		const taskRegex = /^\s*-\s+\[([x ])\]/;
		return taskRegex.test(str);
	}

	addTodoistTag(str: string): string {
		const tag_to_be_added = this.keywords_function("TODOIST_TAG");
		return `${str} ${tag_to_be_added}`;
	}

	getObsidianUrlFromFilepath(filepath: string) {
		const url = encodeURI(
			`obsidian://open?vault=${this.app.vault.getName()}&file=${filepath}`,
		);
		const obsidianUrl = `[${filepath}](${url})`;
		return obsidianUrl;
	}

	addTodoistLink(line_text: string, todoistLink: string): string {
		// const regex = new RegExp(`${keywords.TODOIST_TAG}`, "g");

		// Looks for #todoist to identify where to put the link.
		// TODO let the user choose which tag to use
		const regex = new RegExp(this.keywords_function("TODOIST_TAG"), "g");

		const date_regex =
			/(?:🗓️|📅|📆|🗓|@)\s\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/;
		const grab_regex_date = new RegExp(date_regex, "g");
		if (
			date_regex.test(line_text) &&
			this.plugin.settings.changeDateOrder &&
			!this.plugin.taskParser?.hasTodoistLink
		) {
			// TODO check if already has a link, to prevent from adding multiple links
			return line_text.replace(grab_regex_date, `${todoistLink} $&`);
		}
		// TODO check if already has a link, to prevent from adding multiple links
		return line_text.replace(regex, ` $& ${todoistLink}`);
	}

	hasTodoistLink(line_text: string) {
		const regex_has_todoist_link = new RegExp(
			/tid:: \[\d+\]\((?:https:\/\/app.todoist.com\/app\/task\/\d+|todoist:\/\/task\?id=\d+)\)/,
		);
		return regex_has_todoist_link.test(line_text);
	}

	// Extract deadline_date from {{MM-DD}} and always return it as YYYY-MM-DD
	getDeadlineDateFromLineText(text: string, filepath?: string, lineNumber?: number): string | null {
		const match = text.match(/\{\{(?:(\d{4}|\d{2})-)?(1[0-2]|0?[1-9])-(3[01]|[12]\d|0?[1-9])\}\}/);

		const hasBrackets = text.match(/\{\{.*?\}\}/);
		if (!match && hasBrackets) {
			const suffix = this.locationSuffix(filepath, lineNumber);
			console.warn(`No valid date found within brackets for: ${text}${suffix}`);
			console.warn(`Date format expected for the deadline should be YYYY-MM-DD or MM-DD.${suffix}`);
			new Notice("Deadline date format is incorrect, task will be created without deadline.");
		}

		if (!match) return null;

		// Remove curly braces
		const rawDate = match[0].replace("{{", "").replace("}}", "");
		const format = this.taskDeadlineFormatCheck(rawDate);

		let formatted: string;
		if (format === "YYYY-MM-DD") {
			formatted = rawDate;
		} else if (format === "YY-MM-DD") {
			formatted = `20${rawDate}`;
		} else if (format === "MM-DD") {
			formatted = `${new Date().getFullYear()}-${rawDate}`;
		} else {
			return null;
		}

		// Ensure format is YYYY-MM-DD
		const result = formatted.match(/\d{4}-\d{2}-\d{2}/);
		return result ? result[0] : null;
	}
}
