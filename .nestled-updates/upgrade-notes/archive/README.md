# Archived upgrade notes — history, not a backlog

These notes predate the convergence reset (2026-08-19). **They are not work waiting to be
done.** Nothing here should be replayed, applied in date order, or counted as a gap.

## Why they are here rather than deleted

Each one records why a change was made, and that reasoning is not recoverable from the diff.
They stay readable for anyone tracing how the template arrived at its current shape.

## Why they are not in the live directory

A repo that has never converged compares its own `upgrade-notes/` against the template's and
concludes it is dozens of upgrades behind. Two repos reached exactly that conclusion during
the 2026-08 rollout and proposed working through the backlog in date order — a program of
work that convergence does in one pass, because the template's current state already contains
every one of these changes.

## What replaced them

Convergence. A repo is measured by `.nestled/converged-at` against the template's HEAD, not by
which notes it has applied. `nestled-upgrader convergence-status` reports the gap. The
divergence scan brings a repo to the template's present state directly; it does not replay how
the template got there.

## Notes that exist only in one clone

A clone may hold archived notes this repo never had — its own bootstrap, its own build wiring,
anything describing that repo's own setup rather than a change flowing down from here. Those are
archived in place, in the repo that owns them, because there is no upstream copy to archive.

That is the one exception. Every other note here is mirrored, and editing a mirrored note in a clone
is undone by the next promotion — which is how the section explaining this exception was lost once
already.

## What the live directory is still for

Notes dated 2026-08-19 and later, and every new one. They document changes as they happen and
satisfy the doctor's note gate, which requires a note in the same diff as a sensitive change.
That mechanism is not retired — only the backlog reading of it is.
