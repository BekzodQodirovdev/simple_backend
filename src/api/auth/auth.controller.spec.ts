import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ForbiddenException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google.service';
import { GithubAuthService } from './github.service';
import { FacebookAuthService } from './facebook.service';
import { TelegramAuthService } from './telegram.service';
import { NetWorkEnum } from 'src/common/enum/network.enums';
import type { Request, Response } from 'express';

describe('AuthController (social routes)', () => {
  let controller: AuthController;
  let authService: { loginOrRegisterSocial: jest.Mock };
  let googleAuthService: { getAuthUrl: jest.Mock; handleCallback: jest.Mock };

  const mockResponse = () =>
    ({
      redirect: jest.fn(),
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    }) as unknown as Response;

  const mockRequest = (cookies: Record<string, string> = {}) =>
    ({ cookies }) as unknown as Request;

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
        // The AuthUpdatePassword guard (used on `forgot-password` via
        // @UseGuards) needs a JwtService to construct, even though none
        // of this spec's tests touch that route.
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  describe('redirectToGoogle', () => {
    it('sets a CSRF state cookie and redirects to the provider auth URL built with that state', () => {
      const res = mockResponse();
      controller.redirectToGoogle(res);

      expect(res.cookie).toHaveBeenCalledWith(
        'oauth_state',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
      const state = (res.cookie as jest.Mock).mock.calls[0][1];
      expect(googleAuthService.getAuthUrl).toHaveBeenCalledWith(state);
      expect(res.redirect).toHaveBeenCalledWith(
        'https://accounts.google.com/auth-url',
      );
    });
  });

  describe('googleCallback', () => {
    it('redirects to the frontend with an access token when the state matches and login succeeds', async () => {
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
      const req = mockRequest({ oauth_state: 'matching-state' });
      await controller.googleCallback('code123', 'matching-state', req, res);

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

    it('rejects without calling the provider when the state does not match the cookie', async () => {
      const res = mockResponse();
      const req = mockRequest({ oauth_state: 'stored-state' });
      await controller.googleCallback('code123', 'attacker-state', req, res);

      expect(googleAuthService.handleCallback).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/callback?error=invalid_state'),
      );
    });

    it('rejects when no state cookie was ever set', async () => {
      const res = mockResponse();
      const req = mockRequest({});
      await controller.googleCallback('code123', 'some-state', req, res);

      expect(googleAuthService.handleCallback).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/callback?error=invalid_state'),
      );
    });

    it('redirects to the frontend with a conflict error when loginOrRegisterSocial rejects with ForbiddenException', async () => {
      googleAuthService.handleCallback.mockResolvedValue({
        email: 'a@test.com',
        name: 'A',
      });
      authService.loginOrRegisterSocial.mockRejectedValue(
        new ForbiddenException('conflict'),
      );

      const res = mockResponse();
      const req = mockRequest({ oauth_state: 'matching-state' });
      await controller.googleCallback('code123', 'matching-state', req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/callback?error=network_conflict'),
      );
    });

    it('redirects with a generic server error (not network_conflict) when the provider call itself fails', async () => {
      googleAuthService.handleCallback.mockRejectedValue(
        new Error('provider outage'),
      );

      const res = mockResponse();
      const req = mockRequest({ oauth_state: 'matching-state' });
      await controller.googleCallback('code123', 'matching-state', req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/callback?error=server_error'),
      );
      expect(res.redirect).not.toHaveBeenCalledWith(
        expect.stringContaining('network_conflict'),
      );
    });
  });
});
