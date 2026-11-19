import { BaseModel } from 'src/common/database';
import { Column, Entity } from 'typeorm';

@Entity({ name: 'telegram_contact' })
export class TelegramContact extends BaseModel {
  @Column({ unique: true })
  phone: string;

  @Column()
  chat_id: string;
}
