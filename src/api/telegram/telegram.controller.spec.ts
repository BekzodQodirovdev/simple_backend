import { TelegramController } from './telegram.controller';
import { NetWorkEnum } from 'src/common/enum/network.enums';

describe('TelegramController', () => {
  let controller: TelegramController;
  let telegramService: { requestOtp: jest.Mock; verifyOtp: jest.Mock };
  let authService: { loginOrRegisterSocial: jest.Mock };

  beforeEach(() => {
    telegramService = { requestOtp: jest.fn(), verifyOtp: jest.fn() };
    authService = { loginOrRegisterSocial: jest.fn() };
    controller = new TelegramController(
      telegramService as any,
      authService as any,
    );
  });

  it('send-otp delegates to TelegramService.requestOtp', async () => {
    telegramService.requestOtp.mockResolvedValue({
      sent: false,
      deepLink: 'https://t.me/test_bot?start=998901234567',
    });

    const result = await controller.sendOtp({ phone: '998901234567' });

    expect(telegramService.requestOtp).toHaveBeenCalledWith('998901234567');
    expect(result).toEqual({
      sent: false,
      deepLink: 'https://t.me/test_bot?start=998901234567',
    });
  });

  it('verify checks the OTP then logs the user in through AuthService using the normalized phone', async () => {
    telegramService.verifyOtp.mockResolvedValue('998901234567');
    authService.loginOrRegisterSocial.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'b',
      data: {},
    });
    const res = {} as any;

    await controller.verify(
      { phone: '+998 90 123 45 67', otp_code: '938210' },
      res,
    );

    expect(telegramService.verifyOtp).toHaveBeenCalledWith(
      '+998 90 123 45 67',
      '938210',
    );
    expect(authService.loginOrRegisterSocial).toHaveBeenCalledWith(
      'telegram_998901234567@telegram.local',
      '998901234567',
      '998901234567',
      NetWorkEnum.TELEGRAM_BOT,
      res,
    );
  });
});
