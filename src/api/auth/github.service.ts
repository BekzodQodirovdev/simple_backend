import { BadRequestException, Injectable } from '@nestjs/common';
import { config } from 'src/config';

type GithubEmail = { email: string; primary: boolean; verified: boolean };

@Injectable()
export class GithubAuthService {
  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.GITHUB_CLIENT_ID,
      redirect_uri: config.GITHUB_CALLBACK_URL,
      scope: 'read:user user:email',
      state,
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
