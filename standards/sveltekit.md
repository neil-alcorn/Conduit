<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        standards/sveltekit.md
# description: SvelteKit-specific gotchas and standards.
# owner:       HUMAN
# update:      Manual as new issues are discovered.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Run `npx svelte-kit sync` before tests in any fresh shell/CI** — without it, path aliases break confusingly.
- **Never import `$lib/server/` from client code**; auth lives ONLY in `hooks.server.ts` — public routes go in `PUBLIC_PATHS`, never self-bypass.
- **Svelte 5:** wrap prop-initialized `$state` in `untrack()`; all action forms use `use:enhance`.
- **Migrations:** `db:generate` → review SQL → `db:migrate` → commit schema + migration together; never hand-edit generated SQL.
- New modules follow the 8-step registration pattern (schema → API → page → nav → auth → help → tests → ACs).

# SvelteKit Standards

Discovered during a platform-buildout convoy (Stage 3). Applies to every SvelteKit work stream.

---

## 1. Run `svelte-kit sync` before `vitest`

**Rule:** Always precede `npm run test` with `npx svelte-kit sync` (or `npm run sync` if defined) in any new shell session.

**Why:** `tsconfig.json` extends `.svelte-kit/tsconfig.json`, which is generated at dev/sync time. Vitest loads `tsconfig.json` at startup. If `.svelte-kit/` does not exist (fresh clone, clean CI runner), all TypeScript path aliases (`$lib/*`, `$env/*`) resolve incorrectly and tests fail with confusing import errors.

**CI fix:** Add `svelte-kit sync` as a pre-test step in any pipeline that runs `npm run test`.

**Local:** Once `.svelte-kit/` exists from a `npm run dev` session, you don't need to repeat it. But after `git clean -fd` or on a fresh checkout, run sync first.

---

## 2. `$lib/server/` boundary — never import in client code

**Rule:** Any file under `src/lib/server/` must never be imported from a `.svelte` component directly (client-side). This includes `db/index.ts`, `auth.ts`, `ai/openai.ts`.

**Why:** SvelteKit's bundler will surface this as a build error, but the error message is confusing. The root cause is always a server-only import in a component file.

**Correct pattern:**
- Data flows from `+page.server.ts` (server) → `+page.svelte` (client) via `data` prop
- Never call `db.select(...)` from a `.svelte` file

---

## 3. Svelte 5 runes — `untrack()` for state initialized from props

**Rule:** When initializing `$state` from a `$props()` value, wrap it in `untrack()`.

**Why:** Without `untrack()`, Svelte 5 creates a reactive dependency on the prop during state initialization, causing double-execution or infinite loops in some patterns.

```typescript
// WRONG — may cause reactivity loop
let items = $state($props().initialItems);

// CORRECT
import { untrack } from 'svelte';
let items = $state(untrack(() => $props().initialItems));
```

---

## 4. Form actions — always use `use:enhance`

**Rule:** All `<form>` elements using SvelteKit actions must include `use:enhance`.

**Why:** Without `use:enhance`, form submission causes a full page reload. With it, SvelteKit handles the action via `fetch` and re-runs `load()` seamlessly. This is progressive enhancement — it degrades gracefully if JS is off.

---

## 5. Auth is ONLY in `hooks.server.ts` — never in routes

**Rule:** Never check `locals.user` for null or redirect in a `+page.server.ts` file. The hook handles all auth. Routes may assume `locals.user` is populated on protected routes.

**Why:** Auth checks in routes create inconsistency — some routes protect themselves, others don't. One missed check = a vulnerability. The hook is the single gate.

**PUBLIC_PATHS exception:** Routes that must be accessible without login (e.g., `/plan/share/[shareId]`, `/auth/*`) must be added to the `PUBLIC_PATHS` array in `hooks.server.ts`, not bypassed in the route itself.

---

## 6. Drizzle migration workflow

**Rule:** Follow this order exactly. Never skip steps.

```bash
# 1. Make schema changes in src/lib/server/db/schema/
# 2. Generate migration (never hand-write SQL)
npm run db:generate

# 3. Review generated SQL before committing
# 4. Run migration in dev
npm run db:migrate

# 5. Commit both the schema change AND the migration file together
```

**Never:** Edit generated migration files manually. If the generated SQL is wrong, fix the schema and regenerate.

---

## 7. Seed script — `npm run db:seed:<module>`

A module may ship a seed script to populate local/dev data.

```bash
npm run db:seed:<module>
# Requires DATABASE_URL in .env.local
# Safe to run multiple times — checks for existing data before inserting
# Creates a small set of representative rows for the module
```

**Pattern:** Seed scripts live in `scripts/` and use `tsx` + `dotenv`. They import schema tables directly (no SvelteKit env wrapping). They must check for existing data before inserting to be idempotent.

**Test implications:** Logic-only unit tests (financials calculations, nav role checks) are framework-safe and do not require seeded data. Integration tests that need DB rows must use `db:seed:plan` first and be flagged as `@integration` in CI.

**For new modules:** Create `scripts/seed-[module].ts` following the same pattern and add `"db:seed:[module]": "tsx scripts/seed-[module].ts"` to `package.json`.

---

## 8. Module registration pattern

When adding a new module to a SvelteKit app:

1. **Schema** → `src/lib/server/db/schema/[module].ts` + export from `schema/index.ts`
2. **API routes** → `src/routes/api/[module]/+server.ts`
3. **Pages** → `src/routes/[module]/+page.svelte` + `+page.server.ts`
4. **Nav entry** → `src/routes/+layout.svelte` — add to correct section with role gate
5. **Auth** → if public, add to `PUBLIC_PATHS` in `hooks.server.ts`
6. **Help** → add `appModule` context to the help and feedback reporters on the module page
7. **Tests** → `tests/[module].test.ts` with at least one test per AC
8. **QA/ACCEPTANCE.md** → add AC entries for the new module before Stage 0 gate
