<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        standards/design-quality.md
# description: Design quality standard for SvelteKit components built through Conduit convoys.
# owner:       BOTH
# update:      Manual as design standards evolve.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Every convoy-built SvelteKit component:** state design intent in one sentence BEFORE coding — if you can't, it's not ready.
- **Use the design system:** type scale + CSS color variables only (no hardcoded hex/px), spacing scale, one visual entry point per screen.
- **Motion must communicate** and respect `prefers-reduced-motion`; no decorative entrance animations.
- **WCAG 2.1 AA is non-negotiable** — axe-core violations block Gate 4.
- **No generic template patterns** — size/emphasis reflects content priority; data-heavy screens need density.

# Design Quality Standard

Applies to every SvelteKit component built through a Conduit convoy. Works alongside `sveltekit.md` (which covers framework rules). This file covers design intent.

---

## Rule 1: Design Intent Before Code

Before writing any component, state the design intent in the living spec or workstream notes:

- **What is the user trying to accomplish?**
- **What should the component feel like?** (fast, calm, authoritative, playful)
- **What existing pattern does it extend or replace?**

Do not start coding a component with "make a card that shows X." Start with "the user needs to scan 20 items quickly and act on 2-3 of them — the layout should emphasize scanability over detail."

**Gate check:** If a component cannot articulate its design intent in one sentence, it is not ready for implementation.

---

## Rule 2: Typography Pairing

Use the design system's type scale. Do not invent sizes.

- **Headings:** Use CSS custom properties (`--font-heading`, `--font-size-*`)
- **Body:** Use the base font stack — never override with a random Google Font
- **Hierarchy:** Every screen must have exactly one visual entry point (largest/boldest element). If two things compete for attention, the hierarchy is broken.
- **Monospace:** Use `--font-mono` for code, data, and IDs only

**Forbidden:** Mixing more than 2 font families on one screen. Using font-size in px without the CSS variable.

---

## Rule 3: Color System via CSS Variables

All color must come from the design system's CSS custom properties.

```css
/* CORRECT — uses the system */
background: var(--color-surface);
color: var(--color-text-primary);
border: 1px solid var(--color-border);

/* WRONG — hardcoded */
background: #f5f5f5;
color: #333;
```

- **Semantic names only:** `--color-success`, `--color-warning`, `--color-danger` — never raw hex in component styles
- **Dark mode:** If you use CSS variables, dark mode works automatically. If you hardcode colors, it breaks.
- **Accent color:** One accent color per module. Defined in the module's root layout, not per-component.

**Forbidden:** Inline `style="color: #xxx"` in Svelte templates. Hardcoded hex/rgb in `<style>` blocks.

---

## Rule 4: Motion With Purpose

Animation must communicate something. If it does not, remove it.

**Allowed motion:**
- **Feedback:** Button press confirmation, form submission state, loading indicators
- **Orientation:** Page transitions that show spatial relationship (slide left = going deeper)
- **Attention:** Drawing the eye to a change that just happened (new item added, status changed)

**Forbidden motion:**
- Decorative entrance animations on page load (fade-in-up on every card)
- Parallax scrolling
- Animation that plays every time a component re-renders
- Motion that cannot be disabled (respect `prefers-reduced-motion`)

```css
/* Always include this */
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

---

## Rule 5: Accessibility (WCAG 2.1 AA)

Non-negotiable. Every component must meet these:

- **Color contrast:** 4.5:1 for normal text, 3:1 for large text (18px+ bold or 24px+ regular)
- **Keyboard navigation:** Every interactive element reachable via Tab, operable via Enter/Space
- **Focus indicators:** Visible focus ring on every interactive element — never `outline: none` without a replacement
- **Screen reader:** All images have `alt` text. All icon-only buttons have `aria-label`. Form inputs have associated labels.
- **Landmarks:** Use semantic HTML (`<main>`, `<nav>`, `<aside>`, `<header>`) before reaching for `<div>`

**Gate check at Stage 4:** QA agent runs axe-core. Any violation blocks the QA gate.

---

## Rule 6: No Generic Patterns

Components built through Conduit should look like they were designed for this specific use case — not pulled from a template gallery.

**Signs of generic/cookie-cutter design:**
- Card grid where every card is the same size regardless of content importance
- Default border-radius (8px) on everything
- Gray-on-white with no visual identity
- Dashboard layout that looks like every SaaS admin panel
- Placeholder illustrations or generic icons where specific content should be

**What to do instead:**
- Size and emphasis should reflect content priority
- Use the color system to create visual identity per module
- If a layout looks like it could belong to any product, it needs more design intent
- Data-heavy screens need density — do not wrap everything in padded cards

---

## Rule 7: Spatial Composition

Whitespace is a design tool, not a default.

- **Consistent spacing:** Use the spacing scale (`--space-1` through `--space-8`). Do not mix `margin: 12px` with `margin: 1rem` with `margin: 16px`.
- **Group by proximity:** Related items closer together, unrelated items farther apart. This is the primary way users understand relationships on screen.
- **Alignment:** Every element on screen should align to something. If an element floats alone with no alignment relationship, the layout needs work.
- **Density:** Data tools can be dense. Not every list needs 16px padding between items. Match density to the user's task — scanning 50 items is different from reading 3.

---

## How This Gets Checked

| Stage | Check | Who |
|---|---|---|
| Stage 2 (Design) | Design intent stated in living spec | Architect at Gate 2 |
| Stage 3 (Implementation) | CSS variables used, no hardcoded colors/sizes, semantic HTML | Code review at Gate 3 |
| Stage 4 (QA Unit) | axe-core accessibility scan, keyboard nav test | QA agent at Gate 4 |
| Stage 6 (QA Regression) | Visual regression — component matches design intent | QA agent at Gate 6 |

---

## Related Standards

- `sveltekit.md` — Framework rules (server/client boundary, runes, form actions, auth)
- `tech-stack.md` — Version requirements and stack decisions
- `ai-app-standards.md` — Additional rules for AI-powered features
