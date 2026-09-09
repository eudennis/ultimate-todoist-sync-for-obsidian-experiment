import type { App } from "obsidian";
import { Modal, Setting, TFile } from "obsidian";
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
			text: "Another Simple Todoist Sync: Set default project for the current file.",
		});

		// Prefer the note's YAML frontmatter `project:` key (only consulted by
		// the sync engine when the "Project from note frontmatter" experimental
		// setting is on); otherwise fall back to the legacy per-file default
		// stored in plugin settings, same as before this feature existed.
		const frontmatterProjectName = this.plugin.settings.enableFrontmatterProject
			? this.plugin.taskParser?.getProjectNameFromFrontmatter(this.filepath)
			: undefined;
		if (frontmatterProjectName) {
			const rawProjectId = this.plugin.cacheOperation?.getProjectIdByNameFromCache(
				frontmatterProjectName,
			);
			this.defaultProjectId = rawProjectId ? rawProjectId.toString() : "";
			this.defaultProjectName = frontmatterProjectName;
		} else {
			this.defaultProjectId =
				this.plugin.cacheOperation?.getDefaultProjectIdForFilepath(
					this.filepath,
				) ?? "";
			this.defaultProjectName =
				this.plugin.cacheOperation?.getProjectNameByIdFromCache(
					this.defaultProjectId,
				) ?? "";
		}
		const myProjectsOptions: Record<string, string> | undefined =
			this.plugin.settings.todoistTasksData?.projects?.results?.reduce(
				(obj: Record<string, string>, item: TodoistProject) => {
					obj[item.id.toString()] = item.name;
					return obj;
				},
				{},
			);

		const useFrontmatter = this.plugin.settings.enableFrontmatterProject;

		new Setting(contentEl)
			.setName("Default project")
			.setDesc(
				useFrontmatter
					? "All new tasks in this note will be added to this project. Written to the note's YAML frontmatter as `project: <name>`."
					: "All new tasks will be added to this project.",
			)
			.addDropdown((component) =>
				component
					.addOption(this.defaultProjectId, this.defaultProjectName ?? "")
					.addOptions(myProjectsOptions)
					.onChange(async (value) => {
						if (useFrontmatter) {
							const projectName =
								this.plugin.cacheOperation?.getProjectNameByIdFromCache(
									value,
								) ?? "";
							const file = this.app.vault.getAbstractFileByPath(this.filepath);
							if (file instanceof TFile) {
								await this.app.fileManager.processFrontMatter(
									file,
									(frontmatter: Record<string, unknown>) => {
										frontmatter.project = projectName;
									},
								);
							}
						} else {
							this.plugin.cacheOperation?.setDefaultProjectIdForFilepath(
								this.filepath,
								value,
								this.defaultProjectName,
							);
						}
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
