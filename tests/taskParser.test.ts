import { TFile } from "obsidian";
import { describe, expect, it } from "vitest";
import { TaskParser } from "../src/taskParser";
import { lines } from "./fixtures/markdownLines";
import { createMockApp, createMockPlugin } from "./helpers/mockPlugin";

// Helper: build a parser, optionally overriding plugin settings (e.g. to toggle
// alternativeKeywords or customSyncTag).
function makeParser(settingsOverrides: Record<string, unknown> = {}) {
	return new TaskParser(
		createMockApp() as never,
		createMockPlugin(settingsOverrides) as never,
	);
}

// Real TFile has an implicit 0-arg constructor (tsconfig.test.json type-checks
// against the real obsidian types, not the mock's `constructor(path)`), so build
// an instance via the prototype instead of `new TFile(path)`.
function mockTFile(path: string): TFile {
	const file = Object.create(TFile.prototype) as TFile;
	file.path = path;
	file.name = path.split("/").pop() ?? path;
	return file;
}

describe("TaskParser", () => {
	describe("isMarkdownTask", () => {
		it("recognises an unchecked task", () => {
			expect(makeParser().isMarkdownTask(lines.basic)).toBe(true);
		});
		it("recognises a checked task", () => {
			expect(makeParser().isMarkdownTask(lines.completed)).toBe(true);
		});
		it("recognises an indented task", () => {
			expect(makeParser().isMarkdownTask(lines.indentedOnce)).toBe(true);
		});
		it("rejects a heading", () => {
			expect(makeParser().isMarkdownTask(lines.heading)).toBe(false);
		});
		it("rejects plain prose", () => {
			expect(makeParser().isMarkdownTask(lines.notATask)).toBe(false);
		});
	});

	describe("hasTodoistTag", () => {
		it("is true when the default #tdsync tag is present", () => {
			expect(makeParser().hasTodoistTag(lines.basic)).toBe(true);
		});
		it("is false when no sync tag is present", () => {
			expect(makeParser().hasTodoistTag("- [ ] No tag here")).toBe(false);
		});
		it("honours a custom sync tag from settings", () => {
			const parser = makeParser({ customSyncTag: "#todoist" });
			expect(parser.hasTodoistTag("- [ ] task #todoist")).toBe(true);
			expect(parser.hasTodoistTag("- [ ] task #tdsync")).toBe(false);
		});
	});

	describe("hasCalendarEmoji", () => {
		it("is false when no date emoji/keyword is present", () => {
			expect(makeParser().hasCalendarEmoji(lines.basic)).toBe(false);
		});
		it("is true when a date emoji is present", () => {
			expect(makeParser().hasCalendarEmoji(lines.withDueDate)).toBe(true);
		});
	});

	describe("hasDueDate / getDueDateFromLineText", () => {
		it("detects an emoji due date", () => {
			expect(makeParser().hasDueDate(lines.withDueDate)).toBe(true);
		});
		it("extracts the date without the emoji", () => {
			expect(makeParser().getDueDateFromLineText(lines.withDueDate)).toBe(
				"2025-06-15",
			);
		});
		it("returns null when there is no due date", () => {
			expect(makeParser().getDueDateFromLineText(lines.basic)).toBeNull();
		});
		it("accepts @ as a date keyword when alternative keywords are on (default)", () => {
			expect(makeParser().hasDueDate(lines.withAlternativeDate)).toBe(true);
		});
		it("rejects @ as a date keyword when alternative keywords are off", () => {
			const parser = makeParser({ alternativeKeywords: false });
			expect(parser.hasDueDate(lines.withAlternativeDate)).toBe(false);
		});
	});

	describe("hasDueTime / getDueTimeFromLineText", () => {
		it("detects an emoji due time", () => {
			expect(makeParser().hasDueTime(lines.withDateTime)).toBe(true);
		});
		it("extracts HH:MM", () => {
			expect(makeParser().getDueTimeFromLineText(lines.withDateTime)).toBe(
				"14:00",
			);
		});
		it("returns empty string when no time is present", () => {
			expect(makeParser().getDueTimeFromLineText(lines.basic)).toBe("");
		});
		it("returns empty string for an out-of-range time", () => {
			expect(makeParser().getDueTimeFromLineText("- [ ] task ⏰25:00")).toBe("");
		});
	});

	describe("hasDuration / getTaskDurationFromLineText", () => {
		it("detects a duration", () => {
			expect(makeParser().hasDuration(lines.withDuration)).toBe(true);
		});
		it("extracts the number of minutes", () => {
			expect(makeParser().getTaskDurationFromLineText(lines.withDuration)).toBe(
				90,
			);
		});
		it("ignores durations greater than 1440 minutes", () => {
			expect(
				makeParser().getTaskDurationFromLineText("- [ ] task ⏳2000min"),
			).toBeNull();
		});
	});

	describe("getTaskPriority (inverts !!1 → API 4)", () => {
		it("maps !!1 to 4", () => {
			expect(makeParser().getTaskPriority(lines.withPriority1)).toBe(4);
		});
		it("maps !!2 to 3", () => {
			expect(makeParser().getTaskPriority(lines.withPriority2)).toBe(3);
		});
		it("maps !!3 to 2", () => {
			expect(makeParser().getTaskPriority(lines.withPriority3)).toBe(2);
		});
		it("maps !!4 to 1", () => {
			expect(makeParser().getTaskPriority(lines.withPriority4)).toBe(1);
		});
		it("defaults to 1 when no priority is given", () => {
			expect(makeParser().getTaskPriority(lines.basic)).toBe(1);
		});
		it("recognises a priority at the end of the line (issue #54)", () => {
			expect(makeParser().getTaskPriority(lines.withPriorityAtEnd)).toBe(4);
		});
	});

	describe("getTaskContentFromLineText", () => {
		it("strips the checkbox and sync tag", () => {
			expect(makeParser().getTaskContentFromLineText(lines.basic)).toBe(
				"Buy groceries",
			);
		});
		it("strips a due date", () => {
			expect(makeParser().getTaskContentFromLineText(lines.withDueDate)).toBe(
				"Submit report",
			);
		});
		it("strips priority and tags together", () => {
			expect(makeParser().getTaskContentFromLineText(lines.withPriority1)).toBe(
				"Fix production bug",
			);
		});
		it("strips multiple tags", () => {
			expect(makeParser().getTaskContentFromLineText(lines.withTags)).toBe(
				"Task with tags",
			);
		});
		it("strips a trailing completion date (issue #44)", () => {
			expect(
				makeParser().getTaskContentFromLineText(
					"- [x] Buy groceries #tdsync ✅ 2026-01-28",
				),
			).toBe("Buy groceries");
		});
	});

	describe("getAllTagsFromLineText", () => {
		it("returns the single sync tag for a basic task", () => {
			expect(makeParser().getAllTagsFromLineText(lines.basic)).toEqual([
				"tdsync",
			]);
		});
		it("returns every tag without the leading #", () => {
			expect(makeParser().getAllTagsFromLineText(lines.withTags)).toEqual([
				"work",
				"meeting",
				"tdsync",
			]);
		});
		it("keeps sub-project tags intact", () => {
			expect(makeParser().getAllTagsFromLineText(lines.withSubProjectTag)).toEqual(
				["Work/ProjectX", "tdsync"],
			);
		});
		it("returns an empty array for prose", () => {
			expect(makeParser().getAllTagsFromLineText(lines.notATask)).toEqual([]);
		});
	});

	describe("getDeadlineDateFromLineText", () => {
		it("parses a full YYYY-MM-DD deadline", () => {
			expect(
				makeParser().getDeadlineDateFromLineText(lines.withDeadlineFullDate),
			).toBe("2025-12-31");
		});
		it("expands a YY-MM-DD deadline to 20YY", () => {
			expect(
				makeParser().getDeadlineDateFromLineText(lines.withDeadlineShortYear),
			).toBe("2025-12-31");
		});
		it("defaults a MM-DD deadline to the current year", () => {
			const year = new Date().getFullYear();
			expect(
				makeParser().getDeadlineDateFromLineText(lines.withDeadlineShortDate),
			).toBe(`${year}-12-31`);
		});
		it("returns null when there is no deadline", () => {
			expect(makeParser().getDeadlineDateFromLineText(lines.basic)).toBeNull();
		});
	});

	describe("convertDueDateToProperFormat", () => {
		it("passes through a well-formed date", () => {
			expect(makeParser().convertDueDateToProperFormat("2025-06-15")).toBe(
				"2025-06-15",
			);
		});
		it("zero-pads single-digit month and day", () => {
			expect(makeParser().convertDueDateToProperFormat("2025-6-5")).toBe(
				"2025-06-05",
			);
		});
		it("expands a two-digit year", () => {
			expect(makeParser().convertDueDateToProperFormat("25-6-5")).toBe(
				"2025-06-05",
			);
		});
		it("returns empty string for an unparseable value", () => {
			expect(makeParser().convertDueDateToProperFormat("not-a-date")).toBe("");
		});
	});

	describe("hasTodoistId / getTodoistIdFromLineText", () => {
		it("detects an https task id", () => {
			expect(makeParser().hasTodoistId(lines.withTodoistId)).toBe(true);
		});
		it("detects a todoist:// app-uri task id", () => {
			expect(makeParser().hasTodoistId(lines.withTodoistAppUri)).toBe(true);
		});
		it("returns false for an id containing a hyphen (regex is [a-zA-Z0-9]+)", () => {
			expect(makeParser().hasTodoistId(lines.withHyphenTodoistId)).toBe(false);
		});
		it("returns null for an empty string", () => {
			expect(makeParser().hasTodoistId("")).toBeNull();
		});
		it("extracts the id from the tid field", () => {
			expect(makeParser().getTodoistIdFromLineText(lines.withTodoistId)).toBe(
				"6cfCcrHfXrFP6q3R",
			);
		});
		it("extracts a hyphenated id too (looser .*? capture)", () => {
			expect(
				makeParser().getTodoistIdFromLineText(lines.withHyphenTodoistId),
			).toBe("task-abc123");
		});
		it("returns null when there is no tid field", () => {
			expect(makeParser().getTodoistIdFromLineText(lines.basic)).toBeNull();
		});
	});

	describe("indentation helpers", () => {
		it("getTabIndentation counts leading tabs", () => {
			const parser = makeParser();
			expect(parser.getTabIndentation(lines.basic)).toBe(0);
			expect(parser.getTabIndentation(lines.indentedOnce)).toBe(1);
			expect(parser.getTabIndentation(lines.indentedTwice)).toBe(2);
		});
		it("isIndentedTask is true only for indented tasks", () => {
			const parser = makeParser();
			expect(parser.isIndentedTask(lines.indentedOnce)).toBe(true);
			expect(parser.isIndentedTask(lines.basic)).toBe(false);
		});
	});

	describe("isLineBlank", () => {
		it("is true for whitespace-only and empty lines", () => {
			const parser = makeParser();
			expect(parser.isLineBlank(lines.blank)).toBe(true);
			expect(parser.isLineBlank(lines.emptyString)).toBe(true);
		});
		it("is false for a non-blank line", () => {
			expect(makeParser().isLineBlank(lines.basic)).toBe(false);
		});
	});

	describe("comparison helpers", () => {
		it("taskContentCompare ignores whitespace differences", () => {
			const parser = makeParser();
			expect(
				parser.taskContentCompare({ content: "Buy milk" }, { content: "Buymilk" }),
			).toBe(true);
			expect(
				parser.taskContentCompare({ content: "Buy milk" }, { content: "Buy eggs" }),
			).toBe(false);
		});
		it("treats a completion-date marker as unchanged content (issue #44)", () => {
			const parser = makeParser();
			const withoutDate = parser.getTaskContentFromLineText(
				"- [ ] Buy groceries #tdsync",
			);
			const withDate = parser.getTaskContentFromLineText(
				"- [x] Buy groceries #tdsync ✅ 2026-01-28",
			);
			expect(
				parser.taskContentCompare(
					{ content: withoutDate },
					{ content: withDate },
				),
			).toBe(true);
		});
		it("taskTagCompare matches regardless of order", () => {
			const parser = makeParser();
			expect(
				parser.taskTagCompare({ labels: ["a", "b"] }, { labels: ["b", "a"] }),
			).toBe(true);
			expect(
				parser.taskTagCompare({ labels: ["a"] }, { labels: ["a", "b"] }),
			).toBe(false);
		});
		it("taskStatusCompare compares completion state", () => {
			const parser = makeParser();
			expect(
				parser.taskStatusCompare(
					{ isCompleted: true },
					{ isCompleted: true },
				),
			).toBe(true);
			expect(
				parser.taskStatusCompare(
					{ isCompleted: true },
					{ isCompleted: false },
				),
			).toBe(false);
		});
	});

	describe("ISO date/time conversion (TZ=UTC)", () => {
		it("ISOStringToLocalDateString returns YYYY-MM-DD", () => {
			expect(
				makeParser().ISOStringToLocalDateString("2025-06-15T14:00:00Z"),
			).toBe("2025-06-15");
		});
		it("ISOStringToLocalDateString returns null for null input", () => {
			expect(
				makeParser().ISOStringToLocalDateString(null as never),
			).toBeNull();
		});
		it("ISOStringToLocalClockTimeString returns HH:MM with zero padding", () => {
			expect(
				makeParser().ISOStringToLocalClockTimeString("2025-06-15T09:05:00Z"),
			).toBe("09:05");
		});
		it("ISOStringToLocalClockTimeString treats 23:59:59 as 'no time'", () => {
			expect(
				makeParser().ISOStringToLocalClockTimeString("2025-06-15T23:59:59Z"),
			).toBe("");
		});
	});

	describe("checkbox / section / project extraction", () => {
		it("isTaskCheckboxChecked detects [x] and [X]", () => {
			const parser = makeParser();
			expect(parser.isTaskCheckboxChecked(lines.completed)).toBe(true);
			expect(parser.isTaskCheckboxChecked("- [X] done #tdsync")).toBe(true);
			expect(parser.isTaskCheckboxChecked(lines.basic)).toBe(false);
		});
		it("getFirstSectionFromLineText returns the section name", () => {
			expect(makeParser().getFirstSectionFromLineText(lines.withSection)).toBe(
				"MySection",
			);
		});
		it("getFirstSectionFromLineText returns empty string when absent", () => {
			expect(makeParser().getFirstSectionFromLineText(lines.basic)).toBe("");
		});
		it("getProjectNameFromCommentOnLineText reads the %%[p::...]%% field", () => {
			expect(
				makeParser().getProjectNameFromCommentOnLineText(
					"- [ ] task %%[p::Work]%% #tdsync",
				),
			).toBe("Work");
		});
	});

	describe("getProjectNameFromFrontmatter (issue #48)", () => {
		it("returns undefined when no filepath is given", () => {
			expect(makeParser().getProjectNameFromFrontmatter(undefined)).toBeUndefined();
		});
		it("returns undefined when the file can't be resolved", () => {
			const app = createMockApp();
			app.vault.getAbstractFileByPath.mockReturnValue(null);
			const parser = new TaskParser(app as never, createMockPlugin() as never);
			expect(parser.getProjectNameFromFrontmatter("note.md")).toBeUndefined();
		});
		it("returns undefined when the note has no `project` frontmatter key", () => {
			const app = createMockApp();
			app.vault.getAbstractFileByPath.mockReturnValue(mockTFile("note.md"));
			app.metadataCache.getFileCache.mockReturnValue({ frontmatter: {} });
			const parser = new TaskParser(app as never, createMockPlugin() as never);
			expect(parser.getProjectNameFromFrontmatter("note.md")).toBeUndefined();
		});
		it("returns the trimmed project name from frontmatter", () => {
			const app = createMockApp();
			app.vault.getAbstractFileByPath.mockReturnValue(mockTFile("note.md"));
			app.metadataCache.getFileCache.mockReturnValue({
				frontmatter: { project: "  Work  " },
			});
			const parser = new TaskParser(app as never, createMockPlugin() as never);
			expect(parser.getProjectNameFromFrontmatter("note.md")).toBe("Work");
		});
	});

	describe("line-rewriting helpers", () => {
		it("removeTaskIndentation strips leading tabs from the bullet", () => {
			expect(makeParser().removeTaskIndentation(lines.indentedOnce)).toBe(
				"- [ ] Sub-task #tdsync",
			);
		});
		it("addTodoistTag appends the sync tag", () => {
			expect(makeParser().addTodoistTag("- [ ] plain")).toBe(
				"- [ ] plain #tdsync",
			);
		});
		it("getObsidianUrlFromFilepath builds a vault deep link", () => {
			expect(makeParser().getObsidianUrlFromFilepath("note.md")).toBe(
				"[note.md](obsidian://open?vault=TestVault&file=note.md)",
			);
		});
		it("hasTodoistLink matches a numeric-id tid link only", () => {
			const parser = makeParser();
			expect(
				parser.hasTodoistLink(
					"x %%[tid:: [12345](https://app.todoist.com/app/task/12345)]%%",
				),
			).toBe(true);
			expect(parser.hasTodoistLink(lines.basic)).toBe(false);
		});
	});

	describe("deadline format detection", () => {
		it("classifies the three supported formats", () => {
			const parser = makeParser();
			expect(parser.taskDeadlineFormatCheck("2025-12-31")).toBe("YYYY-MM-DD");
			expect(parser.taskDeadlineFormatCheck("25-12-31")).toBe("YY-MM-DD");
			expect(parser.taskDeadlineFormatCheck("12-31")).toBe("MM-DD");
		});
		it("returns undefined for an unrecognised format", () => {
			expect(makeParser().taskDeadlineFormatCheck("2025/12/31")).toBeUndefined();
		});
	});
});
