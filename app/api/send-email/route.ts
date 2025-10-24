import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
try {
const { to, subject, htmlContent, textContent } = await req.json();



if (!to || !subject || (!htmlContent && !textContent)) {
  return NextResponse.json({ error: "Missing fields: to, subject and htmlContent or textContent are required" }, { status: 400 });
}

const from = process.env.MAIL_FROM;
if (!from) {
  return NextResponse.json({ error: "MAIL_FROM is not set" }, { status: 500 });
}

const sendmailPath = process.env.SENDMAIL_PATH || "/usr/sbin/sendmail";

const transporter = nodemailer.createTransport({
  sendmail: true,
  newline: "unix",
  path: sendmailPath,
});

const info = await transporter.sendMail({
  from,
  to,
  subject,
  html: htmlContent,
  text: textContent, // optional fallback
});

return NextResponse.json({ ok: true, id: info.messageId });
} catch (err: any) {
console.error("send-email error:", err);
return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
}
}