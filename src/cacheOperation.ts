import type { App } from "obsidian";
import type AnotherSimpleTodoistSync from "../main";

interface Due {
	date: string;
	datetime?: string;
	string?: string;
	timezone?: string;
}

export interface Task {
	id: string;
	content: string;
	description?: string;
	project_id?: string;
	section_id?: string;
	parent_id?: string;
	order?: number;
	priority?: number;
	due_date?: string;
	due_datetime?: string;
	due?: {
		date: string;
		datetime?: string;
		string?: string;
		timezone?: string;
	};
	url?: string;
	comment_count?: number;
	created?: string;
	creator_id?: string;
	assignee_id?: string;
	assigner_id?: string;
	labels?: string[];
	duration?: number | {amount: number; unit: string};
	duration_unit?: "minute" | "day";
	isCompleted?: boolean;
	path?: string;
	deadline_date?: string;
	deadline?: {
		date: string;
		lang: string;
	}
}

interface Project {
	id: string;
	name: string;
}

interface Section {
	id: string;
	name: string;
	project_id: string;
}

export interface FileMetadata {
	todoistTasks: string[];
	todoistCount: number;
	defaultProjectId?: string;
	defaultProjectName?: string;
}

export class CacheOperation {
	app: App;
	plugin: AnotherSimpleTodoistSync;

	constructor(app: App, plugin: AnotherSimpleTodoistSync) {
		//super(app,settings);
		this.app = app;
		this.plugin = plugin;
	}

	async getFileMetadataByFilePath(filepath: string) {
		return this.plugin.settings.fileMetadata[filepath] ?? null;
	}

	async getFileMetadata() {
		return this.plugin.settings.fileMetadata ?? null;
	}

	async newEmptyFileMetadata(filepath: string) {
		const metadata = this.plugin.settings.fileMetadata;
		if (metadata[filepath]) {
			return;
		}
		metadata[filepath] = {
			todoistTasks: [],
			todoistCount: 0,
		};
		// Save the updated metadata object back to the settings object
		this.plugin.settings.fileMetadata = metadata;
	}

	async updateFileMetadata(filepath: string, newMetadata: FileMetadata) {
		const metadata = this.plugin.settings.fileMetadata;

		// If the metadata object does not exist, create a new object and add it to metadata
		if (!metadata[filepath]) {
			metadata[filepath] = {
				todoistTasks: [],
				todoistCount: 0,
			};
		}

		// Update the properties of the metadata object
		metadata[filepath].todoistTasks = newMetadata.todoistTasks;
		metadata[filepath].todoistCount = newMetadata.todoistCount;

		// Save the updated metadata object back to the settings object
		this.plugin.settings.fileMetadata = metadata;
	}

	async deleteTaskIdFromMetadata(filepath: string, taskId: string) {
		const metadata = await this.getFileMetadataByFilePath(filepath);
		const newTodoistTasks = metadata.todoistTasks.filter(
			(element: string) => element !== taskId,
		);
		const newTodoistCount = metadata.todoistCount - 1;
		const newMetadata: FileMetadata = {
			todoistTasks: newTodoistTasks,
			todoistCount: newTodoistCount,
		};
		await this.updateFileMetadata(filepath, newMetadata);
	}

	//delete filepath from filemetadata
	async deleteFilepathFromMetadata(filepath: string) {
		Reflect.deleteProperty(this.plugin.settings.fileMetadata, filepath);
		this.plugin.saveSettings();
	}

	//Check errors in filemetadata where the filepath is incorrect.
	async checkFileMetadata() {
		const metadata = await this.getFileMetadata();
		for (const key in metadata) {
			const filepath = key;
			const value = metadata[key];
			const file = this.app.vault.getAbstractFileByPath(key);
			if (!file && (value.todoistTasks?.length === 0 || !value.todoistTasks)) {
				await this.deleteFilepathFromMetadata(key);
				continue;
			}
			if (value.todoistTasks?.length === 0 || !value.todoistTasks) {
				//todo
				//delete empty metadata
				continue;
			}
			//check if file exist

			if (!file) {
				//search new filepath
				const todoistId1 = value.todoistTasks[0];
				const searchResult =
					await this.plugin.fileOperation?.searchFilePathsByTaskIdInVault(
						todoistId1,
					);

				//update metadata
				if (searchResult) {
					await this.updateRenamedFilePath(filepath, searchResult);
				}
				this.plugin.saveSettings();
			}
		}
	}

	getDefaultProjectNameForFilepath(filepath: string) {
		const metadata = this.plugin.settings.fileMetadata;
		if (
			!metadata[filepath] ||
			metadata[filepath].defaultProjectId === undefined
		) {
			return this.plugin.settings.defaultProjectName;
		}
		const defaultProjectId = metadata[filepath].defaultProjectId;
		const defaultProjectName =
			this.getProjectNameByIdFromCache(defaultProjectId);
		return defaultProjectName;
	}

	getDefaultProjectIdForFilepath(filepath: string) {
		const metadata = this.plugin.settings.fileMetadata;
		if (
			!metadata[filepath] ||
			metadata[filepath].defaultProjectId === undefined
		) {
			return this.plugin.settings.defaultProjectId;
		}
		const defaultProjectId = metadata[filepath].defaultProjectId;
		return defaultProjectId;
	}

	setDefaultProjectIdForFilepath(
		filepath: string,
		defaultProjectId: string,
		defaultProjectName: string,
	) {
		const metadata = this.plugin.settings.fileMetadata;
		if (!metadata[filepath]) {
			metadata[filepath] = {
				todoistTasks: [],
				todoistCount: 0,
				defaultProjectId: defaultProjectId,
				defaultProjectName: defaultProjectName,
			};
		}
		metadata[filepath].defaultProjectId = defaultProjectId;
		metadata[filepath].defaultProjectName = defaultProjectName;

		// Save the updated metadata object back to the settings object
		this.plugin.settings.fileMetadata = metadata;
	}

	// Read all tasks from Cache
	loadTasksFromCache() {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;
			return savedTasks;
		} catch (error) {
			console.error(`Error loading tasks from Cache: ${error}`);
			return [];
		}
	}

	// Overwrite and save all tasks to cache
	saveTasksToCache(newTasks: Task[]) {
		try {
			this.plugin.settings.todoistTasksData.tasks = newTasks;
		} catch (error) {
			console.error(`Error saving tasks to Cache: ${error}`);
			return false;
		}
	}

	// Append a single event to cache
	appendEventToCache(
		event: {
			id: string;
			object_type: string;
			object_id: string;
			event_type: string;
			event_date: string;
			parent_item_id?: string;
			extra_data?: {
				content?: string;
				last_content?: string;
				last_due_date?: string;
				client?: string;
			};
		}[],
	) {
		try {
			this.plugin.settings.todoistTasksData.events.push(...event);
		} catch (error) {
			console.error(`Error append event to Cache: ${error}`);
		}
	}

	// Append multiple events to cache
	appendEventsToCache(
		events: {
			id: string;
			object_type: string;
			object_id: string;
			event_type: string;
			event_date: string;
			parent_item_id?: string;
			extra_data?: {
				content?: string;
				last_content?: string;
				last_due_date?: string;
				client?: string;
			};
		}[],
	) {
		try {
			this.plugin.settings.todoistTasksData.events.push(...events);
		} catch (error) {
			console.error(`Error append events to Cache: ${error}`);
		}
	}

	// Load all events from cache
	loadEventsFromCache() {
		try {
			const savedEvents = this.plugin.settings.todoistTasksData.events;
			return savedEvents;
		} catch (error) {
			console.error(`Error loading events from Cache: ${error}`);
		}
	}

	// Append a task to cache
	appendTaskToCache(task: Task) {
		// TODO for some reason the task receives duration even when was not specified, so I had to add this extra step to remove it. I need to find a better way to handle this.
		const taskToAppend =
			task.duration === null ? (({ duration, ...rest }) => rest)(task) : task;
		try {
			if (taskToAppend === null) {
				return;
			}
			// const savedTasks = this.plugin.settings.todoistTasksData.tasks
			//const taskAlreadyExists = savedTasks.some((t) => t.id === task.id);
			//if (!taskAlreadyExists) {
			//, when you insert a string into a Cache object using the push method, it is treated as a simple key-value pair, where the key is the numeric index of the array and the value is the string itself. But if you use the push method to insert another Cache object (or array) into a Cache object, the object becomes a nested child object of the original Cache object. In this case, the key is the numeric index and the value is the nested Cache object itself.
			//}
			this.plugin.settings.todoistTasksData.tasks.push(taskToAppend);
		} catch (error) {
			console.error(`Error appending task to Cache: ${error}`);
		}
	}

	// As Todoist default object doesn't contain the filepath, this helps ensure we know where each task is located for future sync updates
	appendPathToTaskInCache(taskId: string, filepath: string) {
		const findObject = this.plugin.settings.todoistTasksData.tasks.find(
			(task: Task & { path?: string }) => task.id === taskId,
		);
		if (findObject) {
			(findObject as Task & { path?: string }).path = filepath;
		} else {
			console.error(
				`Object with ID ${taskId} not found on cache to append it's path.`,
			);
		}
	}

	// Find task by id within the cache
	loadTaskFromCacheID(taskId: string): Task | undefined {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;
			const savedTask = savedTasks.find((t: Task) => t.id === taskId);
			return savedTask;
		} catch (error) {
			console.error(`Error finding task from Cache: ${error}`);
			return undefined;
		}
	}

	// Compare the string with the names of sections on the cache. If exist, return it's ID. If not, return null.
	checkIfSectionExistOnCache(sectionString: string, projectId: string) {
		const savedSections =
			this.plugin.settings.todoistTasksData.sections?.results;
		if (!savedSections) return false;

		const sectionExist = savedSections.some(
			(section: Section) =>
				section.name === sectionString && section.project_id === projectId,
		);

		if (sectionExist) {
			// If it finds the section, it returns the section ID. If not, will return false
			const sectionDetails = savedSections.find(
				(section: Section) =>
					section.name === sectionString && section.project_id === projectId,
			);

			return sectionDetails?.id;
		}

		return false;
	}

	// Compare the string with the names of projects on the cache. If exist, returns it's ID. If not, return a null value.
	checkIfProjectExistOnCache(projectString: string) {
		const savedProjects = this.plugin.settings.todoistTasksData.projects;
		const projectExist = savedProjects.results.some(
			(project: Project) => project.name === projectString,
		);

		if (projectExist) {
			const projectDetails = savedProjects.results.find(
				(project: Project) => project.name === projectString,
			);
			return projectDetails?.id;
		}
		return false;
	}

	addSectionToCache(name: string, sectionId: string, project_id: string) {
		// TODO get all details from the TodoistApi, then saves to cache
		try {
			this.plugin.settings.todoistTasksData?.sections?.results.push({
				name: name,
				id: sectionId,
				project_id: project_id,
			});
		} catch (error) {
			console.error(`Error appending section to Cache: ${error}`);
		}
	}

	// Add a new project to cache
	addProjectToCache(projectString: string, project_id: string) {
		try {
			this.plugin.settings.todoistTasksData.projects.results.push({
				name: projectString,
				id: project_id,
			});
		} catch (error) {
			console.error(`Error appending project to Cache: ${error}`);
		}
	}

	// Find the name of the section based on a given ID
	getSectionNameByIdFromCache(sectionId: string) {
		try {
			const savedSections = this.plugin.settings.todoistTasksData.sections;
			if (!savedSections) return null;

			const targetSection = savedSections.results.find(
				(obj: Section) => obj.id === sectionId,
			);
			const sectionName = targetSection ? targetSection.name : null;
			return sectionName;
		} catch (error) {
			console.error(`Error finding section from Cache file: ${error}`);
			return false;
		}
	}

	getSectionIdByNameFromCache(sectionName: string) {
		const savedSections = this.plugin.settings.todoistTasksData.sections;
		if (!savedSections) return null;

		const targetSection = savedSections.results.find(
			(obj: Section) => obj.name === sectionName,
		);
		// console.log("targetSection is: ", targetSection);
		return targetSection ? targetSection.id : null;
	}

	// Replace the cached task with the given ID
	updateTaskToCacheByID(task: Task) {
		try {
			// Remove the old task
			this.deleteTaskFromCache(task.id);
			// Insert the updated task
			this.appendTaskToCache(task);
		} catch (error) {
			console.error(`Error updating task to Cache: ${error}`);
			return;
		}
	}

	// Update just the sectionID from a given task within the Cache
	updateTaskSectionOnCacheById(taskId: string, newSectionId: string) {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;
			const taskIndex = savedTasks.findIndex(
				(task: Task) => task.id === taskId,
			);

			if (taskIndex !== -1) {
				const updatedTask = { ...savedTasks[taskIndex] };
				if (newSectionId !== undefined) {
					updatedTask.section_id = newSectionId;
				}
				savedTasks[taskIndex] = updatedTask;
				this.plugin.settings.todoistTasksData.tasks = savedTasks;
			} else {
				throw new Error(`Task with ID ${taskId} not found in cache.`);
			}
		} catch (error) {
			console.error(`Error updating task to Cache: ${error}`);
		}
	}

	modifyTaskToCacheByID(
		taskId: string,
		{ content, due }: { content?: string; due?: Due },
	): void {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;
			const taskIndex = savedTasks.findIndex(
				(task: Task) => task.id === taskId,
			);

			if (taskIndex !== -1) {
				const updatedTask = { ...savedTasks[taskIndex] };

				if (content !== undefined) {
					updatedTask.content = content;
				}

				if (due !== undefined) {
					if (due === null) {
						updatedTask.due = undefined;
					} else {
						updatedTask.due = due;
					}
				}

				savedTasks[taskIndex] = updatedTask;

				this.plugin.settings.todoistTasksData.tasks = savedTasks;
			} else {
				throw new Error(`Task with ID ${taskId} not found in cache.`);
			}
		} catch (error) {
			console.error(`Error updating task to Cache: ${error}`);
		}
	}

	//open a task status
	reopenTaskToCacheByID(taskId: string) {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;

			// Find the item with the given ID and update it
			for (let i = 0; i < savedTasks.length; i++) {
				if (savedTasks[i].id === taskId) {
					(savedTasks[i] as Task).isCompleted = false;
					break;
				}
			}
			this.plugin.settings.todoistTasksData.tasks = savedTasks;
		} catch (error) {
			console.error(`Error open task to Cache file: ${error}`);
			return;
		}
	}

	//close a task status
	closeTaskToCacheByID(taskId: string) {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;

			// Find the item with the given ID and update it
			for (let i = 0; i < savedTasks.length; i++) {
				if (savedTasks[i].id === taskId) {
					(savedTasks[i] as Task).isCompleted = true;
					break;
				}
			}
			this.plugin.settings.todoistTasksData.tasks = savedTasks;
		} catch (error) {
			console.error(`Error close task to Cache file: ${error}`);
			throw error; // Re-throw so the caller can handle it
		}
	}

	// Delete task by ID
	deleteTaskFromCache(taskId: string) {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;
			const newSavedTasks = savedTasks.filter((t: Task) => t.id !== taskId);
			this.plugin.settings.todoistTasksData.tasks = newSavedTasks;
		} catch (error) {
			console.error(`Error deleting task from Cache file: ${error}`);
		}
	}

	deleteTaskFromCacheByIDs(deletedTaskIds: string[]) {
		try {
			const savedTasks = this.plugin.settings.todoistTasksData.tasks;
			const newSavedTasks = savedTasks.filter(
				(t: Task) => !deletedTaskIds.includes(t.id),
			);
			this.plugin.settings.todoistTasksData.tasks = newSavedTasks;
		} catch (error) {
			console.error(`Error deleting task from Cache : ${error}`);
		}
	}

	getProjectIdByNameFromCache(projectName: string) {
		const projectNameToFind = projectName;
		try {
			const savedProjects =
				this.plugin.settings.todoistTasksData.projects.results;
			const targetProject = savedProjects.find(
				(obj: Project) => obj.name === projectNameToFind,
			);
			const projectId = targetProject ? targetProject.id : null;
			return projectId;
		} catch (error) {
			console.error(`Error finding project from Cache file: ${error}`);
			return false;
		}
	}

	getProjectNameByIdFromCache(projectId: string) {
		try {
			const savedProjects =
				this.plugin.settings.todoistTasksData.projects.results;
			const targetProject = savedProjects.find(
				(obj: Project) => obj.id === projectId,
			);
			const projectName = targetProject ? targetProject.name : null;
			return projectName;
		} catch (error) {
			console.error(`Error finding project from Cache file: ${error}`);
			return null;
		}
	}

	//save projects data to json file
	async saveProjectsToCache() {
		try {
			//get projects
			const projects = await this.plugin.todoistNewAPI?.getAllProjects();
			if (!projects) {
				return false;
			}

			//save to json
			this.plugin.settings.todoistTasksData.projects = { results: projects };

			return true;
		} catch (error) {
			console.error(`error downloading projects: ${error}`);
			return false;
		}
	}

	async saveSectionsToCache() {
		try {
			const sections = await this.plugin.todoistNewAPI?.getAllSections();

			if (!sections) {
				console.error("Error saving sections to Cache.");
				return false;
			}

			this.plugin.settings.todoistTasksData.sections = sections;

			return true;
		} catch (error) {
			console.error(`Error downloading sections: ${error}`);
			return false;
		}
	}

	async updateRenamedFilePath(oldpath: string, newpath: string) {
		try {
			const savedTask = await this.loadTasksFromCache();
			//console.log(savedTask)
			const newTasks = savedTask.map((obj: Task) => {
				if (obj.path === oldpath) {
					return { ...obj, path: newpath };
				}
				return obj;
			});
			//console.log(newTasks)
			await this.saveTasksToCache(newTasks);

			//update filepath
			const fileMetadata = this.plugin.settings.fileMetadata;
			fileMetadata[newpath] = fileMetadata[oldpath];
			delete fileMetadata[oldpath];
			this.plugin.settings.fileMetadata = fileMetadata;
		} catch (error) {
			console.error(`Error updating renamed file path to cache: ${error}`);
		}
	}

	// Needed to ignore old tasks on users cache since 0.5.1
	checkTaskIdIsOld(taskId: string) {
		if (/^\d{10}/.test(taskId)) {
			return true;
		}
		return false;
	}

	// Needed to cleanup old tasks, sections, projects, events on users cache since 0.5.1 because the new API uses different data structure
	async cleanupOldPluginVersionData() {
		const savedTasks = this.plugin.settings.todoistTasksData.tasks;
		const newSavedTasks = savedTasks.filter(
			(t: Task) => !this.checkTaskIdIsOld(t.id),
		);
		this.plugin.settings.todoistTasksData.tasks = newSavedTasks;

		const savedEvents = this.plugin.settings.todoistTasksData.events;

		const newSavedEvents = savedEvents.filter((e: {
			id: string;
			object_type: string;
			object_id: string;
			event_type: string;
			event_date: string;
			parent_item_id?: string;
			extra_data?: {
				content?: string;
				last_content?: string;
				last_due_date?: string;
				client?: string;
			};
		}) => {
			const eventDate = new Date(e.event_date);
			const year = eventDate.getFullYear();
			const month = eventDate.getMonth() + 1;
			const day = eventDate.getDate();
			return !(
				year === 2024 ||
				(year === 2025 && month < 4) ||
				(year === 2025 && month === 4 && day < 19)
			);
		});

		this.plugin.settings.todoistTasksData.events = newSavedEvents;

		const savedSections = this.plugin.settings.todoistTasksData.sections;
		const newSavedSections = savedSections?.results;
		if (this.plugin.settings.todoistTasksData.sections && newSavedSections) {
			this.plugin.settings.todoistTasksData.sections.results = newSavedSections;
		}

		const savedProjects = this.plugin.settings.todoistTasksData.projects;
		const newSavedProjects = savedProjects.results;
		if (this.plugin.settings.todoistTasksData.projects && newSavedProjects) {
			this.plugin.settings.todoistTasksData.projects.results = newSavedProjects;
		}

		// inside todoistTaskData.fileMetadata, delete all items that the todoistCount is 0
		const fileMetadata = this.plugin.settings.fileMetadata;
		const newFileMetadata = Object.fromEntries(
			Object.entries(fileMetadata).filter(
				([_, value]) => value.todoistCount !== 0,
			),
		);
		const newFileMetadataRemovingOldTasks = Object.fromEntries(
			Object.entries(newFileMetadata).filter(
				([_, value]) => value.todoistTasks[0].length !== 10,
			),
		);
		this.plugin.settings.fileMetadata = newFileMetadataRemovingOldTasks;

		if (this.plugin.settings?.defaultProjectId?.length === 10) {
			console.warn("defaultProjectId is old, need to select a new one");
		}
	}
}
