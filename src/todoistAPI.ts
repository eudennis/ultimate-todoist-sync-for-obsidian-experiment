import { TodoistApi } from "@doist/todoist-sdk";
import type AnotherSimpleTodoistSync from "main";
import type { App } from "obsidian";
import { requestUrl } from "obsidian";

type TodoistEvent = {
	id: string;
	object_type: string;
	object_id: string;
	parent_item_id?: string;
	event_type: string;
	event_date: string;
	extra_data?: {
		client?: string;
		[key: string]: unknown;
	};
};

export type { TodoistEvent };

type FilterOptions = {
	event_type?: string;
	object_type?: string;
};

export class TodoistNewAPI {
	app: App;
	plugin: AnotherSimpleTodoistSync;

	constructor(app: App, plugin: AnotherSimpleTodoistSync) {
		this.app = app;
		this.plugin = plugin;
	}

	initializeNewAPI() {
		const token = this.plugin.settings.todoistAPIToken;
		const api = new TodoistApi(token);
		return api;
	}

	async addTask({
		project_id,
		content,
		parent_id,
		due_date,
		due_datetime,
		labels,
		description,
		priority,
		duration,
		duration_unit,
		section_id,
		path,
		deadline_date,
	}: {
		project_id: string;
		content: string;
		parent_id?: string;
		due_date?: string;
		due_datetime?: string;
		labels?: Array<string>;
		description?: string;
		priority?: number;
		duration?:number;
		duration_unit?: string;
		section_id?: string;
		path?: string;
		deadline_date?: string;
	}) {
		try {
			const taskData: {
				content: string;
				description?: string;
				project_id?: string;
				section_id?: string;
				parent_id?: string;
				order?: number;
				labels?: string[];
				priority?: number;
				due_date?: string;
				due_datetime?: string;
				duration?: number;
				duration_unit?: string;
				deadline_date?: string;
			} = {
				content,
				description,
				project_id,
				section_id,
				parent_id,
				labels,
				priority,
				due_date,
				due_datetime,
				duration,
				duration_unit,
				deadline_date
			};

			if (taskData.section_id === "") {
				taskData.section_id = undefined;
			}
			if (taskData.parent_id === "") {
				taskData.parent_id = undefined;
			}

			// Logic: If I have a dueDatetime, I don't need to have a dueDate. If any is empty, I send as null. If I have both, I send as dueDatetime.
			if (taskData.due_date === "") {
				taskData.due_date = undefined;
			}
			if (taskData.due_datetime === "") {
				taskData.due_datetime = undefined;
			}
			if (taskData.due_datetime !== undefined) {
				taskData.due_date = undefined;
			}

			// Logic: If there is no durationTime, need to remove both duration_time and duration_unit
			if (
				taskData.duration === undefined ||
				taskData.duration === null ||
				Number.isNaN(taskData.duration) ||
				taskData.duration === 0
			) {
				taskData.duration = undefined;
				taskData.duration_unit = undefined;
			}

			if(this.plugin.settings.removeObsidianLinks && description) {
				taskData.description = ''
			}

			if(this.plugin.settings.debugMode) {
				console.log("Todoist Task data to be added: ", taskData);
			}


			const token = this.plugin.settings.todoistAPIToken;
			try {
				const response = await requestUrl({
					url: "https://todoist.com/api/v1/tasks",
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(taskData),
				});
				return response.json;
			} catch (error) {
				console.error("Error adding task:", error);
				return false;
			}
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Error adding task: ${error.message}`);
			}
			throw new Error("Unknown error occurred while adding task");
		}
	}

	// TODO prepare for response with 100+ sections
	async getAllSections() {
		const token = this.plugin.settings.todoistAPIToken;
		try {
			const response = await requestUrl({
				url: "https://todoist.com/api/v1/sections",
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			});
			return response.json;
		} catch (error) {
			console.error("Error getting sections", error);
			return false;
		}
	}

	// Updated: Retrieve all projects using the new REST API and handle pagination if present
	async getAllProjects() {
		const token = this.plugin.settings.todoistAPIToken;
		const allProjects = [];
		let nextCursor = undefined;
		try {
			do {
				const url = new URL("https://todoist.com/api/v1/projects?limit=100");
				if (nextCursor) {
					url.searchParams.append("cursor", nextCursor);
				}
				const response = await requestUrl({
					url: url.toString(),
					method: "GET",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
				});
				const data = response.json;

				// The API returns an array of projects and possibly a next_cursor property
				if (Array.isArray(data)) {
					allProjects.push(...data);
				} else if (data && Array.isArray(data.results)) {
					allProjects.push(...data.results);
				} else if (data && Array.isArray(data.projects)) {
					allProjects.push(...data.projects);
				}

				// Pagination: look for next_cursor in the response body
				nextCursor = data.next_cursor ? data.next_cursor : undefined;
			} while (nextCursor !== undefined);
			return allProjects;
		} catch (error) {
			console.error("Error getting projects", error);
			return false;
		}
	}

	// TODO: how do I get the last 1000 events? Should I consider user plan?
	async getNonObsidianAllActivityEvents() {
		const token = this.plugin.settings.todoistAPIToken;
		try {
			const response = await requestUrl({
				url: "https://api.todoist.com/api/v1/activities",
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			});

			if (response.status >= 400) {
				throw new Error(`API returned error status: ${response.status}`);
			}

			const data = response.json.results;
			// console.log('Todoist API Response for activities:', data); // Debug log

			// Check if data exists and has events array
			if (!data || !Array.isArray(data)) {
				console.error("Unexpected response format:", data);
				return [];
			}

			// Filter out activities from Obsidian client
			const filteredEvents = data.filter((event: TodoistEvent) => {
				const client = event.extra_data?.client;
				return !client || !client.includes("obsidian");
			});

			// console.log('Filtered events:', filteredEvents);
			return filteredEvents;
		} catch (error) {
			console.error("Failed to fetch non-Obsidian activities:", error);
			return [];
		}
	}

	filterActivityEvents(
		events: TodoistEvent[],
		options: FilterOptions,
	): TodoistEvent[] {
		return events.filter((event) => {
			const matchesEventType = options.event_type
				? event.event_type === options.event_type
				: true;
			const matchesObjectType = options.object_type
				? event.object_type === options.object_type
				: true;
			return matchesEventType && matchesObjectType;
		});
	}

	async getAllResources() {
		const token = this.plugin.settings.todoistAPIToken;
		try {
			const response = await requestUrl({
				url: "https://todoist.com/api/v1/sync",
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					sync_token: "*",
					resource_types: '["all"]',
				}).toString(),
			});

			if (response.status >= 400) {
				throw new Error(`API returned error status: ${response.status}`);
			}

			const data = response.json;
			return data;
		} catch (error) {
			console.error("Failed to fetch all resources from Todoist:", error);
			throw new Error(
				"Could not create a backup from Todoist. Please try again later.",
			);
		}
	}

	async updateTask(
		taskId: string,
		updates: {
			content?: string;
			description?: string;
			labels?: Array<string>;
			due_date?: string;
			due_datetime?: string;
			due_string?: string;
			parent_id?: string;
			priority?: number;
			duration?: number;
			duration_unit?: string;
			section_id?: string;
			deadline_date?: string;
		},
	) {
		const token = this.plugin.settings.todoistAPIToken;

		if (!taskId) {
			throw new Error("taskId is required");
		}

		if (
			!updates.content &&
			!updates.description &&
			!updates.due_date &&
			!updates.due_datetime &&
			!updates.due_string &&
			!updates.labels &&
			!updates.parent_id &&
			!updates.priority &&
			!updates.duration &&
			!updates.section_id &&
			!updates.deadline_date
		) {
			throw new Error("At least one update is required");
		}

		try {
			const taskData: {
				content?: string;
				description?: string;
				labels?: string[];
				priority?: number;
				parent_id?: string;
				section_id?: string;
				due_date?: string;
				due_string?: string;
				due_datetime?: string;
				duration?: number;
				duration_unit?: string;
				deadline_date?: string;
			} = {};

			// Handle content updates
			if (updates.content) {
				taskData.content = updates.content;
			}

			// Handle description updates
			if (updates.description) {
				taskData.description = updates.description;
			}

			// Handle labels updates
			if (updates.labels) {
				taskData.labels = updates.labels;
			}

			// Handle priority updates
			if (updates.priority) {
				taskData.priority = updates.priority;
			}

			// Handle parent ID updates
			if (updates.parent_id) {
				taskData.parent_id = updates.parent_id;
			}

			// Handle section ID updates
			if (updates.section_id) {
				taskData.section_id = updates.section_id;
			}
			if(updates.deadline_date) {
				taskData.deadline_date = updates.deadline_date;
			}

			// Handle due date and time
			if (updates.due_date) {
				taskData.due_date = updates.due_date;
			}
			if (updates.due_datetime) {
				taskData.due_datetime = updates.due_datetime;
				taskData.due_date = undefined;
			}
			if (updates.due_string) {
				taskData.due_string = updates.due_string;
			}

			// Handle duration
			if (updates.duration) {
				taskData.duration = updates.duration ?? 0;
				taskData.duration_unit = updates.duration_unit || "minute";
			}

			if (this.plugin.settings.debugMode) {
				console.log("Todoist Task data to be updated: ", taskData);
			}

			const response = await requestUrl({
				url: `https://todoist.com/api/v1/tasks/${taskId}`,
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(taskData),
			});

			if (response.status >= 400) {
				throw new Error(`API returned error status: ${response.status}`);
			}

			const updatedTask = response.json;
			return updatedTask;
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Error updating task: ${error.message}`);
			}
			throw new Error("Unknown error occurred while updating task");
		}
	}

	async closeTask(taskId: string): Promise<boolean> {
		const token = this.plugin.settings.todoistAPIToken;

		if (!taskId) {
			throw new Error("taskId is required");
		}

		try {
			const response = await requestUrl({
				url: `https://todoist.com/api/v1/tasks/${taskId}/close`,
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			});

			// According to the API docs, a successful close returns 204 No Content
			return response.status === 204;
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Error closing task: ${error.message}`);
			}
			throw new Error("Unknown error occurred while closing task");
		}
	}

	async moveTaskToAnotherSection(
		taskId: string,
		newSectionId: string,
	): Promise<boolean> {
		const token = this.plugin.settings.todoistAPIToken;

		if (!taskId || !newSectionId) {
			throw new Error("Both taskId and newSectionId are required");
		}

		try {
			const response = await requestUrl({
				url: `https://todoist.com/api/v1/tasks/${taskId}/move`,
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					section_id: newSectionId,
				}),
			});

			// A successful update returns 200 OK
			return response.status === 200;
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Error moving task to new section: ${error.message}`);
			}
			throw new Error(
				"Unknown error occurred while moving task to new section",
			);
		}
	}

	async openTask(taskId: string): Promise<boolean> {
		const token = this.plugin.settings.todoistAPIToken;

		if (!taskId) {
			throw new Error("taskId is required");
		}

		try {
			const response = await requestUrl({
				url: `https://todoist.com/api/v1/tasks/${taskId}/reopen`,
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			});

			// According to the API docs, a successful reopen returns 204 No Content
			return response.status === 204;
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Error reopening task: ${error.message}`);
			}
			throw new Error("Unknown error occurred while reopening task");
		}
	}

	async getTaskDueById(taskId: string) {
		const token = this.plugin.settings.todoistAPIToken;

		if (!taskId) {
			throw new Error("taskId is required");
		}

		try {
			const response = await requestUrl({
				url: `https://todoist.com/api/v1/tasks/${taskId}`,
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			});

			if (response.status >= 400) {
				throw new Error(`API returned error status: ${response.status}`);
			}

			const task = response.json;
			return task.due ?? null;
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Error getting task due date: ${error.message}`);
			}
			throw new Error("Unknown error occurred while getting task due date");
		}
	}

	async getTaskById(taskId: string) {
		const token = this.plugin.settings.todoistAPIToken;

		if (!taskId) {
			throw new Error("taskId is required");
		}

		try {
			const response = await requestUrl({
				url: `https://todoist.com/api/v1/tasks/${taskId}`,
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				throw: false,
			});

			if (this.plugin.settings.debugMode) {
				console.log(`getTaskById(${taskId}) → status ${response.status}`, response.json);
			}

			if (response.status >= 400) {
				const detail = response.json ? JSON.stringify(response.json) : `status ${response.status}`;
				throw new Error(`API returned error status ${response.status}: ${detail}`);
			}

			return response.json;
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Error retrieving task: ${error.message}`);
			}
			throw new Error("Unknown error occurred while retrieving task");
		}
	}

	async getActiveTasks(options: {
		projectId?: string;
		sectionId?: string;
		label?: string;
		filter?: string;
		lang?: string;
		ids?: Array<string>;
	}) {
		const token = this.plugin.settings.todoistAPIToken;
		try {
			// Build query string from options
			const queryParams = new URLSearchParams();
			if (options.projectId)
				queryParams.append("project_id", options.projectId);
			if (options.sectionId)
				queryParams.append("section_id", options.sectionId);
			if (options.label) queryParams.append("label", options.label);
			if (options.filter) queryParams.append("filter", options.filter);
			if (options.lang) queryParams.append("lang", options.lang);
			if (options.ids) queryParams.append("ids", options.ids.join(","));

			const response = await requestUrl({
				url: `https://todoist.com/api/v1/tasks?${queryParams.toString()}`,
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			});

			if (response.status >= 400) {
				throw new Error(`API returned error status: ${response.status}`);
			}

			const tasks = response.json;
			return tasks;
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Error getting active tasks: ${error.message}`);
			}
			throw new Error("Unknown error occurred while getting active tasks");
		}
	}

	async createNewSection(name: string, project_id: string) {
		const token = this.plugin.settings.todoistAPIToken;

		if (!name || !project_id) {
			throw new Error("Both name and project_id are required");
		}

		try {
			const response = await requestUrl({
				url: "https://todoist.com/api/v1/sections",
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name,
					project_id: project_id,
				}),
			});

			if (response.status >= 400) {
				throw new Error(`API returned error status: ${response.status}`);
			}

			const newSection = response.json;
			return newSection;
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Error creating section: ${error.message}`);
			}
			throw new Error("Unknown error occurred while creating section");
		}
	}

	async createNewProject(name: string) {
		const token = this.plugin.settings.todoistAPIToken;
		try {
			const response = await requestUrl({
				url: "https://todoist.com/api/v1/projects",
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name,
				}),
			});

			if (response.status >= 400) {
				throw new Error(`API returned error status: ${response.status}`);
			}

			const newProject = response.json;
			return newProject;
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Error creating project: ${error.message}`);
			}
			throw new Error("Unknown error occurred while creating project");
		}
	}

	// All OLD Api functions from the todoistSyncAPI.ts file that were not refactored yet
	//   async getNonObsidianAllActivityEvents() {
	//   async getCompletedItemsActivity() {
	//   async getUncompletedItemsActivity() {
	//   async getNonObsidianCompletedItemsActivity() {
	//   async getNonObsidianUncompletedItemsActivity() {
	//   async getUpdatedItemsActivity() {
	//   async getNonObsidianUpdatedItemsActivity() {
	//   async getProjectsActivity() {
	//   async generateUniqueId(): Promise<string> {

	async getUserResource() {
		const token = this.plugin.settings.todoistAPIToken;
		try {
			const response = await requestUrl({
				url: "https://todoist.com/api/v1/user",
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
			});

			if (response.status >= 400) {
				throw new Error(`API returned error status: ${response.status}`);
			}

			const data = response.json;
			return data;
		} catch (error) {
			console.error("Failed to fetch user resources:", error);
			throw new Error("Failed to fetch user resources");
		}
	}
}
