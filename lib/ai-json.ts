/**
 * 從 AI 回傳文字中抽取可解析的 JSON 字串（移除 markdown、抽取第一個 {...}），
 * 並修復常見的非法格式（如 trailing comma），供 generate-meals、travel-mode 等共用。
 */
export function extractJsonFromAiResponse(text: string): string {
  let clean = text
    .trim()
    .replace(/^```json?\n?/g, '')
    .replace(/```\n?$/g, '')
    .trim()
  const match = clean.match(/\{[\s\S]*\}/)
  if (match) clean = match[0]
  // 移除 trailing comma（例如 },] 或 ,,]），否則 JSON.parse 會報 Unexpected token
  clean = clean.replace(/,+(\s*[}\]])/g, '$1')
  return clean
}
