// 카드 수수료율 13.3%. 카드 최종액 = floor(원금 × 867 / 1000) (정수연산으로 DB의 floor(original*0.867)와 일치).
export const CARD_FEE_RATE = 0.133;

export function finalAmount(type, original) {
  const n = Number(original) || 0;
  return type === '현금' ? n : Math.floor((n * 867) / 1000);
}
