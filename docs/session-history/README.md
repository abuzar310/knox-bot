# Session history

Cursor agent chats get archived. This folder is the durable log for Knox / ZARU so the next session can pick up without the old transcript.

## Rules

- One markdown file per session, named `YYYY-MM-DD-<short-name>.md`.
- Write what shipped, what is still open, and where it lives in git. Skip chat filler.
- Never commit tokens, passwords, cookies, or `.env` values. If a secret was pasted in chat, say that it was rotated or that it must be rotated — do not repeat it.
- Update `CURRENT.md` to point at the latest file when a session starts or ends.

`recovered-from-git.md` is the reconstruction of work that landed before this folder existed.
