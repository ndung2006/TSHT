import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { passwordResetLink, portalOrigin, verificationLink } from './reader-auth-helpers';

export interface MailResult {
  sent: boolean;
  devUrl?: string;
}

export interface BuiltMail {
  from: string | { name: string; address: string };
  to: string;
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Gui email xac nhan / dat lai mat khau cho ban doc.
// - Co SMTP (SMTP_HOST...): gui that qua nodemailer.
// - Chua co SMTP (moi truong test): KHONG gui, ghi lien ket vao log
//   server thay the; chi can dien bien moi truong la gui that, khong
//   doi code. Link khong bao gio tra ve client tru khi DEV_AUTH_LINKS=true
//   (chi bat o moi truong test).
// - Dia chi gui: uu tien MAIL_FROM_NAME + MAIL_FROM_ADDRESS (2 bien rieng,
//   khong dau ngoac kep — tranh loi phan tich khi Coolify giu/mat dau
//   ngoac trong MAIL_FROM); fallback MAIL_FROM / SMTP_FROM / SMTP_USER.
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

  fromAddress(): string | { name: string; address: string } {
    const name = (process.env.MAIL_FROM_NAME || '').trim();
    const address = (process.env.MAIL_FROM_ADDRESS || '').trim();
    if (address) return name ? { name, address } : address;
    return process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.SMTP_USER || '';
  }

  private mailFooterHtml(): string {
    const origin = portalOrigin();
    return (
      `<hr style="border:0;border-top:1px solid #e5e5e5;margin:24px 0 12px">` +
      `<p style="color:#666;font-size:13px;line-height:1.6">Tòa soạn hội tụ — <a href="${origin}">${origin}</a><br>` +
      `Thư gửi tự động, vui lòng không trả lời.</p>`
    );
  }

  private mailFooterText(): string {
    return `\n--\nTòa soạn hội tụ — ${portalOrigin()}\nThư gửi tự động, vui lòng không trả lời.`;
  }

  private mailButtonHtml(link: string, label: string): string {
    return (
      `<p><a href="${link}" style="display:inline-block;background:#d61f2f;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:6px">${label}</a></p>` +
      `<p>Nếu nút không bấm được, hãy sao chép liên kết sau vào trình duyệt:<br><a href="${link}">${link}</a></p>`
    );
  }

  buildVerificationMail(to: string, displayName: string | undefined, token: string): BuiltMail {
    const link = verificationLink(token);
    const name = (displayName || '').trim() || 'bạn đọc';
    const safeName = escapeHtml(name);
    return {
      from: this.fromAddress(),
      to,
      subject: 'Xác nhận email — Tòa soạn hội tụ',
      html:
        `<p>Chào ${safeName},</p>` +
        `<p>Bạn vừa đăng ký tài khoản bạn đọc trên <b>Tòa soạn hội tụ</b>. Bấm nút dưới đây để xác nhận email của bạn:</p>` +
        this.mailButtonHtml(link, 'Xác nhận email') +
        `<p>Liên kết có hiệu lực 24 giờ và chỉ dùng một lần. Nếu bạn không đăng ký, hãy bỏ qua email này.</p>` +
        this.mailFooterHtml(),
      text:
        `Chào ${name},\n\nBạn vừa đăng ký tài khoản bạn đọc trên Tòa soạn hội tụ (${portalOrigin()}). ` +
        `Bấm vào liên kết sau để xác nhận email của bạn:\n\n${link}\n\n` +
        `Liên kết có hiệu lực 24 giờ và chỉ dùng một lần. Nếu bạn không đăng ký, hãy bỏ qua email này.` +
        this.mailFooterText(),
    };
  }

  buildPasswordResetMail(to: string, displayName: string | undefined, token: string): BuiltMail {
    const link = passwordResetLink(token);
    const name = (displayName || '').trim() || 'bạn đọc';
    const safeName = escapeHtml(name);
    return {
      from: this.fromAddress(),
      to,
      subject: 'Đặt lại mật khẩu — Tòa soạn hội tụ',
      html:
        `<p>Chào ${safeName},</p>` +
        `<p>Bạn vừa yêu cầu đặt lại mật khẩu tài khoản bạn đọc trên <b>Tòa soạn hội tụ</b>. Bấm nút dưới đây để đặt mật khẩu mới:</p>` +
        this.mailButtonHtml(link, 'Đặt lại mật khẩu') +
        `<p>Liên kết có hiệu lực 30 phút và chỉ dùng một lần. Nếu bạn không yêu cầu, hãy bỏ qua thư này, mật khẩu không thay đổi.</p>` +
        this.mailFooterHtml(),
      text:
        `Chào ${name},\n\nBạn vừa yêu cầu đặt lại mật khẩu tài khoản bạn đọc trên Tòa soạn hội tụ. ` +
        `Bấm vào liên kết sau để đặt mật khẩu mới:\n\n${link}\n\n` +
        `Liên kết có hiệu lực 30 phút và chỉ dùng một lần. Nếu bạn không yêu cầu, hãy bỏ qua thư này, mật khẩu không thay đổi.` +
        this.mailFooterText(),
    };
  }

  async sendVerificationEmail(to: string, displayName: string | undefined, token: string): Promise<MailResult> {
    return this.sendMail({ ...this.buildVerificationMail(to, displayName, token), devUrl: verificationLink(token) });
  }

  async sendPasswordResetEmail(to: string, displayName: string | undefined, token: string): Promise<MailResult> {
    return this.sendMail({ ...this.buildPasswordResetMail(to, displayName, token), devUrl: passwordResetLink(token) });
  }

  private async sendMail(opts: {
    from: string | { name: string; address: string };
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
        from: opts.from,
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
