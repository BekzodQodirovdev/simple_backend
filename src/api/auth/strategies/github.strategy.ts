import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { config } from 'src/config';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor() {
    super({
      clientID: config.GITHUB_CLIENT_ID,
      clientSecret: config.GITHUB_APP_SECRET,
      callbackURL: config.GITHUB_CALLBACK_URL,
      scope: ['user:email'],
    });
  }

  validate(accessToken: string, refreshToken: string, profile: Profile) {
    const email = profile.emails?.find((item) => item.value)?.value;

    if (!email) {
      throw new UnauthorizedException('GitHub account has no email');
    }

    return {
      providerId: profile.id,
      email,
      name: profile.displayName || profile.username || email,
    };
  }
}
