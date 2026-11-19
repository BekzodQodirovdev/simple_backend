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
