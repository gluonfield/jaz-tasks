# Inbox updates

- [x] Check Linear's completed-issue behavior against the supplied Inbox screenshot.
- [x] Keep completed updates visible until dismissed; add individual and completed-update dismissal.
- [x] Persist dismissal per user/workspace and let later issue changes or comments reappear.
- [x] Verify behavior and review code.
- [x] Commit/push and verify production.

Linear's Inbox contains notifications, including completion updates. Its current [Inbox documentation](https://linear.app/docs/inbox) offers deleting notifications independently of the issue, with Backspace for the selected update. Jaz currently derives the Inbox from assigned/created issues; this change adds dismissal to that existing model without introducing separate notification generation.

Validation: full backend, auth and HTTP middleware suites; frontend typecheck/lint/three builds; real browser completed-update dismissal, selected-update Backspace, refresh persistence, dismiss-all empty state and reappearance after a comment. The 390px and 700px live layouts have no horizontal overflow and retain the actions. A negative control with dismissal filtering disabled fails the lifecycle regression. Fixed the existing demo cycle calculation for Sundays so the normal suite passes on every weekday. Screenshot capture in the integrated browser times out; visual screenshot verification remains unavailable.

Production: 808dc5d is pushed to main; Railway deployment c1a33ef0-d20e-47cd-b08c-b8218c3ad8df succeeded. Authenticated live GraphQL and the real screen confirm 11 CAS updates, including 6 completed/canceled, exact revisions and the dismissal actions. Verification leaves the user's Inbox untouched.
