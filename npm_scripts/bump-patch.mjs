import { readFileSync, writeFileSync } from "fs";

const manifestPath = "manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

// Strip any 4th build component, then bump patch
const parts = manifest.version.split(".").slice(0, 3).map(Number);
parts[2] += 1;
manifest.version = parts.join(".");

writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t"));
console.log(`Version bumped to ${manifest.version}`);
