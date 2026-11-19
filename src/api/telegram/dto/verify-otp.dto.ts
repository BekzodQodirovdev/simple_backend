import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class TelegramVerifyOtpDto {
  @ApiProperty({ example: '+998901234567' })
  @IsString()
  phone: string;

  @ApiProperty({ example: '938210' })
  @IsString()
  otp_code: string;
}
