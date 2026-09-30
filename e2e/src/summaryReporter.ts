import fs from "node:fs";
import path from "node:path";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { E2E_ROOT, PLUGIN_MANIFEST } from "./env";

// Writes, per run:
//   results/<run>/summary.md   — versions, totals, one row per test, links to failure artifacts
//   results/history.csv        — one line per run (override with E2E_HISTORY_FILE)
//   $GITHUB_STEP_SUMMARY       — the same summary, when running in GitHub Actions
// and points results/latest at the run folder.

type Outcome = "PASS" | "FAIL" | "TIMEOUT" | "SKIP" | "KNOWN GAP" | "UNEXPECTED PASS" | "FLAKY";

interface Row {
	suite: string;
	title: string;
	outcome: Outcome;
	durationMs: number;
	error?: string;
	links: string[];
	note?: string;
}

const ICON: Record<Outcome, string> = {
	PASS: "✅",
	FAIL: "❌",
	TIMEOUT: "⏱️",
	SKIP: "⏭️",
	"KNOWN GAP": "🟡",
	"UNEXPECTED PASS": "❗",
	FLAKY: "⚠️",
};

export default class SummaryReporter implements Reporter {
	private readonly attempts = new Map<string, { test: TestCase; results: TestResult[] }>();
	private started = Date.now();

	onBegin() {
		this.started = Date.now();
	}

	onTestEnd(test: TestCase, result: TestResult) {
		const entry = this.attempts.get(test.id) ?? { test, results: [] };
		entry.results.push(result);
		this.attempts.set(test.id, entry);
	}

	onEnd(full: FullResult) {
		// `--list`, or a run aborted before any test: nothing to report, and
		// writing a history row would record a meaningless "pass".
		if (this.attempts.size === 0) return;
		const runDir = process.env.E2E_RUN_DIR!;
		fs.mkdirSync(runDir, { recursive: true });
		const runInfo = readJson(path.join(runDir, "run-info.json"));
		const obsidianVersion = (runInfo.obsidianVersion as string) ?? process.env.E2E_OBSIDIAN_RESOLVED_VERSION ?? "unknown";

		const rows = [...this.attempts.values()].map(({ test, results }) => toRow(test, results, runDir));
		const count = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
		const failed = count("FAIL") + count("TIMEOUT") + count("UNEXPECTED PASS");
		const totals = {
			total: rows.length,
			passed: count("PASS"),
			failed,
			knownGaps: count("KNOWN GAP"),
			skipped: count("SKIP"),
			flaky: count("FLAKY"),
		};
		const verdict = failed === 0 && full.status === "passed" ? "✅ PASS — OK to release" : "❌ FAIL — DO NOT RELEASE";

		const md: string[] = [
			`# E2E results — Another Simple Todoist Sync v${PLUGIN_MANIFEST.version}`,
			"",
			`**${verdict}**`,
			"",
			"| | |",
			"|---|---|",
			`| Plugin version | ${PLUGIN_MANIFEST.version} |`,
			`| Obsidian version | ${obsidianVersion} |`,
			`| Git commit | ${process.env.E2E_GIT_SHA || "unknown"} |`,
			`| Run | ${process.env.E2E_RUN_ID} |`,
			`| Duration | ${Math.round((Date.now() - this.started) / 1000)}s |`,
			`| Todoist activity log | ${runInfo.activityLog === "ok" ? "available" : `**unavailable** (${String(runInfo.activityLog ?? "not checked")})`} |`,
			`| Todoist plan | ${runInfo.accountPremium ? "Pro" : "free"} · premium tests ${runInfo.premiumTests ? "on" : "off (E2E_PREMIUM unset)"} |`,
			"",
			`**Total ${totals.total}** · ✅ passed ${totals.passed} · ❌ failed ${totals.failed} · 🟡 known gaps (expected failures) ${totals.knownGaps} · ⚠️ flaky ${totals.flaky} · ⏭️ skipped ${totals.skipped}`,
			"",
			"| Suite | Test | Status | Duration | Details / artifacts |",
			"|---|---|---|---|---|",
			...rows.map(
				(r) =>
					`| ${esc(r.suite)} | ${esc(r.title)} | ${ICON[r.outcome]} ${r.outcome} | ${(r.durationMs / 1000).toFixed(1)}s | ${[
						r.note ? esc(r.note) : "",
						r.error ? `\`${esc(r.error)}\`` : "",
						r.links.join(" · "),
					]
						.filter(Boolean)
						.join("<br>")} |`,
			),
			"",
			"Legend: 🟡 KNOWN GAP = matrix item the plugin does not implement yet (test.fail). ❗ UNEXPECTED PASS = a known gap now works — remove its test.fail marker.",
			"",
		];
		const summary = md.join("\n");
		fs.writeFileSync(path.join(runDir, "summary.md"), summary);

		if (process.env.GITHUB_STEP_SUMMARY) {
			// Artifact links are relative to the run folder, meaningless on the Actions page.
			fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")}\n`);
		}

		const historyFile = process.env.E2E_HISTORY_FILE ?? path.join(E2E_ROOT, "results", "history.csv");
		fs.mkdirSync(path.dirname(historyFile), { recursive: true });
		if (!fs.existsSync(historyFile)) {
			fs.writeFileSync(historyFile, "date,plugin_version,obsidian_version,git_sha,grep,total,passed,failed,known_gaps,flaky,skipped,duration_s,run_id\n");
		}
		const grep = process.argv.includes("--grep") ? process.argv[process.argv.indexOf("--grep") + 1] : "all";
		fs.appendFileSync(
			historyFile,
			`${[
				new Date().toISOString(),
				PLUGIN_MANIFEST.version,
				obsidianVersion,
				process.env.E2E_GIT_SHA ?? "",
				grep,
				totals.total,
				totals.passed,
				totals.failed,
				totals.knownGaps,
				totals.flaky,
				totals.skipped,
				Math.round((Date.now() - this.started) / 1000),
				process.env.E2E_RUN_ID,
			]
				.map(csv)
				.join(",")}\n`,
		);

		const latest = path.join(path.dirname(runDir), "latest");
		try {
			fs.rmSync(latest, { force: true, recursive: true });
			fs.symlinkSync(path.basename(runDir), latest);
		} catch {
			/* symlinks unsupported — not essential */
		}
		console.log(`\n[e2e] ${verdict}\n[e2e] Summary: ${path.join(runDir, "summary.md")}\n[e2e] HTML report: ${path.join(runDir, "html", "index.html")}`);
	}

	printsToStdio() {
		return false;
	}
}

function toRow(test: TestCase, results: TestResult[], runDir: string): Row {
	const last = results[results.length - 1];
	const titlePath = test.titlePath().filter(Boolean); // [project?, file, describe…, title]
	const suite = titlePath.length >= 3 ? titlePath[titlePath.length - 2] : path.basename(test.location.file);
	const expectedFail = test.expectedStatus === "failed";
	let outcome: Outcome;
	if (last.status === "skipped") outcome = "SKIP";
	else if (expectedFail) outcome = last.status === "passed" ? "UNEXPECTED PASS" : "KNOWN GAP";
	else if (last.status === "passed") outcome = results.length > 1 ? "FLAKY" : "PASS";
	else if (last.status === "timedOut") outcome = "TIMEOUT";
	else outcome = "FAIL";

	const unexpected = outcome === "FAIL" || outcome === "TIMEOUT" || outcome === "FLAKY";
	const failedAttempt = [...results].reverse().find((r) => r.status !== "passed" && r.status !== "skipped");
	const links = unexpected && failedAttempt
		? failedAttempt.attachments
				.filter((a) => a.path)
				.map((a) => `[${a.name}](${path.relative(runDir, a.path!).split(path.sep).join("/")})`)
		: [];
	// test.fail()/fixme() called inside the test body land on the result, static ones on the test.
	const annotations = [...test.annotations, ...(last.annotations ?? [])];
	const reason = annotations.find((a) => a.type === "fail" || a.type === "fixme" || a.type === "skip")?.description;
	const observed = annotations.filter((a) => a.type === "observed").map((a) => `observed: ${a.description}`);
	return {
		suite,
		title: test.title,
		outcome,
		durationMs: results.reduce((sum, r) => sum + r.duration, 0),
		error: unexpected ? firstLine(failedAttempt?.error?.message) : undefined,
		links,
		note: [reason, ...observed].filter(Boolean).join("; ") || undefined,
	};
}

function firstLine(message?: string) {
	if (!message) return undefined;
	// eslint-disable-next-line no-control-regex
	const clean = message.replace(/\u001b\[[0-9;]*m/g, "").split("\n").find((l) => l.trim()) ?? "";
	return clean.length > 200 ? `${clean.slice(0, 200)}…` : clean;
}

function esc(s: string) {
	return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function csv(v: unknown) {
	const s = String(v ?? "");
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function readJson(file: string): Record<string, unknown> {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		return {};
	}
}
