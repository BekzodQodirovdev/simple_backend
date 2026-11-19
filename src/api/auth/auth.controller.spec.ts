import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google.service';
import { GithubAuthService } from './github.service';
import { FacebookAuthService } from './facebook.service';
import { TelegramAuthService } from './telegram.service';
import { NetWorkEnum } from 'src/common/enum/network.enums';
import type { Response } from 'express';

describe('AuthController (social routes)', () => {
  let controller: AuthController;
  let authService: { loginOrRegisterSocial: jest.Mock };
  let googleAuthService: { getAuthUrl: jest.Mock; handleCallback: jest.Mock };

  const mockResponse = () =>
    ({ redirect: jest.fn(), cookie: jest.fn() }) as unknown as Response;

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
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  it('redirects to the Google auth URL', () => {
    const res = mockResponse();
    controller.redirectToGoogle(res);
    expect(res.redirect).toHaveBeenCalledWith(
      'https://accounts.google.com/auth-url',
    );
  });

  it('redirects to the frontend with an access token after a successful Google callback', async () => {
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
    await controller.googleCallback('code123', res);

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

  it('redirects to the frontend with a conflict error when loginOrRegisterSocial rejects', async () => {
    googleAuthService.handleCallback.mockResolvedValue({
      email: 'a@test.com',
      name: 'A',
    });
    authService.loginOrRegisterSocial.mockRejectedValue(new Error('conflict'));

    const res = mockResponse();
    await controller.googleCallback('code123', res);

    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/callback?error=network_conflict'),
    );
  });
});
