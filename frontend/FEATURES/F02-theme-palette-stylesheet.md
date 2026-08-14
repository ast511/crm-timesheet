# Theme Palette Stylesheet

## Goal

Connect the theming seam F01 built to the project's **real** palette stylesheet.

F01 shipped the whole mechanism — the generated-enum types, the two maps, the
provider, the `setPreferences` seam — against a placeholder palette it wrote
itself: two colours per scheme (`--brand`, `--brand-foreground`) mapped onto six
shadcn variables. That was a stand-in, and it was always going to be replaced by
the designed palettes.

This feature swaps in the real stylesheet, which selects palettes by **class**
(`.theme-red`, `.dark.theme-red`) rather than by the `data-theme` attribute F01
invented, and defines the **full** variable set per palette rather than an accent
pair. The provider changes to match. Nothing else about the seam moves.

## Requirements

- `src/index.css` carries the supplied palette stylesheet, colours unchanged.
- `colorScheme` selects a palette by putting a `theme-<name>` class on `<html>`;
  `DEFAULT` puts none and falls through to `:root`.
- `cornerRadius` sets `--radius` on `<html>`, overriding the fixed `:root` value
  and moving the whole derived radius chain with it.
- Light/dark stays the `dark` class, stays client-only, and combines with any
  palette.
- The maps stay keyed by the generated Feature 039 enums.
- The `setPreferences` seam is unchanged, so the profile feature is unaffected.
- Type-check, lint and build clean.

---

## The mapping

### `colorScheme` → class on `<html>`

| `colorScheme` | class | selects |
| --- | --- | --- |
| `DEFAULT` | *(none)* | `:root` / `.dark` |
| `RED` | `theme-red` | `.theme-red` / `.dark.theme-red` |
| `ROSE` | `theme-rose` | `.theme-rose` / `.dark.theme-rose` |
| `ORANGE` | `theme-orange` | `.theme-orange` / `.dark.theme-orange` |
| `GREEN` | `theme-green` | `.theme-green` / `.dark.theme-green` |
| `BLUE` | `theme-blue` | `.theme-blue` / `.dark.theme-blue` |
| `YELLOW` | `theme-yellow` | `.theme-yellow` / `.dark.theme-yellow` |
| `VIOLET` | `theme-violet` | `.theme-violet` / `.dark.theme-violet` |

**`DEFAULT` maps to `null`, and that is a value rather than a gap.** The default
palette *is* the `:root` / `.dark` base; giving it a class would mean restating
every variable in those two blocks a second time, to be kept in step by hand.

`COLOR_SCHEME_CLASS` is a `Record<ColorScheme, string | null>` keyed by the
generated union, so a ninth palette on the server is a compile error here until
it is given a class. `PALETTE_CLASSES` — the list `applyTheme` removes before
adding the chosen one — is **derived** from that object rather than written out
again: a hand-kept second list is how a palette becomes impossible to switch
*away* from, and that failure stays invisible until somebody picks a second
colour.

### `cornerRadius` → `--radius`

Unchanged from F01, and still matching `backend/FEATURES/039` exactly:

| Symbol | `--radius` | `rounded-sm` | `rounded-md` | `rounded-lg` | `rounded-xl` |
| --- | --- | --- | --- | --- | --- |
| `NONE` | `0rem` | 0px | 0px | 0px | 4px |
| `SMALL` | `0.3rem` | 0.8px | 2.8px | 4.8px | 8.8px |
| `MEDIUM` | `0.5rem` — the default | 4px | 6px | 8px | 12px |
| `LARGE` | `0.75rem` | 8px | 10px | 12px | 16px |
| `FULL` | `1rem` | 12px | 14px | 16px | 20px |

It is written as an **inline style** on `<html>`, which is what lets it override
the `--radius` in `:root`. Until a preference is applied the `:root` value
(`0.625rem`) stands, so the app is never unstyled.

The new stylesheet derives the chain **additively** — `calc(var(--radius) - 4px)`
for `sm`, `+ 4px` for `xl` — where F01's placeholder was multiplicative. At
`NONE` that makes `--radius-sm` compute to `-4px`; CSS clamps a negative `calc()`
to `0` for properties that only accept non-negative lengths, so `NONE` renders
square as intended. It is worth knowing that this is why it works, because the
same arithmetic would be a real bug in a property that does accept negatives.

### Light/dark

Still the `dark` class on `<html>`, still **client-only**: system default,
local toggle, remembered in `localStorage`, **never sent to the backend**. There
is no column for it and F01's argument for that has not changed.

The palette class and `dark` go on the **same element**, which is what lets the
stylesheet address them together as `.dark.theme-violet`. Splitting them across
`<html>` and `<body>` would leave every dark palette variant unmatched.

---

## Theming: the one thing that had to move

**The palettes are in `index.css` now, not in an imported `theme/palettes.css`,
and that is a correctness fix rather than a tidy-up.**

`.theme-red` and the base `.dark` have the *same* specificity — one class each,
(0,1,0). Which one wins is therefore decided purely by source order. `@import`
inserts a file's content at the point of the import, and CSS requires imports to
come before every other rule, so an imported palette file always lands *above*
`:root` and `.dark` — and loses to them.

F01's placeholder mostly dodged this: it wrote `--brand`, a variable the base
blocks never set, and used `html.dark[data-theme='x']` (0,2,1) for its dark
variants. But its one overlapping rule had the bug for real — `[data-theme='x']`
set `--primary`, `.dark` set `--primary` after it, and so **every palette showed
the neutral primary in dark mode**. The full stylesheet, which sets the entire
variable set, would have been broken in light mode too.

Keeping the palettes at the bottom of `index.css`, after `:root` and `.dark`,
is what makes the cascade come out right; `.dark.theme-red` (0,2,0) then wins on
specificity. The constraint is written at the top of the file, because a later
"let's split this up" would silently reintroduce the bug.

`theme/palettes.css` is deleted rather than emptied — a file that must not be
imported is better absent than present and load-bearing by omission.

### Cleanups applied to the supplied stylesheet

Both were called out and both are done:

- `.theme-green` declared `--background: oklch(1 0 0);` twice. One removed.
- A commented-out HSL `.theme-red` block from an earlier revision, above the
  OKLCH one. Removed — it described a colour space the file no longer uses.

### Deviations from the supplied file, and why

Three, all outside the palettes. **No colour value was changed.**

| Supplied | Shipped | Why |
| --- | --- | --- |
| `@import url("…fonts.googleapis.com…Inter…")` | `@import "@fontsource-variable/inter"` | Inter is already a dependency and is bundled from our own origin — the build emits seven `woff2` files. A remote `@import` in CSS is render-blocking and third-party; adding one for a font we already ship would be a regression. `--font-inter` lists `"Inter Variable", "Inter"`, so the Google family name still resolves if it is ever loaded. |
| `@theme inline` without `--font-sans` / `--font-heading` | both kept, aliased to `--font-inter` | `components/ui/card.tsx` uses `font-heading`. Dropping it would silently un-style every card title. |

`@plugin "tailwind-scrollbar"` is **not** in the shipped file. The plugin was
installed, evaluated and removed; the `--scrollbar-*` variables it was meant to
serve are driven by plain properties instead. See *Scrollbars* below.

Also kept from the previous file: `@import "shadcn/tailwind.css"`, which the
vendored `base-vega` primitives depend on and the supplied file omits.

Carried over unchanged: the `:root` / `.dark` base (now slate-tinted rather than
pure grey), the `--radius-sm/md/lg/xl` chain, and the landing-page grid and
animation classes at the bottom. The `--radius-2xl/3xl/4xl` steps F01 defined
are gone with them; nothing referenced them.

---

### Scrollbars: themed everywhere, and no plugin

The stylesheet declares `--scrollbar-track`, `--scrollbar-thumb` and
`--scrollbar-thumb-hover` in both `:root` and `.dark`. They were inert — nothing
read them — until the rules described here were added. Scrollbars now follow the
colour mode for free, and the thumb's radius is `var(--radius-sm)`, so it follows
`cornerRadius` too.

**The decision: every scroll container is themed, not just the document.** The
`DataTable`'s horizontal overflow, the dropdown and select menus, and any dialog
that scrolls all match the page. A themed page scrollbar beside a native grey one
inside a table reads as a bug, and "which containers scroll" is not a stable
enough set to opt in by hand.

`tailwind-scrollbar` was installed and then **removed**, because it was the one
thing preventing that. Its base reset —
`* { scrollbar-color: initial; scrollbar-width: initial }` — exists to make the
plugin opt-in per element, and it works by severing the inheritance this design
depends on. Tailwind 4.3 already ships the standard-property utilities, so what
remained of the plugin was a reset working against us.

#### Why the rules are written out rather than `@apply`ed

Tailwind 4.3 ships its *own* scrollbar utilities and the plugin defined utilities
under the **same names** with different meanings:

| | sets | painted by |
| --- | --- | --- |
| Tailwind core | `scrollbar-color`, via `--tw-scrollbar-thumb` | the standard property |
| the plugin | `--scrollbar-thumb` | the plugin's `::-webkit-scrollbar-thumb` rule |

An intermediate attempt used both in one `@apply` and resolved **the size utility
to the plugin but the colour utility to core**, emitting a hover rule that set
`--tw-scrollbar-thumb` while the thumb's background read `var(--scrollbar-thumb)`.
It compiled, it looked right, and the hover did nothing. Plain properties cannot
be ambiguous.

#### Why the two blocks are mutually exclusive

They are the same styling for two engines, and they must **not** both apply:
Chrome 121+ ignores the `::-webkit-scrollbar` pseudo-elements entirely on any
element whose `scrollbar-width` or `scrollbar-color` is not `auto`. Declaring
both unconditionally would cost the hover state in Chrome, since the standard
property has no hover to style.

So `@supports not selector(::-webkit-scrollbar)` hands each engine one mechanism:

| Engine | Gets | Covers every container because |
| --- | --- | --- |
| WebKit / Blink | the `::-webkit-scrollbar-*` pseudo-elements, incl. `:hover` | they are written against `*` — pseudo-elements do not inherit |
| Firefox | `scrollbar-width` + `scrollbar-color` on `html` | both properties **are** inherited, so one declaration reaches every descendant |

Firefox keeps the resting colour on hover. That is a platform limit rather than
an oversight — the standard property exposes no hover state.

### A stylesheet-scanning trap: documentation with build output

`@source not "../FEATURES"` is in `index.css`, and it is load-bearing.

Tailwind v4 scans every non-ignored file in the project for class candidates,
**`.md` included**. An earlier draft of this very document named a scrollbar
utility in prose, and that alone was enough for Tailwind to emit a real
`scrollbar-width: thin` rule into the production bundle — dead CSS, generated by
documentation, for a class no element carries.

Worth knowing generally: a feature document that names a utility will otherwise
ship it. The exclusion is what keeps `FEATURES/` prose rather than source.

## State & Data

None. This feature adds no query, no store and no request.

## API Integration

None, deliberately. `ThemeProvider` still does not read the profile and still
does not write it back. `setPreferences({ colorScheme, cornerRadius })` on the
context is the seam the profile feature calls after `GET /api/v1/profile/me`,
and the `PATCH` belongs to the settings screen that owns it. Its signature is
unchanged by this feature, so nothing waiting on it has to be revisited.

## Forms & Validation

None.

## Routing

Unchanged.

---

## Files Created

| File | What it is |
| --- | --- |
| `FEATURES/F02-theme-palette-stylesheet.md` | This document. |

## Files Modified

| File | Change |
| --- | --- |
| `src/index.css` | The supplied stylesheet: base, `@theme inline`, the seven `.theme-*` / `.dark.theme-*` palettes, the landing classes. Both cleanups applied, two deviations above. No longer imports `theme/palettes.css`. Adds the universal scrollbar rules that consume `--scrollbar-*`, and `@source not "../FEATURES"`. |
| `src/theme/theme.ts` | `COLOR_SCHEME_TOKEN` → `COLOR_SCHEME_CLASS` (`string \| null`, `DEFAULT: null`); `PALETTE_CLASSES` derived from it; `applyTheme` swaps the class instead of writing `data-theme`. `COLOR_SCHEMES` reads the renamed map. |

### Files Deleted

| File | Why |
| --- | --- |
| `src/theme/palettes.css` | Superseded by the real palettes. It cannot be re-imported without reintroducing the cascade bug described above. |

Untouched, and worth saying so: `ThemeProvider.tsx`, `theme-context.ts`,
`useTheme.ts`, `ColorModeToggle.tsx` and the pre-paint script in `index.html`.
The seam was right; only what it wrote to the DOM changed.

---

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run build` | clean — 2 232 modules; CSS 47.3 kB → 65.4 kB (11.0 kB gzipped), the full palettes plus the scrollbar rules |
| Scrollbars | asserted against the built CSS: the plugin's reset and its utility variables are gone; the five `::-webkit-scrollbar-*` rules are universal and read the three variables; `--radius-sm` resolves to `calc(var(--radius) - 4px)`, so the thumb tracks `cornerRadius`; all three variables are defined in **both** `:root` and `.dark` |
| The `@supports` guard | `scrollbar-width` and `scrollbar-color` appear **only** inside it — asserted, because leaking either one would silently disable the hover in Chrome 121+ |
| Cascade, all 8 schemes × light/dark | resolved against the **built** stylesheet by specificity-then-order: every palette wins from exactly the rule it should (`.theme-x` in light, `.dark.theme-x` in dark), `DEFAULT` from `:root` / `.dark`, and no two palettes share a `--primary` within a mode |
| `applyTheme`, all 8 × 2 × 5 combinations | run against a fake `<html>`: exactly one `theme-*` class at a time, `dark` toggled correctly, `--radius` and `color-scheme` set |
| Switching away from a palette | `violet` + dark + `LARGE` → `DEFAULT` + light + `NONE` leaves `class=""` and `--radius: 0rem` — no stacked classes |
| Radius reaches components | every `rounded-*` utility the app emits resolves through `var(--radius)` |

The verification scripts are scratch, not committed — they assert against build
output, and the build is the thing under test.

**Not verified in a browser.** No headless driver is installed and adding one
needs approval, so the cascade result above is computed from the built CSS by
the browser's own rule (highest specificity, then latest source order) rather
than read off a screenshot. That covers which rule wins; it does not cover how
the colours look.

---

## Notes

### Why the provider did not need rewriting

F01 put the palette behind a `Record` keyed by the generated enum and applied it
in one function. Changing the mechanism from an attribute to a class was two
edits inside `applyTheme` and a retyped map — no component, no consumer and no
context signature moved. That is the seam paying for itself, and it is the
argument for keeping the next mechanism change equally cheap.

### The palettes are shadcn's, and they are not colour-consistent with the base

The supplied `:root` uses slate-tinted neutrals; the `.theme-*` palettes use
zinc-tinted ones. So switching from `DEFAULT` to `RED` shifts the greys slightly
as well as the accent. That is how the stylesheet was authored and it is left
as-is — but it means `DEFAULT` is not simply "the palettes minus the colour".

## Future Improvements

1. **A browser check of the scrollbars, Firefox included.** The rules are
   asserted against the built CSS, not observed. Firefox is the one that takes
   the different code path, so it is the one worth actually opening.
2. **The settings UI.** `COLOR_SCHEMES` and `CORNER_RADII` are exported in the
   order a picker should offer them, and `setPreferences` applies live. What is
   missing is the screen and its `PATCH /api/v1/profile/me` — F01's first
   improvement, still open, and now with real palettes to preview.
3. **A browser check of the palettes.** Contrast in particular: `yellow` carries
   a dark `--primary-foreground` because white fails on it, and that reasoning
   deserves a measurement rather than an inherited assumption.
4. **Chart colours.** No longer neutral — every palette now defines
   `--chart-1..5`. They should still be reviewed against real series with the
   reporting feature, since five hues of one colour is a questionable choice for
   categorical data.
5. **`scroll-behavior: smooth`** is set unconditionally on `html` and is not
   covered by the stylesheet's `prefers-reduced-motion` block, unlike the
   animations beside it.
