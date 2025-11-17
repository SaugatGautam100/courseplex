import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const playlistId = url.searchParams.get("playlistId");
  const limit = Math.min(Number(url.searchParams.get("limit") || 200), 500);
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Missing YOUTUBE_API_KEY" }, { status: 500 });
  }
  if (!playlistId) {
    return NextResponse.json({ error: "playlistId required" }, { status: 400 });
  }

  const base = "https://www.googleapis.com/youtube/v3/playlistItems";
  let items: { title: string; videoId: string }[] = [];
  let nextPageToken: string | undefined;

  try {
    while (items.length < limit) {
      const params = new URLSearchParams({
        part: "snippet,contentDetails",
        maxResults: "50",
        playlistId,
        key: apiKey,
      });
      if (nextPageToken) params.set("pageToken", nextPageToken);

      const res = await fetch(`${base}?${params}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        return NextResponse.json({ error: "YouTube API error", details: e }, { status: res.status });
      }
      const json = await res.json();

      for (const it of json.items || []) {
        const vid = it.contentDetails?.videoId || it.snippet?.resourceId?.videoId;
        const title = it.snippet?.title;
        if (vid && title && title !== "Private video" && title !== "Deleted video") {
          items.push({ title, videoId: vid });
        }
      }

      nextPageToken = json.nextPageToken;
      if (!nextPageToken) break;
    }

    if (items.length > limit) items = items.slice(0, limit);
    return NextResponse.json({ items });
  } catch (err: any) {
    return NextResponse.json({ error: "Unexpected error", details: err?.message }, { status: 500 });
  }
}