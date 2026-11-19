import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-facebook';
import { config } from 'src/config';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor() {
    super({
      clientID: config.FACEBOOK_CLIENT_ID,
      clientSecret: config.FACEBOOK_APP_SECRET,
      callbackURL: config.FACEBOOK_CALLBACK_URL,
      scope: ['email', 'public_profile'],
      profileFields: ['id', 'displayName', 'email'],
    });
  }

  validate(accessToken: string, refreshToken: string, profile: Profile) {
    const email = profile.emails?.find((item) => item.value)?.value;

    if (!email) {
      throw new UnauthorizedException('Facebook account has no email');
    }

    return {
      email,
      name: profile.displayName || email,
      providerId: profile.id,
    };
  }
}
