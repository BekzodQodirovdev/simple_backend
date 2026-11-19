import { Repository } from 'typeorm';
import { OtpTelegram } from '../entity/otp_telegram';

export type OtpTelegramRepository = Repository<OtpTelegram>;
