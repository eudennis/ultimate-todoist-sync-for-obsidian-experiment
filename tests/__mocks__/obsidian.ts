import { vi } from "vitest";

// The `obsidian` npm package ships types only — at runtime Obsidian injects these
// globals. In tests we provide the minimal stubs the plugin's classes touch.

export class App {
	vault = {
		getName: vi.fn().mockReturnValue("TestVault"),
		getAbstractFileByPath: vi.fn().mockReturnValue(null),
		getFiles: vi.fn().mockReturnValue([]),
		read: vi.fn().mockResolvedValue(""),
		modify: vi.fn().mockResolvedValue(undefined),
		cachedRead: vi.fn().mockResolvedValue(""),
		create: vi.fn().mockResolvedValue(undefined),
	};
	workspace = {
		activeEditor: null,
		getActiveViewOfType: vi.fn().mockReturnValue(null),
	};
	metadataCache = {
		getFileCache: vi.fn().mockReturnValue(null),
	};
	fileManager = {
		processFrontMatter: vi.fn().mockResolvedValue(undefined),
	};
}

export class Modal {
	app: App;
	contentEl: {
		empty: ReturnType<typeof vi.fn>;
		createEl: ReturnType<typeof vi.fn>;
	};
	constructor(app: App) {
		this.app = app;
		this.contentEl = {
			empty: vi.fn(),
			createEl: vi.fn().mockReturnValue({
				createEl: vi.fn().mockReturnValue({ setText: vi.fn(), createEl: vi.fn() }),
				setText: vi.fn(),
				style: {},
			}),
		};
	}
	// In real Obsidian, open() triggers onOpen(). The mock keeps it a no-op so
	// constructing a Modal in a test does not try to render the Settings UI.
	open = vi.fn();
	close = vi.fn();
}

export class Setting {
	constructor(_containerEl: unknown) {}
	setName = vi.fn().mockReturnThis();
	setDesc = vi.fn().mockReturnThis();
	setDisabled = vi.fn().mockReturnThis();
	setHeading = vi.fn().mockReturnThis();
	addText = vi.fn().mockReturnThis();
	addButton = vi.fn().mockReturnThis();
	addToggle = vi.fn().mockReturnThis();
	addDropdown = vi.fn().mockReturnThis();
}

export class Notice {
	constructor(_message: string) {}
}

export class TFile {
	path: string;
	name: string;
	constructor(path: string) {
		this.path = path;
		this.name = path.split("/").pop() ?? path;
	}
}

export class PluginSettingTab {
	app: App;
	containerEl = { empty: vi.fn() };
	constructor(app: App, _plugin: unknown) {
		this.app = app;
	}
}

export class Plugin {
	app: App;
	constructor() {
		this.app = new App();
	}
	addCommand = vi.fn();
	addSettingTab = vi.fn();
	registerDomEvent = vi.fn();
	registerInterval = vi.fn();
	loadData = vi.fn().mockResolvedValue({});
	saveData = vi.fn().mockResolvedValue(undefined);
}

// TodoistNewAPI calls requestUrl() imported from "obsidian" directly. Tests use
// vi.mocked(requestUrl).mockResolvedValueOnce(...) / mockRejectedValueOnce(...).
export const requestUrl = vi.fn().mockResolvedValue({
	status: 200,
	json: {},
	text: "",
});

export const debounce = vi.fn((fn: (...args: unknown[]) => void) => fn);

export class MarkdownView {}
export class Editor {}
