import type { ObsidianSession } from "./obsidian";
import type { TodoistDue } from "./todoist";

// ------------------------------------------------------------------ evidence

/**
 * The last value each waitFor() observed. When a test fails, the fixture
 * attaches this as evidence.json — i.e. the Todoist response or note content
 * that did not satisfy the assertion.
 */
export const evidence = new Map<string, unknown>();

export async function waitFor<T>(
	label: string,
	probe: () => Promise<T> | T,
	accept: (value: T) => boolean,
	{ timeout = 60_000, interval = 2_000 } = {},
): Promise<T> {
	const deadline = Date.now() + timeout;
	let last: T | undefined;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			last = await probe();
			evidence.set(label, last);
			if (accept(last)) return last;
		} catch (e) {
			lastError = e;
			evidence.set(label, { error: String(e) });
		}
		await new Promise((r) => setTimeout(r, interval));
	}
	throw new Error(
		`Timed out after ${timeout / 1000}s waiting for: ${label}\nLast observed: ${JSON.stringify(last, null, 2)?.slice(0, 3000)}` +
			(lastError ? `\nLast error: ${String(lastError)}` : ""),
	);
}

/**
 * Todoist→Obsidian changes only arrive when the plugin syncs. Runs the real
 * "Trigger the manual sync" command, gives it `every` ms to land, and repeats
 * until `accept` passes (the activity log can lag a few seconds behind writes).
 */
export async function syncUntil<T>(
	obsidian: ObsidianSession,
	label: string,
	probe: () => Promise<T> | T,
	accept: (value: T) => boolean,
	{ timeout = 120_000, every = 15_000 } = {},
): Promise<T> {
	const deadline = Date.now() + timeout;
	for (;;) {
		await obsidian.triggerManualSync();
		try {
			return await waitFor(label, probe, accept, { timeout: Math.min(every, Math.max(deadline - Date.now(), 1)), interval: 1_000 });
		} catch (e) {
			if (Date.now() >= deadline) throw e;
		}
	}
}

// ------------------------------------------------------------------ task lines

export const TID_RE = /%%\[tid:: \[([a-zA-Z0-9]+)\]\(([^)]+)\)\]%%/;

export function lineContaining(text: string, needle: string): string | undefined {
	return text.split("\n").find((l) => l.includes(needle));
}

/** Waits until the note on disk has a tid link on the line containing `needle`; returns the Todoist id. */
export async function waitForTaskId(obsidian: ObsidianSession, note: string, needle: string, timeout = 60_000): Promise<string> {
	const line = await waitFor(
		`tid link written to "${needle}" in ${note}`,
		() => lineContaining(obsidian.readNote(note), needle) ?? "",
		(l) => TID_RE.test(l),
		{ timeout, interval: 1_000 },
	);
	return TID_RE.exec(line)![1];
}

/** Local calendar date `days` from today, YYYY-MM-DD. */
export function isoDate(days: number): string {
	const d = new Date();
	d.setDate(d.getDate() + days);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * What a user would see as the due wall-clock time, "YYYY-MM-DD HH:MM".
 * Floating datetimes ("2026-05-31T18:00:00") are taken as-is; UTC ones ("…Z")
 * are shown in the task's timezone, or this machine's (= Obsidian's) timezone.
 */
export function dueWallClock(due: TodoistDue | null | undefined): string | undefined {
	if (!due?.date?.includes("T")) return undefined;
	if (!due.date.endsWith("Z")) return due.date.slice(0, 16).replace("T", " ");
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: due.timezone ?? undefined,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(new Date(due.date));
	const get = (t: string) => parts.find((p) => p.type === t)?.value;
	return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
