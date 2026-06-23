# Plans

Implementation plans authored by the **architect** skill drive all non-trivial
work. Each plan is `NNN-short-name.md` (zero-padded), reviewed and approved
before the **dev** skill implements it, then moved to `done/` on close.

- **Active roster:** _(none yet — this is a fresh skeleton)_
- **Next free number:** `001`
- **Completed:** see `done/`

No plans have been authored yet. When you start the first piece of real work,
invoke the architect skill to draft `001-…`.

## Likely early candidates (not yet planned)

- Create-reminder multi-step flow (label → herb link → recurrence → first fire).
- Per-category proactive digests (the `subscriptions` table + `listSubscribers` are ready).
- Corpus expansion (more herbs/categories/tips via the content-curator skill).
- Admin `/stats` command (the `adminTelegramIds` allowlist is already wired).
