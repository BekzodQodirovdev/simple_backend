import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Bot } from 'grammy';
import { generate } from 'otp-generator';
import { OtpTelegram } from 'src/core/entity/otp_telegram';
import { OtpTelegramRepository } from 'src/core/repository/otp_telegram.repository';
import { TelegramContact } from 'src/core/entity/telegram_contact';
import { TelegramContactRepository } from 'src/core/repository/telegram_contact.repository';
import { VerifyType } from 'src/common/type/otp.type';
import { config } from 'src/config';

const OTP_TTL_MS = 5 * 60 * 1000;

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function generateOtp(): string {
  return generate(6, {
    upperCaseAlphabets: false,
    lowerCaseAlphabets: false,
    specialChars: false,
    alphabets: false,
    digits: true,
  });
}

function generateToken(): string {
  return generate(32, {
    upperCaseAlphabets: true,
    lowerCaseAlphabets: true,
    specialChars: false,
    alphabets: true,
    digits: true,
  });
}

export type RequestOtpResult =
  { sent: true } | { sent: false; deepLink: string };

type StartReply = { text: string; requestContact: boolean };

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private bot: Bot | null = null;

  constructor(
    @InjectRepository(OtpTelegram)
    private readonly repository: OtpTelegramRepository,
    @InjectRepository(TelegramContact)
    private readonly contacts: TelegramContactRepository,
  ) {}

  onModuleInit() {
    if (!config.TELEGRAM_BOT_TOKEN) {
      console.warn(
        'TELEGRAM_BOT_TOKEN is not set — Telegram bot login is disabled.',
      );
      return;
    }
    this.bot = new Bot(config.TELEGRAM_BOT_TOKEN);
    this.bot.command('start', async (ctx) => {
      const reply = await this.handleStartCommand(
        ctx.match?.toString(),
        String(ctx.chat.id),
      );
      await ctx.reply(
        reply.text,
        reply.requestContact
          ? {
              reply_markup: {
                keyboard: [
                  [{ text: 'Telefon raqamni ulashish', request_contact: true }],
                ],
                resize_keyboard: true,
                one_time_keyboard: true,
              },
            }
          : undefined,
      );
    });
    this.bot.on('message:contact', async (ctx) => {
      const text = await this.handleContactShare(
        String(ctx.chat.id),
        ctx.message.contact.phone_number,
      );
      await ctx.reply(text, { reply_markup: { remove_keyboard: true } });
    });
    this.bot.catch((err) => {
      console.error('Telegram bot error:', err);
    });
    this.bot.start().catch((err) => {
      console.error('Telegram bot stopped:', err);
    });
  }

  onModuleDestroy() {
    void this.bot?.stop();
  }

  async requestOtp(phone: string): Promise<RequestOtpResult> {
    if (!config.TELEGRAM_BOT_USERNAME) {
      throw new BadRequestException('Telegram bot login is not configured');
    }
    const normalizedPhone = normalizePhone(phone);
    const contact = await this.contacts.findOne({
      where: { phone: normalizedPhone },
    });

    if (contact) {
      const sent = await this.trySendOtpToChat(
        contact.chat_id,
        normalizedPhone,
      );
      if (sent) {
        return { sent: true };
      }
      await this.contacts.delete({ phone: normalizedPhone });
    }

    return {
      sent: false,
      deepLink: await this.createPendingLink(normalizedPhone),
    };
  }

  private async trySendOtpToChat(
    chatId: string,
    normalizedPhone: string,
  ): Promise<boolean> {
    if (!this.bot) {
      return false;
    }
    await this.repository.delete({ phone: normalizedPhone });
    const row = this.repository.create({
      phone: normalizedPhone,
      otp_code: generateOtp(),
      otp_expires_at: new Date(Date.now() + OTP_TTL_MS),
      type: VerifyType.TELEGRAM_LOGIN,
      token: null,
      chat_id: chatId,
    });
    await this.repository.save(row);
    try {
      await this.bot.api.sendMessage(
        chatId,
        `Tasdiqlash kodingiz: ${row.otp_code}`,
      );
      return true;
    } catch {
      return false;
    }
  }

  private async createPendingLink(normalizedPhone: string): Promise<string> {
    await this.repository.delete({ phone: normalizedPhone });
    const token = generateToken();
    const row = this.repository.create({
      phone: normalizedPhone,
      otp_code: generateOtp(),
      otp_expires_at: new Date(Date.now() + OTP_TTL_MS),
      type: VerifyType.TELEGRAM_LOGIN,
      token,
      chat_id: null,
    });
    await this.repository.save(row);

    const botUsername = config.TELEGRAM_BOT_USERNAME.replace(/^@/, '');
    return `https://t.me/${botUsername}?start=${token}`;
  }

  async verifyOtp(phone: string, otp_code: string): Promise<string> {
    const normalizedPhone = normalizePhone(phone);
    const row = await this.repository.findOne({
      where: { phone: normalizedPhone },
    });
    if (!row || row.otp_code !== otp_code) {
      throw new BadRequestException('OTP code error!!!');
    }
    if (row.otp_expires_at < new Date()) {
      throw new BadRequestException('OTP code has expired');
    }
    await this.repository.delete(row.id);
    return normalizedPhone;
  }

  async handleStartCommand(
    payload: string | undefined,
    chatId: string,
  ): Promise<StartReply> {
    const token = payload?.trim();
    if (!token) {
      return {
        text: "Telefon raqami topilmadi. Saytdan qaytadan urinib ko'ring.",
        requestContact: false,
      };
    }
    const row = await this.repository.findOne({ where: { token } });
    if (!row || row.otp_expires_at < new Date()) {
      return {
        text: "Havola noto'g'ri yoki eskirgan. Saytga qaytib qaytadan urinib ko'ring.",
        requestContact: false,
      };
    }
    await this.repository.update(row.id, { chat_id: chatId });
    return {
      text: 'Tasdiqlash kodini olish uchun telefon raqamingizni ulashing.',
      requestContact: true,
    };
  }

  async handleContactShare(
    chatId: string,
    contactPhone: string,
  ): Promise<string> {
    const row = await this.repository.findOne({ where: { chat_id: chatId } });
    if (!row || row.otp_expires_at < new Date()) {
      return "Havola eskirgan. Saytga qaytib qaytadan urinib ko'ring.";
    }
    const normalizedContactPhone = normalizePhone(contactPhone);
    if (normalizedContactPhone !== row.phone) {
      return 'Bu telefon raqami siz kiritgan raqam bilan mos emas.';
    }

    const existingContact = await this.contacts.findOne({
      where: { phone: row.phone },
    });
    if (existingContact) {
      await this.contacts.update(existingContact.id, { chat_id: chatId });
    } else {
      const contact = this.contacts.create({
        phone: row.phone,
        chat_id: chatId,
      });
      await this.contacts.save(contact);
    }

    return `Tasdiqlash kodingiz: ${row.otp_code}`;
  }
}
