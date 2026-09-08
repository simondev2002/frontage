# Design lab

Asks the models that lead the web-design leaderboards (GPT-5.6 Sol, Kimi K3) plus Claude
for section designs written against Frontage's design tokens, renders every candidate at
390px and 1280px on the real stylesheet, and builds a contact sheet per section for curation.
Winners get ported into `src/renderer` as new variants by hand.

```
cd server
node tools/design-lab/generate.mjs --models=claude,openai,moonshot            # all sections, both directions
node tools/design-lab/generate.mjs --models=openai --sections=hero,services   # subset
node tools/design-lab/render.mjs                                              # out/<section>/sheet.png
```

Keys: copy `.env.example` to `.env` here. Each candidate costs roughly 5 to 25 cents.

## Scoring

`node tools/design-lab/lint.mjs` prints size, data-field count and contract violations per
candidate (hardcoded colours or fonts, unscoped selectors, scripts, gradients, shadows,
missing focus styles). Taste decides between clean candidates; a candidate that breaks the
token contract is not portable and loses regardless of looks.

## Porting a winner

Each ported variant touches five places, in this order:

1. `src/ai/schema.js`: add the value to that section's `variant` enum. Sections without a
   variant today (menu, faq) get `variant: z.enum([...]).default("classic")` so old specs
   still validate.
2. `src/renderer/sections.js`: a branch that emits the candidate's markup from spec data,
   every string through `esc()`, links through `safeHref()`, photos through `img()`.
   Class names become `.<section>.<variant>` plus short child classes.
3. `src/renderer/css.js` BASE: the candidate's CSS, selectors rewritten to the class names
   above, hover transitions kept, no animation. Check dark mode and all eight presets with
   `node scripts/render-demo.js <preset>`.
4. `src/ai/prompts.js` DESIGN_GUIDE "Section variants": one line saying when to use it.
5. `ios/Frontage/Views/Editor/SectionsEditor.swift`: `variants` list and `variantLabels`.

## Ported so far

8 Sep 2026, from the Claude baseline: hero `offset` and `poster`, about `story`, services
`numbered`, testimonials `featured`, menu `ruled`, gallery `editorial` and `filmstrip`, faq
`open` and `numbered`, contact `table` and `address`, cta `framed` and `overlap`. Styles live
in `src/renderer/css-variants.js`, markup in the variant helpers at the bottom of
`src/renderer/sections.js`. Each was checked at 390 and 1280 px in warm light and luxury
dark, and without photos.
