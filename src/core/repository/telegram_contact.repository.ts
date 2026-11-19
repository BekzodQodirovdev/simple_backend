import { Repository } from 'typeorm';
import { TelegramContact } from '../entity/telegram_contact';

export type TelegramContactRepository = Repository<TelegramContact>;
