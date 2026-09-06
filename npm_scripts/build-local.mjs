import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { execFileSync } from "child_process";

const PLUGIN_ID = "another-simple-todoist-sync";
const LOCAL_DIR = `LocalBuild/${PLUGIN_ID}`;

mkdirSync(LOCAL_DIR, { recursive: true });

// Read source manifest for base version and all fields
const sourceManifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const baseVersion = sourceManifest.version.split(".").slice(0, 3).join(".");

// Determine next build number from existing LocalBuild manifest
let buildNumber = 1;
const localManifestPath = `${LOCAL_DIR}/manifest.json`;
if (existsSync(localManifestPath)) {
	const localManifest = JSON.parse(readFileSync(localManifestPath, "utf8"));
	const parts = localManifest.version.split(".");
	if (parts.length === 4) {
		buildNumber = Number(parts[3]) + 1;
	}
}

const newVersion = `${baseVersion}.${buildNumber}`;

// Write updated manifest to LocalBuild
const localManifest = { ...sourceManifest, version: newVersion };
writeFileSync(localManifestPath, JSON.stringify(localManifest, null, "\t"));

// Copy build artifacts
copyFileSync("main.js", `${LOCAL_DIR}/main.js`);
if (existsSync("styles.css")) {
	copyFileSync("styles.css", `${LOCAL_DIR}/styles.css`);
}

// Repackage the zip so it always matches manifest.json, main.js, and styles.css above
const zipName = `${PLUGIN_ID}.zip`;
const zipPath = `${LOCAL_DIR}/${zipName}`;
rmSync(zipPath, { force: true });
const zipFiles = ["manifest.json", "main.js"];
if (existsSync(`${LOCAL_DIR}/styles.css`)) {
	zipFiles.push("styles.css");
}
try {
	execFileSync("zip", ["-q", zipName, ...zipFiles], { cwd: LOCAL_DIR });
} catch (error) {
	console.error(`Failed to create ${zipPath}: ${error.message}`);
	throw error;
}

console.log(`Built ${newVersion} → ${LOCAL_DIR}/ (incl. ${zipName})`);
