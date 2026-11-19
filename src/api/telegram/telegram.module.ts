import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { OtpTelegram } from 'src/core/entity/otp_telegram';
import { TelegramContact } from 'src/core/entity/telegram_contact';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OtpTelegram, TelegramContact]),
    AuthModule,
  ],
  controllers: [TelegramController],
  providers: [TelegramService],
})
export class TelegramModule {}
