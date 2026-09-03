# Design system — skeleton + rotating theme

The carousel is split in three so the look can change without the structure moving.

- **`base.css`** — the skeleton. Slide geometry (locked 1080×1350), the 8-slide
  architecture, and the shared components. Reads only `--tokens`; contains no
  colours or typefaces of its own.
- **`texture.css`** — the "cut, don't render" layer: halftone screens, film
  grain, torn edges, tape, photocopy contrast, duotone. Pure CSS/SVG, no image
  files and no network. A theme opts in per surface.
- **`themes/NN-name.css`** — tokens only, ~25 lines. Each declares the faces it
  needs in an `@fonts` comment, which the renderer parses and base64-inlines
  (Google Fonts is unreachable from the build container).
- **`layouts/NN-name.css`** — that theme's **composition**: how its frames are
  built and which components it owns. This is the file that stops a theme from
  being a recolour of another theme's layout.
- **`templates/NN-name.html`** — the 8-slide structure, ready to copy into
  `decks/<slug>/deck.html` and have its words replaced.
- **`NN-name.md`** — the written spec each theme was derived from: principles,
  colour shares, type scale, components, voice.

A theme is only usable when all four of tokens, layout, template and spec
exist. `scripts/pick-theme.mjs` refuses to select an incomplete one.

## Rotating

`design/ROTATION` lists the active themes in order; `node scripts/pick-theme.mjs`
prints the one for the current month. Selection is `month_index % count`, derived
from the calendar rather than a stored pointer — nothing to advance, and a
missed build cannot desynchronise the sequence.

Rotate **monthly**, not per post. A look needs roughly a dozen posts to
register; changing every post means never accumulating any visual equity.

Because selection is modulo the list length, **adding or removing a theme can
change the current month's pick.** Check before you edit the list: the seven
active themes keep `03-vistto-mono` at index 2 precisely so the September 2026
pick did not move when the list grew from three to seven.

## What carried over from the references, and what did not

The six source systems lean heavily on photography — archive objects, LA
streets, desks, portraits. This pipeline renders pure HTML with no image
source, so each theme's photographic role is rebuilt from texture rather than
faked: a halftone-screened panel where a scanned product shot would sit, a
crushed black field with grain and a bottom gradient where the LA photography
would, borrowed interface parts (detection boxes, save marks) doing the framing
the photograph did. Nothing here pretends to be a picture, and no illustration
stands in for one — where a system's frame depended entirely on a photograph,
that frame was dropped.

Frame ratios were normalised to 4:5. The source specs variously call for 1:1,
4:5 and 9:16, but an Instagram carousel must be one ratio throughout and
`scripts/render-deck.mjs` asserts 1080×1350.

## Two traps worth knowing

- **`hr` ignores inherited colour.** Chrome's UA sheet sets `hr{color:gray}`,
  which beats inheritance, so `currentColor` on a rule renders grey unless the
  element resets `color:inherit`. `base.css` does.
- **An accent that is also a field is invisible on that field.** Street
  Manifesto's tomato is both; every accent mark there routes through a
  `--st-mark` token that flips per field rather than reading `--accent` directly.
