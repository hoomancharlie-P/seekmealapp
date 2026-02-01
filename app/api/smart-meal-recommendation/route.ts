import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

// 常見食物組合最低卡路里表
interface FoodComboRule {
  keywords: string[]  // 必須包含的關鍵字（部分匹配）
  minCalories: number  // 最低卡路里
  description: string  // 描述
}

const FOOD_COMBO_RULES: FoodComboRule[] = [
  {
    keywords: ['沙嗲', '多士', '奶茶'],
    minCalories: 650,
    description: '沙嗲牛肉麵 + 牛油多士 + 熱奶茶'
  },
  {
    keywords: ['沙嗲', '多士'],
    minCalories: 550,
    description: '沙嗲牛肉麵 + 牛油多士'
  },
  {
    keywords: ['沙嗲', '奶茶'],
    minCalories: 550,
    description: '沙嗲牛肉麵 + 熱奶茶'
  },
  {
    keywords: ['餐蛋', '多士', '奶茶'],
    minCalories: 600,
    description: '餐蛋麵 + 牛油多士 + 熱奶茶'
  },
  {
    keywords: ['牛腩', '多士', '奶茶'],
    minCalories: 650,
    description: '牛腩麵 + 牛油多士 + 熱奶茶'
  },
  {
    keywords: ['星洲', '多士', '奶茶'],
    minCalories: 650,
    description: '星洲炒米 + 牛油多士 + 熱奶茶'
  },
  {
    keywords: ['公仔麵', '多士', '奶茶'],
    minCalories: 600,
    description: '公仔麵 + 牛油多士 + 熱奶茶'
  },
  {
    keywords: ['即食麵', '多士', '奶茶'],
    minCalories: 600,
    description: '即食麵 + 牛油多士 + 熱奶茶'
  },
  {
    keywords: ['沙嗲'],
    minCalories: 450,
    description: '沙嗲牛肉麵（單項）'
  },
  {
    keywords: ['餐蛋'],
    minCalories: 400,
    description: '餐蛋麵（單項）'
  },
  {
    keywords: ['牛腩'],
    minCalories: 450,
    description: '牛腩麵（單項）'
  }
]

// 根據食物列表重新計算營養素（確保為整數）
function recalculateNutritionFromFoods(foods: any[]): { protein: number; carbs: number; fat: number; fiber: number } {
  return {
    protein: Math.round(foods.reduce((sum, f) => sum + (Number(f.protein) || 0), 0)),
    carbs: Math.round(foods.reduce((sum, f) => sum + (Number(f.carbs) || 0), 0)),
    fat: Math.round(foods.reduce((sum, f) => sum + (Number(f.fat) || 0), 0)),
    fiber: Math.round(foods.reduce((sum, f) => sum + (Number(f.fiber) || 0), 0))
  }
}

// 驗證餐單卡路里和營養素是否合理
function validateMealCalories(
  foods: any[], 
  totalCalories: number, 
  protein: number, 
  carbs: number, 
  fat: number
): { 
  valid: boolean; 
  reason?: string;
  corrected?: { protein: number; carbs: number; fat: number; fiber: number }
} {
  if (!foods || foods.length === 0) {
    return { valid: false, reason: '沒有食物' }
  }
  
  // 構建食物名稱字符串（小寫，用於匹配）
  const foodNames = foods.map(f => (f.name || '').toLowerCase()).join(' ')
  
  // 檢查每個規則
  for (const rule of FOOD_COMBO_RULES) {
    // 檢查是否包含所有關鍵字
    const hasAllKeywords = rule.keywords.every(keyword => 
      foodNames.includes(keyword.toLowerCase())
    )
    
    if (hasAllKeywords) {
      // 如果總卡路里低於最低要求
      if (totalCalories < rule.minCalories) {
        return {
          valid: false,
          reason: `${rule.description} 的最低卡路里應為 ${rule.minCalories} 卡，但當前只有 ${totalCalories} 卡`
        }
      }
    }
  }
  
  // 驗證食物卡路里總和是否等於總卡路里（允許 ±5 卡誤差）
  const sumCalories = foods.reduce((sum, f) => sum + (Number(f.calories) || 0), 0)
  if (Math.abs(sumCalories - totalCalories) > 5) {
    return {
      valid: false,
      reason: `食物卡路里總和 (${sumCalories} 卡) 與總卡路里 (${totalCalories} 卡) 不符`
    }
  }
  
  // **新增：驗證營養素與卡路里的一致性**
  // 營養學公式：卡路里 = 蛋白質×4 + 碳水化合物×4 + 脂肪×9（允許 ±10 卡誤差，因為纖維、酒精等）
  // 確保營養素值為整數
  const roundedProtein = Math.round(protein || 0)
  const roundedCarbs = Math.round(carbs || 0)
  const roundedFat = Math.round(fat || 0)
  const calculatedCalories = roundedProtein * 4 + roundedCarbs * 4 + roundedFat * 9
  const calorieDiff = Math.abs(calculatedCalories - totalCalories)
  
  if (calorieDiff > 10) {
    // 嘗試根據食物列表重新計算營養素
    const recalculated = recalculateNutritionFromFoods(foods)
    const recalculatedCalories = recalculated.protein * 4 + recalculated.carbs * 4 + recalculated.fat * 9
    const recalculatedDiff = Math.abs(recalculatedCalories - totalCalories)
    
    // 如果重新計算後更接近，使用重新計算的值
    if (recalculatedDiff < calorieDiff) {
      return {
        valid: false,
        reason: `營養素與卡路里不一致（計算值：${calculatedCalories} 卡，實際：${totalCalories} 卡，誤差：${calorieDiff} 卡）`,
        corrected: recalculated
      }
    } else {
      return {
        valid: false,
        reason: `營養素與卡路里不一致（計算值：${calculatedCalories} 卡，實際：${totalCalories} 卡，誤差：${calorieDiff} 卡）`
      }
    }
  }
  
  return { valid: true }
}

export async function POST(request: NextRequest) {
  try {
    const {
      userId,
      mealType,           // 'breakfast' | 'lunch' | 'dinner' | 'snack'
      mode,               // 'quick' | 'smart'
      
      // 用戶選擇（智能模式）
      taste,              // 'light' | 'heavy' | 'random'
      location,           // 'eating_out' | 'home_cook'
      style,             // 'comfort' | 'healthy' | 'explore' | 'filling' | 'random'
      cuisines,           // ['hk', 'japanese', 'korean', 'thai', 'western', 'other']
      foodType,           // 'rice' | 'noodles' | 'soup' | 'light'
      customInput,        // 自由輸入
      
      // 營養目標
      targetCalories,
      targetProtein,
      targetCarbs,
      targetFat,
      targetFiber,
      
      // 用戶限制
      dietaryRestrictions,
      dietaryHabit,
      allergies,
      
      // 其他餐次（用於調整）
      otherMeals,          // [{ type, calories, consumed }, ...]
      
      // 增加隨機性（重新推薦時）
      increaseRandomness = false  // boolean
    } = await request.json()
    
    console.log('🤖 Smart meal recommendation:', { mealType, mode, location })
    
    // 使用 v1beta API 中可用的模型（測試確認 gemini-2.0-flash 可用）
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    
    // 構建 prompt
    const mealNames: Record<string, string> = {
      breakfast: '早餐',
      lunch: '午餐',
      dinner: '晚餐',
      snack: '小食'
    }
    
    const tasteText: Record<string, string> = {
      light: '清淡',
      heavy: '重口味',
      random: '隨便'
    }
    
    const locationText: Record<string, string> = {
      eating_out: '外食（茶餐廳、餐廳等）',
      home_cook: '自己煮（家常菜）'
    }
    
    const styleText: Record<string, string> = {
      comfort: 'Comfort food（暖心、熟悉、療癒）',
      healthy: '健康清爽（清淡、營養、無負擔）',
      explore: '嘗試新鮮（探索、特別、不同）',
      filling: '飽足有力（高蛋白、高能量）',
      random: '完全隨機'
    }
    
    const cuisineText: Record<string, string> = {
      hk: '港式',
      japanese: '日本',
      korean: '韓國',
      thai: '泰國',
      western: '西餐',
      other: '其他'
    }
    
    const foodTypeText: Record<string, string> = {
      rice: '飯類',
      noodles: '麵類',
      soup: '湯類',
      light: '輕食'
    }
    
    // 計算當前餐次的目標卡路里
    const currentMealTarget = targetCalories
    
    // 如果是外食，生成 3 個不同卡路里的選項
    const shouldGenerateMultiple = mode === 'smart'
    const isEatingOut = location === 'eating_out'
    
    const selectedCuisines = cuisines && cuisines.length > 0
      ? cuisines.map((c: string) => cuisineText[c] || c).join('、')
      : ''
    
    let prompt = ''
    
    if (mode === 'quick') {
      // 快速生成模式 - 只生成 1 個
      prompt = `你是一個專業的香港營養師。

請為用戶生成 ${mealNames[mealType]}。

用戶需求：
- 地點：${locationText[location]}
- 目標卡路里：${currentMealTarget} 卡

${location === 'eating_out' ? `
重要提示：
這是外食，卡路里可能較高（可以 500-650 卡）
因為用戶之後會自動調整其他餐次
` : `
重要提示：
這是自己煮，請嚴格符合目標卡路里 ${currentMealTarget} 卡（誤差 ±5%）
`}

用戶營養目標：
- 蛋白質：${targetProtein}g
- 碳水化合物：${targetCarbs}g
- 脂肪：${targetFat}g
- 纖維：${targetFiber}g

用戶飲食限制：
${dietaryRestrictions && dietaryRestrictions.length > 0 ? `- 不吃：${dietaryRestrictions.map((r: string) => {
  const names: Record<string, string> = {
    beef: '牛肉', pork: '豬肉', chicken: '雞肉', seafood: '海鮮',
    egg: '蛋類', dairy: '奶類', nuts: '堅果', soy: '大豆製品'
  }
  return names[r] || r
}).join('、')}` : ''}
${dietaryHabit && dietaryHabit !== 'none' ? `- 飲食習慣：${(() => {
  const habits: Record<string, string> = {
    vegetarian: '素食',
    low_carb: '低碳水',
    keto: '生酮飲食'
  }
  return habits[dietaryHabit] || dietaryHabit
})()}` : ''}
${allergies && allergies.length > 0 ? `- 過敏：${allergies.join('、')}` : ''}

要求：
1. 使用香港常見食物和廣東話名稱
2. ${location === 'eating_out' ? '外食選項（茶餐廳、快餐店等）；卡路里須依茶餐廳標準如實估算，**禁止低估**' : '家常菜（容易自己煮）'}
3. 包含 3-4 項食物
4. 遵守飲食限制
5. **營養素計算規則（非常重要）**：
   - **必須根據實際食物計算營養素**，不要使用固定的目標值（${targetProtein}g、${targetCarbs}g、${targetFat}g）
   - 營養素必須符合公式：卡路里 = 蛋白質×4 + 碳水化合物×4 + 脂肪×9（誤差 ±10 卡）
   - 每個食物的營養素相加必須等於總營養素
6. **強制驗證規則**：
   - 各食物卡路里相加必須等於總卡路里（誤差 ±5 卡）
   - 如果包含「沙嗲牛肉麵 + 牛油多士 + 熱奶茶」，總卡路里必須 >= 650 卡
   - 如果包含「沙嗲牛肉麵 + 牛油多士」，總卡路里必須 >= 550 卡
   - 如果包含「餐蛋麵 + 多士 + 奶茶」，總卡路里必須 >= 600 卡
   - 生成後必須自行檢查是否符合以上規則

回傳格式（純 JSON，不要任何其他文字）：
{
  "meal": {
    "calories": 470,
    "protein": 32,
    "carbs": 65,
    "fat": 12,
    "fiber": 5,
    "foods": [
      {
        "name": "雞胸肉",
        "portion": "150g",
        "calories": 165,
        "protein": 31,
        "carbs": 0,
        "fat": 4,
        "fiber": 0
      }
    ]
  }
}

請立即生成（純 JSON）：`

    } else {
      // 智能推薦模式 - 生成 3 個選項
      const selectedStyle = style ? styleText[style] : ''
      const selectedTaste = taste ? tasteText[taste] : ''
      
      prompt = `你是一個專業的香港營養師。

請為用戶推薦 3 個 ${mealNames[mealType]} 選項。

用戶需求：
- 地點：${locationText[location]}
${selectedTaste ? `- 口味：${selectedTaste}` : ''}
${selectedStyle ? `- 風格：${selectedStyle}` : ''}
${selectedCuisines ? `- 菜系偏好：${selectedCuisines}` : ''}
${foodType ? `- 主食類型：${foodTypeText[foodType]}` : ''}
${customInput ? `- 特別要求：${customInput}` : ''}

${location === 'eating_out' ? `
**CRITICAL - 香港茶餐廳卡路里參考（嚴禁低估）：**
- 沙嗲牛肉麵、餐蛋麵、牛腩麵、星洲炒米等：每碟約 450–600 卡
- 牛油多士、奶醬多、西多士：約 150–220 卡／份
- 熱奶茶、熱鴛鴦（少甜）：約 80–120 卡
- 煎蛋、炒蛋：約 90–120 卡
- 即食麵、公仔麵：約 400–500 卡

因此「沙嗲牛肉麵 + 牛油多士 + 熱奶茶」合理總卡約 650–900 卡，**不可**估成 400–500 卡。
若目標卡路里低（如 ${currentMealTarget} 卡），「健康」選項須為輕盈組合：通粉（少油）、灼菜、清湯、無糖咖啡/茶等；**勿**用沙嗲牛、多士、奶茶等高卡組合再壓低數字。

請生成 3 個不同卡路里的選項：

選項 1：健康外食
- 卡路里：接近 ${currentMealTarget} 卡（誤差 ±5%）
- 輕盈組合：通粉、灼菜、清湯、無糖飲品等
- 例如：少飯、走汁、清蒸

選項 2：中等外食
- 卡路里：約 ${Math.round(currentMealTarget * 1.15)} 卡（+15%）
- 正常外食份量，依上述參考如實估算

選項 3：典型外食
- 卡路里：約 ${Math.round(currentMealTarget * 1.35)} 卡（+35%）
- 完整套餐（例：麵/飯 + 多士/蛋 + 飲品），依上述參考如實估算，**禁止低估**
` : `
請生成 3 個不同風格的選項：

所有選項都嚴格符合目標卡路里 ${currentMealTarget} 卡（誤差 ±5%）

選項 1：傳統經典
- 常見、熟悉的家常菜

選項 2：創新健康
- 新鮮、特別的組合

選項 3：簡單方便
- 容易準備、快速
`}

用戶營養目標：
- 蛋白質：${targetProtein}g
- 碳水化合物：${targetCarbs}g
- 脂肪：${targetFat}g
- 纖維：${targetFiber}g

用戶飲食限制：
${dietaryRestrictions && dietaryRestrictions.length > 0 ? `- 不吃：${dietaryRestrictions.map((r: string) => {
  const names: Record<string, string> = {
    beef: '牛肉', pork: '豬肉', chicken: '雞肉', seafood: '海鮮',
    egg: '蛋類', dairy: '奶類', nuts: '堅果', soy: '大豆製品'
  }
  return names[r] || r
}).join('、')}` : ''}
${dietaryHabit && dietaryHabit !== 'none' ? `- 飲食習慣：${(() => {
  const habits: Record<string, string> = {
    vegetarian: '素食',
    low_carb: '低碳水',
    keto: '生酮飲食'
  }
  return habits[dietaryHabit] || dietaryHabit
})()}` : ''}
${allergies && allergies.length > 0 ? `- 過敏：${allergies.join('、')}` : ''}

要求：
1. 使用香港常見食物和廣東話名稱
2. ${location === 'eating_out' ? '外食選項（茶餐廳、快餐店等）；卡路里須依上述茶餐廳參考如實估算，**禁止低估**' : '家常菜（容易自己煮）'}
3. 每個選項包含 3-4 項食物
4. 遵守飲食限制
5. 3 個選項要有明顯區別
6. **營養素計算規則（非常重要）**：
   - **必須根據實際食物計算營養素**，不要使用固定的目標值（${targetProtein}g、${targetCarbs}g、${targetFat}g）
   - 每個選項的營養素應該根據其食物組合而不同
   - 如果卡路里不同，營養素也必須不同
   - 營養素必須符合公式：卡路里 = 蛋白質×4 + 碳水化合物×4 + 脂肪×9（誤差 ±10 卡）
   - 例如：如果選項 1 是 350 卡，選項 2 是 465 卡，它們的營養素必須不同
7. **強制驗證規則**：
   - 各食物卡路里相加必須等於該選項總卡路里（誤差 ±5 卡）
   - 如果包含「沙嗲牛肉麵 + 牛油多士 + 熱奶茶」，總卡路里必須 >= 650 卡
   - 如果包含「沙嗲牛肉麵 + 牛油多士」，總卡路里必須 >= 550 卡
   - 如果包含「餐蛋麵 + 多士 + 奶茶」，總卡路里必須 >= 600 卡
   - 如果包含「牛腩麵 + 多士 + 奶茶」，總卡路里必須 >= 650 卡
   - 生成後必須自行檢查是否符合以上規則，不符合則重新計算
${increaseRandomness ? `
6. **重要：這是重新推薦，請大幅增加隨機性和多樣性**
   - 保持相同的菜系類型（${selectedCuisines || '無特定菜系'}）和風格（${selectedStyle || '無特定風格'}）
   - 但必須使用**完全不同的菜式**和食物組合
   - 避免重複之前推薦過的食物
   - 嘗試更創新、更少見的搭配
   - 增加食物的多樣性和變化
` : ''}

回傳格式（純 JSON，不要任何其他文字）：
{
  "options": [
    {
      "id": 1,
      "name": "健康茶餐廳選擇",
      "description": "控制卡路里的外食",
      "calories": ${currentMealTarget},
      "protein": ${targetProtein},
      "carbs": ${targetCarbs},
      "fat": ${targetFat},
      "fiber": ${targetFiber},
      "foods": [
        {
          "name": "碟頭飯（少飯走汁）",
          "portion": "1碟",
          "calories": 350,
          "protein": 28,
          "carbs": 45,
          "fat": 8,
          "fiber": 3
        }
      ]
    }
  ]
}

請立即生成（純 JSON）：`
    }
    
    console.log('📤 Sending to Gemini...')
    
    // 最多重試 3 次
    let data: any = null
    let lastError: string | null = null
    const maxRetries = 3
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await model.generateContent(prompt)
        const text = result.response.text()
        
        if (!text || !text.trim()) {
          throw new Error('AI 沒有返回任何內容')
        }
        
        // 清理回應
        let cleanText = text.trim()
        if (cleanText.startsWith('```json')) {
          cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
        } else if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/```\n?/g, '')
        }
        
        // 嘗試提取 JSON（可能在文字中間）
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          cleanText = jsonMatch[0]
        }
        cleanText = cleanText.trim()
        
        console.log(`📥 Response (attempt ${attempt}, first 500 chars):`, cleanText.substring(0, 500))
        
        // 解析 JSON
        try {
          data = JSON.parse(cleanText)
        } catch (parseError: any) {
          throw new Error(`JSON 解析失敗：${parseError.message}`)
        }
        
        // 驗證格式
        if (mode === 'quick') {
          if (!data.meal || !data.meal.foods || !Array.isArray(data.meal.foods)) {
            throw new Error('Invalid response format for quick mode')
          }
          
          // 驗證卡路里和營養素一致性
          const validation = validateMealCalories(
            data.meal.foods, 
            data.meal.calories,
            data.meal.protein || 0,
            data.meal.carbs || 0,
            data.meal.fat || 0
          )
          
          // 如果有修正值，自動應用（確保為整數）
          if (!validation.valid && validation.corrected) {
            console.log('🔧 Auto-correcting nutrition values:', validation.corrected)
            data.meal.protein = Math.round(validation.corrected.protein)
            data.meal.carbs = Math.round(validation.corrected.carbs)
            data.meal.fat = Math.round(validation.corrected.fat)
            data.meal.fiber = Math.round(validation.corrected.fiber)
            // 修正後重新驗證
            const revalidation = validateMealCalories(
              data.meal.foods,
              data.meal.calories,
              data.meal.protein,
              data.meal.carbs,
              data.meal.fat
            )
            if (revalidation.valid) {
              console.log('✅ Nutrition corrected and validated')
            } else {
              lastError = revalidation.reason || '營養素修正後仍不符合要求'
              console.warn(`⚠️ Validation failed after correction (attempt ${attempt}):`, lastError)
              if (attempt < maxRetries) {
                prompt += `\n\n**重要提醒（第 ${attempt + 1} 次生成）**：\n${lastError}\n請根據實際食物計算營養素，不要使用固定目標值。`
                continue
              } else {
                throw new Error(lastError)
              }
            }
          } else if (!validation.valid) {
            lastError = validation.reason || '卡路里驗證失敗'
            console.warn(`⚠️ Validation failed (attempt ${attempt}):`, lastError)
            
            if (attempt < maxRetries) {
              // 在 prompt 中加入更嚴格的指令
              prompt += `\n\n**重要提醒（第 ${attempt + 1} 次生成）**：\n${lastError}\n請重新生成，確保卡路里和營養素符合要求。`
              continue
            } else {
              throw new Error(lastError)
            }
          }
          
          console.log('✅ Generated 1 meal (validated)')
          break
          
        } else {
          if (!data.options || !Array.isArray(data.options)) {
            throw new Error('Invalid response format for smart mode')
          }
          
          // 驗證每個選項
          let allValid = true
          const validationErrors: string[] = []
          
          for (let i = 0; i < data.options.length; i++) {
            const option = data.options[i]
            if (!option.foods || !Array.isArray(option.foods)) {
              validationErrors.push(`選項 ${i + 1} 缺少食物列表`)
              allValid = false
              continue
            }
            
            // 驗證卡路里和營養素一致性
            const validation = validateMealCalories(
              option.foods,
              option.calories,
              option.protein || 0,
              option.carbs || 0,
              option.fat || 0
            )
            
            // 如果有修正值，自動應用（確保為整數）
            if (!validation.valid && validation.corrected) {
              console.log(`🔧 Auto-correcting nutrition for option ${i + 1}:`, validation.corrected)
              option.protein = Math.round(validation.corrected.protein)
              option.carbs = Math.round(validation.corrected.carbs)
              option.fat = Math.round(validation.corrected.fat)
              option.fiber = Math.round(validation.corrected.fiber)
              // 修正後重新驗證
              const revalidation = validateMealCalories(
                option.foods,
                option.calories,
                option.protein,
                option.carbs,
                option.fat
              )
              if (!revalidation.valid) {
                validationErrors.push(`選項 ${i + 1}: ${revalidation.reason}（已嘗試修正但仍不符合）`)
                allValid = false
              }
            } else if (!validation.valid) {
              validationErrors.push(`選項 ${i + 1}: ${validation.reason}`)
              allValid = false
            }
          }
          
          if (!allValid) {
            lastError = validationErrors.join('; ')
            console.warn(`⚠️ Validation failed (attempt ${attempt}):`, lastError)
            
            if (attempt < maxRetries) {
              // 在 prompt 中加入更嚴格的指令
              prompt += `\n\n**重要提醒（第 ${attempt + 1} 次生成）**：\n${lastError}\n請重新生成所有選項，確保卡路里符合要求。`
              continue
            } else {
              throw new Error(lastError)
            }
          }
          
          console.log('✅ Generated', data.options.length, 'options (all validated)')
          break
        }
        
      } catch (error: any) {
        lastError = error.message || '生成失敗'
        console.error(`❌ Attempt ${attempt} failed:`, lastError)
        
        if (attempt === maxRetries) {
          throw error
        }
        
        // 重試前等待一小段時間
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    if (!data) {
      throw new Error(`生成失敗（已重試 ${maxRetries} 次）: ${lastError || '未知錯誤'}`)
    }
    
    return NextResponse.json({
      success: true,
      data
    })
    
  } catch (error: any) {
    console.error('❌ Error generating recommendation:', error)
    console.error('Error stack:', error.stack)
    
    // 根據錯誤類型返回不同的狀態碼和訊息
    let statusCode = 500
    let errorMessage = '推薦失敗，請重試'
    let errorDetails = error.message || error.toString()
    
    if (error.message?.includes('JSON') || error.message?.includes('格式')) {
      statusCode = 422  // Unprocessable Entity
      errorMessage = 'AI 返回格式錯誤，請重試'
    } else if (error.message?.includes('驗證') || error.message?.includes('卡路里')) {
      statusCode = 400  // Bad Request
      errorMessage = '生成的餐單不符合要求，請重試'
    } else if (error.message?.includes('API') || error.message?.includes('quota') || error.message?.includes('rate limit')) {
      statusCode = 503  // Service Unavailable
      errorMessage = 'AI 服務暫時不可用，請稍後重試'
    } else if (error.message?.includes('重試')) {
      statusCode = 500
      errorMessage = error.message  // 保留重試相關的錯誤訊息
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage,
        details: errorDetails
      },
      { status: statusCode }
    )
  }
}
