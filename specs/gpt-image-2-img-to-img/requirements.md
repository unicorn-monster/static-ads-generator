# Requirements: Swap GPT Image-2 to Image-to-Image variant

## What & Why

Phiên trước đã add `gpt-image-2-text-to-image` vào dropdown — nhưng đó là nhầm. User thực sự cần **`gpt-image-2-image-to-image`**. Feature này thay thế biến thể text-to-image bằng image-to-image.

Khác biệt cốt lõi:

| | text-to-image (đang có) | image-to-image (mục tiêu) |
|---|---|---|
| Input fields | `{ prompt, nsfw_checker }` | `{ prompt, input_urls, nsfw_checker }` |
| Image upload | Ẩn | **Hiện, bắt buộc 1-16 ảnh** |
| URL field name | — | `input_urls` (**không** phải `image_input`) |

Vấn đề cốt lõi: model mới **yêu cầu** 1-16 ảnh input, hành vi ngược với text-to-image (phải SHOW upload area, không HIDE).

## Acceptance Criteria

- [ ] Dropdown option cũ `GPT Image-2` (text-to-image) được thay bằng `GPT Image-2 (img→img)`
- [ ] Model ID mới trong code: `gpt-image-2-image-to-image`
- [ ] Khi chọn GPT Image-2 (img→img):
  - Aspect Ratio / Resolution / Format vẫn ẩn
  - Image Input section **HIỆN** (không ẩn như trước)
  - Label đổi sang `(required, 1–16)` thay vì `(optional, up to 14)`
  - Drop zone helper text phản ánh max 16 files
- [ ] Upload max dynamic: 14 cho nano-banana-2, 16 cho GPT Image-2
- [ ] Generate button **disabled** khi chọn GPT Image-2 mà chưa upload ảnh nào
- [ ] Hint `"Upload at least 1 image to generate with GPT Image-2."` xuất hiện dưới nút khi disabled do thiếu ảnh
- [ ] Backend gửi đúng request body:
  - nano-banana-2: `{ prompt, aspect_ratio, resolution, output_format, image_input? }` (unchanged)
  - GPT Image-2: `{ prompt, input_urls: [...], nsfw_checker: false }`
- [ ] Server-side validation: trả 400 nếu GPT Image-2 mà `imageUrls` empty hoặc > 16
- [ ] `nsfw_checker` hardcode `false`
- [ ] `npx tsc --noEmit` pass — không TypeScript errors

## Dependencies

- Feature kế thừa từ spec trước (`specs/gpt-image-2-model-selector/`): model selector, state `model`, `isGptImage2` đã có sẵn
- Kie AI API key (`KIE_API_KEY`) — đã có trong `.env`
- Không cần packages mới
- Poll endpoint giữ nguyên (model-agnostic)

## Notes

- Backend vẫn nhận field `imageUrls` từ frontend như cũ, nhưng map sang `image_input` (nano-banana-2) hoặc `input_urls` (GPT Image-2) bên trong `createKieTask`.
- Max 16 phải enforce cả frontend (UX) và backend (safety).
