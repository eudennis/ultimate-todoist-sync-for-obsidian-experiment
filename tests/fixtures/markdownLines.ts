// Representative Obsidian markdown task lines used across taskParser tests.
//
// NOTE on Todoist IDs: hasTodoistId()'s regex only matches [a-zA-Z0-9]+ (no
// hyphen), while getTodoistIdFromLineText() uses a looser .*? capture. So
// `withTodoistId` uses a realistic hyphen-free id (matched by both), and
// `withHyphenTodoistId` documents the asymmetry: hasTodoistId() is false for it
// but getTodoistIdFromLineText() still extracts the value.
export const lines = {
	basic: "- [ ] Buy groceries #tdsync",
	withDueDate: "- [ ] Submit report 📅2025-06-15 #tdsync",
	withDateTime: "- [ ] Submit report 📅2025-06-15 ⏰14:00 #tdsync",
	withDuration: "- [ ] Deep work ⏳90min #tdsync",
	withPriority1: "- [ ] Fix production bug !!1 #tdsync",
	withPriority2: "- [ ] High priority task !!2 #tdsync",
	withPriority3: "- [ ] Medium priority task !!3 #tdsync",
	withPriority4: "- [ ] Low priority task !!4 #tdsync",
	withPriorityAtEnd: "- [ ] Task with priority at the end #tdsync !!1",
	withTags: "- [ ] Task with tags #work #meeting #tdsync",
	withSubProjectTag: "- [ ] Task #Work/ProjectX #tdsync",
	withTodoistId:
		"- [ ] Task %%[tid:: [6cfCcrHfXrFP6q3R](https://app.todoist.com/app/task/6cfCcrHfXrFP6q3R)]%%",
	withTodoistAppUri:
		"- [ ] Task %%[tid:: [6cfCcrHfXrFP6q3R](todoist://task?id=6cfCcrHfXrFP6q3R)]%%",
	withHyphenTodoistId:
		"- [ ] Task %%[tid:: [task-abc123](https://app.todoist.com/app/task/task-abc123)]%%",
	withAlternativeDate: "- [ ] Task @2025-06-15 #tdsync",
	withDeadlineFullDate: "- [ ] Task with deadline {{2025-12-31}} #tdsync",
	withDeadlineShortDate: "- [ ] Task {{12-31}} #tdsync",
	withDeadlineShortYear: "- [ ] Task {{25-12-31}} #tdsync",
	withSection: "- [ ] Task ///MySection #tdsync",
	completed: "- [x] Completed task #tdsync",
	indentedOnce: "\t- [ ] Sub-task #tdsync",
	indentedTwice: "\t\t- [ ] Sub-sub-task #tdsync",
	blank: "   ",
	emptyString: "",
	notATask: "This is regular prose.",
	heading: "## My Heading",
};
