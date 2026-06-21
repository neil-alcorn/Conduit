<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        standards/ai-app-standards.md
# description: Required features and integration patterns for all AI-powered apps
# owner:       HUMAN
# update:      Manual when standards change.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Every AI app ships 4 required features** (as Stage 1 ACs): AI instructions/persona, feedback+bug reporter, AI help page, live/mock data indicator.
- **Models: OpenAI** — `gpt-4o-mini` default, `gpt-4o` only for multi-step reasoning; key in your secrets manager.
- **Env:** `$env/dynamic/private`, never `process.env`; do NOT set `OPENAI_ORG_ID`/`OPENAI_PROJECT_ID` (401s); lazy-singleton client.
- Feedback flow (categorize → compose → send to `FEEDBACK_EMAIL`) ships WITH the app, not after.

# AI App Standards

## 4 Required Features (every AI app must have all four)

### 1. AI Instructions / Persona
- Let users customize AI behavior: communication style, role context, preferences
- Store in a secure cookie (`pa_settings`) or user profile row
- Inject as a prefix to every AI system prompt (see pattern below)

### 2. Feedback & Bug Reporter
- Required in all apps — see the Feedback Pattern section below for the full spec

### 3. Help & Guide Page
- An AI-powered help page that answers "How do I..." questions about the app
- System prompt includes full app feature documentation
- Includes a link to report bugs/enhancements

### 4. Live / Mock Data Indicator
- Always show whether the user is seeing live data or demo data
- Use the `mock-badge` component (amber pill: "Demo data")

These four features must be represented as acceptance criteria in Stage 1 for any AI-integrated feature.

## Model Defaults

- Standard: `gpt-4o-mini` — fast, cheap, sufficient for summarization, rewriting, extraction, prioritization
- Complex reasoning: `gpt-4o` — only when multi-step reasoning is required

## User Instructions Injection Pattern

```typescript
// In every AI call, prepend user instructions if set:
const systemPrompt = userInstructions
  ? `${userInstructions}\n\n---\n\n${baseSystemPrompt}`
  : baseSystemPrompt;
```

## Environment Variable Rules

```
OPENAI_API_KEY=sk-svcacct-...
```

- Do NOT add `OPENAI_ORG_ID` or `OPENAI_PROJECT_ID` — causes 401 errors with service account keys
- Always use `$env/dynamic/private` in SvelteKit — never `process.env`

```typescript
// ✅ Correct
import { env } from '$env/dynamic/private';
export const config = { openai: { apiKey: env.OPENAI_API_KEY ?? '' } };

// ❌ Wrong — env vars will be undefined at runtime
export const config = { openai: { apiKey: process.env.OPENAI_API_KEY ?? '' } };
```

## OpenAI Client (lazy singleton)

```typescript
import OpenAI from 'openai';
import { config } from '../config';

let _client: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return _client;
}
```

## API Key

Store the team OpenAI API key in your secrets manager and grant access to developers who need it. Never commit keys to the repo.

---

## Feedback Pattern (Required)

Every application MUST include an AI-powered feedback and bug reporting mechanism. This is non-negotiable — it ships with the app, not after.

### Flow

1. User triggers "Feedback" or "Report a Bug" from any page (must be in the nav)
2. AI classifies the input (bug / enhancement / general feedback) and asks 2–3 clarifying questions
3. User answers conversationally
4. AI composes a structured report — user confirms
5. Report is emailed to the configured recipient

### Implementation (SvelteKit)

Three-step server action in `src/routes/feedback/+page.server.ts`:

| Step | Action | AI Role | Returns |
|------|--------|---------|---------|
| 1 | `categorize` | Classify input, generate follow-up questions | `{ category, questions, step: 2 }` |
| 2 | `compose` | Compile answers into structured email body | `{ subject, body, step: 3 }` |
| 3 | `send` | None — send via Graph `sendMail` or `mailto:` fallback | `{ sent: true }` |

### Email Structure

```
Subject: [Bug/Enhancement/Feedback] <App Name> — <one-line summary>

Category: Bug | Enhancement | General Feedback
App: <name>
Reported by: <user displayName> (<email>)
Date: <ISO date>

Summary: <AI-generated>
Details: <user answers compiled>
Steps to reproduce: <if bug>
Expected behavior: <if bug>
Environment: Browser, Feature/Page
```

### Configuration

- Recipient address: `FEEDBACK_EMAIL` environment variable
- Set this to the address that should receive feedback and bug reports for the app
- AI system prompt: conversational, empathetic, efficient — ask only what is needed for a clear report

### Future Extensions

- Browser/OS auto-detection
- Current page URL capture
- User activity log (last 5 actions)
- Screenshot attachment
- Error log tail
