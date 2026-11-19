import { BaseModel } from 'src/common/database';
import { NetWorkEnum } from 'src/common/enum/network.enums';
import { Column, Entity } from 'typeorm';

@Entity()
export class User extends BaseModel {
  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  picture: string;

  @Column({ type: 'boolean', default: false })
  is_active: boolean;

  @Column({
    type: 'enum',
    enum: NetWorkEnum,
    default: NetWorkEnum.EMAIL,
  })
  network: NetWorkEnum;
}
