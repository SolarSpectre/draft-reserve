# GitHub Issues

Track issues and specs in `SolarSpectre/draft-reserve`. Run `gh` from this checkout and verify the target with `gh repo view --json nameWithOwner` before the first issue write in a session.

- Publish a ticket with `gh issue create`. Use `--body-file` for multiline text.
- Read a ticket with `gh issue view <number> --json number,title,body,labels,comments`. List tickets with `gh issue list` and the relevant filters.
- Use native sub-issues and dependencies for parent and blocker links. A ticket is ready when all blockers are closed.
- Use `gh issue edit` to apply or remove labels. Record the resolution with `gh issue comment` before closing a ticket.
- For `/wayfinder`, use `wayfinder:map` on the parent and `wayfinder:<type>` on child tickets. Follow map order, skip assigned or blocked tickets, and claim a ticket before working on it.

## Pull requests as a triage surface

**PRs as a request surface: no.**
