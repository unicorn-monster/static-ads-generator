// Thin Google Drive client for syncing generated ads into per-product/date/batch folders.
// Single destination (one Drive, one parent folder) — no abstraction, per ADR-0001's philosophy.
// Auth = OAuth "as the user" via a refresh token in token.json (minted once by scripts/gdrive-auth.mjs).

import { google, type drive_v3 } from "googleapis";
import { Readable } from "node:stream";
import { readFile } from "node:fs/promises";
import path from "node:path";

const TOKEN_PATH = path.join(process.cwd(), "token.json");

/** Normalize a product name into a folder-safe slug: lowercase, strip diacritics & non-alphanumerics. */
export function slugProduct(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Build an authenticated Drive client from token.json. Throws Error("NOT_AUTHORIZED") if it's missing. */
export async function getDrive(): Promise<drive_v3.Drive> {
  let raw: string;
  try {
    raw = await readFile(TOKEN_PATH, "utf-8");
  } catch {
    throw new Error("NOT_AUTHORIZED");
  }
  const creds = JSON.parse(raw) as { client_id: string; client_secret: string; refresh_token: string };
  const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret);
  auth.setCredentials({ refresh_token: creds.refresh_token });
  return google.drive({ version: "v3", auth });
}

/** Next zero-padded batch number (001, 002…) for folders named `${prefix}NNN` under parent. */
export async function nextBatchNumber(
  drive: drive_v3.Drive,
  parentId: string,
  prefix: string
): Promise<string> {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(name)",
    pageSize: 1000,
  });
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`);
  let max = 0;
  for (const f of res.data.files ?? []) {
    const m = f.name?.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return String(max + 1).padStart(3, "0");
}

/** Create a folder under parent; returns its id + webViewLink. */
export async function createFolder(drive: drive_v3.Drive, parentId: string, name: string) {
  const res = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id, webViewLink",
  });
  return { id: res.data.id as string, webViewLink: res.data.webViewLink ?? null };
}

/** Upload one file (from a buffer) into a folder. */
export async function uploadFile(
  drive: drive_v3.Drive,
  folderId: string,
  name: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id",
  });
}
