import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { BcryptManage } from 'src/infrastructure/lib/bcrypt';
import { User } from 'src/core/entity/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { Otp } from 'src/core/entity/otp.entity';
import { PassportModule } from '@nestjs/passport';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';
import { TelegramAuthService } from './telegram.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Otp]),
    JwtModule.register({ global: true }),
    PassportModule.register({ session: false }),
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    BcryptManage,
    TelegramAuthService,
    GoogleStrategy,
    GithubStrategy,
    FacebookStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
