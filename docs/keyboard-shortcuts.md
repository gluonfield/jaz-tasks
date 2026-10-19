# Keyboard Shortcuts

Cmd is Ctrl on Windows/Linux, except explicitly named Ctrl shortcuts. Issue actions target the hovered or keyboard-focused row/card, or the open issue. Ordinary inputs suppress app actions; Markdown editors accept their formatting commands. Dialogs and menus retain their native keyboard handling.

`Cmd+Shift+.` copies the existing Tasks branch format: lowercase issue identifier, a hyphen, then the lowercase title with non-ASCII-alphanumeric runs replaced by hyphens, trimmed, and capped at 60 title characters. Example: `ENG-42`, “Fix: OAuth / callbacks & retries!” → `eng-42-fix-oauth-callbacks-retries`. It does not create a Git branch or change issue status. Linear uses the same action but allows workspace branch-format and optional status/assignment settings; Tasks has neither setting.

Sources: [requested reference](https://shortcuts.design/tools/toolspage-linear/) and its [loaded table](https://shortcuts.design/data/Productivity/toolspage-linear.html), [Linear GitHub](https://linear.app/docs/github), [branch options](https://linear.app/changelog/2020-04-13-branch-naming), [copy ID/branch](https://linear.app/changelog/page/25), [copy URL](https://linear.app/changelog/page/22), [My Issues](https://linear.app/docs/my-issues), [editor](https://linear.app/docs/editor), [current heading keys](https://linear.app/changelog/page/3), [edit action change](https://linear.app/changelog/page/11), [delete/restore](https://linear.app/docs/delete-archive-issues), [issue/team actions](https://linear.app/docs/creating-issues). Checked 19 October 2026. `?` is present in the reference; `Cmd+/` is also provided as requested, but its present-day Linear binding was not independently confirmed in public docs.

## Mapping

“Exists” means the shortcut already existed and is preserved or centralized. “Add” means this change adds the binding to a feature already supported by the app or API. The requested reference includes older shortcuts; corrections below follow current first-party documentation. Editor commands operate on Tasks' existing Markdown source rather than introducing a rich-text editor.

| Linear shortcut / action | Tasks mapping | Status |
| --- | --- | --- |
| ⌘ K · Open command menu | Open command menu | exists |
| ⌘ Enter · Save or submit | Save or submit | exists |
| Esc · Back | Back | exists |
| Enter or O · Open focused item | Open focused item | exists |
| Esc · Clear a list selection | Clear a list selection | add — implemented |
| ↑ or K · Move up | Move up | exists |
| ↓ or J · Move down | Move down | exists |
| → · Move right | Move right | add — implemented |
| ← · Move left | Move left | add — implemented |
| ⌥ ⇧ Q · Log out | Log out | add — implemented |
| O then I · Open issue | Open issue | add — implemented |
| ⌘ ⇧ ↑ · Open parent issue | Open parent issue | add — implemented |
| ⌘ ⇧ ↓ · Open sub issue | Open sub issue | add — implemented |
| / · Open search | Open search | exists |
| ? · Open this view | ? / ⌘ / — Keyboard Shortcuts | add — implemented |
| ⌘ I · Open details sidebar | Open details sidebar | add — implemented |
| ⌘ B · Toggle list / board view | Toggle list / board view | exists |
| ⌃ ⇧ 1-9 · Go to team | Go to team | add — implemented |
| G then I · Go to inbox | Go to inbox | exists |
| G then A · Go to my issues | G M (current docs; replaces listed G A) | exists |
| G then B · Go to backlog | Go to backlog | add — implemented |
| G then E · Go to all issues | Go to all issues | add — implemented |
| G then D · Go to board | Go to board | add — implemented |
| G then P · Go to projects | Go to projects | exists |
| G then S · Go to settings | Go to settings | exists |
| O then P · Open a project | Open a project | add — implemented |
| O then T · Open a team | Open a team | add — implemented |
| ⌘ ⌥ 1-9 · Set issue status | Set issue status | add — implemented |
| C · New issue | New issue | exists |
| E · Edit issue | ⌥ E (current Linear; replaces listed E) | add — implemented |
| A · Assign to user | Assign to user | exists |
| I · Assign to me | Assign to me | add — implemented |
| L · Change labels | Change labels | exists |
| ⇧ L · Remove label | Remove label | add — implemented |
| S · Change status | Change status | exists |
| P · Change priority | Change priority | exists |
| ⇧ E · Change estimate | ⇧ E (Tasks previously used E) | add — implemented |
| ⇧ D · Set due date | Set due date | exists |
| ⌘ ⇧ D · Remove due date | Remove due date | add — implemented |
| R · Rename | Rename | add — implemented |
| ⌘ ⇧ M · Move to another team | Move to another team | add — implemented |
| ⌘ Delete · Delete issue | Existing soft-delete API (archives) | add — implemented |
| # · Restore issue | Restore an open archived issue through the existing unarchive API | add — implemented |
| ⌘ . · Copy issue ID | Copy issue ID | add — implemented |
| ⌘ ⇧ . · Copy git branch name | Copy git branch name | add — implemented |
| ⌘ ⇧ , · Copy issue URL | Copy issue URL | add — implemented |
| ⌘ ⇧ O · Create sub-issue | Create sub-issue | exists |
| ⇧ C · Add to cycle | Add to cycle | add — implemented |
| ⇧ P · Add to project | Add to project | add — implemented |
| ⌃ M · Comment on issue | Comment on issue | add — implemented |
| ⌘ ⇧ C · Add to active cycle | Add to active cycle | add — implemented |
| ⌘ B · Bold | Bold | add — implemented |
| ⌘ I · Italic | Italic | add — implemented |
| ⌘ D · Strikethrough | ⌘ ⇧ S (current docs; listed ⌘ D is obsolete) | add — implemented |
| ⌘ > · Blockquote (old reference) | Current docs: italic in Markdown editor; blockquotes use > then Space | add — implemented |
| ⌃ ⇧ 1 · Large header | ⌘ ⌥ 1 (current Linear) | add — implemented |
| ⌃ ⇧ 2 · Medium header | ⌘ ⌥ 2 (current Linear) | add — implemented |
| ⌃ ⇧ 3 · Small header | ⌘ ⌥ 3 (current Linear) | add — implemented |
| ⌘ ⇧ 7 · Todo list | Todo list | add — implemented |
| ⌘ ⇧ 8 · Bulleted list | Bulleted list | add — implemented |
| ⌘ ⇧ 9 · Numbered list | Numbered list | add — implemented |
| ⌘ ⇧ \ · Code block | Code block | add — implemented |
| ⌘ ⇧ C · Inline code | ⌘ E (current docs; listed ⌘ ⇧ C is obsolete) | add — implemented |
| ⌘ K · Turn text into link | Turn text into link | add — implemented |
| ⌘ Z · Undo | Undo | exists |
| ⌘ ⇧ Z · Redo | Redo | exists |
| # · Large header | Markdown source → rendered description, comment or project brief | exists |
| ## · Medium header | Markdown source → rendered description, comment or project brief | exists |
| ### · Small header | Markdown source → rendered description, comment or project brief | exists |
| - · Bulleted list | Markdown source → rendered description, comment or project brief | exists |
| 1. · Numbered list | Markdown source → rendered description, comment or project brief | exists |
| > · Blockquote | Markdown source → rendered description, comment or project brief | exists |
| ``` · Code block | Markdown source → rendered description, comment or project brief | exists |
| _text_ · Italic | Markdown source → rendered description, comment or project brief | exists |
| **text** · Bold | Markdown source → rendered description, comment or project brief | exists |
| ~~text~~ · Strikethrough | Markdown source → rendered description, comment or project brief | exists |
| `code` · Inline code | Markdown source → rendered description, comment or project brief | exists |
| *** · Horizontal divider | Markdown source → rendered description, comment or project brief | exists |

## No matching feature

| Linear shortcut | Action | Tasks limitation |
| --- | --- | --- |
| Space | Peek into issue | No preview overlay |
| X | Select in a list | No bulk selection |
| ⇧ click | Select multiple items in a list | No bulk selection |
| G then X | Go to archived issues | No archive browser |
| G then C | Go to cycles | Cycles can be assigned; no cycle pages |
| G then V | Go to active cycle | No cycle pages |
| G then W | Go to upcoming cycle | No cycle pages |
| O then F | Open a favorite | No favorites |
| O then C | Open a cycle | No cycle pages |
| O then U | Open a user | No user pages |
| O then M | Open my profile | No profile page |
| ⌥ C | New issue from template | No issue templates |
| V | New issue in full screen view | Creation uses a dialog |
| ⇧ S | Subscribe to issue | No subscriptions |
| ⌘ ⇧ S | Manage issue subscribers | No subscribers |
| M then B | Mark as blocked | No blocking relations |
| M then X | Mark as blocking | No blocking relations |
| M then R | Reference related issue | No related-issue relations |
| M then M | Merge into another issue | No merge operation |
| ⌃ L | Link any URL to issue… | No issue attachment links; Markdown links remain supported |
| F | Filter issues | No interactive filter builder |
| ⇧ F | Clear last issue filter | No filter history |
| ⌥ ⇧ F | Clear all issue filters | No filter builder |
| ⌘ U | Underline | Markdown renderer has no underline format |
| ⌘ ⇧ A (current docs: ⌘ ⇧ U) | Attach image / file | No file uploads |

Additional existing actions: timeline zoom `=` / `-`; Inbox dismiss `Backspace` (also `E`, following Linear's edit-key change). `G U` opens Tasks' Views, matching current Linear's views navigation family. Property pickers retain number keys 1–9. No dependency was added.

## Verification

`bun run check` includes typecheck, lint, all three builds, and `node tests/shortcuts.mjs`. The browser test runs headless Chrome against the real Go HTTP stack and a fresh seeded Postgres database, then drops that database and stops Chrome. Set `TEST_DATABASE_URL` for the test Postgres and `CHROME_BIN` if Chrome is not installed at a standard path. Built artifacts and screenshots go under the root's ignored `runs/shortcuts/`.

Verified 22 browser scenarios with 20 distinct failing mutation controls, including branch text from list, board and issue page; input isolation; Mac/Ctrl modifiers; saved mutations; palette handoffs; Inbox Back; native Enter; and scrollable help in light/dark and at 390px. No dependency was added.
