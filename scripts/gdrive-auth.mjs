// One-time Google Drive auth. Run once: `node scripts/gdrive-auth.mjs`
// Prereq: a `credentials.json` (OAuth client, type "Desktop") at the project root.
// Opens a browser for consent, then writes `token.json` (refresh token) — both gitignored.
// See workflows/sync_to_drive.md for the full Google Cloud setup steps.

import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SCOPES = ["https://www.googleapis.com/auth/drive"];
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
const TOKEN_PATH = path.join(process.cwd(), "token.json");

async function main() {
  let creds;
  try {
    creds = JSON.parse(await readFile(CREDENTIALS_PATH, "utf-8"));
  } catch {
    console.error("❌ Không tìm thấy credentials.json ở thư mục gốc dự án.");
    console.error("   → Tạo OAuth client (kiểu 'Desktop app') trong Google Cloud Console,");
    console.error("     tải file JSON về, đổi tên thành credentials.json, đặt ở thư mục gốc.");
    process.exit(1);
  }

  const client = await authenticate({ scopes: SCOPES, keyfilePath: CREDENTIALS_PATH });

  if (!client.credentials.refresh_token) {
    console.error("❌ Không nhận được refresh_token.");
    console.error("   → Vào https://myaccount.google.com/permissions, gỡ quyền của app rồi chạy lại.");
    process.exit(1);
  }

  const key = creds.installed || creds.web;
  await writeFile(
    TOKEN_PATH,
    JSON.stringify(
      {
        type: "authorized_user",
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
      },
      null,
      2
    )
  );

  const drive = google.drive({ version: "v3", auth: client });
  const about = await drive.about.get({ fields: "user(emailAddress)" });
  console.log("✅ Đã lưu token.json. Đăng nhập với:", about.data.user?.emailAddress);
  console.log("   Giờ vào app bấm 'Sync to Drive' là chạy được.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
