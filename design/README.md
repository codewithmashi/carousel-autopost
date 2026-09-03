# Design system — skeleton + rotating theme

The carousel is split in two so the look can change without the structure moving.

- **`base.css`** — the skeleton. Slide geometry (locked 1080×1350), the 8-slide
  architecture, and every component. Reads only `--tokens`; contains no colours
  or typefaces of its own.
- **`themes/NN-name.css`** — one theme = one set of tokens, ~25 lines. Each
  declares the fonts it needs in an `@fonts` comment, which the renderer parses
  and base64-inlines (Google Fonts is unreachable from the build container).
- **`NN-name.md`** — the written spec each theme was derived from: principles,
  colour shares, type scale, components, voice.

## Rotating

Change the theme `<link>` in a deck's `deck.html`. Nothing else moves — the
copy, the structure and the 8-slide flow are untouched.

Rotate on a **monthly** cadence, not per post. A look needs ~12 posts to
register; changing every post means never accumulating any visual equity.

## What carried over from the references, and what did not

The six source systems lean heavily on photography — archive objects, LA
streets, desks, portraits. This pipeline renders pure HTML with no image
source, so what is implemented is the type-led half of each system: flat
colour fields, the two-voice type contrast, and the drawn components
(highlight block, underline, accent word, watermark glyph, ledger, pill).

Frame ratios were normalised to 4:5. The source specs variously call for 1:1,
4:5 and 9:16, but an Instagram carousel must be one ratio throughout and
`scripts/render-deck.mjs` asserts 1080×1350.
