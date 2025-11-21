// lib/server/email.ts
import nodemailer from "nodemailer";

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  fromName?: string;   // optional display name override
  fromEmail?: string;  // optional email override
};

/**
 * Build a standard "From" header string.
 * Used only for sendmail fallback.
 */
function buildFromHeader(
  fromName?: string,
  fromEmail?: string,
  envFrom?: string
): string {
  if (fromEmail && fromName) return `${fromName} <${fromEmail}>`;
  if (fromEmail) return fromEmail;
  if (envFrom) return envFrom;
  throw new Error("MAIL_FROM is not set and no fromEmail provided");
}

/**
 * Primary helper – chooses transport based on MAIL_TRANSPORT:
 *
 * MAIL_TRANSPORT=cloudflare-worker  (recommended on Firebase)
 *   - uses Cloudflare Worker + MailChannels
 *
 * MAIL_TRANSPORT=sendmail          (for old cPanel installs only)
 *   - uses local sendmail via Nodemailer
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const { to, subject, html, text, replyTo, fromName, fromEmail } = params;

  if (!to || !subject || (!html && !text)) {
    throw new Error("Missing required fields: to, subject and html/text");
  }

  const transport = (process.env.MAIL_TRANSPORT ?? "cloudflare-worker")
    .toLowerCase()
    .trim();

  // ------------- Cloudflare Worker transport (recommended) -------------
  if (transport === "cloudflare-worker") {
    const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
    const workerSecret = process.env.CLOUDFLARE_WORKER_SECRET;
    const envFromEmail = process.env.MAIL_FROM_EMAIL;
    const envFromName = process.env.MAIL_FROM_NAME ?? "Plex Courses";

    const finalFromEmail = fromEmail || envFromEmail;
    const finalFromName = fromName || envFromName;

    if (!workerUrl || !workerSecret || !finalFromEmail) {
      throw new Error(
        "Cloudflare mail worker is not configured. Check CLOUDFLARE_WORKER_URL, CLOUDFLARE_WORKER_SECRET, MAIL_FROM_EMAIL."
      );
    }

    const payload = {
      to: Array.isArray(to) ? to[0] : to, // Worker version expects a single "to"
      from: {
        email: finalFromEmail,
        name: finalFromName,
      },
      subject,
      html: html || text,
    };

    const res = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": workerSecret,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Cloudflare worker email error:", res.status, body);
      throw new Error(
        `Cloudflare worker email failed: ${res.status} ${body || ""}`.trim()
      );
    }

    return;
  }

  // ------------- sendmail transport (legacy / cPanel only) -------------
  if (transport === "sendmail") {
    const fromHeader = buildFromHeader(
      fromName,
      fromEmail,
      process.env.MAIL_FROM
    );
    const sendmailPath = process.env.SENDMAIL_PATH || "/usr/sbin/sendmail";

    const transporter = nodemailer.createTransport({
      sendmail: true,
      newline: "unix",
      path: sendmailPath,
    });

    await transporter.sendMail({
      from: fromHeader,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      html,
      text,
      replyTo: replyTo || process.env.MAIL_REPLY_TO,
    });

    return;
  }

  throw new Error(
    `Unsupported MAIL_TRANSPORT="${transport}". Use "cloudflare-worker" or "sendmail".`
  );
}

/**
 * Backward compatibility – route old Gmail helper to the main helper.
 * All existing imports of sendEmailViaGmailAPI will now use your Cloudflare Worker.
 */
export async function sendEmailViaGmailAPI(
  params: SendEmailParams
): Promise<void> {
  return sendEmail(params);
}

export default sendEmail;