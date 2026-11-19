import { BadRequestException, Injectable } from '@nestjs/common';
import { config } from 'src/config';

@Injectable()
export class FacebookAuthService {
  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.FACEBOOK_CLIENT_ID,
      redirect_uri: config.FACEBOOK_CALLBACK_URL,
      scope: 'email,public_profile',
      state,
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
