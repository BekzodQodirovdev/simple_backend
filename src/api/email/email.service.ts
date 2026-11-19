import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailService {
  constructor(private mailerService: MailerService) {}

  async otpSend(email: string, code: string) {
    console.log('Sending email to:', email);
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'OTP CODE',
        from: '"Productive" <mail@Productive.com>',
        html: `<p>Your OTP code -> <b>${code}</b></p>`,
      });
    } catch (err) {
      console.error('Error sending OTP email:', err.message);
    }
  }
  async otpMessageTask(email: string, message: string) {
    console.log('Sending email to:', email);
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Task',
        from: '"Productive" <mail@Productive.com>',
        html: `<p>${message}</p>`,
      });
    } catch (err) {
      console.error('Error sending OTP email:', err.message);
    }
  }

  async otpMessage(email: string, message: string) {
    console.log('Sending email to:', email);
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Message',
        from: '"Productive" <mail@Productive.com>',
        html: `<p>${message}</p>`,
      });
    } catch (err) {
      console.error('Error sending OTP email:', err.message);
    }
  }
}
