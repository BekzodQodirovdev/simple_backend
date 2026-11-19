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
    it('builds a Facebook OAuth dialog URL with the email scope and CSRF state', () => {
      const url = service.getAuthUrl('csrf-state-123');
      expect(url).toContain('https://www.facebook.com/v19.0/dialog/oauth?');
      expect(url).toContain('scope=email');
      expect(url).toContain('state=csrf-state-123');
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
