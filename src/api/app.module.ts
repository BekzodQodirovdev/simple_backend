import { Module } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { config } from 'src/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { MailerModule, MailerOptions } from '@nestjs-modules/mailer';
import { JwtGuard } from 'src/common/guard/jwt-auth.guard';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
    ]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: config.DB_HOST,
      port: +config.DB_PORT,
      username: config.DB_USER,
      password: config.DB_PASS,
      database: config.DB_NAME,
      autoLoadEntities: true,
      synchronize: true,
      // dropSchema: true,
      entities: ['dist/core/entity/*.entity{.ts,.js}'],
    }),
    MailerModule.forRoot({
      transport: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      },
      // `from` is a valid nodemailer send-default; the type-only mismatch
      // here is version skew between @nestjs-modules/mailer's declared
      // nodemailer dependency and another transitively-resolved
      // nodemailer version -- pre-existing, unrelated to this branch,
      // only surfaced now that pnpm's strict resolution replaced npm's
      // hoisting (see ledger).
      defaults: {
        from: process.env.SMTP_USER,
      } as MailerOptions['defaults'],
    }),
    AuthModule,
    EmailModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
  ],
})
export class AppModule {}
