import tsParser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";
import { defineConfig } from "eslint/config";
import { DEFAULT_BRANDS } from "eslint-plugin-obsidianmd/dist/lib/rules/ui/brands.js";
import { DEFAULT_ACRONYMS } from "eslint-plugin-obsidianmd/dist/lib/rules/ui/acronyms.js";

export default defineConfig([
	{
		// npm_scripts/ are Node build tooling, not shipped plugin code, so
		// Node-builtin/globals rules meant for the plugin runtime don't apply.
		ignores: ["node_modules/", "main.js", "LocalBuild/", "coverage/", "tests/", "npm_scripts/", "vitest.config.ts"],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				project: "./tsconfig.json",
			},
		},
		rules: {
			// Popout-window compatibility rule; the recommended config ships this
			// "off" by default, but the plugin does target popout-window support.
			"obsidianmd/prefer-active-doc": "warn",
			"no-prototype-builtins": "off",
			"@typescript-eslint/no-empty-function": "off",

			// "Todoist" and the two multi-word product/plugin names below aren't
			// in the rule's default brand list, so extend it (rather than
			// replace it — passing `brands`/`acronyms` overrides the rule's
			// defaults outright) to keep recognizing "Obsidian", "API", etc.
			// ignoreRegex skips strings containing a literal URL/URI scheme
			// example, which aren't prose and shouldn't get "sentence cased"
			// into a domain name or scheme with the wrong casing.
			"obsidianmd/ui/sentence-case": [
				"warn",
				{
					brands: [...DEFAULT_BRANDS, "Another Simple Todoist Sync", "Obsidian Tasks", "Todoist"],
					acronyms: [...DEFAULT_ACRONYMS, "URI"],
					ignoreRegex: ["https?://", "todoist://"],
				},
			],
		},
	},
]);
