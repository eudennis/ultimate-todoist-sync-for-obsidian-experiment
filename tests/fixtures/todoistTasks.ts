// Raw Todoist REST API v1 task shapes, as returned by getTaskById() and consumed
// by the import modal. Note v1 puts the full datetime into `due.date` (no separate
// `due.datetime`) when a time is set.
export const taskFixtures = {
	simpleTask: {
		id: "6cfCcrHfXrFP6q3R",
		content: "Buy groceries",
		project_id: "proj-123",
		priority: 1,
		labels: [],
		due: null,
		url: "https://app.todoist.com/app/task/6cfCcrHfXrFP6q3R",
		is_completed: false,
	},
	taskWithDue: {
		id: "6def456GHIjkl789",
		content: "Submit report",
		project_id: "proj-123",
		priority: 3,
		labels: ["work"],
		due: {
			date: "2025-06-15T14:00:00",
			timezone: "UTC",
		},
		url: "https://app.todoist.com/app/task/6def456GHIjkl789",
		is_completed: false,
	},
	taskWithDateOnly: {
		id: "6ghi789JKLmno012",
		content: "Doctor appointment",
		project_id: "proj-123",
		priority: 1,
		labels: [],
		due: {
			date: "2025-06-20",
			timezone: null,
		},
		url: "https://app.todoist.com/app/task/6ghi789JKLmno012",
		is_completed: false,
	},
	urgentTask: {
		id: "6jkl012MNOpqr345",
		content: "Fix production bug",
		project_id: "proj-456",
		priority: 4,
		labels: ["urgent", "engineering"],
		due: {
			date: "2025-06-01",
			timezone: null,
		},
		url: "https://app.todoist.com/app/task/6jkl012MNOpqr345",
		is_completed: false,
	},
	taskWithDuration: {
		id: "6mno345PQRstu678",
		content: "Deep work session",
		project_id: "proj-123",
		priority: 1,
		labels: [],
		due: null,
		duration: { amount: 90, unit: "minute" },
		url: "https://app.todoist.com/app/task/6mno345PQRstu678",
		is_completed: false,
	},
};
