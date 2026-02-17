import type { App } from "obsidian";
import { debounce, Notice, Setting, PluginSettingTab } from "obsidian";
import type AnotherSimpleTodoistSync from "../main";

export interface TodoistProject {
	id: string | number;
	name: string;
}

export interface TodoistLabel {
	id: string | number;
	name: string;
}

export interface TodoistSection {
	id: string;
	name: string;
}

export interface TodoistUserData {
	email: string | undefined;
	full_name: string | undefined;
	lang: string | undefined;
	tz_info: {
		timezone: string | undefined;
		gmt_string: string | undefined;
	};
}

export interface FileMetadata {
	[key: string]: {
		todoistTasks: string[];
		todoistCount: number;
		defaultProjectId?: string;
		defaultProjectName?: string;
	};
}

export interface TodoistTasksData {
	projects: {
		results: TodoistProject[];
	};
	tasks: Array<{
		id: string;
		content: string;
		description?: string;
		project_id?: string;
		section_id?: string;
		parent_id?: string;
		order?: number;
		priority?: number;
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
	}>;
	events: Array<{
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
	}>;
	labels?: {
		results: TodoistLabel[];
	};
	sections?: {
		results: TodoistSection[];
	};
	user_data?: {
		email: string | undefined;
		full_name: string | undefined;
		lang: string | undefined;
		tz_info: {
			timezone: string | undefined;
			gmt_string: string | undefined;
		};
	};
}

export interface AnotherSimpleTodoistSyncSettings {
	todoistTasksData: TodoistTasksData;
	fileMetadata: FileMetadata;
	initialized: boolean;
	apiInitialized: boolean;
	todoistAPIToken: string;
	defaultProjectName: string | false;
	defaultProjectId: string;
	automaticSynchronizationInterval: number;
	enableFullVaultSync: boolean;
	debugMode: boolean;
	commentsSync: boolean;
	alternativeKeywords: boolean;
	customSyncTag: string;
	experimentalFeatures: boolean;
	changeDateOrder: boolean;
	linksAppURI: boolean;
	delayedSync: boolean;
	removeObsidianLinks: boolean;
}

export const DefaultAppSettings: Partial<AnotherSimpleTodoistSyncSettings> = {
	todoistTasksData: {
		projects: { results: [] },
		tasks: [],
		events: [],
		user_data: {
			email: "",
			full_name: "",
			lang: "",
			tz_info: { timezone: "", gmt_string: "" },
		},
	},
	fileMetadata: {},
	initialized: false,
	apiInitialized: false,
	defaultProjectName: "Select a project",
	defaultProjectId: "",
	automaticSynchronizationInterval: 150,
	enableFullVaultSync: false,
	debugMode: false,
	commentsSync: true,
	alternativeKeywords: true,
	customSyncTag: "#tdsync",
	experimentalFeatures: false,
	changeDateOrder: false,
	linksAppURI: false,
	delayedSync: false,
	removeObsidianLinks: false,
};

export class AnotherSimpleTodoistSyncPluginSettingTab extends PluginSettingTab {
	plugin: AnotherSimpleTodoistSync;

	constructor(app: App, plugin: AnotherSimpleTodoistSync) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const { containerEl } = this;

		containerEl.empty();

		const myProjectsOptions: Record<string, string> =
			this.plugin.settings.todoistTasksData?.projects?.results?.reduce(
				(obj: Record<string, string>, item: TodoistProject) => {
					obj[item.id.toString()] = item.name;
					return obj;
				},
				{},
			) ?? {};

		new Setting(containerEl).setHeading().setName("API & Sync Settings");

		new Setting(containerEl)
			.setName("Todoist API Token")
			.setDesc("Get your API token from Todoist settings")
			.addText((text) =>
				text
					.setPlaceholder("Enter your API token")
					.setValue(this.plugin.settings.todoistAPIToken || "")
					.onChange(async (value) => {
						this.plugin.settings.todoistAPIToken = value;
						this.plugin.settings.apiInitialized = false;
					}),
			)
			.addButton((button) =>
				button
					.setButtonText("Submit")
					.setCta()
					.onClick(async () => {
						await this.plugin.modifyTodoistAPI(
							this.plugin.settings.todoistAPIToken,
						);
						this.display();
					}),
			);

		// Debounces the sync interval value, to avoid triggering while the user is still typing
		const debouncedSyncSave = debounce(
			(sync_interval: number) => {
				const intervalNum = Number(sync_interval);
				if (Number.isNaN(intervalNum)) {
					new Notice("Wrong type, please enter a number.");
					return;
				}
				if (intervalNum < 20) {
					new Notice(
						"The synchronization interval time cannot be less than 20 seconds.",
					);
					console.error(
						"The synchronization interval time cannot be less than 20 seconds.",
					);
					return;
				}
				if (!Number.isInteger(intervalNum)) {
					new Notice("The synchronization interval must be an integer.");
					return;
				}
				this.plugin.settings.automaticSynchronizationInterval = intervalNum;
				this.plugin.saveSettings();
				new Notice("Settings have been updated.");
			},
			1000,
			true,
		);

		new Setting(containerEl)
			.setName("Automatic sync interval time")
			.setDesc(
				"Please specify the desired interval time, with seconds as the default unit. The default setting is 300 seconds, which corresponds to syncing once every 5 minutes. You can customize it, but it cannot be lower than 20 seconds.",
			)
			.addText((text) =>
				text
					.setPlaceholder("Sync interval")
					.setValue(
						this.plugin.settings.automaticSynchronizationInterval
							? this.plugin.settings.automaticSynchronizationInterval.toString()
							: "150",
					)
					.onChange(async (value) => {
						debouncedSyncSave(Number(value));
					}),
			);

		new Setting(containerEl)
			.setName("Default project")
			.setDesc(
				"New tasks are automatically synced to the default project. You can modify the project here.",
			)
			.addDropdown((component) =>
				component
					.addOption(
						this.plugin.settings.defaultProjectId,
						this.plugin.settings.defaultProjectName
							? this.plugin.settings.defaultProjectName
							: "Select a project",
					)
					.addOptions(myProjectsOptions)
					.onChange((value) => {
						this.plugin.settings.defaultProjectId = value;
						this.plugin.settings.defaultProjectName =
							this.plugin.cacheOperation?.getProjectNameByIdFromCache(value) ??
							"";
						this.plugin.saveSettings();
					}),
			);

		// Test if the tag has #, if not, return false
		function checkTagValue(tag: string) {
			const tagRegexRule = /#[\w\u4e00-\u9fa5-]+/g;
			const tagRegexTest = tagRegexRule.test(tag);

			if (tagRegexTest) {
				return true;
			}
			return false;
		}

		// Debounces the save function for 1 second to avoid triggering multiple notices
		const debouncedTagSave = debounce(
			(tag: string) => {
				this.plugin.settings.customSyncTag = tag;
				this.plugin.saveSettings();
				new Notice("New custom sync tag have been updated.");
			},
			1000,
			true,
		);

		if (this.plugin.settings.experimentalFeatures) {
			new Setting(containerEl)
				.setName("Custom sync tag")
				.setDesc(
					"Set a custom tag to sync tasks with Todoist. NOTE: Using #todoist might conflict with older version of this plugin",
				)
				.addText((text) =>
					text
						.setPlaceholder("Enter custom tag")
						.setValue(this.plugin.settings.customSyncTag)
						.onChange(async (value) => {
							const valueCleaned = value.replace(" ", "");
							checkTagValue(valueCleaned);

							if (!checkTagValue(valueCleaned)) {
								console.error(
									"The tag must contain a # symbol and at least 1 character to be considered a valid sync tag.",
								);
								new Notice("The tag must contain a # symbol.");
							}

							if (checkTagValue(valueCleaned)) {
								debouncedTagSave(valueCleaned);
							}
						}),
				);
		}

		// Prevent plugin from any sync to prevent issues while Obsidian is indexing files
		if (this.plugin.settings.experimentalFeatures) {
			new Setting(containerEl)
				.setName("Delayed first Sync")
				.setDesc(
					"This will hold any sync for 1 minute, to give Obsidian time to sync all files.",
				)
				.addToggle((component) =>
					component
						.setValue(this.plugin.settings.delayedSync)
						.onChange((value) => {
							this.plugin.settings.delayedSync = value;
							this.plugin.saveSettings();
							new Notice("First sync will be delayed by 60 seconds.");
						}),
				);
		}
		new Setting(containerEl)
			.setName("Manual sync")
			.setDesc("Manually perform a synchronization task.")
			.addButton((button) =>
				button.setButtonText("Sync").onClick(async () => {
					if (!this.plugin.settings.apiInitialized) {
						new Notice("Please set the Todoist api first");
						return;
					}
					try {
						await this.plugin.scheduledSynchronization();
						this.plugin.syncLock = false;
						new Notice("Sync with Todoist completed.");
					} catch (error) {
						new Notice(`An error occurred while syncing.:${error}`);
						this.plugin.syncLock = false;
					}
				}),
			);

		// new Setting(containerEl)
		// 	.setName("Check database")
		// 	.setDesc(
		// 		"Check for possible issues: sync error, file renaming not updated, or missed tasks not synchronized.",
		// 	)
		// 	.addButton((button) =>
		// 		button.setButtonText("Check Database").onClick(async () => {
		// 			if (!this.plugin.settings.apiInitialized) {
		// 				new Notice("Please set the Todoist api first");
		// 				return;
		// 			}

		// 			//check file metadata
		// 			await this.plugin.cacheOperation?.checkFileMetadata();
		// 			this.plugin.saveSettings();
		// 			const metadatas =
		// 				await this.plugin.cacheOperation?.getFileMetadatas();
		// 			// check default project task amounts
		// 			try {
		// 				const project_id = this.plugin.settings.defaultProjectId;
		// 				const options = { projectId: project_id };
		// 				const tasks =
		// 					await this.plugin.todoistNewAPI?.getActiveTasks(options);
		// 				const length = Number(tasks?.length);
		// 				if (length >= 300) {
		// 					new Notice(
		// 						"The number of tasks in the default project exceeds 300, reaching the upper limit. It is not possible to add more tasks. Please modify the default project.",
		// 					);
		// 				}
		// 			} catch (error) {
		// 				console.error(
		// 					`An error occurred while get tasks from todoist: ${error.message}`,
		// 				);
		// 			}

		// 			if (!(await this.plugin.checkAndHandleSyncLock())) return;

		// 			//check empty task
		// 			for (const key in metadatas) {
		// 				const value = metadatas[key];
		// 				for (const taskId of value.todoistTasks) {
		// 					let taskObject:
		// 						| import("@doist/todoist-api-typescript").Task
		// 						| undefined;
		// 					try {
		// 						taskObject =
		// 							await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId);
		// 					} catch (error) {
		// 						console.error(
		// 							`An error occurred while loading task cache: ${error.message}`,
		// 						);
		// 					}

		// 					if (!taskObject) {
		// 						//get from Todoist
		// 						try {
		// 							taskObject =
		// 								await this.plugin.todoistNewAPI?.getTaskById(taskId);
		// 						} catch (error) {
		// 							if (error.message.includes("404")) {
		// 								// 处理404错误
		// 								await this.plugin.cacheOperation?.deleteTaskIdFromMetadata(
		// 									key,
		// 									taskId,
		// 								);
		// 								continue;
		// 							}
		// 							// 处理其他错误
		// 							console.error(error);
		// 						}
		// 					}
		// 				}
		// 			}
		// 			this.plugin.saveSettings();

		// 			try {
		// 				//check renamed files
		// 				for (const key in metadatas) {
		// 					const value = metadatas[key];
		// 					const newDescription =
		// 						this.plugin.taskParser?.getObsidianUrlFromFilepath(key);
		// 					for (const taskId of value.todoistTasks) {
		// 						let taskObject:
		// 							| import("@doist/todoist-api-typescript").Task
		// 							| undefined;
		// 						try {
		// 							taskObject =
		// 								await this.plugin.cacheOperation?.loadTaskFromCacheID(
		// 									taskId,
		// 								);
		// 						} catch (error) {
		// 							console.error(
		// 								`An error occurred while loading task ${taskId} from cache: ${error.message}`,
		// 							);
		// 						}
		// 						if (!taskObject) {
		// 							continue;
		// 						}
		// 						const oldDescription = taskObject?.description ?? "";
		// 						if (newDescription !== oldDescription) {
		// 							try {
		// 								await this.plugin.todoistSync?.updateTaskDescription(key);
		// 							} catch (error) {
		// 								console.error(
		// 									`An error occurred while updating task discription: ${error.message}`,
		// 								);
		// 							}
		// 						}
		// 					}
		// 				}

		// 				//check empty file metadata

		// 				//check calendar format

		// 				//check omitted tasks
		// 				const files = this.app.vault.getFiles();
		// 				files.forEach(async (v, i) => {
		// 					if (v.extension === "md") {
		// 						try {
		// 							await this.plugin.fileOperation?.addTodoistLinkToFile(v.path);
		// 							if (this.plugin.settings.enableFullVaultSync) {
		// 								await this.plugin.fileOperation?.addTodoistTagToFile(
		// 									v.path,
		// 								);
		// 							}
		// 						} catch (error) {
		// 							console.error(
		// 								`An error occurred while check new tasks in the file: ${v.path}, ${error.message}`,
		// 							);
		// 						}
		// 					}
		// 				});
		// 				this.plugin.syncLock = false;
		// 				new Notice("All files have been scanned.");
		// 			} catch (error) {
		// 				console.error(
		// 					`An error occurred while scanning the vault.:${error}`,
		// 				);
		// 				this.plugin.syncLock = false;
		// 			}
		// 		}),
		// 	);

		new Setting(containerEl)
			.setName("Sync comments")
			.setDesc("When enabled, new Todoist comments won't by added below tasks")
			.addToggle((component) =>
				component
					.setValue(this.plugin.settings.commentsSync)
					.onChange((value) => {
						this.plugin.settings.commentsSync = value;
						this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setHeading().setName("Backup & Data Settings");

		new Setting(containerEl)
			.setName("Backup Todoist Data")
			.setDesc(
				"A backup file will be stored in the root directory of the Obsidian vault.",
			)
			.addButton((button) =>
				button.setButtonText("Backup").onClick(() => {
					if (!this.plugin.settings.apiInitialized) {
						new Notice("Please set the Todoist api first");
						return;
					}
					this.plugin.todoistSync?.backupTodoistAllResources();
				}),
			);

		new Setting(containerEl).setHeading().setName("Experimental features");

		new Setting(containerEl)
			.setName("Experimental features")
			.setDesc(
				"Manage experimental features. Some might not be working yet or have bugs.",
			)
			.addToggle((component) =>
				component
					.setValue(this.plugin.settings.experimentalFeatures)
					.onChange((value) => {
						this.plugin.settings.experimentalFeatures = value;
						this.plugin.saveSettings();
						new Notice(
							"Experimental features have been enabled. Be careful, some might not be working yet or have bugs.",
						);
						this.display();
					}),
			);

		if (this.plugin.settings.experimentalFeatures) {
			new Setting(containerEl)
				.setName("Alternative keywords")
				.setDesc(
					"Enable the use of @ for settings calendar time, $ for time and & for duration. Enabled by default.",
				)
				.addToggle((component) =>
					component
						.setValue(this.plugin.settings.alternativeKeywords)
						.onChange((value) => {
							this.plugin.settings.alternativeKeywords = value;
							this.plugin.saveSettings();
						}),
				);
		}

		if (this.plugin.settings.experimentalFeatures) {
			new Setting(containerEl)
				.setName("Obsidian Tasks Integration")
				.setDesc(
					"In order to have this plugin properly working with Obsidian Tasks plugin, it has to reorder the link and tid comment.",
				)
				.addToggle((component) =>
					component
						.setValue(this.plugin.settings.changeDateOrder)
						.onChange((value) => {
							this.plugin.settings.changeDateOrder = value;
							this.plugin.saveSettings();
						}),
				);
		}

		if (this.plugin.settings.experimentalFeatures) {
			new Setting(containerEl)
				.setName("Change URL to app URI")
				.setDesc(
					'Create tasks links using app URI ("todoist://") instead of brower url ("https://app.todoist.com/") to open desktop app instead of browser.',
				)
				.addToggle((component) =>
					component
						.setValue(this.plugin.settings.linksAppURI)
						.onChange((value) => {
							this.plugin.settings.linksAppURI = value;
							this.plugin.saveSettings();
						}),
				);
		}

		if (this.plugin.settings.experimentalFeatures) {
			new Setting(containerEl)
				.setName("Remove Obsidian file name from task description")
				.setDesc('By default, this plugins adds the file name to the task description. Enable this option to remove it.')
				.addToggle((component) =>
					component
						.setValue(this.plugin.settings.removeObsidianLinks)
						.onChange((value) => {
							this.plugin.settings.removeObsidianLinks = value;
							this.plugin.saveSettings();
						}),
				);
		}

		// TODO need to evaluate if this feature is still working after all the new features
		if (this.plugin.settings.experimentalFeatures) {
			new Setting(containerEl)
				.setName("Full vault sync")
				.setDesc(
					"By default, only tasks marked with #tdsync are synchronized. If this option is turned on, any tasks in the vault will be synchronized.",
				)
				.addToggle((component) =>
					component
						.setValue(this.plugin.settings.enableFullVaultSync)
						.onChange((value) => {
							this.plugin.settings.enableFullVaultSync = value;
							this.plugin.saveSettings();
							new Notice("Full vault sync is enabled.");
						}),
				);
		}

		new Setting(containerEl)
			.setHeading()
			.setName("User Data Settings")
			.setDesc(
				"For now, those settings can only be changed in your Todoist account.",
			);

		const userResource = await this.plugin.todoistNewAPI?.getUserResource();

		if (!this.plugin.settings.todoistTasksData.user_data) {
			this.plugin.settings.todoistTasksData.user_data = {
				email: "",
				full_name: "",
				lang: "",
				tz_info: { timezone: "", gmt_string: "" },
			};
		}

		const saveUserData = async () => {
			try {
				this.plugin.settings.todoistTasksData.user_data = {
					email: userResource?.email ?? "",
					full_name: userResource?.full_name ?? "",
					lang: userResource?.lang ?? "",
					tz_info: {
						timezone: userResource?.tz_info?.timezone ?? "",
						gmt_string: userResource?.tz_info?.gmt_string ?? "",
					},
				};
			} catch (error) {
				console.error(`Error saving user data: ${error}`);
			}
		};

		saveUserData();

		new Setting(containerEl)
			.setName(`Hello, ${userResource?.full_name}!`)
			.setDisabled(true);

		new Setting(containerEl)
			.setName("User timezone")
			.setDesc("Timezone set on your Todoist account.")
			.addText((text) =>
				text
					.setPlaceholder("User Timezone")
					.setValue(
						`${userResource?.tz_info?.timezone} (${userResource?.tz_info?.gmt_string})`,
					)
					.setDisabled(true),
			);

		new Setting(containerEl)
			.setName("User language")
			.setDesc("Language set on your Todoist account.")
			.addText((text) =>
				text
					.setPlaceholder("User Language")
					.setValue(userResource?.lang)
					.setDisabled(true),
			);
		new Setting(containerEl).setHeading().setName("Developer Settings");

		new Setting(containerEl)
			.setName("Debug mode")
			.setDesc(
				"Enable this option to log information will on the development console, which can help troubleshoot for errors.",
			)
			.addToggle((component) =>
				component.setValue(this.plugin.settings.debugMode).onChange((value) => {
					this.plugin.settings.debugMode = value;
					this.plugin.saveSettings();
				}),
			);

		// Add type for key in settings loop
		for (const key of Object.keys(this.plugin.settings) as Array<
			keyof typeof this.plugin.settings
		>) {
			if (key === "todoistTasksData") {
				break;
			}
			delete this.plugin.settings[key];
		}
	}
}
