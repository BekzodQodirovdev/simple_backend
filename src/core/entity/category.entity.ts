import { BaseModel } from 'src/common/database';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { User } from './user.entity';
import { categoryType } from 'src/common/enum/category.enums';

@Entity()
export class Category extends BaseModel {
  @Column()
  name: string;

  @Column({ nullable: true })
  image: string;

  @Column({ nullable: true })
  color: string;

  @Column({ type: 'enum', enum: categoryType })
  type: categoryType;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, (user) => user.event)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
