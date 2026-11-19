import { BadRequestException, Injectable } from '@nestjs/common';
import { config } from 'src/config';

@Injectable()
export class GoogleAuthService {
  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      redirect_uri: config.GOOGLE_CALLBACK_URL,
      response_type: 'code',
      scope: 'email profile',
      state,
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
