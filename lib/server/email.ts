// lib/server/email.ts
import { Resend } from "resend";

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  fromName?: string;
  fromEmail?: string;
};

const transport = (process.env.MAIL_TRANSPORT ?? "resend")
  .toLowerCase()
  .trim();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const { to, subject, html, text, replyTo, fromName, fromEmail } = params;

  if (!to || !subject || (!html && !text)) {
    throw new Error("Missing required fields: to, subject and html/text");
  }

  if (transport === "resend") {
    const apiKey = requireEnv("RESEND_API_KEY");
    const defaultFromEmail = requireEnv("MAIL_FROM_EMAIL");
    const defaultFromName = process.env.MAIL_FROM_NAME ?? "Plex Courses";

    const resend = new Resend(apiKey);

    const finalFromEmail = fromEmail || defaultFromEmail;
    const finalFromName = fromName || defaultFromName;
    const toList = Array.isArray(to) ? to : [to];

    const base = {
      from: `${finalFromName} <${finalFromEmail}>`,
      to: toList,
      subject,
      ...(replyTo ? { reply_to: replyTo } : {}),
    } as const;

    if (html) {
      // Here html is guaranteed string
      const { error } = await resend.emails.send({
        ...base,
        html,
        ...(text ? { text } : {}),
      });

      if (error) {
        console.error("Resend email error:", error);
        throw new Error("Resend failed to send email");
      }
      return;
    }

    // If no html, we know text is defined because of the earlier guard
    const { error } = await resend.emails.send({
      ...base,
      text: text as string, // non-null assertion; we know it's present
    });

    if (error) {
      console.error("Resend email error:", error);
      throw new Error("Resend failed to send email");
    }
    return;
  }

  throw new Error(
    `Unsupported MAIL_TRANSPORT="${transport}". Use "resend".`
  );
}

/**
 * Backward compatibility – existing code that calls sendEmailViaGmailAPI()
 * will now use Resend under the hood.
 */
export async function sendEmailViaGmailAPI(
  params: SendEmailParams
): Promise<void> {
  return sendEmail(params);
}

export default sendEmail;