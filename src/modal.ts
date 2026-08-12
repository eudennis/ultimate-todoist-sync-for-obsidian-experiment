import type { App } from "obsidian";
import { Modal, Setting } from "obsidian";
import type AnotherSimpleTodoistSync from "../main";
import type { TodoistProject } from "./settings";

export class SetDefaultProjectInTheFilepathModal extends Modal {
	defaultProjectId: string;
	defaultProjectName: string;
	filepath: string;
	plugin: AnotherSimpleTodoistSync;

	constructor(app: App, plugin: AnotherSimpleTodoistSync, filepath: string) {
		super(app);
		this.filepath = filepath;
		this.plugin = plugin;
		this.open();
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h5", {
			text: "Another Todoist Sync: Set default project for the current file.",
		});

		this.defaultProjectId =
			this.plugin.cacheOperation?.getDefaultProjectIdForFilepath(
				this.filepath,
			) ?? "";
		this.defaultProjectName =
			this.plugin.cacheOperation?.getProjectNameByIdFromCache(
				this.defaultProjectId,
			) ?? "";
		const myProjectsOptions: Record<string, string> | undefined =
			this.plugin.settings.todoistTasksData?.projects?.results?.reduce(
				(obj: Record<string, string>, item: TodoistProject) => {
					obj[item.id.toString()] = item.name;
					return obj;
				},
				{},
			);

		new Setting(contentEl)
			.setName("Default project")
			.setDesc("All new tasks will be added to this project.")
			.addDropdown((component) =>
				component
					.addOption(this.defaultProjectId, this.defaultProjectName ?? "")
					.addOptions(myProjectsOptions)
					.onChange(async (value) => {
						this.plugin.cacheOperation?.setDefaultProjectIdForFilepath(
							this.filepath,
							value,
							this.defaultProjectName,
						);
						await this.plugin.setStatusBarText();
						this.close();
					}),
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
