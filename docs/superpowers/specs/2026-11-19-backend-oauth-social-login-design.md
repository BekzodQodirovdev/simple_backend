# Backend Multi-Provider OAuth Social Login — Design Spec

Date: 2026-11-19
Status: Approved (conversational design review)

## 1. Purpose

Extend the existing NestJS auth module (currently email/password with OTP
verification) to support login/registration via four external identity
providers: **Google**, **GitHub**, **Facebook**, and **Telegram**. The user
has already obtained Google, GitHub, and Facebook OAuth app credentials and
is registering a Telegram bot via BotFather.

Success criteria:
- A user can register/log in through any of the four providers and receive
  the same access/refresh token pair the existing email/password flow
  issues.
- Code stays easy to read: no Passport.js strategy abstraction, no new
  heavy library layers — each provider integration is a short, explicit,
  readable file.
- No breaking changes to the existing email/password/OTP flow.

## 2. Key Decisions (from brainstorming)

| Decision | Choice | Why |
|---|---|---|
| Integration style | Manual HTTP calls (fetch) per provider, no Passport.js | User explicitly asked to avoid "complex code" — manual flow keeps every step visible instead of hidden behind strategy/guard abstractions. |
| Account model | Single `network` field per user (existing `NetWorkEnum`), one provider per account | Matches existing code's behavior; avoids a new provider-linking table. |
| Cross-provider conflict | If the resolved email already exists under a different `network`, reject with the existing "You are logged in from another network." error | Reuses existing logic in `AuthService.login`; no new conflict-resolution logic needed. |
| Telegram identity | No real email from Telegram Login Widget, so synthesize `telegram_<id>@telegram.local` as the account's email | Avoids schema changes (no nullable email column, no new `telegram_id` column); keeps `User` entity untouched. |
| Token delivery (Google/GitHub/Facebook) | Backend redirects the browser to `${FRONTEND_URL}/auth/callback?accessToken=...` after setting the `refreshToken` httpOnly cookie | These three require a full-page browser redirect to the provider's consent screen, so the callback is a GET redirect, not a fetch — the access token must travel back to the frontend via the redirect URL. |
| Token delivery (Telegram) | Direct JSON response `{ accessToken, refreshToken, data }`, same shape as `POST /auth/login` | Telegram Login Widget flow is already a frontend `fetch`/`POST`, no redirect involved. |
| New user activation | Social logins set `is_active: true` immediately (no OTP step) | The provider has already verified the identity (or, for Telegram, the login widget itself is the verification); OTP is redundant. |

## 3. Architecture

### 3.1 Flow — Google / GitHub / Facebook (OAuth2 Authorization Code)

1. Frontend navigates the browser to `GET /api/auth/:provider` (e.g. `/api/auth/google`).
2. Backend redirects to the provider's consent URL (built from that provider's client ID + `CALLBACK_URL` + requested scopes).
3. Provider redirects back to `GET /api/auth/:provider/callback?code=...`.
4. Backend:
   a. Exchanges `code` for an access token (provider's token endpoint).
   b. Fetches the user's profile (email, name, picture) with that token.
   c. Calls the shared `AuthService.loginOrRegisterSocial({ email, name, network })`.
   d. On success: sets `refreshToken` cookie (same helper `writeToCookie` already used by `login`), redirects to `${FRONTEND_URL}/auth/callback?accessToken=...`.
   e. On conflict: redirects to `${FRONTEND_URL}/auth/callback?error=network_conflict`.

### 3.2 Flow — Telegram (Login Widget)

1. Frontend embeds the Telegram Login Widget (no `data-request-access`, so no bot "Start" prompt is ever triggered).
2. On successful widget auth, Telegram calls the frontend JS callback with `{ id, first_name, username, photo_url, auth_date, hash }`.
3. Frontend `POST`s that object as-is to `/api/auth/telegram`.
4. Backend:
   a. Recomputes the HMAC-SHA256 hash using `SHA256(TELEGRAM_BOT_TOKEN)` as the secret key, over all fields except `hash`, and compares.
   b. If mismatch → `401 Unauthorized`.
   c. If valid → builds `email = telegram_${id}@telegram.local`, `name = first_name`, calls the same `loginOrRegisterSocial({ email, name, network: TELEGRAM })`.
   d. Returns `{ accessToken, refreshToken, data }` directly (also sets the `refreshToken` cookie, consistent with `/auth/login`).

### 3.3 File structure (all new files under `src/api/auth/`, flat — no subfolder)

- `google.service.ts` — `getAuthUrl()`, `handleCallback(code)` → `{ email, name }`
- `github.service.ts` — same shape
- `facebook.service.ts` — same shape
- `telegram.service.ts` — `verifyWidgetData(data)` → `{ email, name }` or throws `UnauthorizedException`
- `auth.service.ts` — add one new method: `loginOrRegisterSocial(email, name, network): Promise<{ accessToken, refreshToken, data }>`
  - Reuses the existing token-signing code already in `login()` (refactor that signing logic into a small private helper so it is not duplicated).
  - Behavior: find user by `email`.
    - Not found → create new user (`network`, `is_active: true`, random unguessable password since the column is non-nullable but never used to log in), then issue tokens.
    - Found, `user.network === network` → issue tokens directly (no password check, since the provider already authenticated this request).
    - Found, `user.network !== network` → throw `ForbiddenException('You are logged in from another network.')` (same message `login()` already uses).
- `auth.controller.ts` — add 7 routes:
  - `GET /auth/google`, `GET /auth/google/callback`
  - `GET /auth/github`, `GET /auth/github/callback`
  - `GET /auth/facebook`, `GET /auth/facebook/callback`
  - `POST /auth/telegram`
- `auth.module.ts` — register the 4 new provider services as providers.

### 3.4 Data model changes

- `src/common/enum/network.enums.ts`: add `GITHUB = 'github'`, `FACEBOOK = 'facebook'`, `TELEGRAM = 'telegram'` to `NetWorkEnum`. (`GOOGLE` already exists; `ICLOUD` stays, unused, out of scope.)
- No changes to `User` entity or any other table.

### 3.5 Config additions (`src/config/index.ts`)

Already added by the user:
```
GOOGLE_CLIENT_ID, GOOGLE_APP_SECRET
GITHUB_CLIENT_ID, GITHUB_APP_SECRET
FACEBOOK_CLIENT_ID, FACEBOOK_APP_SECRET
FRONTEND_URL
```
Still to add:
```
GOOGLE_CALLBACK_URL
GITHUB_CALLBACK_URL
FACEBOOK_CALLBACK_URL
TELEGRAM_BOT_TOKEN
```
(`TELEGRAM_BOT_USERNAME` is a **frontend-only** value — not part of backend config.)

## 4. Error Handling

| Case | Behavior |
|---|---|
| Email already registered under a different network | Redirect flow: `${FRONTEND_URL}/auth/callback?error=network_conflict`. Telegram flow: throws the same `ForbiddenException` as today's `login()`, returned as JSON error. |
| Provider code→token exchange fails | `400 Bad Request` ("Failed to authenticate with <provider>") |
| Telegram hash invalid or `auth_date` too old (>1 day) | `401 Unauthorized` |
| Provider profile fetch fails (no email returned, etc.) | `400 Bad Request` |

## 5. Testing

- Unit test `telegram.service.ts`'s hash verification against known good/bad fixtures (pure function, easiest to test in isolation).
- Unit test `AuthService.loginOrRegisterSocial` for: new user creation, existing matching-network login, and the cross-network conflict rejection.
- `google.service.ts` / `github.service.ts` / `facebook.service.ts` are thin HTTP wrappers — covered by a light test mocking `fetch`, not exhaustive provider-contract testing.
- No E2E test against real provider endpoints (requires live credentials); manual verification against each real provider is the acceptance step.

## 6. Out of scope (explicitly deferred)

- Frontend Auth UI — separate sub-project, to be brainstormed after this one ships.
- Apple and LinkedIn providers — user deferred these; not part of this spec.
- Multi-provider linking (one account, several providers) — explicitly rejected during brainstorming in favor of the simpler single-network-per-account model.
