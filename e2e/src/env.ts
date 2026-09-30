import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Loads e2e/.env (gitignored) once, without overriding variables already set
// in the environment (CI secrets win over a stray local file).
export const E2E_ROOT = path.resolve(__dirname, "..");
export const REPO_ROOT = path.resolve(E2E_ROOT, "..");

const envFile = path.join(E2E_ROOT, ".env");
if (fs.existsSync(envFile)) {
	for (const raw of fs.readFileSync(envFile, "utf8").split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
		if (process.env[key] === undefined) process.env[key] = value;
	}
}

export const PLUGIN_ID = "another-simple-todoist-sync";
export const PLUGIN_MANIFEST = JSON.parse(
	fs.readFileSync(path.join(REPO_ROOT, "manifest.json"), "utf8"),
) as { id: string; version: string; minAppVersion: string };

// Every Todoist resource the harness (or the plugin, on the harness's behalf)
// creates carries this prefix, so the sweeper can find leftovers from crashed runs.
export const RESOURCE_PREFIX = "e2e";

// The user's real Obsidian config dir. The harness must never launch Obsidian
// against it — see assertIsolated().
export const REAL_OBSIDIAN_CONFIG = path.join(
	process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
	"obsidian",
);

export const WORK_ROOT = path.resolve(process.env.E2E_WORK_DIR ?? path.join(E2E_ROOT, ".work"));
export const CACHE_DIR = path.join(E2E_ROOT, ".cache");

export function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable ${name}. See e2e/README.md → "Environment variables".`);
	}
	return value;
}

export function todoistToken(): string {
	return requireEnv("TODOIST_E2E_TOKEN");
}

/**
 * Removes the account's API token and any email address from text bound for a
 * report. Reports end up in CI artifacts, which anyone with read access to the
 * repository can download. Todoist's /user response, for one, includes both.
 */
export function redactSecrets(text: string): string {
	const token = process.env.TODOIST_E2E_TOKEN;
	const redacted = token ? text.split(token).join("<redacted-token>") : text;
	return redacted.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<redacted-email>");
}

/** Throws unless `target` is inside the harness work dir and nowhere near the real Obsidian config. */
export function assertIsolated(target: string, what: string) {
	const resolved = path.resolve(target);
	const realConfig = path.resolve(REAL_OBSIDIAN_CONFIG);
	if (resolved === realConfig || resolved.startsWith(realConfig + path.sep) || realConfig.startsWith(resolved + path.sep)) {
		throw new Error(`Refusing to use ${what} ${resolved}: it overlaps the real Obsidian config dir ${realConfig}`);
	}
	if (!resolved.startsWith(WORK_ROOT + path.sep)) {
		throw new Error(`Refusing to use ${what} ${resolved}: it is outside the harness work dir ${WORK_ROOT}`);
	}
}
