// app/api/send-email/route.ts
import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/server/email";

export const runtime = "nodejs";          // ensure Node.js runtime (not edge)
export const dynamic = "force-dynamic";   // always run on server

type SendEmailBody = {
  to: string | string[];
  subject: string;
  htmlContent?: string;
  textContent?: string;
  replyTo?: string;
  fromName?: string;
  fromEmail?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SendEmailBody;

    const {
      to,
      subject,
      htmlContent,
      textContent,
      replyTo,
      fromName,
      fromEmail,
    } = body;

    if (!to || !subject || (!htmlContent && !textContent)) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: 'to', 'subject', and at least one of 'htmlContent' or 'textContent'.",
        },
        { status: 400 }
      );
    }

    await sendEmail({
      to,
      subject,
      html: htmlContent,
      text: textContent,
      replyTo,
      fromName,
      fromEmail,
    });

    return NextResponse.json({ ok: true, message: "Email sent" }, { status: 200 });
  } catch (err) {
    console.error("Error in /api/send-email:", err);
    return NextResponse.json(
      { error: "Internal server error while sending email." },
      { status: 500 }
    );
  }
}