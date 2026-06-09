import { NextResponse } from "next/server";
import { getDrive, uploadFile } from "@/lib/gdrive";

export const runtime = "nodejs";
export const maxDuration = 60;

interface UploadBody {
  folderId: string;
  url: string; // Kie media URL
  name: string;
}

// Step 2 of sync: upload ONE image into the batch folder. Called once per image so the client can track progress.
export async function POST(req: Request) {
  let body: UploadBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }

  const { folderId, url } = body;
  const name = (body.name || "image.png").replace(/[/\\]/g, "_");
  if (!folderId || !url) return NextResponse.json({ detail: "Missing folderId or url" }, { status: 400 });

  let drive;
  try {
    drive = await getDrive();
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_AUTHORIZED") {
      return NextResponse.json({ detail: "Google Drive not connected" }, { status: 401 });
    }
    return NextResponse.json({ detail: "Failed to initialize Google Drive" }, { status: 500 });
  }

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`image fetch failed (${resp.status}) — Kie URL may have expired`);
    const mime = resp.headers.get("content-type") ?? "image/png";
    const buffer = Buffer.from(await resp.arrayBuffer());
    await uploadFile(drive, folderId, name, buffer, mime);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ detail: e instanceof Error ? e.message : "upload failed" }, { status: 502 });
  }
}
