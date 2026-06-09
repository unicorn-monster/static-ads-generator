# Workflow: Sync ảnh lên Google Drive

**Mục tiêu:** Từ app, chọn ảnh đã tạo → đẩy lên Google Drive vào folder đặt tên theo
`{sản phẩm}-{ngày}-{batch}` (vd `hatnet-2026-06-08-001`) dưới folder cha **"Dino IMG"**.
Tool Meta downstream sẽ tự lấy ảnh từ các folder này.

## Quy ước tên folder (HỢP ĐỒNG với tool Meta)

```
Dino IMG / {product}-{YYYY-MM-DD}-{NNN}
          └ hatnet-2026-06-08-001
```

- `product`: tên sản phẩm đã slug hoá (thường, bỏ dấu, bỏ ký tự đặc biệt). "Hat Net" → `hatnet`.
- ngày: `YYYY-MM-DD`, ngày local lúc bấm Sync.
- `NNN`: số batch 3 chữ số, **tự tăng** theo product + ngày (app quét Drive lấy số kế tiếp).
- File ảnh trong folder: `image-01.png`, `video-01.mp4`… (Meta tool lấy hết, không quan tâm tên).

## Setup 1 lần (Google Cloud + OAuth)

1. Vào [Google Cloud Console](https://console.cloud.google.com/) → tạo project (hoặc dùng project sẵn).
2. **APIs & Services → Library** → bật **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: chọn External, điền tên app, thêm chính email của bạn vào **Test users**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type = **Desktop app**.
5. Tải file JSON về, đổi tên thành **`credentials.json`**, đặt ở **thư mục gốc dự án**.
6. Lấy **folder ID của "Dino IMG"**: mở folder trên Drive, copy phần cuối URL
   `https://drive.google.com/drive/folders/<ID>` → dán vào `.env.local`:
   ```
   GOOGLE_DRIVE_PARENT_FOLDER_ID=<ID>
   ```
7. Chạy 1 lần để cấp quyền:
   ```
   node scripts/gdrive-auth.mjs
   ```
   Trình duyệt mở ra → đăng nhập → đồng ý. Script ghi **`token.json`** (chứa refresh token).
   Báo `✅ Đã lưu token.json` + email là xong.

> `credentials.json` và `token.json` đều đã nằm trong `.gitignore` — không commit.

## Dùng hằng ngày

1. `npm run dev`, tạo ảnh như bình thường.
2. Ở khung Recent/Gallery: tick chọn ảnh (hoặc bấm **Chọn tất cả**).
3. Bấm **☁ Sync to Drive (N)** → nhập tên sản phẩm → **Đẩy lên Drive**.
4. Toast hiện "Đã đẩy N ảnh → folder" + link mở folder.

## Cách hoạt động (cho người bảo trì)

- UI: `app/components/GeneratorWorkspace.tsx` (chọn + modal + gọi API), `app/components/ResultCard.tsx` (checkbox).
- API: `app/api/sync-drive/route.ts` — nhận `{ product, date, items:[{url,name}] }`.
- Drive client: `lib/gdrive.ts` — `getDrive` (đọc token.json), `nextBatchNumber`, `createFolder`, `uploadFile`.
- Auth: `scripts/gdrive-auth.mjs` (mint token.json).

## Lỗi thường gặp

| Thông báo | Nguyên nhân / cách xử lý |
|---|---|
| "GOOGLE_DRIVE_PARENT_FOLDER_ID chưa được cấu hình" | Chưa điền folder ID vào `.env.local`, restart `npm run dev`. |
| "Chưa kết nối Google Drive..." | Chưa có `token.json` → chạy `node scripts/gdrive-auth.mjs`. |
| "Không nhận được refresh_token" | Vào https://myaccount.google.com/permissions gỡ quyền app, chạy lại script. |
| "tải ảnh lỗi — URL Kie có thể đã hết hạn" | URL Kie sống ~24h. Tạo lại ảnh rồi sync trong ngày. |
| Tạo folder lỗi 403/404 | Folder ID sai, hoặc tài khoản OAuth không có quyền trên "Dino IMG". |
