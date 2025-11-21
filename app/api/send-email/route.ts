// app/api/send-email/route.ts
import { NextResponse } from "next/server";

type SendBody = {
  to: string;
  subject: string;
  htmlContent?: string;
  textContent?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SendBody;
    const { to, subject, htmlContent, textContent } = body;

    const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
    const workerSecret = process.env.CLOUDFLARE_WORKER_SECRET;
    const fromEmail = process.env.MAIL_FROM_EMAIL; // e.g. no-reply@plexcourses.com
    const fromName = process.env.MAIL_FROM_NAME;

    if (!workerUrl || !workerSecret || !fromEmail) {
      return NextResponse.json(
        { error: "Email worker is not configured." },
        { status: 500 }
      );
    }

    if (!to || !subject || (!htmlContent && !textContent)) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    const res = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": workerSecret,
      },
      body: JSON.stringify({
        to,
        from: {
          email: fromEmail,
          name: fromName || "Plex Courses",
        },
        subject,
        html: htmlContent || textContent,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Cloudflare worker error: ${res.status} ${errText}`);
      return NextResponse.json(
        { error: "Failed to send via worker" },
        { status: res.status }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Email queued successfully",
    });
  } catch (err: any) {
    console.error("send-email route error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}