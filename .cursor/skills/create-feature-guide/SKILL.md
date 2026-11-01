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
3. **Write the ready guide** — replace `draft(...)` with a full `FeatureGuide` object (`status: 'ready'`). Follow **Body writing & typography** below.
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

## Body writing & typography

Renderer: `src/components/guides/GuideMarkdown.tsx`. Do not invent HTML or extra markdown flavors beyond what it supports.

**Supported markdown:** `##` / `###`, `**bold**`, `` `code` ``, `- ` lists, `>` callouts, and `![alt](ref:id)` images. No tables, links, or HTML.

**How the renderer styles it** (keep content matching this intent):

| Construct | Visual role |
| --- | --- |
| `##` section | Sidebar brand green (`text-emerald-400/90`) + left bar — main sections only (`How it works` / `How to interpret` / `Example`) |
| `###` subsection | Small sky uppercase label — break long sections into named chunks |
| Body / lists | Slightly indented under the section; lists further inset |
| `**bold**` | Bold **white** (not mint) — UI labels and key terms |
| `` `code` `` | Emerald chip — formulas / literal tokens |
| `> …` | Sky callout box — one sharp teaching point or definition |

**Writing rules — avoid a wall of text:**

1. Keep paragraphs short (1–3 sentences). Prefer lists over dense prose.
2. Use `###` subsections whenever a `##` section covers more than one control group or idea.
3. Put the user’s focus concepts in `>` callouts (definitions, “what this answers”, one-line takeaways). One idea per callout.
4. Do not color teaching emphasis with mint/emerald in the prose — bold white + callouts carry emphasis; green is reserved for `##` headings (and code chips).
5. Name real UI labels with `**bold**`.

## Body template

```markdown
## How it works

[One short opener: what this feature changes vs what stays fixed.]

### [Control group or step]

- **Label** — what it does
- **Label** — what it does

> Optional one-line caveat or side effect.

## How to interpret

[How to read the output. What “better” means.]

> **Key term** — crisp definition the user must remember.

## Example

[One small numeric toy example. Prefer values you can reproduce from the lib.]

- Bullet the comparison

![Alt text matching the figure](ref:figure-id)
```

Omit the image line entirely when there is no illustration.

Tone: direct, second person or impersonal; teach the mental model, not marketing.

**Reference ready bodies:** `overview.runway`, `income-cost.monthly`, `comparables.cagrChart`, `portfolio.goal`.

## Illustration (only if requested)

1. Asset under `public/guides/`, path like `/guides/<feature-slug>.svg` (or `.jpg` if raster).
2. Add `references: [{ id, src, alt, caption? }]` and `![...](ref:id)` in the body.
3. **SVG must be XML-safe ASCII** — no em dashes, fancy arrows, or `×`; use `-`, `=`, `~`, `x`. Invalid control chars break `<img>` rendering.
4. **Design for the narrow guide rail** (~280–384px):
   - Prefer **stacked** vertical layout (not wide side-by-side).
   - Target ~640px wide artboard; large type (title ≥24px, body ≥15px, labels ≥16px).
   - **Never put dark text inside short colored bars** — labels sit **beside** bars in `#ffffff`.
   - High contrast: white/near-white reading text on dark panels; mint (`#6ee7b7` / `#34d399`) for accents/titles only in the **illustration**, not in guide body prose.
5. Spot-check the asset URL in the browser after writing; hard-refresh if cached.

## Wiring checklist

- [ ] `teachings.ts` entry `status: 'ready'` with full body
- [ ] Body follows typography / anti–wall-of-text rules above
- [ ] `location.anchor` matches DOM `data-guide-anchor`
- [ ] `FeatureGuideButton` on the feature heading (when a dedicated section exists)
- [ ] Figure asset + `references` **only if user asked**
- [ ] Test assertion for ready (+ figure ref if any)
- [ ] Vitest pass

## Reference examples

- Ready with figure: `overview.runway`, `comparables.cagrChart`, `portfolio.goal` in `src/lib/teachings.ts`
- Ready without figure: `income-cost.monthly`
- Still draft: `comparables.upsideChart`
- Markdown renderer: `src/components/guides/GuideMarkdown.tsx`
- Button: `src/components/guides/FeatureGuideButton.tsx`
