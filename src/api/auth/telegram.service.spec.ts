jest.mock('src/config', () => ({
  config: { TELEGRAM_BOT_TOKEN: 'test-bot-token' },
}));

import { createHash, createHmac } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { TelegramAuthService } from './telegram.service';

function signTelegramData(data: Record<string, string | number>) {
  const checkString = Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join('\n');
  const secretKey = createHash('sha256').update('test-bot-token').digest();
  return createHmac('sha256', secretKey).update(checkString).digest('hex');
}

describe('TelegramAuthService', () => {
  let service: TelegramAuthService;

  beforeEach(() => {
    service = new TelegramAuthService();
  });

  it('accepts correctly signed, fresh widget data and derives a synthetic email', () => {
    const payload = {
      id: 123456,
      first_name: 'Ali',
      auth_date: Math.floor(Date.now() / 1000),
    };
    const hash = signTelegramData(payload);

    const profile = service.verifyWidgetData({ ...payload, hash });

    expect(profile).toEqual({
      email: 'telegram_123456@telegram.local',
      name: 'Ali',
    });
  });

  it('rejects data whose hash does not match (tampered payload)', () => {
    const payload = {
      id: 123456,
      first_name: 'Ali',
      auth_date: Math.floor(Date.now() / 1000),
    };
    const hash = signTelegramData(payload);

    expect(() =>
      service.verifyWidgetData({ ...payload, id: 999999, hash }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects widget data older than one day', () => {
    const payload = {
      id: 123456,
      first_name: 'Ali',
      auth_date: Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60,
    };
    const hash = signTelegramData(payload);

    expect(() => service.verifyWidgetData({ ...payload, hash })).toThrow(
      'Telegram login data has expired',
    );
  });
});
