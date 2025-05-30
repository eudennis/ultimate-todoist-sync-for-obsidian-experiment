# Another Simple Todoist Sync for Obsidian (BETA)

Create, edit, and delete tasks from within Obsidian.md to your Todoist.

> [!CAUTION]
> In early April 2025, this plugin was no longer working due to changes on the Todoist API. [Check this comment for more details](https://github.com/eudennis/ultimate-todoist-sync-for-obsidian-experiment/issues/24#issuecomment-2817456870). Feel free to open bug reports.

> [!WARNING]
> This is a fork from the [Ultimate Todoist Sync plugin for Obsidian](https://github.com/HeroBlackInk/ultimate-todoist-sync-for-obsidian). I consider this as a beta, but I have been using for quite some time without issues. Feel free to contribute opening bug reports if you find anything.
>
> _Some features works only Todoist -> Obsidian, others by-directional. Find more details on the feature table below._

![Alt Text](/attachment/new_demo.gif)

<details>

<summary>Table of detailed features supported</summary>

| Feature                  | from Obsidian to Todoist | from Todoist to Obsidian |
| ------------------------ | ------------------------ | ------------------------ |
| Add task                 | ✅                       | 🔜                       |
| Delete task              | ✅                       | 🔜                       |
| Modify task content      | ✅                       | ✅                       |
| Modify task due date     | ✅                       | ✅                       |
| Modify task due time     | ✅                       | 🔜                       |
| Modify task description  | 🔜                       | 🔜                       |
| Modify task labels/tags  | ✅                       | 🔜                       |
| Mark task as completed   | ✅                       | ✅                       |
| Mark task as uncompleted | ✅                       | ✅                       |
| Modify project           | 🔜                       | 🔜                       |
| Modify section           | 🔜                       | 🔜                       |
| Modify priority [1]      | ✅                       | 🔜                       |
| Add reminder             | ✅                       | ✅                       |
| Add duration             | ✅                       | 🔜                       |
| Move tasks between files | 🔜                       | 🔜                       |
| Added-at date            | 🔜                       | 🔜                       |
| Completed-at date        | 🔜                       | 🔜                       |
| Task notes [2]           | 🔜                       | ✅                       |
| Optional app link        | ✅                       | ✅                       |
| Assign project to task   | ✅                       | 🔜                       |
| Manage Deadline Date     | ✅                       | 🔜                       |

-   [1] Task priority only support one-way synchronization
-   [2] Task notes/comments only support one-way synchronization from Todoist to Obsidian.

</details>

## Installation

> [!WARNING]
> The plugin will require the _Todoist API token_, which can be found on your `Settings > Integrations > Developer` ([direct link here](https://app.todoist.com/app/settings/integrations/developer)). Note that some features will work for [Todoist paid users](https://www.todoist.com/pricing).

### From within Obsidian

1. Open Obsidian's `Community plugins` tab, within the `Settings` window
2. Click `Browse` and search for `Another Todoist Sync Plugin`
3. Back to `Community plugins`, find the `Installed Plugins` section and activate the `Another Todoist Sync Plugin`

> [!NOTE]
> You can update the plugin following the same procedure, clicking Update instead of Install

### Manually

1. Download the latest release of the plugin from the [Releases](https://github.com/eudennis/ultimate-todoist-sync-for-obsidian-experiment/releases) page.
2. Extract the downloaded zip file and copy the entire folder to your Obsidian plugins directory.
3. Enable the plugin in the Obsidian settings.

## Configuration

1. Open Obsidian's `Settings` window
2. Select the `Community plugins` tab on the left
3. Under `Installed plugins`, click the gear icon next to the `Another Simple Todoist Sync` plugin
4. Enter your Todoist API token

## Settings

1. Automatic synchronization interval time
   The time interval for automatic synchronization is set to 300 seconds by default, which means it runs every 5 minutes. You can modify it yourself.
2. Default project
   New tasks will be added to the default project, and you can change the default project in the settings.
3. Sync Comments
   By default, comments on tasks are added below your task on Obsidian. With this enabled, it won't sync comments.
4. Custom Sync Tag
   By default, sync new task with `#tdsync`, but you can change to `#todoist`
5. Alternative Keywords
   When enabled, accept new keywords for date, due time and duration (_@,$ and &_).

## Usage

### Task format

| Syntax               | Description                                                                                                                            | Example                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| #tdsync              | Tasks marked with `#tdsync`[4] will be added to Todoist. If you have enabled _Full Vault Sync_, `#tdsync` will be added automatically. | `- [ ] task #tdsync`                           |
| 📅YYYY-MM-DD         | The date format is 📅YYYY-MM-DD, indicating the due date of a task.                                                                    | `- [ ] task content 📅2025-02-05 #todoist` [1] |
| #tag                 | Note that all tags without a project of the same name are treated as normal tags                                                       | `- [ ] task #tagA #tagB #tagC #todoist`        |
| `!!<number>`         | The priority of the task between 1 and 4. [2]                                                                                          | `- [ ] task !!1 #todoist`                      |
| ⏰HH:MM              | This sets the time of the task. If none is given, the default is 08:00                                                                 | `- [ ] task ⏰23:59`[3]                        |
| ⏳MMmin              | This sets the duration of the task                                                                                                     | `- [ ] task ⏳30min`[[5]]                      |
| ///<section_name>    | This adds the task to a section with <section_name>                                                                                    | `- [ ] task ///section_name`[7]                |
| #project #tag        | First hashtag assign to a project with the same name                                                                                   | `-[ ] task #project #tag1 #tag2` [8]           |
| %%[p::ProjectName]%% | Assign task to project with hidden field                                                                                               | `%%[p::ProjectName]%%` [9]                     |
| {{YYYY-MM-DD}}       | Assign a deadline date to a task                                                                                                       | `{{YYYY-MM-DD}}` [10]                          |

<details>
<summary>Usage footnotes</summary>

-   [1] Supports the following characters/emojis: 📅, 📆, 🗓, 🗓️, @ [6]
-   [2] It's follow the same pattern of p1, p2, p3 and p4, p1 being the highest priority.
-   [3] Supports the following characters/emojis: ⏰, ⏲, $ [6]
-   [4] On the original plugin, this tag was `#todoist`, but on this fork was changed to avoid conflicts.
-   [5] Supports the following characters/emojis: ⏳, & [6]
-   [6] Alternative characters are enabled via "Alternative Keywords" on plugin settings page
-   [7] If the section if removed from the task content, it won't update in Todoist (yet)
-   [8] First tag will be used for project, but will also create a tag with the same name.
-   [9] Project name is case-sensitive.
-   [10] It supports YY-MM-DD, and if you use MM-DD default to the current YY

</details>

### Set a default project for each file separately

The default project in the setting applies to all files. You can set a separate default project for each file using the comand `Set default project for Todoist task in the current file` from the command menu.

<img src="/attachment/command-set-default-project-for-file.png" width="500">
<img src="/attachment/default-project-for-file-modal.png" width="500">

### Tips

#### List your Todoist tasks within Obsidian

You can list all synchronized tasks from your Obsidian Vault using the [Obsidian DataView plugin](https://github.com/blacksmithgu/obsidian-dataview). If you create a view using the following code:

````markdown
```dataview
task
where !completed and contains(tags, "#tdsync")
```
````

#### Expose tasks meta data

If you have the [Obsidian DataView plugin](https://github.com/blacksmithgu/obsidian-dataview) you will be able to see the task ID on your tasks within Obsidian.

## Disclaimer

This plugin is for learning purposes only. The author and contributors makes no representations or warranties of any kind, express or implied, about the accuracy, completeness, or usefulness of this plugin and shall not be liable for any losses or damages resulting from the use of this plugin.

The author shall not be responsible for any loss or damage, including but not limited to data loss, system crashes, computer damage, or any other form of loss arising from software problems or errors. Users assume all risks and are solely responsible for any consequences resulting from the use of this product.

By using this plugin, you agree to be bound by all the terms of this disclaimer. If you have any questions, please contact the author.

## Contributing

Contributions are welcome! If you'd like to contribute to the plugin, please feel free to submit a pull request.

## License

This plugin is released under the [GNU GPLv3 License](/LICENSE.md).
