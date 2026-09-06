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

			// Deferred: these stem from the Todoist SDK's loosely-typed response
			// objects propagating `any` throughout the codebase. Fixing them means
			// adding proper types across most SDK call sites, a larger effort than
			// the scorecard-driven cleanup this config was introduced for. Revisit
			// as a follow-up.
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-base-to-string": "off",
			"@typescript-eslint/no-deprecated": "off",
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
			// Deferred: bumping minAppVersion or gating newer API usage is a
			// product decision, not part of this cleanup.
			"obsidianmd/no-unsupported-api": "off",
			// Deferred: console.log cleanup, unrelated to the scorecard findings.
			"obsidianmd/rule-custom-message": "off",
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
		},
	},
]);
