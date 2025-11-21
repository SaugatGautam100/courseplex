import nodemailer from "nodemailer";

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  fromName?: string;   // optional display name override
  fromEmail?: string;  // optional email override; falls back to MAIL_FROM
};

function buildFrom(fromName?: string, fromEmail?: string, envFrom?: string): string {
  if (fromEmail && fromName) return `${fromName} <${fromEmail}>`;
  if (fromEmail) return fromEmail;
  if (envFrom) return envFrom;
  throw new Error("MAIL_FROM is not set and no fromEmail provided");
}

/**
 * Primary helper – uses cPanel's local sendmail (Exim).
 * Set env:
 *   MAIL_FROM="Plex Courses <no-reply@PlexCourses.com.np>"
 *   SENDMAIL_PATH=/usr/sbin/sendmail
 *   MAIL_REPLY_TO=your@gmail.com (optional)
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const { to, subject, html, text, replyTo, fromName, fromEmail } = params;

  if (!to || !subject || (!html && !text)) {
    throw new Error("Missing required fields: to, subject and html/text");
  }

  const from = buildFrom(fromName, fromEmail, process.env.MAIL_FROM);
  const sendmailPath = process.env.SENDMAIL_PATH || "/usr/sbin/sendmail";

  const transporter = nodemailer.createTransport({
    sendmail: true,
    newline: "unix",
    path: sendmailPath,
  });

  await transporter.sendMail({
    from,
    to: Array.isArray(to) ? to.join(", ") : to,
    subject,
    html,
    text,
    replyTo: replyTo || process.env.MAIL_REPLY_TO,
  });
}

/**
 * Backward compatibility – route old Gmail helper to sendmail.
 */
export async function sendEmailViaGmailAPI(params: SendEmailParams): Promise<void> {
  return sendEmail(params);
}

export default sendEmail;