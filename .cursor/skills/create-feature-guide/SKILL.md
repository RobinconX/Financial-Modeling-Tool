---
name: create-feature-guide
description: >-
  Create or promote in-app feature guide entries in teachings.ts (ready status,
  markdown body, optional illustration, FeatureGuideButton wiring, tests). Use
  when the user asks to add/write/fill a guide, feature guide, teaching, or
  Guide button content for a UI section.
---

# Create feature guide

## What the user supplies

1. **Which entry** — guide id and/or UI location (e.g. `portfolio.goal`, Comparables CAGR chart).
2. **Concepts to emphasize** — teaching points that must land clearly.
3. **Illustration** — only if they ask for one. **If they do not ask, do not add a figure, `references`, or image markdown.**

Fill everything else: accurate how-to-use coverage of the relevant UI/controls, interpretation, and a small numeric example grounded in real app behavior.

## Workflow

1. **Locate the entry** in `src/lib/teachings.ts` (often already a `draft(...)`).
2. **Read the feature** — panel/component + lib math the UI calls. Match real labels, modes, and edge cases (InfoTips are a good source).
3. **Write the ready guide** — replace `draft(...)` with a full `FeatureGuide` object (`status: 'ready'`).
4. **Wire the Guide button** if missing: `<FeatureGuideButton id="..." />` near the section title; ensure `data-guide-anchor` matches `location.anchor`.
5. **Illustration only if requested** — see below.
6. **Test** — extend `tests/lib/teachings.test.ts` for ready status, location, parent, and figure refs when present.
7. **Verify** — `npx vitest run tests/lib/teachings.test.ts`.

## Registry shape

```ts
{
  id: 'tab.feature',           // stable FeatureGuideId
  title: '...',                // UI-facing name
  summary: '...',              // 1–2 sentences; teaching point + what it shows
  body: `...`,                 // markdown — see template
  references?: [...],          // ONLY if illustration requested
  status: 'ready',
  location: { tab, view?, anchor },  // anchor === data-guide-anchor
  parentId: 'parent-id' | null,
  order: number,
}
```

- Prefer promoting an existing draft id over inventing a new one.
- `FeatureGuideButton` renders only when `status === 'ready'`.
- Drafts stay openable from the guide index as stubs; in-feature Guide buttons stay hidden.

## Body template

Supported markdown only: `##` / `###`, `**bold**`, `` `code` ``, `- ` lists, and `![alt](ref:id)` images. No tables, links, or HTML.

```markdown
## How it works

[What the user sets. What each control/mode does. What the chart/table computes.
Name real UI labels. Note side effects (e.g. custom extras never write back).]

## How to interpret

[How to read the output. What “better” means. Call out the user’s focus concepts
explicitly. Disambiguate easy-to-confuse metrics.]

## Example

[One small numeric toy example with concrete numbers. Prefer values you can
reproduce from the lib. Bullet the comparison.]

![Alt text matching the figure](ref:figure-id)
```

Omit the image line entirely when there is no illustration.

Tone: direct, second person or impersonal; teach the mental model, not marketing.

## Illustration (only if requested)

1. Asset under `public/guides/`, path like `/guides/<feature-slug>.svg` (or `.jpg` if raster).
2. Add `references: [{ id, src, alt, caption? }]` and `![...](ref:id)` in the body.
3. **SVG must be XML-safe ASCII** — no em dashes, fancy arrows, or `×`; use `-`, `=`, `~`, `x`. Invalid control chars break `<img>` rendering.
4. **Design for the narrow guide rail** (~280–384px):
   - Prefer **stacked** vertical layout (not wide side-by-side).
   - Target ~640px wide artboard; large type (title ≥24px, body ≥15px, labels ≥16px).
   - **Never put dark text inside short colored bars** — labels sit **beside** bars in `#ffffff`.
   - High contrast: white/near-white reading text on dark panels; mint (`#6ee7b7` / `#34d399`) for accents/titles only.
5. Spot-check the asset URL in the browser after writing; hard-refresh if cached.

## Wiring checklist

- [ ] `teachings.ts` entry `status: 'ready'` with full body
- [ ] `location.anchor` matches DOM `data-guide-anchor`
- [ ] `FeatureGuideButton` on the feature heading (when a dedicated section exists)
- [ ] Figure asset + `references` **only if user asked**
- [ ] Test assertion for ready (+ figure ref if any)
- [ ] Vitest pass

## Reference examples

- Ready with figure: `comparables.cagrChart`, `portfolio.goal` in `src/lib/teachings.ts`
- Still draft: `comparables.upsideChart`
- Markdown renderer: `src/components/guides/GuideMarkdown.tsx`
- Button: `src/components/guides/FeatureGuideButton.tsx`
