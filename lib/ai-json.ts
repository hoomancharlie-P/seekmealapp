/**
 * 從 AI 回傳文字中抽取可解析的 JSON 字串（移除 markdown、抽取第一個 {...}），
 * 供 generate-meals、travel-mode 等共用，減少 "Unexpected token" 等解析錯誤。
 */
export function extractJsonFromAiResponse(text: string): string {
  let clean = text
    .trim()
    .replace(/^```json?\n?/g, '')
    .replace(/```\n?$/g, '')
    .trim()
  const match = clean.match(/\{[\s\S]*\}/)
  if (match) clean = match[0]
  return clean
}
