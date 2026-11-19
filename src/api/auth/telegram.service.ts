import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import { config } from 'src/config';
import { TelegramLoginDto } from './dto/telegram-login.dto';

const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

@Injectable()
export class TelegramAuthService {
  verifyWidgetData(data: TelegramLoginDto): { email: string; name: string } {
    const { hash, ...rest } = data;
    const checkString = Object.keys(rest)
      .sort()
      .map((key) => `${key}=${(rest as Record<string, unknown>)[key]}`)
      .join('\n');

    const secretKey = createHash('sha256')
      .update(config.TELEGRAM_BOT_TOKEN)
      .digest();
    const computedHash = createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    if (computedHash !== hash) {
      throw new UnauthorizedException('Invalid Telegram login data');
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (nowInSeconds - data.auth_date > ONE_DAY_IN_SECONDS) {
      throw new UnauthorizedException('Telegram login data has expired');
    }

    return {
      email: `telegram_${data.id}@telegram.local`,
      name: data.first_name,
    };
  }
}
