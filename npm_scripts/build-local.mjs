import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";

const PLUGIN_ID = "another-simple-todoist-sync";
const LOCAL_DIR = `LocalBuild/${PLUGIN_ID}`;

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

console.log(`Built ${newVersion} → ${LOCAL_DIR}/`);
