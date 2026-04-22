# Implementation Plan: Add Nano Banana Pro Model

## Overview

Mở rộng `KieModel` union và `ALLOWED_MODELS` list để nhận thêm `nano-banana-pro`. Vì request schema Pro trùng với Nano Banana 2, existing fall-through path trong `createKieTask` đã build đúng body — chỉ cần thêm server-side validation cap 8 ảnh. Frontend thêm entry vào `MODELS` array và chuyển `maxImages` từ binary ternary sang per-model lookup.

---

## Phase 1: Backend — Extend model union and add 8-image cap

Cho phép `nano-banana-pro` qua validation và reject request vượt 8 ảnh.

### Tasks

- [ ] Mở rộng type `KieModel` trong [app/api/create-tasks/route.ts](../../app/api/create-tasks/route.ts) thêm `"nano-banana-pro"`
- [ ] Mở rộng `ALLOWED_MODELS` array thêm `"nano-banana-pro"`
- [ ] Thêm validation block cho `model === "nano-banana-pro"` reject khi `imageUrls.length > 8`

### Technical Details

**File:** `app/api/create-tasks/route.ts`

**Line 7 — Type union:**
```ts
type KieModel = "nano-banana-2" | "nano-banana-pro" | "gpt-image-2-image-to-image";
```

**Line 9 — Allowed list:**
```ts
const ALLOWED_MODELS: KieModel[] = ["nano-banana-2", "nano-banana-pro", "gpt-image-2-image-to-image"];
```

**Không thay đổi lines 24–40.** Existing `else` branch (áp dụng cho mọi model ≠ `gpt-image-2-image-to-image`) đã build đúng body Nano Banana Pro expect:
```ts
{
  prompt,
  aspect_ratio: options.aspectRatio,
  resolution: options.resolution,
  output_format: options.outputFormat,
  // image_input: options.imageUrls  (nếu length > 0)
}
```
`model` field ở outer body (line 49) được pass-through nguyên văn sang Kie.

**Sau line 103 — thêm validation cap 8 ảnh:**
```ts
if (model === "nano-banana-pro") {
  const urls = Array.isArray(imageUrls) ? imageUrls : [];
  if (urls.length > 8) {
    return NextResponse.json(
      { detail: "Nano Banana Pro supports maximum 8 input images" },
      { status: 400 }
    );
  }
}
```

**Request shape gửi Kie AI** (confirmed từ OpenAPI spec):
- Endpoint: `POST https://api.kie.ai/api/v1/jobs/createTask`
- Auth: `Authorization: Bearer ${KIE_API_KEY}`
- Body:
  ```json
  {
    "model": "nano-banana-pro",
    "input": {
      "prompt": "...",
      "aspect_ratio": "1:1",
      "resolution": "1K",
      "output_format": "png",
      "image_input": ["https://..."]
    }
  }
  ```
- Response: `{ code: 200, msg: "success", data: { taskId: "task_nano-banana-pro_..." } }` — existing taskId extractor (line 62: `data.taskId ?? data.data?.taskId`) đã handle.

---

## Phase 2: Frontend — Add model option and per-model image cap

Thêm entry vào `MODELS`, chuyển `maxImages` từ binary sang 3-way lookup.

### Tasks

- [ ] Thêm `{ id: "nano-banana-pro", label: "Nano Banana Pro" }` vào `MODELS` constant trong [app/page.tsx](../../app/page.tsx)
- [ ] Mở rộng logic `maxImages` thành per-model lookup (GPT = 16, Pro = 8, Nano 2 = 14)

### Technical Details

**File:** `app/page.tsx`

**Lines 52–55 — thêm model entry (giữ thứ tự Nano 2 → Pro → GPT):**
```ts
const MODELS = [
  { id: "nano-banana-2", label: "Nano Banana 2" },
  { id: "nano-banana-pro", label: "Nano Banana Pro" },
  { id: "gpt-image-2-image-to-image", label: "GPT Image-2 (img→img)" },
] as const;
```

**Line 194 — per-model max:**
```ts
const maxImages = model === "gpt-image-2-image-to-image" ? 16 : model === "nano-banana-pro" ? 8 : 14;
```

**Không đổi các phần khác của frontend:**

- Model `<select>` ở [lines 622–630](../../app/page.tsx#L622-L630) render từ `MODELS` dynamic — auto có option mới.
- `isGptImage2` tại [line 193](../../app/page.tsx#L193) không đổi. Nano Banana Pro sẽ rơi vào nhánh `!isGptImage2` → settings panel visible, image upload optional — đúng behavior mong muốn.
- `missingImages` tại [line 200](../../app/page.tsx#L200) chỉ kiểm tra `isGptImage2` → Pro không bị ép required.
- Upload label tại [line 528](../../app/page.tsx#L528) đọc `maxImages` nên tự động hiển thị `(optional, up to 8)`.
- Placeholder text `Up to ${maxImages} files` ở [line 571](../../app/page.tsx#L571) và "+" button guard ở [line 593](../../app/page.tsx#L593) cũng đọc `maxImages` nên tự reflect limit mới.
- `handleBulkGenerate` tại [lines 314–321](../../app/page.tsx#L314-L321) đã gửi field `model` trong body → không cần đổi.

---

## Phase 3: Verification

End-to-end verify model mới chạy qua full flow.

### Tasks

- [ ] Chạy `npx tsc --noEmit` — phải pass không errors
- [ ] Chạy `npm run build` — phải pass
- [ ] Chạy `npm run dev` và verify trong browser:
  - Dropdown hiển thị 3 option
  - Chọn Nano Banana Pro → Aspect/Resolution/Format controls visible
  - Upload label đọc `(optional, up to 8)`
  - Kéo 9 ảnh vào → chỉ 8 ảnh được accept (remaining logic)
- [ ] Generate thử 1 ảnh với Pro + prompt ngắn, 0 ảnh reference — DevTools Network check body `POST /api/create-tasks` chứa `model: "nano-banana-pro"` + đầy đủ aspectRatio/resolution/outputFormat; task poll tới `success` và render trong gallery
- [ ] Negative test: `curl` `/api/create-tasks` với 9 URLs trong `imageUrls` + `model: "nano-banana-pro"` → expect HTTP 400 với message `"Nano Banana Pro supports maximum 8 input images"`

### Technical Details

**Verification curl** (negative test):
```bash
curl -X POST http://localhost:3000/api/create-tasks \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nano-banana-pro",
    "prompts": ["test"],
    "aspectRatio": "1:1",
    "resolution": "1K",
    "outputFormat": "png",
    "imageUrls": ["u1","u2","u3","u4","u5","u6","u7","u8","u9"]
  }'
```
Expect: `{"detail":"Nano Banana Pro supports maximum 8 input images"}` với status 400.
