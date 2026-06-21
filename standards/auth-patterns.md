<!--
# ── CONDUIT MANAGED FILE ────────────────────────────────────────────
# file:        standards/auth-patterns.md
# description: Auth implementation rules and patterns (OIDC SSO via your identity provider + MSAL Node)
# owner:       HUMAN
# update:      Manual when standards change.
# schema:      none
# last_update: 2026-06-10
# ─────────────────────────────────────────────────────────────────────
-->

## TL;DR
- **Non-negotiables:** auth guard in `hooks.server.ts`, user from `event.locals.user`; never expose tokens to the browser; sessions = httpOnly cookies; auth routes in `PUBLIC_PATHS`.
- **OIDC SSO via MSAL Node** — login + callback routes per the patterns here; validate JWTs against the JWKS endpoint.
- **Local fallback:** no `OIDC_CLIENT_ID` → `/auth/local`; adding env vars activates SSO with no code change.

# Auth Patterns

## Rules (non-negotiable)

- Auth guard lives in `hooks.server.ts` — routes get the authenticated user from `event.locals.user`, never from the request body
- Never expose tokens (access tokens, client secrets) to the browser
- Sessions are stored as httpOnly cookies — not in the database, not in localStorage
- All auth routes (`/auth/login`, `/auth/callback`, `/auth/local`) must be in `PUBLIC_PATHS` in the hook

## Identity Provider App Registration

Register an OIDC application with your identity provider. Per app, provision:
- `OIDC_CLIENT_ID` — safe in env vars (not secret)
- `OIDC_CLIENT_SECRET` — treat like a password
- `OIDC_TENANT_ID` — your provider tenant/directory identifier
- Reply URL: `https://<your-app-host>/auth/callback`

Some organizations restrict who can register applications with the identity provider — request access from whoever administers it if you cannot self-serve.

Add to Terraform `app_settings`:
```hcl
"OIDC_CLIENT_ID"     = "<from your identity provider>"
"OIDC_CLIENT_SECRET" = "<from your identity provider>"
"OIDC_TENANT_ID"     = "<your tenant/directory id>"
```

## MSAL Node Flow

> The examples below use MSAL Node against a Microsoft-style OIDC endpoint. Any standards-compliant OIDC provider (Auth0, Okta, Keycloak, Google, etc.) works the same way — swap the authority URL and use the provider's OIDC client library.

### Login route (`/auth/login/+server.ts`)

```typescript
import { redirect } from '@sveltejs/kit';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { env } from '$env/dynamic/private';

export const GET = async ({ url }) => {
  if (!env.OIDC_CLIENT_ID) {
    throw redirect(302, '/auth/local');  // local fallback when SSO not configured
  }
  const msalApp = new ConfidentialClientApplication({
    auth: {
      clientId: env.OIDC_CLIENT_ID,
      authority: `${env.OIDC_AUTHORITY}/${env.OIDC_TENANT_ID}`,  // e.g. https://login.microsoftonline.com/<tenant>
      clientSecret: env.OIDC_CLIENT_SECRET
    }
  });
  const authUrl = await msalApp.getAuthCodeUrl({
    scopes: ['openid', 'profile', 'email'],
    redirectUri: `${env.ORIGIN}/auth/callback`
  });
  throw redirect(302, authUrl);
};
```

### Callback route (`/auth/callback/+server.ts`)

```typescript
import { redirect } from '@sveltejs/kit';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db/index.js';
import { users } from '$lib/server/db/schema/index.js';

export const GET = async ({ url, cookies }) => {
  const code = url.searchParams.get('code');
  if (!code) throw redirect(302, '/auth/login');

  const msalApp = new ConfidentialClientApplication({
    auth: {
      clientId: env.OIDC_CLIENT_ID,
      authority: `${env.OIDC_AUTHORITY}/${env.OIDC_TENANT_ID}`,
      clientSecret: env.OIDC_CLIENT_SECRET
    }
  });
  const result = await msalApp.acquireTokenByCode({
    code,
    scopes: ['openid', 'profile', 'email'],
    redirectUri: `${env.ORIGIN}/auth/callback`
  });

  const subjectId = result.account?.homeAccountId ?? '';
  const email = result.account?.username ?? '';
  const displayName = result.account?.name ?? email;

  await db.insert(users)
    .values({ subjectId, email, displayName })
    .onConflictDoUpdate({
      target: users.subjectId,
      set: { displayName, updatedAt: new Date() }
    });

  cookies.set('session', subjectId, {
    path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 * 60 * 8
  });
  throw redirect(302, '/dashboard');
};
```

## Auth Guard (`hooks.server.ts`)

```typescript
import { redirect, type Handle } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { users } from '$lib/server/db/schema/index.js';
import { eq } from 'drizzle-orm';

const PUBLIC_PATHS = ['/auth/login', '/auth/local', '/auth/callback'];

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');
  if (sessionId) {
    const [user] = await db.select().from(users)
      .where(eq(users.subjectId, sessionId)).limit(1);
    event.locals.user = user ?? null;
  } else {
    event.locals.user = null;
  }

  const isPublic = PUBLIC_PATHS.some(p => event.url.pathname.startsWith(p));
  if (!event.locals.user && !isPublic) {
    throw redirect(302, '/auth/login');
  }
  return resolve(event);
};
```

## JWT Validation

The identity provider issues signed JWTs. Validate against its JWKS endpoint (no central auth service needed):

```typescript
// src/lib/server/auth/validateToken.ts
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const client = jwksClient({
  jwksUri: `${OIDC_AUTHORITY}/${OIDC_TENANT_ID}/discovery/v2.0/keys`  // use your provider's JWKS URL
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  client.getSigningKey(header.kid, (err, key) => {
    callback(err, key?.getPublicKey());
  });
}

export async function validateToken(token: string): Promise<TokenPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, {
      audience: OIDC_CLIENT_ID,
      issuer: `${OIDC_AUTHORITY}/${OIDC_TENANT_ID}/v2.0`
    }, (err, decoded) => {
      if (err) reject(err);
      else resolve(decoded as TokenPayload);
    });
  });
}
```

## Local Fallback (Development)

When `OIDC_CLIENT_ID` is not set, login redirects to `/auth/local`. The local form collects name + email, upserts the user with `subjectId = local:<email>`, and sets the same session cookie. No code changes are needed when switching to SSO — adding the env vars activates it automatically.

## Session Storage

- Cookie value = `subjectId` from the DB (`local:user@email.com` or the provider's `homeAccountId`/`sub` GUID)
- `hooks.server.ts` does a DB lookup on every request (one DB hit per request — acceptable for small teams on a small instance)
- For higher-traffic apps: add an in-module `Map` cache with TTL to reduce DB load

## Calling External REST APIs — OAuth, not long-lived tokens

When an app calls an external service's REST API, prefer **OAuth access tokens** from your identity provider over long-lived personal access tokens (PATs).

**Why not PATs:** PATs are user-scoped and require manual rotation. OAuth tokens are app-scoped, short-lived, and automatically refreshed. Same access level — no capability loss.

**How:** Request a token from MSAL (or your OIDC client) scoped to the target API's resource/audience, then pass it as `Authorization: Bearer <token>`.
