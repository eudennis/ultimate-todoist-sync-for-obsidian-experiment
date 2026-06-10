import { MarkdownView, Notice, Plugin, type Editor } from "obsidian";

//settings
import {
	type AnotherSimpleTodoistSyncSettings,
	DefaultAppSettings,
	AnotherSimpleTodoistSyncPluginSettingTab,
} from "./src/settings";
import { TodoistNewAPI } from "src/todoistAPI";
import { TaskParser } from "./src/taskParser";
import { CacheOperation } from "./src/cacheOperation";
import { FileOperation } from "./src/fileOperation";
import { TodoistSync } from "./src/syncModule";
import { SetDefaultProjectInTheFilepathModal } from "src/modal";
import { ImportTaskFromTodoistModal } from "src/importTaskModal";

export default class AnotherSimpleTodoistSync extends Plugin {
	declare settings: AnotherSimpleTodoistSyncSettings;
	private settingsCache: string | null = null;
	todoistNewAPI: TodoistNewAPI | undefined;
	taskParser: TaskParser | undefined;
	cacheOperation: CacheOperation | undefined;
	fileOperation: FileOperation | undefined;
	todoistSync: TodoistSync | undefined;
	lastLines!: Map<string, number>;
	statusBar!: HTMLElement;
	syncLock!: boolean;

	

	async onload() {
		this.app.workspace.onLayoutReady(async () => {
			const isSettingsLoaded = await this.loadSettings();

			if (!isSettingsLoaded) {
				new Notice(
					"Settings failed to load. Please reload the Another Simple Todoist Sync plugin.",
				);
				return;
			}
			// This adds a settings tab so the user can configure various aspects of the plugin
			this.addSettingTab(new AnotherSimpleTodoistSyncPluginSettingTab(this.app, this));
		if (!this.settings.todoistAPIToken) {
			new Notice("Please enter your Todoist API.");
			//return
		} else {
			await this.initializePlugin();
		}

		//lastLine object {path:line} is saved in lastLines map
		this.lastLines = new Map();

		// Create a syncLock effect to prevent sync of tasks while Obsidian is still indexing files and downloading updates
		let initialSyncIsLocked: boolean;

		function runAfter60Seconds() {
			initialSyncIsLocked = false;
		}

		function startCounter() {
			setTimeout(() => {
				runAfter60Seconds();
			}, 60000); // 60 seconds
		}

		if (this.settings.delayedSync) {
			initialSyncIsLocked = true;
			startCounter();
		}

		//key event monitoring, judging line break and deletion
		this.registerDomEvent(document, "keyup", async (evt: KeyboardEvent) => {
			if (!this.settings.apiInitialized) {
				return;
			}

			//Determine the area where the click event occurs. If it is not in the editor，return
			if (!this.app.workspace.activeEditor?.editor?.hasFocus()) {
				return;
			}

			if (
				evt.key === "ArrowUp" ||
				evt.key === "ArrowDown" ||
				evt.key === "ArrowLeft" ||
				evt.key === "ArrowRight" ||
				evt.key === "PageUp" ||
				evt.key === "PageDown"
			) {
				if (initialSyncIsLocked) {
					return;
				}
				// TODO for some reason, in some cases, without this wait, the task is deleted just after the task is created. Still have not found why
				await new Promise((resolve) => setTimeout(resolve, 10000));
				if (!this.checkModuleClass()) {
					return;
				}
				this.lineNumberCheck();
			}

			if (evt.key === "Enter") {
				// if the plugin settings for sync is enabled, it won't sync for the first 60 seconds
				if (initialSyncIsLocked) {
					return;
				}
				// Check if the line has a task when the user hits "enter" (to select a tag)
				// TODO needs to modify lineContentNewTaskCheck to accept if is the current ore previous line, so when the user jumps to the next line, we can check for a task within the previous line
				try {
					const editor = this.app.workspace.activeEditor?.editor;
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);

					if (!this.settings.apiInitialized) {
						return;
					}

					this.lineNumberCheck();
					if (!this.checkModuleClass()) {
						return;
					}
					if (this.settings.enableFullVaultSync) {
						return;
					}
					if (!(await this.checkAndHandleSyncLock())) return;
					if (view) {
						await this.todoistSync?.lineContentNewTaskCheck(editor, view);
					}
					this.syncLock = false;
					this.saveSettings();
				} catch (error) {
					console.error(
						`An error occurred while check new task in line: ${error.message}`,
					);
					this.syncLock = false;
				}
			}

			if (
				evt.key === "Delete" ||
				evt.key === "Backspace" ||
				evt.key === "Del"
			) {
				if (initialSyncIsLocked) {
					return;
				}
				try {
					if (!this.checkModuleClass()) {
						return;
					}
					if (!(await this.checkAndHandleSyncLock())) return;
					const file_path =
						this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
					if (file_path) {
						await this.todoistSync?.deletedTaskCheck(file_path);
					}
					this.syncLock = false;
					this.saveSettings();
				} catch (error) {
					console.error(`An error occurred while deleting tasks: ${error}`);
					this.syncLock = false;
				}
			}
		});

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, "click", async (evt: MouseEvent) => {
			if (!this.settings.apiInitialized) {
				return;
			}
			if (this.app.workspace.activeEditor?.editor?.hasFocus()) {
				this.lineNumberCheck();
			} else {
				//
			}

			const target = evt.target as HTMLInputElement;

			if (target.type === "checkbox") {
				if (!this.checkModuleClass()) {
					return;
				}
				this.checkboxEventHandler(evt);
				//this.todoistSync.fullTextModifiedTaskCheck()
			}
		});

		//hook editor-change event, if the current line contains #tdsync, it means there is a new task
		this.registerEvent(
			this.app.workspace.on(
				"editor-change",
				async (editor, view: MarkdownView) => {
					// TODO for some reason, in some cases, without this wait, the task is deleted just after the task is created. Still didn't find why
					await new Promise((resolve) => setTimeout(resolve, 10000));
					try {
						if (!this.settings.apiInitialized) {
							return;
						}

						this.lineNumberCheck();
						if (!this.checkModuleClass()) {
							return;
						}
						if (this.settings.enableFullVaultSync) {
							return;
						}
						if (!(await this.checkAndHandleSyncLock())) return;
						await this.todoistSync?.lineContentNewTaskCheck(editor, view);
						this.syncLock = false;
						this.saveSettings();
					} catch (error) {
						console.error(
							`An error occurred while check new task in line: ${error.message}`,
						);
						this.syncLock = false;
					}
				},
			),
		);

		// Listen for rename events and update the task data path
		this.registerEvent(
			this.app.vault.on("rename", async (file, oldpath) => {
				if (!this.settings.apiInitialized) {
					return;
				}
				// Read frontMatter
				//const frontMatter = await this.fileOperation.getFrontMatter(file)
				const frontMatter = await this.cacheOperation?.getFileMetadataByFilePath(oldpath);
				if (frontMatter === null || frontMatter?.todoistTasks === undefined) {
					return;
				}
				if (!this.checkModuleClass()) {
					return;
				}
				await this.cacheOperation?.updateRenamedFilePath(oldpath, file.path);
				this.saveSettings();

				//update task description
				if (!(await this.checkAndHandleSyncLock())) return;
				try {
					await this.todoistSync?.updateTaskDescription(file.path);
				} catch (error) {
					console.error("An error occurred in updateTaskDescription:", error);
				}
				this.syncLock = false;
			}),
		);

		//Listen for file modified events and execute fullTextNewTaskCheck
		this.registerEvent(
			this.app.vault.on("modify", async (file) => {
				try {
					if (!this.settings.apiInitialized) {
						return;
					}
					const filepath = file.path;

					//get current view
					const activateFile = this.app.workspace.getActiveFile();

					//To avoid conflicts, Do not check files being edited
					if (activateFile?.path === filepath) {
						return;
					}

					if (!(await this.checkAndHandleSyncLock())) return;

					await this.todoistSync?.fullTextNewTaskCheck(filepath);
					this.syncLock = false;
				} catch (error) {
					console.error(
						`An error occurred while modifying the file: ${error.message}`,
					);
					this.syncLock = false;
				}
			}),
		);

		this.registerInterval(
			window.setInterval(
				async () => await this.scheduledSynchronization(),
				this.settings.automaticSynchronizationInterval * 1000,
			),
		);

		this.app.workspace.on("active-leaf-change", (leaf) => {
			this.setStatusBarText();
		});

		// set default  project for Todoist task in the current file
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "set-default-project-for-todoist-task-in-the-current-file",
			name: "Set default project for Todoist task in the current file",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if (!view) {
					return;
				}
				let filepath: string;
				if (view.file) {
					filepath = view.file.path;
					new SetDefaultProjectInTheFilepathModal(this.app, this, filepath);
				}
			},
		});

		// Adds an edit command to trigger the manual sync.
		this.addCommand({
			id: "asts-trigger-manual-sync",
			name: "Trigger the Manual Sync",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if (!view) {
					return;
				}
				// let filepath
				if (view.file) {
					// filepath = view.file.path
					if (!this.settings.apiInitialized) {
						new Notice("Please set the Todoist api first");
						return;
					}
					try {
						this.scheduledSynchronization();
						this.syncLock = false;
					} catch (error) {
						new Notice(`An error occurred while syncing.:${error}`);
						this.syncLock = false;
					}
				}
			},
		});

		this.addCommand({
			id: "asts-cleanup-old-plugin-version-data",
			name: "Clean data from plugin below v0.5.0",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if (!view) {
					return;
				}
				this.cacheOperation?.cleanupOldPluginVersionData();
			},
		});

		this.addCommand({
			id: "asts-import-task-from-todoist-link",
			name: "Import task from Todoist link",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if (!view?.file) {
					return;
				}
				if (!this.settings.apiInitialized) {
					new Notice("Please set the Todoist API token first.");
					return;
				}
				if (!this.settings.experimentalFeatures || !this.settings.enableImportFromTodoistLink) {
					new Notice('Enable "Import task from Todoist link" under Experimental Features in the plugin settings.');
					return;
				}
				if (!this.checkModuleClass()) {
					return;
				}
				new ImportTaskFromTodoistModal(this.app, this, editor, view.file.path);
			},
		});

		//display default project for the current file on status bar
		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.statusBar = this.addStatusBarItem();
		});
	}

	async onunload() {
		await this.saveSettings();
	}

	async loadSettings() {
		try {
			const data = await this.loadData();
			this.settings = Object.assign({}, DefaultAppSettings, data);
			this.settingsCache = this.normalizeSettingsForCompare(this.settings);
			return true;
		} catch (error) {
			console.error("Failed to load data:", error);
			return false;
		}
	}

	async saveSettings() {
		try {
			if (this.settings && Object.keys(this.settings).length > 0) {
				const normalized = this.normalizeSettingsForCompare(this.settings);
				if (this.settingsCache === normalized) return;
				await this.saveData(this.settings);
				this.settingsCache = normalized;
			} else {
				console.error(
					"Settings are empty or invalid, not saving to avoid data loss.",
				);
			}
		} catch (error) {
			console.error("Error saving settings:", error);
		}
	}

	private normalizeSettingsForCompare(settings: AnotherSimpleTodoistSyncSettings): string {
		try {
			const copy = JSON.parse(JSON.stringify(settings));
			if (copy.todoistTasksData) {
				if (Array.isArray(copy.todoistTasksData.tasks)) {
					copy.todoistTasksData.tasks.sort((a: any, b: any) => (a.id > b.id ? 1 : -1));
				}
				if (Array.isArray(copy.todoistTasksData.projects?.results)) {
					copy.todoistTasksData.projects.results.sort((a: any, b: any) => (a.id > b.id ? 1 : -1));
				}
			}
			return JSON.stringify(copy);
		} catch {
			return JSON.stringify(settings);
		}
	}

	async modifyTodoistAPI(api: string) {
		await this.initializePlugin();
	}

	// return true of false
	async initializePlugin() {
		// initialize Todoist API
		this.todoistNewAPI = new TodoistNewAPI(this.app, this);

		//initialize data read and write object
		this.cacheOperation = new CacheOperation(this.app, this);
		const isProjectsSaved = await this.cacheOperation.saveProjectsToCache();
		const isSectionsSaved = await this.cacheOperation.saveSectionsToCache();

		if (!isProjectsSaved || !isSectionsSaved) {
			if (!isProjectsSaved) {
				console.error("Error saving projects to cache");
			}
			if (!isSectionsSaved) {
				console.error("Error saving sections to cache");
			}
			// this.todoistRestAPI = undefined
			// this.todoistSyncAPI = undefined
			this.todoistNewAPI = undefined;
			this.taskParser = undefined;
			this.cacheOperation = undefined;
			this.fileOperation = undefined;
			this.todoistSync = undefined;
			new Notice(
				"Another Simple Todoist Sync plugin initialization failed, please check the Todoist api",
			);
			return;
		}

		if (!this.settings.initialized) {
			try {
				// First plugin startup — initialize modules and back up Todoist data
				this.taskParser = new TaskParser(this.app, this);

				//initialize file operation
				this.fileOperation = new FileOperation(this.app, this);

				//initialize Todoist sync module
				this.todoistSync = new TodoistSync(this.app, this);

				// Back up all Todoist resources before each startup
				this.todoistSync.backupTodoistAllResources();
			} catch (error) {
				console.error(`error creating user data folder: ${error}`);
				new Notice("error creating user data folder");
				return;
			}

			// Mark plugin as initialized
			this.settings.initialized = true;
			this.saveSettings();
			new Notice(
				"Another Simple Todoist Sync initialization successful. Todoist data has been backed up.",
			);
		}

		this.initializeModuleClass();

		//get user plan resources
		//const rsp = await this.todoistSyncAPI.getUserResource()
		this.settings.apiInitialized = true;
		this.syncLock = false;
		new Notice("Another Simple Todoist Sync loaded successfully.");
		return true;
	}

	async initializeModuleClass() {
		// initialize Todoist New API
		this.todoistNewAPI = new TodoistNewAPI(this.app, this);

		//initialize data read and write object
		this.cacheOperation = new CacheOperation(this.app, this);
		this.taskParser = new TaskParser(this.app, this);

		//initialize file operation
		this.fileOperation = new FileOperation(this.app, this);

		//initialize Todoist sync module
		this.todoistSync = new TodoistSync(this.app, this);

		if (this.settings.debugMode) {
			console.log(
				`Another Simple Todoist Sync plugin: version ${this.manifest.version} (requires obsidian ${this.manifest.minAppVersion})`,
			);
		}
	}

	async lineNumberCheck() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			const cursor = view.app.workspace
				.getActiveViewOfType(MarkdownView)
				?.editor.getCursor();
			const line = cursor?.line;
			//const lineText = view.editor.getLine(line)
			const fileContent = view.data;

			//console.log(line)
			//const fileName = view.file?.name
			const fileName =
				view.app.workspace.getActiveViewOfType(MarkdownView)?.app.workspace
					.activeEditor?.file?.name;
			const filepath =
				view.app.workspace.getActiveViewOfType(MarkdownView)?.app.workspace
					.activeEditor?.file?.path;
			if (
				typeof this.lastLines === "undefined" ||
				typeof this.lastLines.get(fileName as string) === "undefined"
			) {
				this.lastLines.set(fileName as string, line as number);
				return;
			}

			// console.log(`filename is ${fileName}`);
			if (
				this.lastLines.has(fileName as string) &&
				line !== this.lastLines.get(fileName as string)
			) {
				const lastLine = this.lastLines.get(fileName as string);

				const lastLineText = view.editor.getLine(lastLine as number);
				if (!this.checkModuleClass()) {
					return;
				}
				this.lastLines.set(fileName as string, line as number);
				try {
					if (!(await this.checkAndHandleSyncLock())) return;
					await this.todoistSync?.lineModifiedTaskCheck(
						filepath as string,
						lastLineText,
						lastLine as number,
						fileContent,
					);
					this.syncLock = false;
				} catch (error) {
					console.error(
						`An error occurred while check modified task in line text: ${error}`,
					);
					this.syncLock = false;
				}
			}
		}
	}

	async checkboxEventHandler(evt: MouseEvent) {
		if (!this.checkModuleClass()) {
			return;
		}
		const target = evt.target as HTMLInputElement;

		// Use closest() to find the nearest div parent rather than indexing into the event path
		const taskElement = target.closest("div");
		//console.log(taskElement)
		if (!taskElement) return;
		const regex = /\[tid:: (\d+)\]/; // Match [tid:: number] format
		// const regex = /\[todoist_id:: (\d+)\]/;
		const match = taskElement.textContent?.match(regex) || false;
		if (match) {
			const taskId = match[1];
			//console.log(taskId)
			//const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (target.checked) {
				this.todoistSync?.closeTask(taskId);
			} else {
				this.todoistSync?.reopenTask(taskId);
			}
		} else {
			//Start full text search and check status update
			try {
				if (!(await this.checkAndHandleSyncLock())) return;
				const file_path =
					this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
				if (file_path) {
					await this.todoistSync?.fullTextModifiedTaskCheck(file_path);
				}
				this.syncLock = false;
			} catch (error) {
				console.error(
					`An error occurred while check modified tasks in the file: ${error}`,
				);
				this.syncLock = false;
			}
		}
	}

	// Check if the module class is initialized
	checkModuleClass() {
		if (this.settings.apiInitialized === true) {
			if (
				this.todoistNewAPI === undefined ||
				this.cacheOperation === undefined ||
				this.fileOperation === undefined ||
				this.todoistSync === undefined ||
				this.taskParser === undefined
			) {
				this.initializeModuleClass();
			}
			return true;
		}
		new Notice("Please enter the correct Todoist API token");
		return false;
	}

	async setStatusBarText() {
		if (!this.checkModuleClass()) {
			return;
		}
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			this.statusBar.setText("");
		} else {
			const filepath =
				this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;

			if (filepath === undefined) {
				return;
			}
			const defaultProjectName =
				await this.cacheOperation?.getDefaultProjectNameForFilepath(
					filepath as string,
				);
			if (defaultProjectName === undefined) {
				return;
			}
			this.statusBar.setText(defaultProjectName as string);
		}
	}

	async scheduledSynchronization() {
		if (!this.checkModuleClass()) {
			return;
		}

		try {
			if (!(await this.checkAndHandleSyncLock())) return;
			try {
				await this.todoistSync?.syncTodoistToObsidian();
			} catch (error) {
				console.error("An error occurred in syncTodoistToObsidian:", error);
			}
			this.syncLock = false;
			try {
				await this.saveSettings();
			} catch (error) {
				console.error("An error occurred in saveSettings:", error);
			}

			const filesToSync = this.settings.fileMetadata;
			// console.log("filesToSync is", filesToSync);
			for (const fileKey in filesToSync) {
				if (!(await this.checkAndHandleSyncLock())) return;
				try {
					await this.todoistSync?.fullTextNewTaskCheck(fileKey);
				} catch (error) {
					console.error("An error occurred in fullTextNewTaskCheck:", error);
				}
				this.syncLock = false;

				if (!(await this.checkAndHandleSyncLock())) return;
				try {
					await this.todoistSync?.deletedTaskCheck(fileKey);
				} catch (error) {
					console.error("An error occurred in deletedTaskCheck:", error);
				}
				this.syncLock = false;

				if (!(await this.checkAndHandleSyncLock())) return;
				try {
					// console.log("fullTextModifiedTaskCheck function is called");
					await this.todoistSync?.fullTextModifiedTaskCheck(fileKey);
				} catch (error) {
					console.error(
						"An error occurred in fullTextModifiedTaskCheck:",
						error,
					);
				}
				this.syncLock = false;
			}
		} catch (error) {
			console.error("An error occurred:", error);
			new Notice("An error occurred:", error);
			this.syncLock = false;
		}
	}

	async checkSyncLock() {
		let checkCount = 0;
		while (this.syncLock === true && checkCount < 10) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
			checkCount++;
		}
		if (this.syncLock === true) {
			return false;
		}
		return true;
	}

	async checkAndHandleSyncLock() {
		if (this.syncLock) {
			const isSyncLockChecked = await this.checkSyncLock();
			if (!isSyncLockChecked) {
				return false;
			}
		}
		this.syncLock = true;
		return true;
	}
}
