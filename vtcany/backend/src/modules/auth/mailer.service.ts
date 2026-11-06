import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { passwordResetLink, portalOrigin, verificationLink } from './reader-auth-helpers';

export interface MailResult {
  sent: boolean;
  devUrl?: string;
}

// Gui email xac nhan / dat lai mat khau cho ban doc.
// - Co SMTP (SMTP_HOST...): gui that qua nodemailer.
// - Chua co SMTP (moi truong test): KHONG gui, ghi lien ket vao log
//   server thay the; chi can dien bien moi truong la gui that, khong
//   doi code. Link khong bao gio tra ve client tru khi DEV_AUTH_LINKS=true
//   (chi bat o moi truong test).
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter | null = null;
  private transportTried = false;

  isConfigured(): boolean {
    return !!(process.env.SMTP_HOST || '').trim();
  }

  devLinksEnabled(): boolean {
    return process.env.DEV_AUTH_LINKS === 'true';
  }

  private getTransporter(): nodemailer.Transporter | null {
    if (this.transportTried) return this.transporter;
    this.transportTried = true;
    const host = (process.env.SMTP_HOST || '').trim();
    if (!host) return null;
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
        : undefined,
    });
    return this.transporter;
  }

  async sendVerificationEmail(to: string, displayName: string | undefined, token: string): Promise<MailResult> {
    const link = verificationLink(token);
    const name = (displayName || '').trim() || 'bạn đọc';
    return this.sendMail({
      to,
      subject: 'Xác nhận email — Tòa Soạn Hội Tụ',
      text:
        `Chào ${name},\n\nBạn vừa đăng ký tài khoản bạn đọc trên Tòa Soạn Hội Tụ (${portalOrigin()}). ` +
        `Bấm vào liên kết sau để xác nhận email của bạn:\n\n${link}\n\n` +
        `Liên kết có hiệu lực 24 giờ và chỉ dùng một lần. Nếu bạn không đăng ký, hãy bỏ qua email này.\n\nTòa Soạn Hội Tụ`,
      html:
        `<p>Chào ${name},</p>` +
        `<p>Bạn vừa đăng ký tài khoản bạn đọc trên <b>Tòa Soạn Hội Tụ</b>. Bấm vào liên kết sau để xác nhận email của bạn:</p>` +
        `<p><a href="${link}">${link}</a></p>` +
        `<p>Liên kết có hiệu lực 24 giờ và chỉ dùng một lần. Nếu bạn không đăng ký, hãy bỏ qua email này.</p>` +
        `<p>Tòa Soạn Hội Tụ</p>`,
      devUrl: link,
    });
  }

  async sendPasswordResetEmail(to: string, displayName: string | undefined, token: string): Promise<MailResult> {
    const link = passwordResetLink(token);
    const name = (displayName || '').trim() || 'bạn đọc';
    return this.sendMail({
      to,
      subject: 'Đặt lại mật khẩu — Tòa Soạn Hội Tụ',
      text:
        `Chào ${name},\n\nBạn vừa yêu cầu đặt lại mật khẩu tài khoản bạn đọc trên Tòa Soạn Hội Tụ. ` +
        `Bấm vào liên kết sau để đặt mật khẩu mới:\n\n${link}\n\n` +
        `Liên kết có hiệu lực 30 phút và chỉ dùng một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn không thay đổi.\n\nTòa Soạn Hội Tụ`,
      html:
        `<p>Chào ${name},</p>` +
        `<p>Bạn vừa yêu cầu đặt lại mật khẩu tài khoản bạn đọc trên <b>Tòa Soạn Hội Tụ</b>. Bấm vào liên kết sau để đặt mật khẩu mới:</p>` +
        `<p><a href="${link}">${link}</a></p>` +
        `<p>Liên kết có hiệu lực 30 phút và chỉ dùng một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn không thay đổi.</p>` +
        `<p>Tòa Soạn Hội Tụ</p>`,
      devUrl: link,
    });
  }

  private async sendMail(opts: {
    to: string;
    subject: string;
    html: string;
    text: string;
    devUrl: string;
  }): Promise<MailResult> {
    const t = this.getTransporter();
    if (!t) {
      // Chua cau hinh SMTP: ghi link ra log server (chi moi truong test).
      this.logger.warn(
        `[mailer] Chua cau hinh SMTP — khong gui duoc email toi ${opts.to}. Link (chi dung o moi truong test): ${opts.devUrl}`,
      );
      return { sent: false, devUrl: opts.devUrl };
    }
    try {
      await t.sendMail({
        from: process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.SMTP_USER,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      });
      return { sent: true };
    } catch (e: any) {
      this.logger.error(`[mailer] Gui email toi ${opts.to} that bai: ${e?.message}`);
      return { sent: false, devUrl: opts.devUrl };
    }
  }
}
