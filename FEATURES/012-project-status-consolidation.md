# Feature 012 — Project Status Consolidation

Supersedes part of [011 — Projects Module](011-projects-module.md). That
document stays as written; this one records what changed and why.

## Goal

Two things, both about `projects` no longer matching its own model:

1. **Remove `Project.isActive`.** Since [011](011-projects-module.md) introduced
   `projectStatus`, the boolean carried no information the enum did not already
   hold, and keeping both gave one fact two places to disagree.
2. **Rebuild the table so its physical column order matches `schema.prisma`.**
   Three migrations of appends and a drop had left the columns in the order the
   migrations happened to run.

## Requirements

- Drop the `is_active` column from `projects`.
- Remove the field from the API surface: the response body, both write DTOs and
  the `?isActive=` list filter.
- Keep `isArchived` untouched.
- Recreate `projects` with the columns in model order, restoring its index and
  the `project_members` foreign key.
- Do not modify the Feature 011 document or its migration.

## Rationale

### The column was derivable

Every row the [011](011-projects-module.md) seed wrote satisfied the same rule:

| `projectStatus` | `isActive` |
| --- | --- |
| `ACTIVE` | `true` |
| `ON_HOLD` | `true` |
| `COMPLETED` | `false` |

That is `isActive = projectStatus IN ('active', 'on_hold')`. No row carried
information the enum did not already hold.

### Which made it a second source of truth

Redundancy alone would be a tidiness argument. The real problem is divergence:
nothing prevented the pair `isActive: true, projectStatus: CANCELLED`, and no
rule said which of the two a reader should believe. A list filtered on the
boolean and a badge rendered from the enum could disagree about the same
project, and both would be reading the database correctly.

Feature 011 argued the opposite — a comment in `projects.seed.ts` claimed
`ON_HOLD` with `isActive: true` showed "lifecycle and activity" were two axes.
That was wrong: it is not independent information, it *is* the derivation rule.
The comment has been rewritten.

### Why `isArchived` stays

Archiving is genuinely a second axis. It is about visibility and retention, not
lifecycle: a `COMPLETED` project and a `CANCELLED` one can both be archived, and
the distinction between them survives it. Nothing about `projectStatus`
determines whether a row should appear in a default listing, so no derivation
rule could replace the flag.

Note also what `isArchived` is *not*: it is not a soft delete, and it does not
freeze the record. The rule from [011](011-projects-module.md) still holds —
archived projects remain editable.

## Backend

| Concern | Change |
| --- | --- |
| Response body | `isActive` no longer appears in `ProjectEntity` or `PROJECT_PUBLIC_SELECT`. |
| `POST` / `PATCH` | The field is gone from both DTOs. Because the global `ValidationPipe` runs with `forbidNonWhitelisted`, sending it is now a **`400`**, not a silently ignored property. |
| `GET` filter | `?isActive=` removed. Ask `?projectStatus=ACTIVE` (or `ON_HOLD`) of the one column that answers it. Sending `?isActive=` is a `400`, as above. |
| Service | Removed from both write paths and from `buildWhere`. |

The `400` on the removed parameter is deliberate rather than incidental: a
client still sending `?isActive=true` is asking a question the API no longer
answers, and failing loudly is better than returning an unfiltered page that
looks like a successful answer to it.

## Database

### One migration

`prisma/migrations/20260803150000_rebuild_projects_table/migration.sql`

A single new migration covers both changes. Dropping `is_active` with an
`ALTER TABLE ... DROP COLUMN` first would be work nobody needs to replay, since
the very next statement discards the whole table anyway.

It does not edit `20260803120000_extend_project_model`, which is already applied:
rewriting recorded history would leave the migration log and the actual database
describing two different schemas.

**Why the table is rebuilt rather than altered.** PostgreSQL keeps columns in
the order they were added, so after Feature 011 appended five columns to a table
the init migration created, `SELECT *` and `\d projects` listed them in
migration order rather than model order. Reordering columns in place is not
something PostgreSQL supports; a rebuild is the only way.

That part is **cosmetic**. Prisma always names columns explicitly, so nothing in
the application reads a column by position and no query changes behaviour. It
was done because the table is inspected by hand often enough during development
for the mismatch to be a nuisance, and because the data is still disposable —
the same rebuild against real data would not be worth it.

Dropping `is_active` is irreversible, and deliberately so: restoring it would
mean restoring a column whose values are recomputable from `project_status`, so
nothing is lost that cannot be derived.

The migration is **destructive** and takes six steps, in this order:

| # | Step | Why |
| --- | --- | --- |
| 1 | `DELETE FROM "project_members"` | Its rows reference project ids that are about to disappear; leaving them makes step 6 fail. |
| 2 | Drop `project_members_projectId_fkey` | Explicitly, rather than via `DROP TABLE ... CASCADE`, so exactly one constraint goes and nothing else is taken down as collateral. |
| 3 | `DROP TABLE "projects"` | The `ProjectStatus` and `ProjectPriority` types survive — enum types are independent objects. |
| 4 | `CREATE TABLE "projects"` | Columns in the order the `Project` model declares them. |
| 5 | `CREATE UNIQUE INDEX "projects_code_key"` | Restores the index backing the `code` duplicate check. |
| 6 | Re-add `project_members_projectId_fkey` | With the same `ON DELETE RESTRICT` that stops a project being deleted while memberships reference it. |

Steps 1 and 2 are the part a naive `DROP TABLE` gets wrong: the foreign key
blocks the drop, and rebuilt projects get fresh cuids, so the old membership
rows would point at ids that no longer exist and the constraint could not be
restored.

Column order is not something Prisma tracks, so the rebuild produces no drift —
the cumulative effect of all three migrations still equals `schema.prisma`. A
fresh database built from scratch ends up in the same state, because this
migration runs last and has the final word on the table's shape.

### Running it

From `backend/`:

```bash
npm run prisma:migrate
npm run prisma:seed
```

Seeding is **required** here, not optional: the rebuild leaves `projects` and
`project_members` empty. The seed repopulates both, in dependency order, from
`prisma/seeds/`.

`prisma generate` was re-run so the client no longer carries the dropped field.

### Seed

`prisma/seeds/projects.seed.ts` drops `isActive` from `ProjectSeed` and from all
five projects, and the `PORTAL` comment that argued for keeping the flag was
rewritten. `project-members.seed.ts` is unchanged — it resolves projects by
`code`, so it picks up the new ids without knowing they changed.

## API

The only breaking changes, all on `/api/v1/projects`:

- `isActive` is absent from every response body.
- `?isActive=` on `GET` now returns `400`.
- `isActive` in a `POST` or `PATCH` body now returns `400`.

Everything else from [011](011-projects-module.md) is unchanged: pagination,
search over `code`/`name`/`clientName`, the `?isArchived=`, `?projectStatus=`
and `?projectPriority=` filters, the six sortable columns, the date-range rule,
the HEX colour rule, duplicate protection and delete protection.

No frontend consumes this endpoint yet, so nothing downstream needed migrating.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/prisma/migrations/20260803150000_rebuild_projects_table/migration.sql` | Drops `is_active` and rebuilds the table in model column order. |

## Files Modified

| File | Change |
| --- | --- |
| `backend/prisma/schema.prisma` | Removed `isActive` from `Project`; documented why `isArchived` remains a separate axis. |
| `backend/prisma/seeds/projects.seed.ts` | Removed the field; corrected the `PORTAL` comment. |
| `backend/src/modules/projects/entities/project.entity.ts` | Removed from the interface, the select and the mapper. |
| `backend/src/modules/projects/dto/create-project.dto.ts` | Removed the field. |
| `backend/src/modules/projects/dto/update-project.dto.ts` | Removed the field. |
| `backend/src/modules/projects/dto/project-query.dto.ts` | Removed the filter; recorded where the question moved. |
| `backend/src/modules/projects/project.service.ts` | Removed from both writes and from `buildWhere`. |
| `backend/src/modules/projects/project.service.spec.ts` | Filter-combination test now uses `isArchived` + `projectStatus`. |
| `backend/src/modules/projects/dto/*.spec.ts` | Regression cases asserting the field and the filter are now rejected. |

## Notes

- **Verified.** `tsc --noEmit` clean, `nest build` clean, `prisma validate`
  clean, **597 tests passing across 39 suites**.
- Three regression tests pin the removal rather than merely deleting the old
  cases, so re-adding `isActive` by accident fails the suite instead of quietly
  widening the API again.
- `User`, `Department` and `Position` keep their own `isActive`. There the flag
  is not redundant: none of those models has a lifecycle enum, and for reference
  data the boolean is the whole answer to "is this still selectable".
- **No application code changed for the rebuild.** It is a pure schema
  operation; the module reads and writes columns by name, so the same 597 tests
  cover it unchanged.
- The column drop and the rebuild ship as **one** migration. They were drafted
  as two, and squashing them was only safe because the first had not been
  applied yet — once a migration is recorded in `_prisma_migrations`, removing
  its folder breaks `prisma migrate dev`, and the two would have had to stay
  separate.

## Future Improvements

- The open points from [011](011-projects-module.md) still stand: optional
  sorting by `projectStatus` / `projectPriority`, the case-variant race on
  `code`, and guards once authentication exists.
- If a UI wants a single "is this live" predicate, it belongs in the frontend or
  in a future read model — not as a stored column, which is what this feature
  removed.
