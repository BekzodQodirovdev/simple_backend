import { BaseModel } from 'src/common/database';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { User } from './user.entity';
import { notificationType } from 'src/common/enum/notification.enums';

@Entity()
export class Notification extends BaseModel {
  @Column({ type: 'uuid' })
  user_id: string;

  @Column()
  message: string;

  @Column({
    type: 'enum',
    enum: notificationType,
    default: notificationType.NO_SEEN,
  })
  type: notificationType;

  @ManyToOne(() => User, (user) => user.notifications)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
