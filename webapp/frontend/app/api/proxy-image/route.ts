import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ detail: "url is required" }, { status: 400 });
  }

  // Only proxy https URLs
  if (!url.startsWith("https://")) {
    return NextResponse.json({ detail: "Only https URLs are supported" }, { status: 400 });
  }

  const resp = await fetch(url);
  if (!resp.ok) {
    return NextResponse.json({ detail: "Failed to fetch image" }, { status: 502 });
  }

  const contentType = resp.headers.get("content-type") ?? "image/png";
  const buffer = await resp.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
