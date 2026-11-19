import { ExecutionContext, Injectable, Type, mixin } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { randomBytes } from 'crypto';
import { Response } from 'express';

const STATE_COOKIE = 'oauth_state';
const STATE_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;

export function SocialAuthStartGuard(provider: string): Type<unknown> {
  @Injectable()
  class SocialAuthStartGuardMixin extends AuthGuard(provider) {
    getAuthenticateOptions(context: ExecutionContext) {
      const res = context.switchToHttp().getResponse<Response>();
      const state = randomBytes(16).toString('hex');
      res.cookie(STATE_COOKIE, state, {
        httpOnly: true,
        maxAge: STATE_COOKIE_MAX_AGE_MS,
        sameSite: 'lax',
      });
      return { state };
    }
  }
  return mixin(SocialAuthStartGuardMixin);
}

export { STATE_COOKIE as OAUTH_STATE_COOKIE };
