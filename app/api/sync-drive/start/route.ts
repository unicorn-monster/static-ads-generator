import { NextResponse } from "next/server";
import { getDrive, slugProduct, nextBatchNumber, createFolder } from "@/lib/gdrive";

export const runtime = "nodejs";

interface StartBody {
  product: string;
  date: string; // YYYY-MM-DD (local date from client)
}

// Step 1 of sync: create the Drive batch folder. Client then uploads images one-by-one to it.
export async function POST(req: Request) {
  const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
  if (!parentId) {
    return NextResponse.json(
      { detail: "GOOGLE_DRIVE_PARENT_FOLDER_ID is not set in .env.local" },
      { status: 500 }
    );
  }

  let body: StartBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }

  const product = slugProduct(body.product ?? "");
  const date = body.date ?? "";
  if (!product) return NextResponse.json({ detail: "Missing product name" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ detail: "Invalid date" }, { status: 400 });

  let drive;
  try {
    drive = await getDrive();
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_AUTHORIZED") {
      return NextResponse.json(
        { detail: "Google Drive not connected. Run once: node scripts/gdrive-auth.mjs" },
        { status: 401 }
      );
    }
    return NextResponse.json({ detail: "Failed to initialize Google Drive" }, { status: 500 });
  }

  const prefix = `${product}-${date}-`;
  try {
    const nnn = await nextBatchNumber(drive, parentId, prefix);
    const folderName = `${prefix}${nnn}`;
    const folder = await createFolder(drive, parentId, folderName);
    return NextResponse.json({ folderId: folder.id, folderName, webViewLink: folder.webViewLink });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ detail: `Could not create Drive folder: ${msg}` }, { status: 502 });
  }
}
