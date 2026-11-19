# Backend Multi-Provider OAuth Social Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users register/log in via Google, GitHub, Facebook, or the Telegram Login Widget, receiving the same access/refresh token pair the existing email/password flow issues.

**Architecture:** Four small, dependency-free provider services (`google.service.ts`, `github.service.ts`, `facebook.service.ts`, `telegram.service.ts`) each turn their provider's raw protocol into a normalized `{ email, name }` profile. `AuthService` gets one new method, `loginOrRegisterSocial`, that takes that normalized profile and does find-or-create plus token issuance — reusing the token-signing logic already in `login()`. `AuthController` gets 7 new routes that wire providers to that one method.

**Tech Stack:** NestJS 11, TypeORM (Postgres, `synchronize: true`), Jest + `@nestjs/testing`, Node's built-in `fetch` and `crypto` (no new npm dependencies).

**Spec:** `docs/superpowers/specs/2026-11-19-backend-oauth-social-login-design.md`

## Global Constraints

- No Passport.js, no new OAuth npm package — every provider call uses the built-in `fetch`; Telegram hash verification uses the built-in `crypto`.
- One `network` value per user account (existing `NetWorkEnum` column). If a resolved email already exists under a different network, throw `ForbiddenException('You are logged in from another network.')` — the exact message `login()` already uses.
- Telegram has no real email, so the account's email is synthesized as `` `telegram_${id}@telegram.local` ``. No schema/entity changes.
- New social accounts are created with `is_active: true` (no OTP step — the provider already verified the identity).
- Google/GitHub/Facebook callbacks redirect the browser to `` `${config.FRONTEND_URL}/callback?accessToken=...` `` on success, or `` `${config.FRONTEND_URL}/callback?error=network_conflict` `` on a network conflict. Telegram returns JSON directly: `{ accessToken, refreshToken, data }`.

## Review Focus

- GitHub account with no public email on `/user` and no verified primary email in `/user/emails` → must throw a clear `BadRequestException`, not crash or return `undefined` as an email. (Task 4)
- Telegram widget payload with a tampered field (e.g. `id` changed after Telegram signed it) → hash check must fail and throw `UnauthorizedException`, never silently accept it. (Task 2)
- Telegram widget payload replayed more than 24h after `auth_date` → must be rejected even if the hash itself is valid. (Task 2)
- A user who registered with email/password tries a social login with the same email under a different network → must be rejected with the existing conflict message, never silently logged into the wrong account or merged. (Task 6)
- The Google/GitHub/Facebook callback route must not let that conflict (or any `loginOrRegisterSocial` rejection) bubble up as an unhandled 500 — it must redirect to `` `${FRONTEND_URL}/callback?error=network_conflict` `` so the user sees a message instead of a blank error page. (Task 7)

---

### Task 1: Config and Enum Setup

**Files:**
- Modify: `src/config/index.ts:4-31` (add 3 fields to `ConfigType`) and `:33-60` (populate them)
- Modify: `src/common/enum/network.enums.ts:1-5` (add 3 enum members)
- Modify: `.env.exaple` (document the new keys)
- Modify: `.env` (add the 3 missing callback URL keys with local dev values — `.env` is gitignored, so this file is edited but never committed)

**Interfaces:**
- Produces: `config.GOOGLE_CALLBACK_URL`, `config.GITHUB_CALLBACK_URL`, `config.FACEBOOK_CALLBACK_URL` (all `string`), and `NetWorkEnum.GITHUB`, `NetWorkEnum.FACEBOOK`, `NetWorkEnum.TELEGRAM` — every later task depends on these names existing exactly as spelled here.

This task is pure configuration/type additions with no behavior to unit-test; its verification step is a type-check instead of a Jest run.

- [ ] **Step 1: Add the 3 new config fields**

In `src/config/index.ts`, add to the `ConfigType` type (after `FRONTEND_URL: string;`):
```ts
  GOOGLE_CALLBACK_URL: string;
  GITHUB_CALLBACK_URL: string;
  FACEBOOK_CALLBACK_URL: string;
```
and to the `config` object (after `FRONTEND_URL: process.env.FRONTEND_URL as string,`):
```ts
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL as string,
  GITHUB_CALLBACK_URL: process.env.GITHUB_CALLBACK_URL as string,
  FACEBOOK_CALLBACK_URL: process.env.FACEBOOK_CALLBACK_URL as string,
```

- [ ] **Step 2: Add the new `NetWorkEnum` members**

Replace the contents of `src/common/enum/network.enums.ts` with:
```ts
export enum NetWorkEnum {
  EMAIL = 'email',
  GOOGLE = 'google',
  ICLOUD = 'icloud',
  GITHUB = 'github',
  FACEBOOK = 'facebook',
  TELEGRAM = 'telegram',
}
```

- [ ] **Step 3: Add the 3 callback URL keys to `.env` and `.env.exaple`**

In `.env`, add (pick a local dev port matching how you run the backend, e.g. 4000):
```
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback
GITHUB_CALLBACK_URL=http://localhost:4000/api/auth/github/callback
FACEBOOK_CALLBACK_URL=http://localhost:4000/api/auth/facebook/callback
```
In `.env.exaple`, append:
```

#social auth
GOOGLE_CLIENT_ID=
GOOGLE_APP_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback

GITHUB_CLIENT_ID=
GITHUB_APP_SECRET=
GITHUB_CALLBACK_URL=http://localhost:4000/api/auth/github/callback

FACEBOOK_CLIENT_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_CALLBACK_URL=http://localhost:4000/api/auth/facebook/callback

FRONTEND_URL=http://localhost:3000

TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
```

- [ ] **Step 4: Verify the project still type-checks**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: no new errors (the pre-existing `auth.service.ts` JWT-typing error from before this plan is unrelated and may still appear — ignore it).

- [ ] **Step 5: Commit**

`.env` is gitignored on purpose (it holds real secrets) and must never be
committed — only `.env.exaple` (the template) is tracked.

```bash
git add src/config/index.ts src/common/enum/network.enums.ts .env.exaple
git commit -m "feat(auth): add config and enum values for social login providers"
```

---

### Task 2: Telegram Login Widget Verification

**Files:**
- Create: `src/api/auth/telegram.service.ts`
- Create: `src/api/auth/dto/telegram-login.dto.ts`
- Test: `src/api/auth/telegram.service.spec.ts`

**Interfaces:**
- Consumes: `config.TELEGRAM_BOT_TOKEN` (from Task 1/pre-existing config).
- Produces: `TelegramAuthService.verifyWidgetData(data: TelegramLoginDto): { email: string; name: string }`, used by Task 7's controller. Throws `UnauthorizedException` on bad hash or stale data.

- [ ] **Step 1: Write the DTO**

Create `src/api/auth/dto/telegram-login.dto.ts`:
```ts
import { IsInt, IsOptional, IsString } from 'class-validator';

export class TelegramLoginDto {
  @IsInt()
  id: number;

  @IsString()
  first_name: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  photo_url?: string;

  @IsInt()
  auth_date: number;

  @IsString()
  hash: string;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/api/auth/telegram.service.spec.ts`:
```ts
jest.mock('src/config', () => ({
  config: { TELEGRAM_BOT_TOKEN: 'test-bot-token' },
}));

import { createHash, createHmac } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { TelegramAuthService } from './telegram.service';

function signTelegramData(data: Record<string, string | number>) {
  const checkString = Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join('\n');
  const secretKey = createHash('sha256').update('test-bot-token').digest();
  return createHmac('sha256', secretKey).update(checkString).digest('hex');
}

describe('TelegramAuthService', () => {
  let service: TelegramAuthService;

  beforeEach(() => {
    service = new TelegramAuthService();
  });

  it('accepts correctly signed, fresh widget data and derives a synthetic email', () => {
    const payload = {
      id: 123456,
      first_name: 'Ali',
      auth_date: Math.floor(Date.now() / 1000),
    };
    const hash = signTelegramData(payload);

    const profile = service.verifyWidgetData({ ...payload, hash });

    expect(profile).toEqual({
      email: 'telegram_123456@telegram.local',
      name: 'Ali',
    });
  });

  it('rejects data whose hash does not match (tampered payload)', () => {
    const payload = {
      id: 123456,
      first_name: 'Ali',
      auth_date: Math.floor(Date.now() / 1000),
    };
    const hash = signTelegramData(payload);

    expect(() =>
      service.verifyWidgetData({ ...payload, id: 999999, hash }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects widget data older than one day', () => {
    const payload = {
      id: 123456,
      first_name: 'Ali',
      auth_date: Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60,
    };
    const hash = signTelegramData(payload);

    expect(() => service.verifyWidgetData({ ...payload, hash })).toThrow(
      'Telegram login data has expired',
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest telegram.service.spec.ts`
Expected: FAIL with "Cannot find module './telegram.service'"

- [ ] **Step 4: Implement `TelegramAuthService`**

Create `src/api/auth/telegram.service.ts`:
```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import { config } from 'src/config';
import { TelegramLoginDto } from './dto/telegram-login.dto';

const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

@Injectable()
export class TelegramAuthService {
  verifyWidgetData(data: TelegramLoginDto): { email: string; name: string } {
    const { hash, ...rest } = data;
    const checkString = Object.keys(rest)
      .sort()
      .map((key) => `${key}=${(rest as Record<string, unknown>)[key]}`)
      .join('\n');

    const secretKey = createHash('sha256')
      .update(config.TELEGRAM_BOT_TOKEN)
      .digest();
    const computedHash = createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    if (computedHash !== hash) {
      throw new UnauthorizedException('Invalid Telegram login data');
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (nowInSeconds - data.auth_date > ONE_DAY_IN_SECONDS) {
      throw new UnauthorizedException('Telegram login data has expired');
    }

    return {
      email: `telegram_${data.id}@telegram.local`,
      name: data.first_name,
    };
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest telegram.service.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/api/auth/telegram.service.ts src/api/auth/dto/telegram-login.dto.ts src/api/auth/telegram.service.spec.ts
git commit -m "feat(auth): add Telegram Login Widget hash verification"
```

---

### Task 3: Google OAuth Service

**Files:**
- Create: `src/api/auth/google.service.ts`
- Test: `src/api/auth/google.service.spec.ts`

**Interfaces:**
- Consumes: `config.GOOGLE_CLIENT_ID`, `config.GOOGLE_APP_SECRET`, `config.GOOGLE_CALLBACK_URL`.
- Produces: `GoogleAuthService.getAuthUrl(): string` and `GoogleAuthService.handleCallback(code: string): Promise<{ email: string; name: string }>`, used by Task 7.

- [ ] **Step 1: Write the failing tests**

Create `src/api/auth/google.service.spec.ts`:
```ts
import { GoogleAuthService } from './google.service';

describe('GoogleAuthService', () => {
  let service: GoogleAuthService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new GoogleAuthService();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('getAuthUrl', () => {
    it('builds a Google OAuth consent URL containing the client id and redirect uri', () => {
      const url = service.getAuthUrl();
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth?');
      expect(url).toContain('client_id=');
      expect(url).toContain('redirect_uri=');
    });
  });

  describe('handleCallback', () => {
    it('exchanges the code for a token and returns the profile email and name', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'g-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ email: 'a@test.com', name: 'A Test' }),
        });

      const profile = await service.handleCallback('auth-code');

      expect(profile).toEqual({ email: 'a@test.com', name: 'A Test' });
    });

    it('throws when Google has no email on the account', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'g-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ name: 'A Test' }),
        });

      await expect(service.handleCallback('auth-code')).rejects.toThrow(
        'Google account has no email',
      );
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest google.service.spec.ts`
Expected: FAIL with "Cannot find module './google.service'"

- [ ] **Step 3: Implement `GoogleAuthService`**

Create `src/api/auth/google.service.ts`:
```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { config } from 'src/config';

@Injectable()
export class GoogleAuthService {
  getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      redirect_uri: config.GOOGLE_CALLBACK_URL,
      response_type: 'code',
      scope: 'email profile',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<{ email: string; name: string }> {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_APP_SECRET,
        code,
        redirect_uri: config.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      throw new BadRequestException('Failed to authenticate with Google');
    }
    const tokenData = (await tokenRes.json()) as { access_token: string };

    const profileRes = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
    );
    if (!profileRes.ok) {
      throw new BadRequestException('Failed to fetch Google profile');
    }
    const profile = (await profileRes.json()) as {
      email?: string;
      name?: string;
    };
    if (!profile.email) {
      throw new BadRequestException('Google account has no email');
    }
    return { email: profile.email, name: profile.name ?? profile.email };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest google.service.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/auth/google.service.ts src/api/auth/google.service.spec.ts
git commit -m "feat(auth): add Google OAuth service"
```

---

### Task 4: GitHub OAuth Service

**Files:**
- Create: `src/api/auth/github.service.ts`
- Test: `src/api/auth/github.service.spec.ts`

**Interfaces:**
- Consumes: `config.GITHUB_CLIENT_ID`, `config.GITHUB_APP_SECRET`, `config.GITHUB_CALLBACK_URL`.
- Produces: `GithubAuthService.getAuthUrl(): string` and `GithubAuthService.handleCallback(code: string): Promise<{ email: string; name: string }>`, used by Task 7.

- [ ] **Step 1: Write the failing tests**

Create `src/api/auth/github.service.spec.ts`:
```ts
import { GithubAuthService } from './github.service';

describe('GithubAuthService', () => {
  let service: GithubAuthService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new GithubAuthService();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('getAuthUrl', () => {
    it('builds a GitHub OAuth authorize URL with the email scope', () => {
      const url = service.getAuthUrl();
      expect(url).toContain('https://github.com/login/oauth/authorize?');
      expect(url).toContain('user%3Aemail');
    });
  });

  describe('handleCallback', () => {
    it('returns the profile email directly when GitHub exposes it on /user', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'gh-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            login: 'octocat',
            name: 'Oc Cat',
            email: 'oc@test.com',
          }),
        });

      const profile = await service.handleCallback('code');

      expect(profile).toEqual({ email: 'oc@test.com', name: 'Oc Cat' });
    });

    it('falls back to the verified primary email from /user/emails when /user has none', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'gh-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ login: 'octocat', name: 'Oc Cat', email: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { email: 'secondary@test.com', primary: false, verified: true },
            { email: 'primary@test.com', primary: true, verified: true },
          ],
        });

      const profile = await service.handleCallback('code');

      expect(profile).toEqual({ email: 'primary@test.com', name: 'Oc Cat' });
    });

    it('throws when no verified primary email is available anywhere', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'gh-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ login: 'octocat', name: 'Oc Cat', email: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { email: 'unverified@test.com', primary: true, verified: false },
          ],
        });

      await expect(service.handleCallback('code')).rejects.toThrow(
        'GitHub account has no accessible email',
      );
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest github.service.spec.ts`
Expected: FAIL with "Cannot find module './github.service'"

- [ ] **Step 3: Implement `GithubAuthService`**

Create `src/api/auth/github.service.ts`:
```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { config } from 'src/config';

type GithubEmail = { email: string; primary: boolean; verified: boolean };

@Injectable()
export class GithubAuthService {
  getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: config.GITHUB_CLIENT_ID,
      redirect_uri: config.GITHUB_CALLBACK_URL,
      scope: 'read:user user:email',
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<{ email: string; name: string }> {
    const tokenRes = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          client_id: config.GITHUB_CLIENT_ID,
          client_secret: config.GITHUB_APP_SECRET,
          code,
          redirect_uri: config.GITHUB_CALLBACK_URL,
        }),
      },
    );
    if (!tokenRes.ok) {
      throw new BadRequestException('Failed to authenticate with GitHub');
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new BadRequestException('Failed to authenticate with GitHub');
    }

    const headers = {
      Authorization: `Bearer ${tokenData.access_token}`,
      'User-Agent': 'productive-app',
    };

    const profileRes = await fetch('https://api.github.com/user', {
      headers,
    });
    if (!profileRes.ok) {
      throw new BadRequestException('Failed to fetch GitHub profile');
    }
    const profile = (await profileRes.json()) as {
      name?: string;
      login: string;
      email?: string | null;
    };

    let email = profile.email ?? undefined;
    if (!email) {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers,
      });
      if (emailsRes.ok) {
        const emails = (await emailsRes.json()) as GithubEmail[];
        email = emails.find((e) => e.primary && e.verified)?.email;
      }
    }
    if (!email) {
      throw new BadRequestException('GitHub account has no accessible email');
    }

    return { email, name: profile.name ?? profile.login };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest github.service.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/auth/github.service.ts src/api/auth/github.service.spec.ts
git commit -m "feat(auth): add GitHub OAuth service"
```

---

### Task 5: Facebook OAuth Service

**Files:**
- Create: `src/api/auth/facebook.service.ts`
- Test: `src/api/auth/facebook.service.spec.ts`

**Interfaces:**
- Consumes: `config.FACEBOOK_CLIENT_ID`, `config.FACEBOOK_APP_SECRET`, `config.FACEBOOK_CALLBACK_URL`.
- Produces: `FacebookAuthService.getAuthUrl(): string` and `FacebookAuthService.handleCallback(code: string): Promise<{ email: string; name: string }>`, used by Task 7.

- [ ] **Step 1: Write the failing tests**

Create `src/api/auth/facebook.service.spec.ts`:
```ts
import { FacebookAuthService } from './facebook.service';

describe('FacebookAuthService', () => {
  let service: FacebookAuthService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new FacebookAuthService();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('getAuthUrl', () => {
    it('builds a Facebook OAuth dialog URL with the email scope', () => {
      const url = service.getAuthUrl();
      expect(url).toContain('https://www.facebook.com/v19.0/dialog/oauth?');
      expect(url).toContain('scope=email');
    });
  });

  describe('handleCallback', () => {
    it('exchanges the code for a token and returns the profile email and name', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'fb-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '123', name: 'A Test', email: 'a@test.com' }),
        });

      const profile = await service.handleCallback('code');

      expect(profile).toEqual({ email: 'a@test.com', name: 'A Test' });
    });

    it('throws when Facebook returns no access token', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      await expect(service.handleCallback('code')).rejects.toThrow(
        'Failed to authenticate with Facebook',
      );
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest facebook.service.spec.ts`
Expected: FAIL with "Cannot find module './facebook.service'"

- [ ] **Step 3: Implement `FacebookAuthService`**

Create `src/api/auth/facebook.service.ts`:
```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { config } from 'src/config';

@Injectable()
export class FacebookAuthService {
  getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: config.FACEBOOK_CLIENT_ID,
      redirect_uri: config.FACEBOOK_CALLBACK_URL,
      scope: 'email,public_profile',
    });
    return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<{ email: string; name: string }> {
    const tokenParams = new URLSearchParams({
      client_id: config.FACEBOOK_CLIENT_ID,
      client_secret: config.FACEBOOK_APP_SECRET,
      redirect_uri: config.FACEBOOK_CALLBACK_URL,
      code,
    });
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?${tokenParams.toString()}`,
    );
    if (!tokenRes.ok) {
      throw new BadRequestException('Failed to authenticate with Facebook');
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new BadRequestException('Failed to authenticate with Facebook');
    }

    const profileRes = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email&access_token=${tokenData.access_token}`,
    );
    if (!profileRes.ok) {
      throw new BadRequestException('Failed to fetch Facebook profile');
    }
    const profile = (await profileRes.json()) as {
      name?: string;
      email?: string;
    };
    if (!profile.email) {
      throw new BadRequestException('Facebook account has no email');
    }
    return { email: profile.email, name: profile.name ?? profile.email };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest facebook.service.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/auth/facebook.service.ts src/api/auth/facebook.service.spec.ts
git commit -m "feat(auth): add Facebook OAuth service"
```

---

### Task 6: `AuthService.loginOrRegisterSocial`

**Files:**
- Modify: `src/api/auth/auth.service.ts:1-123` (add import, add `signTokens` helper, refactor `login()` to use it, add `loginOrRegisterSocial`)
- Test: `src/api/auth/auth.service.spec.ts` (new file)

**Interfaces:**
- Consumes: `NetWorkEnum` (Task 1), the existing `UserRepository`, `BcryptManage`, `JwtService` already injected into `AuthService`.
- Produces: `AuthService.loginOrRegisterSocial(email: string, name: string, network: NetWorkEnum, res: Response): Promise<{ accessToken: string; refreshToken: string; data: Omit<User, 'password'> }>`, used by Task 7.

- [ ] **Step 1: Write baseline tests for the existing `login()` behavior**

These establish a safety net before refactoring `login()`'s internals — they should already pass once written, since `login()`'s behavior isn't changing yet.

Create `src/api/auth/auth.service.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { User } from 'src/core/entity/user.entity';
import { Otp } from 'src/core/entity/otp.entity';
import { BcryptManage } from 'src/infrastructure/lib/bcrypt';
import { EmailService } from '../email/email.service';
import { NetWorkEnum } from 'src/common/enum/network.enums';
import type { Response } from 'express';
import type { LoginUserDto } from './dto/login-auth.dto';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: {
    findOne: jest.Mock;
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  const mockResponse = () => ({ cookie: jest.fn() }) as unknown as Response;

  beforeEach(async () => {
    userRepository = {
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn((data) => ({ id: 'new-id', ...data })),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Otp), useValue: {} },
        {
          provide: 'REDIS_CLIENT',
          useValue: { get: jest.fn(), set: jest.fn() },
        },
        {
          provide: BcryptManage,
          useValue: {
            createBcryptPassword: jest.fn().mockResolvedValue('hashed'),
            comparePassword: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('signed-token') },
        },
        { provide: EmailService, useValue: { otpSend: jest.fn() } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    it('returns tokens and user data for a correct, active, matching-network login', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'u1',
        email: 'a@test.com',
        password: 'hashed',
        is_active: true,
        network: NetWorkEnum.EMAIL,
      });

      const result = await service.login(
        { email: 'a@test.com', password: 'plain' } as LoginUserDto,
        mockResponse(),
      );

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(result.data).not.toHaveProperty('password');
    });

    it('rejects when the account is not active', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'u1',
        email: 'a@test.com',
        password: 'hashed',
        is_active: false,
        network: NetWorkEnum.EMAIL,
      });

      await expect(
        service.login(
          { email: 'a@test.com', password: 'plain' } as LoginUserDto,
          mockResponse(),
        ),
      ).rejects.toThrow('You are not active.');
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they pass as-is**

Run: `npx jest auth.service.spec.ts`
Expected: PASS (2 tests) — `login()` hasn't changed yet.

- [ ] **Step 3: Refactor `login()` to extract a private `signTokens` helper**

In `src/api/auth/auth.service.ts`, add this import at the top:
```ts
import { NetWorkEnum } from 'src/common/enum/network.enums';
import { randomBytes } from 'crypto';
```

Add this private method (near `writeToCookie`, e.g. directly below it):
```ts
  private signTokens(
    user: Pick<User, 'id' | 'email' | 'is_active'>,
  ): { accessToken: string; refreshToken: string } {
    const payload: IPayload = {
      sub: user.id,
      email: user.email,
      is_active: user.is_active,
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: config.ACCESS_TOKEN_KEY,
      expiresIn: config.ACCESS_TOKEN_TIME,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: config.REFRESH_TOKEN_KEY,
      expiresIn: config.REFRESH_TOKEN_TIME,
    });
    return { accessToken, refreshToken };
  }
```

Replace the token-signing block inside `login()` — this:
```ts
    const payload: IPayload = {
      sub: currentData.id,
      email: currentData.email,
      is_active: currentData.is_active,
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: config.ACCESS_TOKEN_KEY,
      expiresIn: config.ACCESS_TOKEN_TIME,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: config.REFRESH_TOKEN_KEY,
      expiresIn: config.REFRESH_TOKEN_TIME,
    });
    const { password, ...data } = currentData;
```
becomes:
```ts
    const { accessToken, refreshToken } = this.signTokens(currentData);
    const { password, ...data } = currentData;
```

- [ ] **Step 4: Run the tests to verify the refactor didn't change behavior**

Run: `npx jest auth.service.spec.ts`
Expected: PASS (still 2 tests, same as Step 2)

- [ ] **Step 5: Write the failing tests for `loginOrRegisterSocial`**

Add to `src/api/auth/auth.service.spec.ts`, inside the top-level `describe('AuthService', ...)` block, alongside the existing `describe('login', ...)`:
```ts
  describe('loginOrRegisterSocial', () => {
    it('creates a new active user when no account exists for the email', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.loginOrRegisterSocial(
        'new@test.com',
        'New User',
        NetWorkEnum.GOOGLE,
        mockResponse(),
      );

      expect(userRepository.save).toHaveBeenCalled();
      const savedArg = userRepository.save.mock.calls[0][0];
      expect(savedArg.is_active).toBe(true);
      expect(savedArg.network).toBe(NetWorkEnum.GOOGLE);
      expect(result.accessToken).toBe('signed-token');
      expect(result.data).not.toHaveProperty('password');
    });

    it('logs an existing matching-network user straight in without creating a new row', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'u1',
        email: 'existing@test.com',
        password: 'hashed',
        is_active: true,
        network: NetWorkEnum.GOOGLE,
      });

      const result = await service.loginOrRegisterSocial(
        'existing@test.com',
        'Existing User',
        NetWorkEnum.GOOGLE,
        mockResponse(),
      );

      expect(userRepository.save).not.toHaveBeenCalled();
      expect(result.accessToken).toBe('signed-token');
    });

    it('rejects when the email is already registered under a different network', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'u1',
        email: 'existing@test.com',
        password: 'hashed',
        is_active: true,
        network: NetWorkEnum.EMAIL,
      });

      await expect(
        service.loginOrRegisterSocial(
          'existing@test.com',
          'Existing User',
          NetWorkEnum.GOOGLE,
          mockResponse(),
        ),
      ).rejects.toThrow('You are logged in from another network.');
    });
  });
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx jest auth.service.spec.ts`
Expected: FAIL with "service.loginOrRegisterSocial is not a function"

- [ ] **Step 7: Implement `loginOrRegisterSocial`**

Add this public method to `AuthService` (e.g. directly below `login()`):
```ts
  async loginOrRegisterSocial(
    email: string,
    name: string,
    network: NetWorkEnum,
    res: Response,
  ) {
    let user = await this.repository.findOne({ where: { email } });

    if (!user) {
      const randomPassword = await this.manageBcrypt.createBcryptPassword(
        randomBytes(32).toString('hex'),
      );
      user = await this.repository.save(
        this.repository.create({
          name,
          email,
          password: randomPassword,
          is_active: true,
          network,
        }),
      );
    } else if (user.network !== network) {
      throw new ForbiddenException('You are logged in from another network.');
    }

    const { accessToken, refreshToken } = this.signTokens(user);
    const { password, ...data } = user;
    this.writeToCookie(refreshToken, res);
    return { accessToken, refreshToken, data };
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx jest auth.service.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 9: Commit**

```bash
git add src/api/auth/auth.service.ts src/api/auth/auth.service.spec.ts
git commit -m "feat(auth): add loginOrRegisterSocial and extract signTokens helper"
```

---

### Task 7: Controller Routes and Module Wiring

**Files:**
- Modify: `src/api/auth/auth.controller.ts:1-75`
- Modify: `src/api/auth/auth.module.ts` (register the 4 provider services)
- Test: `src/api/auth/auth.controller.spec.ts` (new file)

**Interfaces:**
- Consumes: `GoogleAuthService`, `GithubAuthService`, `FacebookAuthService` (`getAuthUrl()`, `handleCallback(code)` from Tasks 3–5), `TelegramAuthService.verifyWidgetData()` (Task 2), `AuthService.loginOrRegisterSocial()` (Task 6), `config.FRONTEND_URL`.
- Produces: the 7 HTTP routes described in the spec — nothing later in this plan depends on them, this is the final task.

- [ ] **Step 1: Write the failing tests**

Create `src/api/auth/auth.controller.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google.service';
import { GithubAuthService } from './github.service';
import { FacebookAuthService } from './facebook.service';
import { TelegramAuthService } from './telegram.service';
import { NetWorkEnum } from 'src/common/enum/network.enums';
import type { Response } from 'express';

describe('AuthController (social routes)', () => {
  let controller: AuthController;
  let authService: { loginOrRegisterSocial: jest.Mock };
  let googleAuthService: { getAuthUrl: jest.Mock; handleCallback: jest.Mock };

  const mockResponse = () =>
    ({ redirect: jest.fn(), cookie: jest.fn() }) as unknown as Response;

  beforeEach(async () => {
    authService = { loginOrRegisterSocial: jest.fn() };
    googleAuthService = {
      getAuthUrl: jest
        .fn()
        .mockReturnValue('https://accounts.google.com/auth-url'),
      handleCallback: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: GoogleAuthService, useValue: googleAuthService },
        {
          provide: GithubAuthService,
          useValue: { getAuthUrl: jest.fn(), handleCallback: jest.fn() },
        },
        {
          provide: FacebookAuthService,
          useValue: { getAuthUrl: jest.fn(), handleCallback: jest.fn() },
        },
        {
          provide: TelegramAuthService,
          useValue: { verifyWidgetData: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  it('redirects to the Google auth URL', () => {
    const res = mockResponse();
    controller.redirectToGoogle(res);
    expect(res.redirect).toHaveBeenCalledWith(
      'https://accounts.google.com/auth-url',
    );
  });

  it('redirects to the frontend with an access token after a successful Google callback', async () => {
    googleAuthService.handleCallback.mockResolvedValue({
      email: 'a@test.com',
      name: 'A',
    });
    authService.loginOrRegisterSocial.mockResolvedValue({
      accessToken: 'tok',
      refreshToken: 'ref',
      data: {},
    });

    const res = mockResponse();
    await controller.googleCallback('code123', res);

    expect(authService.loginOrRegisterSocial).toHaveBeenCalledWith(
      'a@test.com',
      'A',
      NetWorkEnum.GOOGLE,
      res,
    );
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/callback?accessToken=tok'),
    );
  });

  it('redirects to the frontend with a conflict error when loginOrRegisterSocial rejects', async () => {
    googleAuthService.handleCallback.mockResolvedValue({
      email: 'a@test.com',
      name: 'A',
    });
    authService.loginOrRegisterSocial.mockRejectedValue(new Error('conflict'));

    const res = mockResponse();
    await controller.googleCallback('code123', res);

    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/callback?error=network_conflict'),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest auth.controller.spec.ts`
Expected: FAIL with "controller.redirectToGoogle is not a function"

- [ ] **Step 3: Add the new routes to `AuthController`**

In `src/api/auth/auth.controller.ts`, add these imports:
```ts
import { GoogleAuthService } from './google.service';
import { GithubAuthService } from './github.service';
import { FacebookAuthService } from './facebook.service';
import { TelegramAuthService } from './telegram.service';
import { TelegramLoginDto } from './dto/telegram-login.dto';
import { NetWorkEnum } from 'src/common/enum/network.enums';
import { config } from 'src/config';
```

Replace the constructor:
```ts
  constructor(
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly githubAuthService: GithubAuthService,
    private readonly facebookAuthService: FacebookAuthService,
    private readonly telegramAuthService: TelegramAuthService,
  ) {}
```

Add these methods (e.g. after `sendOtp`, before the `// token must` comment):
```ts
  @Public()
  @Get('google')
  redirectToGoogle(@Res() res: Response) {
    res.redirect(this.googleAuthService.getAuthUrl());
  }

  @Public()
  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Res() res: Response) {
    const profile = await this.googleAuthService.handleCallback(code);
    try {
      const result = await this.authService.loginOrRegisterSocial(
        profile.email,
        profile.name,
        NetWorkEnum.GOOGLE,
        res,
      );
      res.redirect(`${config.FRONTEND_URL}/callback?accessToken=${result.accessToken}`);
    } catch {
      res.redirect(`${config.FRONTEND_URL}/callback?error=network_conflict`);
    }
  }

  @Public()
  @Get('github')
  redirectToGithub(@Res() res: Response) {
    res.redirect(this.githubAuthService.getAuthUrl());
  }

  @Public()
  @Get('github/callback')
  async githubCallback(@Query('code') code: string, @Res() res: Response) {
    const profile = await this.githubAuthService.handleCallback(code);
    try {
      const result = await this.authService.loginOrRegisterSocial(
        profile.email,
        profile.name,
        NetWorkEnum.GITHUB,
        res,
      );
      res.redirect(`${config.FRONTEND_URL}/callback?accessToken=${result.accessToken}`);
    } catch {
      res.redirect(`${config.FRONTEND_URL}/callback?error=network_conflict`);
    }
  }

  @Public()
  @Get('facebook')
  redirectToFacebook(@Res() res: Response) {
    res.redirect(this.facebookAuthService.getAuthUrl());
  }

  @Public()
  @Get('facebook/callback')
  async facebookCallback(@Query('code') code: string, @Res() res: Response) {
    const profile = await this.facebookAuthService.handleCallback(code);
    try {
      const result = await this.authService.loginOrRegisterSocial(
        profile.email,
        profile.name,
        NetWorkEnum.FACEBOOK,
        res,
      );
      res.redirect(`${config.FRONTEND_URL}/callback?accessToken=${result.accessToken}`);
    } catch {
      res.redirect(`${config.FRONTEND_URL}/callback?error=network_conflict`);
    }
  }

  @Public()
  @Post('telegram')
  telegramLogin(
    @Body() data: TelegramLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const profile = this.telegramAuthService.verifyWidgetData(data);
    return this.authService.loginOrRegisterSocial(
      profile.email,
      profile.name,
      NetWorkEnum.TELEGRAM,
      res,
    );
  }
```

Also add `Query` to the existing `@nestjs/common` import list at the top of the file (it currently imports `Controller, Get, Post, Body, Res, Patch, UseGuards, Req` — add `Query` to that list).

- [ ] **Step 4: Register the 4 new providers in `AuthModule`**

In `src/api/auth/auth.module.ts`, add imports:
```ts
import { GoogleAuthService } from './google.service';
import { GithubAuthService } from './github.service';
import { FacebookAuthService } from './facebook.service';
import { TelegramAuthService } from './telegram.service';
```
and update the `providers` array to:
```ts
  providers: [
    AuthService,
    BcryptManage,
    GoogleAuthService,
    GithubAuthService,
    FacebookAuthService,
    TelegramAuthService,
  ],
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest auth.controller.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Run the full test suite and type-check**

Run: `npx jest`
Expected: all test files PASS (`telegram.service.spec.ts`, `google.service.spec.ts`, `github.service.spec.ts`, `facebook.service.spec.ts`, `auth.service.spec.ts`, `auth.controller.spec.ts`)

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: no new errors (the pre-existing unrelated `auth.service.ts` JWT-typing error may still appear).

- [ ] **Step 7: Commit**

```bash
git add src/api/auth/auth.controller.ts src/api/auth/auth.module.ts src/api/auth/auth.controller.spec.ts
git commit -m "feat(auth): wire Google, GitHub, Facebook, and Telegram routes"
```

---

## After this plan ships

Manually verify against the real providers (automated tests use mocked HTTP, not live credentials):
1. Start the backend, visit `http://localhost:4000/api/auth/google` directly in a browser — confirm it reaches Google's consent screen and the callback redirects to your frontend with `?accessToken=...`.
2. Repeat for `/api/auth/github` and `/api/auth/facebook`.
3. Build a minimal test HTML page with the Telegram Login Widget pointed at `POST /api/auth/telegram` to confirm the hash check passes with real widget data (this will likely happen naturally once the frontend auth UI plan is implemented).

Then proceed to the frontend auth UI plan (`frontend/docs/superpowers/specs/2026-11-19-frontend-auth-ui-design.md`), which consumes exactly these 7 routes.
