// 화면 오류를 보내기 전에 이 기기에서 먼저 빼는 것 (서버가 다시 한 번 더 뺀다: engine/server/net/web.ts의 scrub). 화면 요소를 읽지 않는다 (node의 시험이 그대로 읽는다).
/** 주소의 쿼리·조각, 긴 16진(토큰), 이메일을 뺀다 */
export function scrubLocal(s: string): string {
  return s
    .replace(/([^\s?#)]*)[?#][^\s)]*/g, '$1')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>');
}
