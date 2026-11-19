import { Body, Controller, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { TelegramService } from './telegram.service';
import { AuthService } from '../auth/auth.service';
import { TelegramSendOtpDto } from './dto/send-otp.dto';
import { TelegramVerifyOtpDto } from './dto/verify-otp.dto';
import { Public } from 'src/common/decorator/public.decorator';
import { NetWorkEnum } from 'src/common/enum/network.enums';

@ApiTags('Telegram')
@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly authService: AuthService,
  ) {}

  @Public()
  @Post('send-otp')
  sendOtp(@Body() dto: TelegramSendOtpDto) {
    return this.telegramService.requestOtp(dto.phone);
  }

  @Public()
  @Post('verify')
  async verify(
    @Body() dto: TelegramVerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const phone = await this.telegramService.verifyOtp(dto.phone, dto.otp_code);
    return this.authService.loginOrRegisterSocial(
      `telegram_${phone}@telegram.local`,
      phone,
      phone,
      NetWorkEnum.TELEGRAM_BOT,
      res,
    );
  }
}
