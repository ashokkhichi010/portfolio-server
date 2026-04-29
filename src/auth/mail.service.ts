import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { customConfig } from 'src/config/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendAdminOtp(email: string, otp: string): Promise<void> {
    const smtp = customConfig().SMTP;

    if (!smtp.HOST || !smtp.PORT || !smtp.USERNAME || !smtp.PASSWORD || !smtp.EMAIL_FROM) {
      this.logger.warn(`SMTP config missing. OTP for ${email}: ${otp}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: smtp.HOST,
      port: Number(smtp.PORT),
      secure: Number(smtp.PORT) === 465,
      auth: {
        user: smtp.USERNAME,
        pass: smtp.PASSWORD,
      },
    });

    await transporter.sendMail({
      from: smtp.EMAIL_FROM,
      to: email,
      subject: 'Your admin login code',
      text: `Your one-time admin login code is ${otp}. It expires in ${customConfig().OTP_EXPIRES_MINUTES} minutes.`,
      html: `<p>Your one-time admin login code is <strong>${otp}</strong>.</p><p>It expires in ${customConfig().OTP_EXPIRES_MINUTES} minutes.</p>`,
    });
  }
}
