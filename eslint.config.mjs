import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
	{
		ignores: ["node_modules/", "main.js"],
	},
	js.configs.recommended,
	{
		files: ["**/*.ts"],
		plugins: {
			"@typescript-eslint": tsPlugin,
		},
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				sourceType: "module",
			},
			globals: {
				require: "readonly",
				module: "readonly",
				exports: "readonly",
				process: "readonly",
				__dirname: "readonly",
				__filename: "readonly",
				console: "readonly",
				setTimeout: "readonly",
				clearTimeout: "readonly",
				setInterval: "readonly",
				clearInterval: "readonly",
			},
		},
		rules: {
			...tsPlugin.configs["flat/eslint-recommended"].rules,
			...tsPlugin.configs["flat/recommended"].rules,
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
			"@typescript-eslint/ban-ts-comment": "off",
			"no-prototype-builtins": "off",
			"@typescript-eslint/no-empty-function": "off",
		},
	},
];
