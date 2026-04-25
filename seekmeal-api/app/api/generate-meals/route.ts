import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { extractJsonFromAiResponse } from '@/lib/ai-json'

// 不在模組頂層建立 client，避免 build 時 env 未注入導致 supabaseKey is required
export const dynamic = 'force-dynamic'
/** 允許 Gemini 呼叫 + 重試 + DB 寫入有足夠時間完成（避免在「Average errors」後因逾時中斷） */
export const maxDuration = 60

/** 短期快取：同一用戶、同一開始日、同一 days 在 TTL 內不重複呼叫 Gemini（減輕 429） */
const generationCache = new Map<string, { timestamp: number; data: unknown }>()
const CACHE_TTL_MS = 60_000 // 1 分鐘

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      userId, 
      calorieTarget, 
      proteinTarget, 
      carbsTarget, 
      fatTarget, 
      fiberTarget, 
      days = 3,
      dietaryRestrictions = [],
      dietaryHabit = 'none',
      allergies = [],
      forceReplace = false,
      clearCache = false,
      startDate: clientStartDate,
      locale = 'zh-TW'
    } = body

    console.log('🤖 Generating meals for user (v2 DB-first):', userId, 'locale:', locale)
    console.log('📊 Targets:', { calorieTarget, proteinTarget, carbsTarget, fatTarget, fiberTarget })
    console.log('🍽️ Dietary preferences:', { dietaryRestrictions, dietaryHabit, allergies })

    // 驗證參數
    if (!userId || !calorieTarget) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })
    }

    // 快取 key：同一用戶、同一開始日、同一 days
    const startDateStr =
      clientStartDate && /^\d{4}-\d{2}-\d{2}$/.test(String(clientStartDate))
        ? String(clientStartDate)
        : new Date().toISOString().slice(0, 10)
    const cacheKey = `${userId}-${startDateStr}-${days}`

    if (clearCache || forceReplace) {
      const keysToDelete = Array.from(generationCache.keys()).filter((k) => k.startsWith(`${userId}-`))
      keysToDelete.forEach((k) => generationCache.delete(k))
      console.log('🗑️ Cleared cache for user:', userId, keysToDelete.length, 'entries')
    }

    const cached = generationCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log('💾 Returning cached meal generation for', cacheKey)
      return NextResponse.json(cached.data as object)
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: 'Supabase 需設定 SUPABASE_SERVICE_ROLE_KEY 以寫入餐單與食物。請在 Vercel → Environment Variables 設定後重新部署。' },
        { status: 500 }
      )
    }
    const supabase = createClient(url, serviceKey)

    // 使用 v1beta API 中可用的模型（測試確認 gemini-2.0-flash 可用）
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
    console.log(`🤖 Using model: ${modelName}`)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: modelName })

    // 計算每餐卡路里分配
    const breakfastCal = Math.round(calorieTarget * 0.25)
    const lunchCal = Math.round(calorieTarget * 0.35)
    const dinnerCal = Math.round(calorieTarget * 0.3)
    const snackCal = Math.round(calorieTarget * 0.1)

    // 計算每餐營養素分配（按比例）
    const breakfastProtein = Math.round(proteinTarget * 0.25)
    const lunchProtein = Math.round(proteinTarget * 0.35)
    const dinnerProtein = Math.round(proteinTarget * 0.3)
    const snackProtein = Math.round(proteinTarget * 0.1)

    const breakfastCarbs = Math.round(carbsTarget * 0.25)
    const lunchCarbs = Math.round(carbsTarget * 0.35)
    const dinnerCarbs = Math.round(carbsTarget * 0.3)
    const snackCarbs = Math.round(carbsTarget * 0.1)

    const breakfastFat = Math.round(fatTarget * 0.25)
    const lunchFat = Math.round(fatTarget * 0.35)
    const dinnerFat = Math.round(fatTarget * 0.3)
    const snackFat = Math.round(fatTarget * 0.1)

    const breakfastFiber = Math.round(fiberTarget * 0.25)
    const lunchFiber = Math.round(fiberTarget * 0.35)
    const dinnerFiber = Math.round(fiberTarget * 0.3)
    const snackFiber = Math.round(fiberTarget * 0.1)

    // 獲取用戶目標 (Goal)
    const { data: profile } = await supabase
      .from('profiles')
      .select('goal')
      .eq('id', userId)
      .single()
    
    const goal = profile?.goal || 'maintain'
    
    // 根據目標設定修飾詞規則
    let fatModifierInstruction = ''
    if (goal === 'lose_weight') {
      fatModifierInstruction = '   - **減脂目標（CRITICAL）**：\n     - 優先選擇「低脂」、「脫脂」的奶製品或肉類（例如：低脂牛奶、瘦肉、脫脂乳酪）。\n     - 嚴格控制油脂使用。'
    } else {
      fatModifierInstruction = '   - **維持/增肌目標（CRITICAL）**：\n     - 除非必要，否則**避免**使用「低脂」、「脫脂」修飾詞。\n     - 選用全脂或標準版本（例如：全脂牛奶、普通芝士、雞髀肉）。'
    }

    // 構建飲食偏好相關的字符串
    const restrictionNames: Record<string, string> = {
      beef: '牛肉',
      pork: '豬肉',
      chicken: '雞肉',
      seafood: '海鮮',
      egg: '蛋類',
      dairy: '奶類（包括牛奶、芝士、乳酪、忌廉、牛油、奶油等所有乳製品）',
      nuts: '堅果',
      soy: '大豆製品'
    }
    
    const habitNames: Record<string, string> = {
      vegetarian: '素食（不吃任何肉類）',
      low_carb: '低碳水飲食',
      keto: '生酮飲食'
    }
    
    const restrictionsText = dietaryRestrictions.length > 0
      ? `- 不吃的食物：${dietaryRestrictions.map((r: string) => restrictionNames[r] || r).join('、')}\n- ⚠️ 餐單中絕對不能包含以上食材\n- 特別注意：如果有「奶類」限制，絕對不要出現乳酪 (Yogurt)、芝士 (Cheese)、忌廉等乳製品\n- 如需蛋白質，請用其他來源替代（例如：不吃雞肉可用豬肉、魚類、豆腐）\n`
      : ''
    
    const habitText = dietaryHabit !== 'none'
      ? `- 飲食習慣：${habitNames[dietaryHabit] || dietaryHabit}\n${
          dietaryHabit === 'vegetarian' 
            ? '  ⚠️ 重要：用戶是素食者\n  - 絕對不能有任何肉類（牛、豬、雞、魚、海鮮等）\n  - 蛋白質來源：雞蛋、奶類、豆腐、豆類、堅果\n  - 確保蛋白質攝取充足\n' 
            : dietaryHabit === 'low_carb' 
            ? '  ⚠️ 重要：低碳水飲食原則（必須嚴格執行）\n  - 嚴格限制澱粉類主食：盡量不吃或少吃白飯、白麵包、意粉\n  - 推薦替代品：少量糙米、番薯、南瓜、藜麥、或「椰菜花飯」、「蒟蒻麵」\n  - 增加蔬菜和優質蛋白質的比例\n' 
            : dietaryHabit === 'keto' 
            ? '  ⚠️ 重要：生酮飲食原則（必須嚴格執行）\n  - 嚴禁所有穀物（米飯、麵包、麵條、燕麥）\n  - 嚴禁澱粉類蔬菜（薯仔、番薯、粟米）\n  - 嚴禁高糖水果（只能吃少量莓果）\n  - 主要熱量來源：優質油脂（牛油果、堅果、橄欖油）、肉類、魚類、蛋\n' 
            : ''
        }`
      : ''
    
    const allergiesText = allergies.length > 0
      ? `- 過敏食物：${allergies.join('、')}\n- 🚨 非常重要：餐單中絕對不能包含以上食材（會導致過敏反應）\n- 請仔細檢查每一項食物，確保不含過敏原\n`
      : ''

    const languageInstruction = locale === 'en'
      ? '**Language (CRITICAL)**: Generate all food names and meal descriptions in English. Use common English terms (e.g. "Chicken Breast", "Brown Rice", "Steamed Broccoli", "Scrambled Eggs"). Do not use Chinese characters in food names.'
      : '**語言（CRITICAL）**：只使用繁體中文（廣東話）。絕對禁止使用英文、拼音、孟加拉文或其他外語字符（除非是常用的英文縮寫如 BBQ）。'

    // 構建 prompt
    const prompt = `你是一個專業的香港營養師，專門為香港用戶設計餐單。

請為用戶生成 ${days} 天的餐單，每天包含 4 餐（早餐、午餐、晚餐、小食）。

用戶營養目標（CRITICAL - 必須精確匹配）：
- 每日卡路里：${calorieTarget} 卡（必須等於或非常接近，誤差 < 2%）
- 蛋白質：${proteinTarget}g（必須等於或非常接近，誤差 < 2%）
- 碳水化合物：${carbsTarget}g（必須等於或非常接近，誤差 < 2%）
- 脂肪：${fatTarget}g（必須等於或非常接近，誤差 < 2%）
- 纖維：${fiberTarget}g（必須等於或非常接近，誤差 < 5%）

每餐營養素分配（參考值，可微調以確保每天總和 = 目標值）：
- 早餐：約 ${breakfastCal} 卡，${breakfastProtein}g 蛋白質，${breakfastCarbs}g 碳水，${breakfastFat}g 脂肪，${breakfastFiber}g 纖維
- 午餐：約 ${lunchCal} 卡，${lunchProtein}g 蛋白質，${lunchCarbs}g 碳水，${lunchFat}g 脂肪，${lunchFiber}g 纖維
- 晚餐：約 ${dinnerCal} 卡，${dinnerProtein}g 蛋白質，${dinnerCarbs}g 碳水，${dinnerFat}g 脂肪，${dinnerFiber}g 纖維
- 小食：約 ${snackCal} 卡，${snackProtein}g 蛋白質，${snackCarbs}g 碳水，${snackFat}g 脂肪，${snackFiber}g 纖維

用戶飲食偏好：
${restrictionsText}${habitText}${allergiesText}

設計要求：

1. 食物名稱和份量（CRITICAL - 語言限制）：
   - ${languageInstruction}
   - 明確份量（中文模式例如：雞蛋 2隻、雞胸肉 150g、糙米飯 1碗；英文模式例如：2 Eggs, 150g Chicken Breast, 1 bowl Brown Rice）
   - 不要用小數份量（例如：不要「雞蛋 1.5隻」，用「雞蛋 2隻」）
   - **視覺化份量描述（CRITICAL）**：
     - 對於需要秤重或抽象的單位（如 g、克、碗、杯），必須在括號內加入視覺輔助描述。
     - 規則：
       - 肉類/魚類（g/克）：加入「(約手掌心大小)」或「(約一部手機大小)」
       - 飯/麵/蔬菜（碗）：加入「(約拳頭大小)」
       - 湯/液體（碗/杯）：加入「(約 250ml)」或「(標準飯碗)」
     - 例外：明確數量的單位（如 隻、片、罐、條、粒）**不需要**加描述。
     - ✅ 正確例子：「雞胸肉 150g (約手掌心大小)」、「蕃茄蛋花湯 1碗 (約 250ml)」、「雞蛋 1隻」
   - **避免廚餘/浪費（CRITICAL）**：
     - 對於無法拆分的單件食物（如水果、包裝食品），必須使用整數份量。
     - ❌ 錯誤：香蕉 0.5條、蘋果 0.3個、吞拿魚 0.4罐
     - ✅ 正確：小型香蕉 1條、細蘋果 1個、吞拿魚 1罐（可搭配其他餐）
     - 如果營養素超標，請更換為卡路里較低的其他完整食材，而不是將食材切半。
   - **食物描述真實性（CRITICAL）**：
     - **「無糖」限制**：
       - ✅ 允許：常見的代糖飲品（如「無糖可樂」、「無糖綠茶」、「無糖豆漿」）。
       - ❌ 禁止：在天然或通常含糖的食品上隨意添加「無糖」字眼，除非市面非常普遍（例如：不要寫「無糖花生醬」、「無糖果醬」，除非用戶要求生酮飲食，否則請寫「花生醬」、「果醬」即可）。
     - **修飾詞使用規則（根據用戶目標）**：
    ${fatModifierInstruction}
     - **禁止獨立調味料（CRITICAL）**：
       - ❌ 禁止：將「油」、「鹽」、「醬油」、「糖」、「胡椒粉」、「橄欖油」等調味料單獨列為一項食物。
       - ✅ 正確：將烹飪用油和調味的熱量計入主菜中，或者在主菜名稱中體現（例如「蒜蓉炒菜心」、「煎豬扒」），不要單獨列一行「橄欖油 1茶匙」。
     - **複合食物拆分規則（CRITICAL）**：
       - **碟頭飯/蓋飯**：必須拆分為「主菜」和「主食」兩項。
         - ❌ 避免：「雞扒飯 1碟」、「肉醬意粉 1碟」
         - ✅ 正確：「煎雞扒 1件」+「白飯 1碗」；「免治牛肉醬 1份」+「意粉 1碗」
       - **老火湯/滾湯**：如果湯料是主要營養來源，必須註明「連湯渣」或將湯料拆分列出。
         - ✅ 正確：「番茄薯仔魚湯 (連魚肉、薯仔) 1碗」或 「鯇魚肉 (湯渣) 100g」+「番茄薯仔湯 1碗」

2. 符合香港飲食習慣：
   - 常見食材：雞蛋、麵包、牛奶、雞肉、豬肉、牛肉、魚類、米飯、粉麵、蔬菜、豆、生果
   - 常見烹調：水煮、蒸、炒、焗、湯
   - 常見場景：茶餐廳、茶樓、街市、超市
   - **早餐特別限制（CRITICAL）**：
     - ❌ 禁止：豆腐花、糖水、甜品、雪糕、薯片。
     - ✅ 推薦：麵包、多士、三文治、麥皮、通粉、米粉、雞蛋、以及簡單的蒸點（如燒賣、饅頭）。

3. 嚴格遵守飲食偏好（CRITICAL）：
   - 不吃的食物：**完全避免**，檢查每一個成分
   - 奶類限制：**嚴禁**使用牛奶、乳酪、芝士、忌廉、牛油
   - 素食者：**嚴禁**使用任何肉類（牛、豬、雞、魚、海鮮）
   - 過敏食物：**絕對不能**出現

4. 營養平衡：
   - 即使有飲食限制，仍要達到營養目標
   - 素食者：確保蛋白質充足（蛋、奶、豆製品）
   - 不吃某類肉：用其他蛋白質替代

5. 營養素準確性（CRITICAL - 數學檢查）：
   - **每天所有食物的卡路里總和必須等於 ${calorieTarget} (誤差 ±2%)**。請自行檢查加總。
   - **計算方法：**
     * 先計算每餐的食物營養素總和
     * 確保每天 4 餐的營養素總和 = 目標值
     * 如果總和不匹配，調整食物份量直到匹配
   - **每餐食物數量規則**：
     - 早餐、小食：包含 1-3 項食物（保持簡單）
     - 午餐、晚餐：包含 3-4 項食物（保持豐富）
   - 每項食物的營養素要實際可行及準確（例如：雞蛋 2隻 = 約 140卡，12g 蛋白質，不是 200卡）
   - **驗證：每天結束時，calories + protein + carbs + fat + fiber 的總和必須等於目標值**

6. 餐單設計原則：
   - 早餐：簡單易準備（5-10分鐘）
     例如：雞蛋、麵包、燕麥、水果
   
   - 午餐：營養豐富、飽腹感強
     例如：肉類 + 米飯/粉麵 + 蔬菜
   
   - 晚餐：均衡健康、不過量
     例如：魚類/瘦肉 + 糙米/藜麥 + 大量蔬菜
   
   - 小食：低卡健康、易攜帶
     例如：水果、原味堅果、蔬菜條

7. 多樣性：
   - ${days} 天內不要重複相同餐單
   - 每天的食物種類要有變化
   - 蛋白質來源要多樣（雞、豬、魚、蛋、豆）

回傳格式（CRITICAL）：
- 只回傳 JSON，不要任何其他文字
- 不要使用 markdown code block（不要 \`\`\`json）
- 確保 JSON 格式正確

JSON 結構：
{
  "meals": [
    {
      "day": 1,
      "type": "breakfast",
      "emoji": "🌅",
      "calories": ${breakfastCal},
      "protein": 15,
      "carbs": 40,
      "fat": 8,
      "fiber": 5,
      "foods": [
        {
          "name": "水煮蛋 2隻",
          "calories": 140,
          "protein": 12,
          "carbs": 2,
          "fat": 10,
          "fiber": 0
        },
        {
          "name": "全麥麵包 2片",
          "calories": 160,
          "protein": 6,
          "carbs": 30,
          "fat": 2,
          "fiber": 4
        }
      ]
    }
  ]
}

欄位說明：
- day: 1-${days}（第幾天）
- type: "breakfast", "lunch", "dinner", "snack"
- emoji: breakfast="🌅", lunch="🌤️", dinner="🌙", snack="🍎"
- calories, protein, carbs, fat, fiber: 該餐的總營養素（必須準確，所有餐次總和 = 目標值）
- foods: 該餐包含的食物清單
  - name: 食物名稱 + 份量（${locale === 'en' ? 'Use English only for food names' : '必須是純廣東話，禁止英文/外語'}）
  - calories, protein, carbs, fat, fiber: 該食物的營養素（所有食物總和 = 該餐的營養素）

總共生成：${days * 4} 個餐次（${days} 天 × 4 餐）

**重要驗證步驟（生成後必須檢查）：**
1. 每天 4 餐的 calories 總和必須 = ${calorieTarget} 卡（誤差 < 2%）
2. 每天 4 餐的 protein 總和必須 = ${proteinTarget}g（誤差 < 2%）
3. 每天 4 餐的 carbs 總和必須 = ${carbsTarget}g（誤差 < 2%）
4. 每天 4 餐的 fat 總和必須 = ${fatTarget}g（誤差 < 2%）
5. 每天 4 餐的 fiber 總和必須 = ${fiberTarget}g（誤差 < 5%）
6. 每餐的 foods 營養素總和必須 = 該餐的營養素值

請立即生成餐單（純 JSON，無其他文字），確保每天總和精確匹配目標值：`

    console.log('📤 Sending request to Gemini...')

    let result, response, text
    try {
      console.log('📤 Sending request to Gemini...')
      result = await model.generateContent(prompt)
      response = result.response
      text = response.text()
      console.log('📥 Received response from Gemini')
      console.log('Response length:', text.length)
    } catch (apiError: any) {
      const isRateLimitError =
        apiError.message?.includes('429') ||
        apiError.message?.includes('Too Many Requests') ||
        apiError.message?.includes('Resource exhausted')
      if (isRateLimitError) {
        throw new Error('今日 AI 配額已用完，請明天再試')
      }
      throw apiError
    }

    if (!text) {
      return NextResponse.json({ error: 'No response from AI', details: 'Empty response from Gemini' }, { status: 500 })
    }

    // 共用 JSON 抽取邏輯（lib/ai-json），減少 Unexpected token
    const cleanText = extractJsonFromAiResponse(text)
    console.log('Cleaned response (first 300 chars):', cleanText.substring(0, 300))

    // 解析 JSON（若失敗可嘗試移除 BOM/控制字元後重試）
    let mealsData: { meals?: unknown[] }
    try {
      mealsData = JSON.parse(cleanText)
    } catch (parseError) {
      const fallback = cleanText.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim()
      try {
        mealsData = JSON.parse(fallback)
      } catch {
        console.error('❌ JSON parse error:', parseError)
        console.error('Raw text (first 1000 chars):', cleanText.substring(0, 1000))
        return NextResponse.json(
          {
            error: 'Failed to parse AI response',
            details: cleanText.substring(0, 500),
            parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
          },
          { status: 500 }
        )
      }
    }

    // 驗證回應格式
    if (!mealsData.meals || !Array.isArray(mealsData.meals)) {
      console.error('❌ Invalid response format:', mealsData)
      return NextResponse.json(
        { error: 'Invalid response format from AI', details: JSON.stringify(mealsData).substring(0, 200) },
        { status: 500 }
      )
    }

    console.log('✅ Generated', mealsData.meals.length, 'meals')

    // 按天分組：AI 可能回傳 day 0/1/2 或 1/2/3，一律正規化為 1-based（1=今天, 2=明天, 3=後天）
    const mealsByDay: { [key: number]: any[] } = {}
    mealsData.meals.forEach((meal: any) => {
      const rawDay = meal.day
      const dayKey = typeof rawDay === 'number' && rawDay >= 1 && rawDay <= days
        ? rawDay
        : (typeof rawDay === 'number' ? Math.min(days, Math.max(1, rawDay + 1)) : 1)
      if (!mealsByDay[dayKey]) mealsByDay[dayKey] = []
      mealsByDay[dayKey].push(meal)
    })
    const sampleDays = mealsData.meals.slice(0, 4).map((m: any) => m.day)
    console.log('📅 Sample meal.day from AI:', sampleDays, '→ normalized to 1-based')

    // 先寫入 DB（逾時前完成），再跑驗證與統計
    // 日期範圍：若前端傳 startDate（用戶當地「今天」），則從該日開始算 days 天，避免時區導致「後天」空白
    console.log('📝 [DB] Starting write step...')
    const parseStart = (str: string): Date => {
      const [y, m, d] = (str || '').split('-').map(Number)
      if (!y || !m || !d) return new Date()
      const date = new Date(y, m - 1, d)
      return isNaN(date.getTime()) ? new Date() : date
    }
    const startDay = clientStartDate && /^\d{4}-\d{2}-\d{2}$/.test(String(clientStartDate))
      ? parseStart(String(clientStartDate))
      : new Date()
    startDay.setHours(0, 0, 0, 0)
    const toDateStr = (date: Date) => {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    const datesToCheck: string[] = []
    for (let d = 0; d < days; d++) {
      const d2 = new Date(startDay)
      d2.setDate(startDay.getDate() + d)
      datesToCheck.push(toDateStr(d2))
    }
    console.log('📝 [DB] datesToCheck=', datesToCheck, clientStartDate ? `(client startDate: ${clientStartDate})` : '(server today)')
    let existingMeals: { date: string; type: string }[] | null = null
    try {
      const res = await supabase
        .from('meals')
        .select('date, type')
        .eq('user_id', userId)
        .in('date', datesToCheck)
      existingMeals = res.data ?? null
      if (res.error) {
        console.error('❌ [DB] Fetch existing meals error:', res.error)
        return NextResponse.json({ error: '查詢既有餐單失敗', details: res.error.message }, { status: 500 })
      }
    } catch (e: any) {
      console.error('❌ [DB] Fetch existing meals threw:', e?.message ?? e)
      return NextResponse.json({ error: '查詢既有餐單失敗', details: e?.message ?? String(e) }, { status: 500 })
    }
    const normalizeDate = (d: string) => (d && d.includes('T')) ? d.split('T')[0] : (d || '')
    const normalizeType = (t: string) => (t || '').toLowerCase()
    const existingSet = new Set(
      (existingMeals ?? []).map((m) => `${normalizeDate(m.date)}-${normalizeType(m.type)}`)
    )
    if (forceReplace) {
      const { data: existingRows } = await supabase
        .from('meals')
        .select('id')
        .eq('user_id', userId)
        .in('date', datesToCheck)
      const ids = (existingRows ?? []).map((r: { id: string }) => r.id)
      if (ids.length > 0) {
        await supabase.from('foods').delete().in('meal_id', ids)
        const { error: delErr } = await supabase.from('meals').delete().eq('user_id', userId).in('date', datesToCheck)
        if (delErr) console.error('❌ [DB] forceReplace delete meals:', delErr)
        existingSet.clear()
        console.log('📝 [DB] forceReplace: cleared', ids.length, 'existing meals for date range')
      }
    }
    const mealsToInsert: Array<{
      user_id: string
      date: string
      type: string
      emoji: string
      calories: number
      protein: number
      carbs: number
      fat: number
      fiber: number
      consumed: boolean
      is_special_event: boolean
      is_adjusted: boolean
    }> = []
    const foodsByKey: Record<string, Array<{ name: string; calories: number; protein: number; carbs: number; fat: number; fiber?: number; order: number }>> = {}
    for (let dayOffset = 0; dayOffset < days; dayOffset++) {
      const dateStr = datesToCheck[dayOffset]
      const dayMeals = mealsByDay[dayOffset + 1] ?? []
      for (let i = 0; i < dayMeals.length; i++) {
        const meal: any = dayMeals[i]
        const typeNorm = normalizeType(meal.type || '')
        const key = `${dateStr}-${typeNorm}`
        if (existingSet.has(key)) continue
        mealsToInsert.push({
          user_id: userId,
          date: dateStr,
          type: typeNorm,
          emoji: meal.emoji ?? '🍽️',
          calories: meal.calories ?? 0,
          protein: meal.protein ?? 0,
          carbs: meal.carbs ?? 0,
          fat: meal.fat ?? 0,
          fiber: meal.fiber ?? 0,
          consumed: false,
          is_special_event: false,
          is_adjusted: false,
        })
        if (meal.foods?.length) {
          foodsByKey[key] = meal.foods.map((f: any, idx: number) => ({
            name: String(f.name || '').trim() || '未命名',
            calories: Math.round(Number(f.calories) || 0),
            protein: Math.round(Number(f.protein) || 0),
            carbs: Math.round(Number(f.carbs) || 0),
            fat: Math.round(Number(f.fat) || 0),
            fiber: Math.round(Number(f.fiber) || 0),
            order: idx,
          }))
        }
      }
    }
    let skipped = false
    console.log('📝 [DB] userId=', userId, 'existingSet.size=', existingSet.size, 'mealsToInsert.length=', mealsToInsert.length)
    if (mealsToInsert.length === 0 && mealsData.meals.length > 0) {
      console.warn('⚠️ No meals to insert despite AI returned', mealsData.meals.length, 'meals. mealsByDay keys:', Object.keys(mealsByDay))
    }
    if (mealsToInsert.length > 0) {
      console.log('📝 [DB] Inserting', mealsToInsert.length, 'meals...')
      let insertedMeals: { id: string; date: string; type: string }[] | null = null
      try {
        const insertRes = await supabase
          .from('meals')
          .insert(mealsToInsert)
          .select('id, date, type')
        insertedMeals = insertRes.data ?? null
        if (insertRes.error) {
          console.error('❌ [DB] Insert meals error:', insertRes.error)
          return NextResponse.json({ error: '寫入餐單失敗', details: insertRes.error.message }, { status: 500 })
        }
      } catch (e: any) {
        console.error('❌ [DB] Insert meals threw:', e?.message ?? e)
        return NextResponse.json({ error: '寫入餐單失敗', details: e?.message ?? String(e) }, { status: 500 })
      }
      if (insertedMeals?.length) {
        const foodsToInsert: Array<{
          meal_id: string
          name: string
          calories: number
          protein: number
          carbs: number
          fat: number
          fiber: number
          order: number
        }> = []
        for (const row of insertedMeals) {
          const key = `${row.date}-${row.type}`
          const foods = foodsByKey[key]
          if (!foods?.length) continue
          for (const f of foods) {
            foodsToInsert.push({
              meal_id: row.id,
              name: f.name,
              calories: Math.round(Number(f.calories) || 0),
              protein: Math.round(Number(f.protein) || 0),
              carbs: Math.round(Number(f.carbs) || 0),
              fat: Math.round(Number(f.fat) || 0),
              fiber: Math.round(Number(f.fiber) || 0),
              order: f.order,
            })
          }
        }
        if (foodsToInsert.length > 0) {
          console.log('📝 [DB] Inserting', foodsToInsert.length, 'foods...')
          const { error: insertFoodsError } = await supabase.from('foods').insert(foodsToInsert)
          if (insertFoodsError) {
            console.error('❌ [DB] Insert foods error:', insertFoodsError)
            return NextResponse.json({ error: '寫入食物失敗', details: insertFoodsError.message }, { status: 500 })
          }
          console.log('✅ [DB] Inserted', insertedMeals.length, 'meals and', foodsToInsert.length, 'foods')
        } else {
          console.log('✅ [DB] Inserted', insertedMeals.length, 'meals (no foods)')
        }
      }
    } else {
      skipped = true
      console.log('⏭️ No new meals to insert (all exist)')
    }
    console.log('📝 [DB] Write step done')

    // 驗證每天的營養素總和
    const dayStats: Array<{
      day: number
      totals: { calories: number; protein: number; carbs: number; fat: number; fiber: number }
      errors: { calories: number; protein: number; carbs: number; fat: number; fiber: number }
    }> = []

    for (let day = 1; day <= days; day++) {
      const dayMeals = mealsByDay[day] || []
      const dayTotals = dayMeals.reduce(
        (acc: any, meal: any) => ({
          calories: acc.calories + (meal.calories || 0),
          protein: acc.protein + (meal.protein || 0),
          carbs: acc.carbs + (meal.carbs || 0),
          fat: acc.fat + (meal.fat || 0),
          fiber: acc.fiber + (meal.fiber || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
      )

      const dayErrors = {
        calories: (Math.abs(dayTotals.calories - calorieTarget) / calorieTarget) * 100,
        protein: (Math.abs(dayTotals.protein - proteinTarget) / proteinTarget) * 100,
        carbs: (Math.abs(dayTotals.carbs - carbsTarget) / carbsTarget) * 100,
        fat: (Math.abs(dayTotals.fat - fatTarget) / fatTarget) * 100,
        fiber: (Math.abs(dayTotals.fiber - fiberTarget) / fiberTarget) * 100,
      }

      dayStats.push({ day, totals: dayTotals, errors: dayErrors })

      console.log(`📊 Day ${day} totals:`, dayTotals)
      console.log(`📊 Day ${day} errors:`, dayErrors)

      // 如果誤差太大，記錄警告
      if (dayErrors.calories > 5 || dayErrors.protein > 5 || dayErrors.carbs > 5 || dayErrors.fat > 5) {
        console.warn(`⚠️ Day ${day} has large errors!`)
      }
    }

    // 計算平均（用於統計）
    type NutritionTotals = { calories: number; protein: number; carbs: number; fat: number; fiber: number }
    const totals = mealsData.meals.reduce<NutritionTotals>(
      (acc, meal: any) => ({
        calories: acc.calories + (meal.calories || 0),
        protein: acc.protein + (meal.protein || 0),
        carbs: acc.carbs + (meal.carbs || 0),
        fat: acc.fat + (meal.fat || 0),
        fiber: acc.fiber + (meal.fiber || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    )

    const avgPerDay = {
      calories: Math.round(totals.calories / days),
      protein: Math.round(totals.protein / days),
      carbs: Math.round(totals.carbs / days),
      fat: Math.round(totals.fat / days),
      fiber: Math.round(totals.fiber / days),
    }

    console.log('📊 Average per day:', avgPerDay)
    console.log('🎯 Target:', { calorieTarget, proteinTarget, carbsTarget, fatTarget, fiberTarget })

    // 計算平均誤差
    const calorieError = (Math.abs(avgPerDay.calories - calorieTarget) / calorieTarget) * 100
    const proteinError = (Math.abs(avgPerDay.protein - proteinTarget) / proteinTarget) * 100
    const carbsError = (Math.abs(avgPerDay.carbs - carbsTarget) / carbsTarget) * 100
    const fatError = (Math.abs(avgPerDay.fat - fatTarget) / fatTarget) * 100
    const fiberError = (Math.abs(avgPerDay.fiber - fiberTarget) / fiberTarget) * 100

    console.log('📉 Average errors:', {
      calories: calorieError.toFixed(1) + '%',
      protein: proteinError.toFixed(1) + '%',
      carbs: carbsError.toFixed(1) + '%',
      fat: fatError.toFixed(1) + '%',
      fiber: fiberError.toFixed(1) + '%',
    })

    const responsePayload = {
      success: true,
      skipped: !!skipped,
      insertedMealsCount: mealsToInsert.length,
      meals: mealsData.meals,
      stats: {
        totalMeals: mealsData.meals.length,
        days: days,
        avgPerDay: avgPerDay,
        targets: { calorieTarget, proteinTarget, carbsTarget, fatTarget, fiberTarget },
        errors: {
          calories: calorieError.toFixed(1) + '%',
          protein: proteinError.toFixed(1) + '%',
          carbs: carbsError.toFixed(1) + '%',
          fat: fatError.toFixed(1) + '%',
          fiber: fiberError.toFixed(1) + '%',
        },
        dayStats: dayStats, // 每天的詳細統計
      },
    }
    generationCache.set(cacheKey, { timestamp: Date.now(), data: responsePayload })
    return NextResponse.json(responsePayload)
  } catch (error: any) {
    console.error('❌ Error generating meals:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    
    // 檢查是否是 429 錯誤
    const isRateLimitError = error.message?.includes('429') || 
                             error.message?.includes('Too Many Requests') ||
                             error.message?.includes('Resource exhausted')
    
    let errorMessage = '生成餐單失敗'
    let errorDetails = error.message
    
    if (isRateLimitError) {
      errorMessage = '今日 AI 配額已用完，請明天再試'
      errorDetails = 'Gemini API daily quota exceeded'
    } else if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      errorMessage = 'AI API 認證失敗，請檢查 API 密鑰'
    } else if (error.message?.includes('404') || error.message?.includes('Not Found')) {
      errorMessage = 'AI 模型不可用，請檢查配置'
    }
    
    return NextResponse.json({ 
      error: errorMessage, 
      details: errorDetails 
    }, { status: 500 })
  }
}
