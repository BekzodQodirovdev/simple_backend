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
