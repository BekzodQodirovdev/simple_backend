import { BaseModel } from 'src/common/database';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { User } from './user.entity';
import { eventCategory } from 'src/common/enum/event.enums';

@Entity()
export class Event extends BaseModel {
  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: eventCategory, default: eventCategory.OTHER })
  category: eventCategory;

  @Column({ type: 'date' })
  start_date: Date;

  @Column({ type: 'date' })
  end_date: Date;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, (user) => user.event)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
