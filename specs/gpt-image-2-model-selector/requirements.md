# Requirements: GPT Image-2 Model Selector

## What & Why

Kie AI vừa phát hành model mới `gpt-image-2-text-to-image`. Project hiện tại hardcode model `nano-banana-2` trong API route. Feature này thêm dropdown cho phép user chọn giữa 2 models mà không break flow hiện tại.

Vấn đề cốt lõi: GPT Image-2 có input schema **khác hoàn toàn** nano-banana-2 — không hỗ trợ `aspect_ratio`, `resolution`, `output_format`, `image_input`. Gửi sai fields có thể bị Kie API reject (đã có precedent ở commit `7abb880`).

## Acceptance Criteria

- [ ] UI có dropdown "Model" ở đầu section Settings
- [ ] Default model là `nano-banana-2` (backward compat)
- [ ] Khi chọn `GPT Image-2`: Aspect Ratio, Resolution, Format selects bị ẩn hoàn toàn
- [ ] Khi chọn `GPT Image-2`: khu vực upload Image Input bị ẩn hoàn toàn
- [ ] Switch lại `nano-banana-2`: tất cả controls hiện lại với state cũ (không reset)
- [ ] Backend gửi đúng request body theo model được chọn:
  - nano-banana-2: `{ prompt, aspect_ratio, resolution, output_format, image_input? }`
  - gpt-image-2: `{ prompt, nsfw_checker: false }`
- [ ] `nsfw_checker` hardcode `false`, không expose ra UI
- [ ] Polling và gallery flow hoạt động như cũ với cả 2 models
- [ ] Bulk generation (nhiều prompts) hoạt động với GPT Image-2
- [ ] `npm run lint` pass — không TypeScript errors

## Dependencies

- Kie AI API key (`KIE_API_KEY`) — đã có trong `.env`, dùng chung cho cả 2 models
- Không cần thêm packages mới
- Poll endpoint `/recordInfo` là model-agnostic, không cần đổi
