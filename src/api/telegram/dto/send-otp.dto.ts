import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class TelegramSendOtpDto {
  @ApiProperty({ example: '+998901234567' })
  @IsString()
  phone: string;
}
