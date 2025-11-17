import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Missing YOUTUBE_API_KEY" }, { status: 500 });
  }
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const endpoint = "https://www.googleapis.com/youtube/v3/videos";
  const params = new URLSearchParams({
    part: "snippet",
    id,
    key: apiKey,
  });

  try {
    const res = await fetch(`${endpoint}?${params}`);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return NextResponse.json({ error: "YouTube API error", details: e }, { status: res.status });
    }
    const json = await res.json();
    const title = json?.items?.[0]?.snippet?.title || null;
    return NextResponse.json({ title });
  } catch (err: any) {
    return NextResponse.json({ error: "Unexpected error", details: err?.message }, { status: 500 });
  }
}