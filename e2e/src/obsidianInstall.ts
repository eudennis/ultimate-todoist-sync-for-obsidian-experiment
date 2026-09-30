import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { CACHE_DIR, PLUGIN_MANIFEST, REAL_OBSIDIAN_CONFIG } from "./env";

// Obsidian ships as a small Electron "installer" plus an app package
// (obsidian-X.Y.Z.asar). The installer loads the newest asar it finds in its
// config dir, so the version under test is decided by which asar we put into
// the isolated config dir — not by the installed .deb/AppImage version.

export interface ObsidianInstall {
	binary: string;
	asar: string;
	version: string;
}

function compareVersions(a: string, b: string) {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d !== 0) return d;
	}
	return 0;
}

function asarVersion(file: string) {
	return /obsidian-(\d+\.\d+\.\d+)\.asar$/.exec(path.basename(file))?.[1];
}

function newestAsarIn(dir: string): string | undefined {
	if (!fs.existsSync(dir)) return undefined;
	return fs
		.readdirSync(dir)
		.filter((f) => asarVersion(f))
		.sort((a, b) => compareVersions(asarVersion(b)!, asarVersion(a)!))
		.map((f) => path.join(dir, f))[0];
}

async function downloadAsar(version: string): Promise<string> {
	const target = path.join(CACHE_DIR, `obsidian-${version}.asar`);
	if (fs.existsSync(target)) return target;
	const url = `https://github.com/obsidianmd/obsidian-releases/releases/download/v${version}/obsidian-${version}.asar.gz`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Could not download Obsidian ${version} app package from ${url}: HTTP ${res.status}`);
	fs.mkdirSync(CACHE_DIR, { recursive: true });
	fs.writeFileSync(`${target}.tmp`, zlib.gunzipSync(Buffer.from(await res.arrayBuffer())));
	fs.renameSync(`${target}.tmp`, target);
	return target;
}

function resolveBinary(): string {
	const fromEnv = process.env.E2E_OBSIDIAN_BIN;
	if (fromEnv) {
		if (!fs.existsSync(fromEnv)) throw new Error(`E2E_OBSIDIAN_BIN=${fromEnv} does not exist`);
		return fromEnv;
	}
	for (const candidate of ["/opt/Obsidian/obsidian", "/usr/lib/obsidian/obsidian"]) {
		if (fs.existsSync(candidate)) return candidate;
	}
	try {
		// Resolve the path only — never execute the binary outside the isolated launcher.
		return fs.realpathSync(execFileSync("which", ["obsidian"], { encoding: "utf8" }).trim());
	} catch {
		throw new Error("Obsidian not found. Install the .deb (see e2e/README.md) or set E2E_OBSIDIAN_BIN.");
	}
}

/**
 * Picks the Obsidian app package, in priority order:
 *   1. E2E_OBSIDIAN_ASAR — an explicit file
 *   2. E2E_OBSIDIAN_VERSION — downloaded from GitHub releases into e2e/.cache
 *   3. newest asar already in e2e/.cache
 *   4. newest asar in the real ~/.config/obsidian (copied, read-only)
 */
export async function resolveObsidian(): Promise<ObsidianInstall> {
	const binary = resolveBinary();
	let asar: string | undefined = process.env.E2E_OBSIDIAN_ASAR;
	if (!asar && process.env.E2E_OBSIDIAN_VERSION) asar = await downloadAsar(process.env.E2E_OBSIDIAN_VERSION);
	asar ??= newestAsarIn(CACHE_DIR) ?? newestAsarIn(REAL_OBSIDIAN_CONFIG);
	if (!asar || !fs.existsSync(asar)) {
		throw new Error(
			`No Obsidian app package (obsidian-X.Y.Z.asar) found. Set E2E_OBSIDIAN_VERSION=${PLUGIN_MANIFEST.minAppVersion} (or newer) to download one.`,
		);
	}
	const version = asarVersion(asar);
	if (!version) throw new Error(`Cannot read the Obsidian version from ${asar} (expected obsidian-X.Y.Z.asar)`);
	if (compareVersions(version, PLUGIN_MANIFEST.minAppVersion) < 0) {
		throw new Error(`Obsidian ${version} is older than the plugin's minAppVersion ${PLUGIN_MANIFEST.minAppVersion}`);
	}
	return { binary, asar, version };
}
