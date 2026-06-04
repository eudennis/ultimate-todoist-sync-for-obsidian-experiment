// Todoist activity-log events used to exercise TodoistNewAPI.filterActivityEvents.
export const activityEventFixtures = {
	itemAdded: {
		id: "evt-001",
		object_type: "item",
		object_id: "6cfCcrHfXrFP6q3R",
		event_type: "added",
		event_date: "2025-06-01T10:00:00Z",
		extra_data: { client: "api" },
	},
	itemCompletedFromObsidian: {
		id: "evt-002",
		object_type: "item",
		object_id: "6def456GHIjkl789",
		event_type: "completed",
		event_date: "2025-06-01T11:00:00Z",
		extra_data: { client: "obsidian-plugin" },
	},
	itemUpdated: {
		id: "evt-003",
		object_type: "item",
		object_id: "6cfCcrHfXrFP6q3R",
		event_type: "updated",
		event_date: "2025-06-01T12:00:00Z",
		extra_data: { content: "New content", last_content: "Old content" },
	},
	itemDeleted: {
		id: "evt-004",
		object_type: "item",
		object_id: "6cfCcrHfXrFP6q3R",
		event_type: "deleted",
		event_date: "2025-06-01T13:00:00Z",
		extra_data: undefined,
	},
	projectUpdated: {
		id: "evt-005",
		object_type: "project",
		object_id: "proj-123",
		event_type: "updated",
		event_date: "2025-06-01T14:00:00Z",
		extra_data: undefined,
	},
};
