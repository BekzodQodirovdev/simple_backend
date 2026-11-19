import { BaseModel } from 'src/common/database';
import { VerifyType } from 'src/common/type/otp.type';
import { Column, Entity } from 'typeorm';

@Entity({ name: 'otp_telegram' })
export class OtpTelegram extends BaseModel {
  @Column({ type: 'varchar', nullable: true })
  token: string | null;

  @Column({ type: 'varchar', nullable: true })
  chat_id: string | null;

  @Column()
  phone: string;

  @Column()
  otp_code: string;

  @Column({ type: 'timestamp' })
  otp_expires_at: Date;

  @Column({ type: 'enum', enum: VerifyType })
  type: VerifyType;
}
