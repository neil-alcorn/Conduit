<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        standards/drizzle-patterns.md
# description: Drizzle ORM rules, migration workflow, and query patterns
# owner:       HUMAN
# update:      Manual when standards change.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **All schema definitions live in `conduit-core/src/db/schema/`** — never define tables in an app repo; import via the `$lib/server/db/schema` barrel or `@conduit/core/db`.
- **All DB access through `src/lib/server/db/index.ts`** — never import postgres directly in routes.
- **Migrations:** `db:generate`, commit SQL + `meta/_journal.json`; never migrate production manually.
- **Conventions:** snake_case columns / camelCase props, `createdAt`+`updatedAt`, `text` IDs, `boolean` flags. Schema `index.ts` re-exports use bare names (no `.js`) or drizzle-kit breaks.

# Drizzle Patterns

## Rules (non-negotiable)

- All DB access through `src/lib/server/db/index.ts` — never import postgres directly in routes
- **All Drizzle schema definitions live in `conduit-core/src/db/schema/`.** Never define new table schemas in a SvelteKit app's own `src/lib/server/db/schema/` directory. This is the canonical platform rule established by convoy `ws-conduit-core-schemas`.
- Migration SQL files and `meta/_journal.json` MUST be committed — the pipeline depends on them
- Do not run `drizzle-kit migrate` against production manually; let the pipeline handle it

## Schema Ownership (Platform Architecture)

Schema definitions belong in `conduit-core`. Application repos import them as a package dependency.

### Import pattern in application routes

```typescript
// ✅ Correct — import from conduit-core via the app's schema barrel
import { users, tasks, checkins } from '$lib/server/db/schema';

// ✅ Also correct — import directly from @conduit/core/db
import { users, tasks } from '@conduit/core/db';
```

The `$lib/server/db/schema` barrel (`<app>/src/lib/server/db/schema/index.ts`) re-exports everything from `@conduit/core/db`. Both import paths work and resolve to the same definitions.

### Workspace link setup (for new application repos)

To consume conduit-core schemas in a new repo:

1. Add to `package.json` dependencies:
   ```json
   "@conduit/core": "file:../conduit-core"
   ```

2. Run `npm install` — creates a symlink in `node_modules/@conduit/core`.

3. Add to `vite.config.ts`:
   ```typescript
   import { resolve } from 'path';

   export default defineConfig({
     plugins: [sveltekit()],
     resolve: {
       dedupe: ['drizzle-orm'],
       alias: [
         { find: '@conduit/core/db', replacement: resolve('../conduit-core/src/db/index.ts') },
         { find: '@conduit/core', replacement: resolve('../conduit-core/src/index.ts') },
       ]
     }
   });
   ```
   The `dedupe` prevents duplicate drizzle-orm instances. The aliases bypass `dist/` output — Vite resolves conduit-core's TypeScript source directly.

4. Add to `drizzle.config.ts`:
   ```typescript
   schema: '../conduit-core/src/db/schema/*.ts',
   ```
   drizzle-kit resolves the glob relative to the config file and reads schema definitions from conduit-core's source.

5. Run `npm install` in conduit-core if it has no `node_modules` — required so Rollup can resolve `drizzle-orm` from conduit-core's file location during bundling.

## Schema Location and Structure

```
src/lib/server/db/
  index.ts          ← db client (import this everywhere)
  schema/
    index.ts        ← re-exports all tables (use bare imports here — see gotcha below)
    users.ts
    ideas.ts
    ...
drizzle/
  migrations/
    0000_*.sql      ← MUST commit
    meta/
      _journal.json ← MUST commit
drizzle.config.ts
```

## Schema Definition Example

```typescript
// src/lib/server/db/schema/users.ts
import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  subjectId:   text('subject_id').primaryKey(),
  email:       text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  isAdmin:     boolean('is_admin').notNull().default(false),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow()
});
```

Schema conventions:
- `snake_case` column names, `camelCase` TypeScript properties
- Always include `createdAt` and `updatedAt`
- Use `text` for IDs (UUIDs, identity-provider subject IDs), not `serial`/`integer` unless auto-increment is required
- Use `boolean` not `integer` for flags
- Use `timestamp` not `date` for datetime values

## DB Client

```typescript
// src/lib/server/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema/index.js';

const client = postgres(env.DATABASE_URL);
export const db = drizzle(client, { schema });
```

## Migration Workflow

```bash
# 1. Edit schema TypeScript files
# 2. Generate SQL migration
npm run db:generate

# 3. Commit both files
git add drizzle/migrations/XXXX_*.sql drizzle/migrations/meta/_journal.json

# 4. Pipeline applies migration on deploy
npm run db:migrate   # runs drizzle-kit migrate with DATABASE_URL set
```

`DATABASE_URL` format:
```
postgresql://<login>:<password>@<host>:<port>/<dbname>?sslmode=require
```

## Common Query Patterns

### Upsert
```typescript
await db.insert(users)
  .values({ subjectId, email, displayName })
  .onConflictDoUpdate({
    target: users.subjectId,
    set: { displayName, updatedAt: new Date() }
  });
```

### Select with filter
```typescript
const [user] = await db.select()
  .from(users)
  .where(eq(users.subjectId, sessionId))
  .limit(1);
```

### Select with join
```typescript
const results = await db.select({ idea: ideas, author: users })
  .from(ideas)
  .leftJoin(users, eq(ideas.authorId, users.subjectId))
  .where(eq(ideas.status, 'published'));
```

### Delete
```typescript
await db.delete(ideas).where(eq(ideas.id, ideaId));
```

### Count
```typescript
const [{ count }] = await db.select({ count: sql<number>`count(*)` })
  .from(votes)
  .where(eq(votes.ideaId, ideaId));
```

## Critical Gotcha: CJS/ESM in Schema Index

drizzle-kit runs in CJS mode. The schema `index.ts` re-exports must use **bare module names** (no `.js` extension):

```typescript
// ✅ Correct — schema/index.ts
export * from './users';
export * from './ideas';

// ❌ Wrong — breaks drizzle-kit generate
export * from './users.js';
```

The `.js` extension is required everywhere else in SvelteKit (ESM resolution), but NOT in the schema index that drizzle-kit reads.
