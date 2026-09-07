import { vi } from "vitest";
import { DefaultAppSettings } from "../../src/settings";

// A minimal stand-in for the AnotherSimpleTodoistSync plugin instance. The parser,
// cache, API and import modal all reach into `plugin.settings.*` and the four
// module references below — never into the Obsidian lifecycle — so this is enough
// for unit tests. Cast with `as any` at the call site.
//
// Notes:
// - Spreads DefaultAppSettings so real defaults apply (alternativeKeywords: true,
//   customSyncTag: "#tdsync", debugMode: false, ...). Override per-test, e.g.
//   createMockPlugin({ alternativeKeywords: false }) for emoji-only parsing.
// - todoistTasksData uses snake_case `user_data` (matching the interface) and
//   includes `sections.results`, which DefaultAppSettings omits but
//   CacheOperation.checkIfSectionExistOnCache requires.
export function createMockPlugin(overrides: Record<string, unknown> = {}) {
	return {
		settings: {
			...DefaultAppSettings,
			todoistAPIToken: "test-token",
			defaultProjectId: "proj-123",
			defaultProjectName: "Inbox",
			todoistTasksData: {
				projects: { results: [{ id: "proj-123", name: "Inbox" }] },
				tasks: [],
				events: [],
				sections: { results: [] },
				user_data: {
					email: "test@example.com",
					full_name: "Test",
					lang: "en",
					tz_info: { timezone: "UTC", gmt_string: "+00:00" },
				},
			},
			fileMetadata: {},
			...overrides,
		},
		saveData: vi.fn().mockResolvedValue(undefined),
		saveSettings: vi.fn().mockResolvedValue(undefined),
		cacheOperation: null,
		todoistNewAPI: null,
		taskParser: null,
		fileOperation: null,
		todoistSync: null,
	};
}

export function createMockApp() {
	return {
		vault: {
			getName: vi.fn().mockReturnValue("TestVault"),
			getAbstractFileByPath: vi.fn().mockReturnValue(null),
			getFiles: vi.fn().mockReturnValue([]),
			read: vi.fn().mockResolvedValue(""),
			modify: vi.fn().mockResolvedValue(undefined),
		},
		workspace: {
			activeEditor: null,
			getActiveViewOfType: vi.fn().mockReturnValue(null),
		},
		metadataCache: {
			getFileCache: vi.fn().mockReturnValue(null),
		},
		fileManager: {
			processFrontMatter: vi.fn().mockResolvedValue(undefined),
		},
	};
}
