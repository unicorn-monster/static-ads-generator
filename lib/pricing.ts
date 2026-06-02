// Kie credit → VND. 1 credit = $0.005 (Kie rate) × 26,300đ (USD/VND) = 131.5đ.
export const CREDIT_VND = 0.005 * 26300; // 131.5

/** Credits → VND, rounded up to the nearest 100 for readability. */
export function creditsToVnd(credits: number): number {
  return Math.ceil((credits * CREDIT_VND) / 100) * 100;
}

export function formatVnd(n: number): string {
  return n.toLocaleString("vi-VN");
}
