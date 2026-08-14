# Frontend Features

This directory is the change log of the **frontend**. Every frontend feature gets
its own document, numbered incrementally (F01, F02, …) and never overwritten. The
backend has its own separate `backend/FEATURES/`.

## Files

| File                  | Purpose                                                   |
| --------------------- | --------------------------------------------------------- |
| `HISTORY.md`          | Index of every frontend feature, in implementation order. |
| `TEMPLATE.md`         | Skeleton to copy when documenting a new frontend feature. |
| `FNN-feature-name.md` | One document per frontend feature.                        |

## Workflow

Before implementing a frontend feature:

1. Read `HISTORY.md`.
2. Read `TEMPLATE.md`.
3. Review related feature documents if necessary.
4. Follow `../CLAUDE.md` (frontend conventions).

After implementing a frontend feature:

1. Create `FNN-feature-name.md` from `TEMPLATE.md`, using the next available number.
2. Document all UI, state, API-integration, theming and i18n changes.
3. Append a row to `HISTORY.md`.
4. Update any other documentation the change affects.

Never overwrite a previous feature document. If a later feature changes earlier
behaviour, record that in the new document and link back to the old one.
