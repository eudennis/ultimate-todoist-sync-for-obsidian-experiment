import { defineConfig } from "vitest/config";

// The `obsidian` and `@doist/todoist-sdk` packages have no usable runtime in a
// plain Node process, so we alias them to hand-written mocks under tests/__mocks__.
// `main` is aliased too, but in practice every `from "main"` import in src/ is a
// type-only import (erased by esbuild), so no test ever loads main.ts at runtime.
export default defineConfig({
	resolve: {
		alias: {
			obsidian: new URL("./tests/__mocks__/obsidian.ts", import.meta.url)
				.pathname,
			"@doist/todoist-sdk": new URL(
				"./tests/__mocks__/todoist-sdk.ts",
				import.meta.url,
			).pathname,
			main: new URL("./main.ts", import.meta.url).pathname,
		},
	},
	test: {
		globals: true,
		environment: "node",
		clearMocks: true,
		setupFiles: ["./tests/setup.ts"],
		include: ["tests/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: [
				"src/taskParser.ts",
				"src/importTaskModal.ts",
				"src/cacheOperation.ts",
				"src/todoistAPI.ts",
			],
			reporter: ["text", "lcov"],
		},
	},
});
