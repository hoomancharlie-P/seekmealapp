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

/** 以 foods 為準自動校正餐單總營養素，不再因誤差拋錯 */
function validateAndCorrectMeal(meal: any): any {
  if (!meal?.foods || !Array.isArray(meal.foods) || meal.foods.length === 0) {
    return meal
  }
  const corrected = meal.foods.reduce(
    (sum: any, food: any) => ({
      calories: sum.calories + (Number(food.calories) || 0),
      protein: sum.protein + (Number(food.protein) || 0),
      carbs: sum.carbs + (Number(food.carbs) || 0),
      fat: sum.fat + (Number(food.fat) || 0),
      fiber: sum.fiber + (Number(food.fiber) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  )
  Object.keys(corrected).forEach((k) => {
    corrected[k] = Math.round(corrected[k])
  })
  const origCal = meal.calories ?? 0
  const diff = Math.abs(corrected.calories - origCal)
  if (diff > 0) {
    console.log(`📊 Nutrient correction: original ${origCal} cal → corrected ${corrected.calories} cal (diff ${diff} cal, ${(diff / (origCal || 1) * 100).toFixed(1)}%)`)
  }
  meal.calories = corrected.calories
  meal.protein = corrected.protein
  meal.carbs = corrected.carbs
  meal.fat = corrected.fat
  meal.fiber = corrected.fiber
  return meal
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
  
  // 驗證食物卡路里總和是否等於總卡路里（允許 ±20 卡或 ±5% 誤差）
  const sumCalories = foods.reduce((sum, f) => sum + (Number(f.calories) || 0), 0)
  const sumTolerance = Math.max(20, Math.round(totalCalories * 0.05))
  if (Math.abs(sumCalories - totalCalories) > sumTolerance) {
    return {
      valid: false,
      reason: `食物卡路里總和 (${sumCalories} 卡) 與總卡路里 (${totalCalories} 卡) 不符`
    }
  }
  
  // **驗證營養素與卡路里的一致性**
  // 營養學公式：卡路里 = 蛋白質×4 + 碳水化合物×4 + 脂肪×9
  // 允許 ±80 卡或 ±20% 誤差（取較大者），避免過嚴導致重試
  const roundedProtein = Math.round(protein || 0)
  const roundedCarbs = Math.round(carbs || 0)
  const roundedFat = Math.round(fat || 0)
  const calculatedCalories = roundedProtein * 4 + roundedCarbs * 4 + roundedFat * 9
  const calorieDiff = Math.abs(calculatedCalories - totalCalories)
  const tolerance = Math.max(80, Math.round(totalCalories * 0.20))

  if (calorieDiff > tolerance) {
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
    const body = await request.json()
    const preferences = body.preferences || {}
    const cuisineMap: Record<string, string> = {
      cantonese: 'hk', korean: 'korean', japanese: 'japanese', western: 'western',
      thai: 'thai', other: 'other'
    }
    const moodMap: Record<string, string> = {
      healthy: 'healthy', filling: 'filling', comfort: 'comfort',
      adventurous: 'explore', casual: 'random'
    }
    const mainTypeMap: Record<string, string> = {
      rice: 'rice', noodles: 'noodles', soup: 'soup', light: 'light'
    }
    const prefCuisine = preferences.cuisine ? (cuisineMap[String(preferences.cuisine)] || preferences.cuisine) : undefined
    const prefMood = preferences.mood ? (moodMap[String(preferences.mood)] || preferences.mood) : undefined
    const prefMain = preferences.mainType ? (mainTypeMap[String(preferences.mainType)] || preferences.mainType) : undefined
    const prefLocation = preferences.location === 'home' ? 'home_cook' : (preferences.location || undefined)

    const {
      userId,
      mealType,
      locale = 'zh-HK',
      mode,
      taste: bodyTaste,
      location: bodyLocation,
      style: bodyStyle,
      cuisines: bodyCuisines,
      foodType: bodyFoodType,
      customInput: bodyCustomInput,
      targetCalories,
      targetProtein,
      targetCarbs,
      targetFat,
      targetFiber,
      dietaryRestrictions,
      dietaryHabit,
      allergies,
      otherMeals,
      increaseRandomness = false,
      numberOfOptions = 2,
      requireDiversity = true,
      secondOptionCalorieMultiplier = 1.3
    } = body

    const isEnglish = typeof locale === 'string' && locale.toLowerCase().startsWith('en')
    const location = bodyLocation ?? prefLocation ?? 'eating_out'
    const cuisines = Array.isArray(bodyCuisines) && bodyCuisines.length > 0 ? bodyCuisines : (prefCuisine ? [prefCuisine] : [])
    const style = bodyStyle ?? prefMood ?? ''
    const foodType = bodyFoodType ?? prefMain ?? ''
    const customInput = bodyCustomInput ?? preferences.customInput ?? ''
    const taste = bodyTaste ?? (style === 'healthy' ? 'light' : style === 'filling' ? 'heavy' : 'random')

    console.log('🤖 Smart meal recommendation:', { mealType, mode, locale, numberOfOptions, requireDiversity, secondOptionCalorieMultiplier })
    console.log('🎯 User preferences received:', { location, cuisines, style, taste, foodType, customInput: customInput ? `${String(customInput).slice(0, 50)}` : undefined })
    
    // 使用 v1beta API 中可用的模型（測試確認 gemini-2.0-flash 可用）
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    
    // 構建 prompt
    const mealNames: Record<string, string> = isEnglish
      ? { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snack: 'snack' }
      : { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '小食' }
    
    const tasteText: Record<string, string> = isEnglish
      ? { light: 'light', heavy: 'rich flavor', random: 'random' }
      : { light: '清淡', heavy: '重口味', random: '隨便' }
    
    const locationText: Record<string, string> = isEnglish
      ? { eating_out: 'eating out (restaurants/cafes)', home_cook: 'home cooking' }
      : { eating_out: '外食（茶餐廳、餐廳等）', home_cook: '自己煮（家常菜）' }
    
    const styleText: Record<string, string> = isEnglish
      ? {
          comfort: 'comfort food',
          healthy: 'healthy and light',
          explore: 'explore new tastes',
          filling: 'filling and high-protein',
          random: 'fully random'
        }
      : {
          comfort: 'Comfort food（暖心、熟悉、療癒）',
          healthy: '健康清爽（清淡、營養、無負擔）',
          explore: '嘗試新鮮（探索、特別、不同）',
          filling: '飽足有力（高蛋白、高能量）',
          random: '完全隨機'
        }
    
    const cuisineText: Record<string, string> = isEnglish
      ? { hk: 'Hong Kong style', japanese: 'Japanese', korean: 'Korean', thai: 'Thai', western: 'Western', other: 'Other' }
      : { hk: '港式', japanese: '日本', korean: '韓國', thai: '泰國', western: '西餐', other: '其他' }
    
    const foodTypeText: Record<string, string> = isEnglish
      ? { rice: 'rice', noodles: 'noodles', soup: 'soup', light: 'light meal' }
      : { rice: '飯類', noodles: '麵類', soup: '湯類', light: '輕食' }
    const languageInstruction = isEnglish
      ? 'CRITICAL Language: Return all food names, labels, and descriptions in English only. Do not use Chinese.'
      : 'CRITICAL 語言：所有食物名稱與描述必須使用繁體中文（廣東話），不要使用英文。'
    
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
      // 快速生成模式 - 依用戶偏好生成 2 個具體餐單選項，供用戶選擇
      const selectedCuisinesQuick = cuisines && cuisines.length > 0
        ? cuisines.map((c: string) => cuisineText[c] || c).join('、')
        : ''
      const selectedStyleQuick = style ? styleText[style] : ''
      const selectedTasteQuick = taste ? tasteText[taste] : ''
      const selectedFoodTypeQuick = foodType ? foodTypeText[foodType] : ''
      if (isEnglish) {
        prompt = `${languageInstruction}
You are a professional nutrition coach.
Generate exactly 2 distinct ${mealNames[mealType]} options based on user preferences.

User preferences (must follow):
1) Location: ${locationText[location] || 'eating out'}
2) Cuisine: ${selectedCuisinesQuick || 'no strict cuisine, but keep diversity'}
3) Style: ${selectedStyleQuick || 'no strict style'}
4) Taste: ${selectedTasteQuick || 'no strict taste'}
5) Main type: ${selectedFoodTypeQuick || 'no strict main type'}
${customInput ? `6) Extra requirement: ${customInput}` : ''}

Hard requirements:
- Return JSON only in this exact shape: { "options": [ optionA, optionB ] }.
- Exactly 2 options. Do not return a single "meal" object.
- All food names, option labels, and descriptions must be English only.
- If cuisine is provided, the main dishes must match that cuisine.
- If main type is provided, dishes must match it (rice/noodles/soup/light meal).
- Each option has 3-4 foods.
- Sum of food calories must match option calories (small rounding error only).
- Macros should be realistic and follow calories = protein*4 + carbs*4 + fat*9.
${requireDiversity ? '- The two options must be clearly different dishes.' : ''}

Target calories:
- Base target: ${currentMealTarget} kcal.
${style === 'healthy'
  ? `- Both options must be within ±10% (${Math.round(currentMealTarget * 0.9)}-${Math.round(currentMealTarget * 1.1)} kcal).`
  : `- At least one option must be within ±10% (${Math.round(currentMealTarget * 0.9)}-${Math.round(currentMealTarget * 1.1)} kcal). The second can be richer around ${Math.round(currentMealTarget * (typeof secondOptionCalorieMultiplier === 'number' ? secondOptionCalorieMultiplier : 1.3))} kcal.`}

Nutrition targets (reference): protein ${targetProtein}g, carbs ${targetCarbs}g, fat ${targetFat}g, fiber ${targetFiber}g.
Dietary restrictions: ${dietaryRestrictions && dietaryRestrictions.length > 0 ? dietaryRestrictions.join(', ') : 'none'}.
Dietary habit: ${dietaryHabit && dietaryHabit !== 'none' ? dietaryHabit : 'none'}.
Allergies: ${allergies && allergies.length > 0 ? allergies.join(', ') : 'none'}.

Example output (JSON only):
{
  "options": [
    {
      "label": "Standard",
      "calories": 520,
      "protein": 28,
      "carbs": 55,
      "fat": 18,
      "fiber": 3,
      "foods": [
        { "name": "Satay beef noodle soup", "portion": "1 bowl", "calories": 480, "protein": 26, "carbs": 48, "fat": 18, "fiber": 2 },
        { "name": "Hot milk tea", "portion": "1 cup", "calories": 40, "protein": 2, "carbs": 7, "fat": 0, "fiber": 0 }
      ]
    },
    {
      "label": "Hearty",
      "calories": 610,
      "protein": 31,
      "carbs": 66,
      "fat": 24,
      "fiber": 5,
      "foods": [
        { "name": "Tomato beef rice noodle soup", "portion": "1 bowl", "calories": 500, "protein": 27, "carbs": 58, "fat": 18, "fiber": 3 },
        { "name": "Blanched choy sum", "portion": "1 plate", "calories": 45, "protein": 3, "carbs": 5, "fat": 1, "fiber": 2 },
        { "name": "Unsweetened green tea", "portion": "1 cup", "calories": 0, "protein": 0, "carbs": 0, "fat": 0, "fiber": 0 }
      ]
    }
  ]
}

Generate now. JSON only.`
      } else {
        prompt = `${languageInstruction}
【必須】回傳格式：僅能回傳 { "options": [ 選項A, 選項B ] }，即 **恰好 2 個** 不同餐單物件。**禁止**回傳單一 { "meal": ... } 物件。

⭐⭐⭐ 用戶偏好（必須遵守，不可忽略）⭐⭐⭐
1. 用餐地點：${locationText[location] || '外食'}
2. 菜系：${selectedCuisinesQuick || '不限（但須多樣化）'}
3. 心情／風格：${selectedStyleQuick || '不限'}
4. 口味：${selectedTasteQuick || '不限'}
5. 主食類型：${selectedFoodTypeQuick || '不限'}
${customInput ? `6. 特別要求：${customInput}` : ''}

CRITICAL 規則：
- 若用戶選了「菜系」則主菜**必須**是該菜系，**不可**生成其他菜系。
- 若用戶選了「主食類型」則須符合：飯類/麵類/湯類/輕食。
- 不要每次都生成相同食物；在符合偏好的範圍內選擇不同菜式。

請根據以上偏好，生成 2 個不同的 ${mealNames[mealType]} 選項，每個選項都要具體可執行。
目標卡路里：${currentMealTarget} 卡（±10%）
${requireDiversity ? '兩個選項必須明顯不同。' : ''}

要求：
1. 使用繁體中文（廣東話）食物名稱。
2. 每個選項 3-4 項食物。
3. 各食物卡路里相加 = 該選項總卡路里（小誤差可接受）。
4. 回傳僅限 JSON，鍵名為 options，且恰好 2 個選項。

請立即生成（純 JSON）：`
      }
      console.log('📝 Quick mode prompt preview (first 600 chars):', prompt.substring(0, 600))

    } else {
      // 智能推薦模式 - 生成 3 個選項
      const selectedStyle = style ? styleText[style] : ''
      const selectedTaste = taste ? tasteText[taste] : ''
      
      prompt = `${languageInstruction}
你是一個專業的香港營養師。

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
1. ${isEnglish ? 'Use common foods and names in English.' : '使用香港常見食物和廣東話名稱'}
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
    
    // quick mode 需要 2 個選項，多給一次重試機會；smart mode 3 次
    let data: any = null
    let lastError: string | null = null
    const maxRetries = mode === 'quick' ? 4 : 3
    
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
        
        // 相容：LLM 有時回傳 { "meal": {...} } 而非 { "options": [...] }
        if (data && (data.meal && typeof data.meal === 'object') && (!data.options || !Array.isArray(data.options))) {
          data.options = [ data.meal ]
        }
        
        // 驗證格式
        if (mode === 'quick') {
          if (!data.options || !Array.isArray(data.options) || data.options.length < 1) {
            throw new Error('Invalid response format for quick mode: need options array with at least 1 meal')
          }
          let allValid = true
          for (let i = 0; i < data.options.length; i++) {
            const opt = data.options[i]
            if (!opt.foods || !Array.isArray(opt.foods) || opt.foods.length === 0) {
              lastError = `選項 ${i + 1} 缺少食物列表`
              allValid = false
              break
            }
            // 一律先以 foods 為準自動校正總營養素，不再因誤差拋錯
            validateAndCorrectMeal(opt)
            const validation = validateMealCalories(
              opt.foods,
              opt.calories ?? 0,
              opt.protein || 0,
              opt.carbs || 0,
              opt.fat || 0
            )
            // 只對「沒有食物」或「茶餐廳組合最低卡路里」視為錯誤；營養素/卡路里誤差已由校正處理
            if (!validation.valid) {
              const isNutrientMismatch = validation.reason && (
                validation.reason.includes('營養素與卡路里') ||
                validation.reason.includes('食物卡路里總和')
              )
              if (isNutrientMismatch) {
                console.warn(`⚠️ Option ${i + 1}: ${validation.reason} (ignored after auto-correct)`)
              } else {
                lastError = validation.reason || `選項 ${i + 1} 驗證失敗`
                allValid = false
                break
              }
            }
          }
          if (!allValid && lastError && attempt < maxRetries) {
            prompt += `\n\n**重要提醒**：${lastError}\n請重新生成 2 個選項。`
            continue
          }
          if (!allValid) throw new Error(lastError || '驗證失敗')
          // 卡路里範圍：輕盈健康則兩選項皆須在目標 ±10%；否則至少一選項在目標 ±10%
          const calLow = currentMealTarget * 0.9
          const calHigh = currentMealTarget * 1.1
          const inRange = (cal: number) => cal >= calLow && cal <= calHigh
          const optionsInRange = data.options.filter((o: any) => inRange(Number(o.calories) ?? 0))
          if (style === 'healthy') {
            if (optionsInRange.length < data.options.length) {
              lastError = `輕盈健康模式下，每個選項卡路里須在目標 ±10% 內（${Math.round(calLow)}–${Math.round(calHigh)} 卡）`
              if (attempt < maxRetries) {
                prompt += `\n\n**重要提醒**：${lastError}\n請重新生成 2 個選項，兩個選項的卡路里都須在 ${Math.round(calLow)}–${Math.round(calHigh)} 卡內。`
                continue
              }
              throw new Error(lastError)
            }
          } else {
            if (optionsInRange.length < 1) {
              lastError = `至少一個選項的卡路里須在目標 ±10% 內（${Math.round(calLow)}–${Math.round(calHigh)} 卡）`
              if (attempt < maxRetries) {
                prompt += `\n\n**重要提醒**：${lastError}\n請重新生成 2 個選項，其中至少一個的卡路里須在 ${Math.round(calLow)}–${Math.round(calHigh)} 卡內。`
                continue
              }
              throw new Error(lastError)
            }
          }
          // quick mode 需要 2 個選項；若只有 1 個則重試
          if (data.options.length < 2 && attempt < maxRetries) {
            prompt += '\n\n【重試要求】你必須回傳 **2 個** 不同選項在 "options" 陣列內，格式為 { "options": [ 選項1, 選項2 ] }。不要只回傳 1 個 "meal" 或單一選項。'
            console.log(`⚠️ Quick mode got only ${data.options.length} option(s), retrying for 2...`)
            continue
          }
          // 若仍只有 1 個選項，自動生成豐富版（份量約 +15%）
          if (data.options.length === 1) {
            const standard = data.options[0]
            const generous = {
              ...standard,
              version: 'generous',
              label: isEnglish ? 'Hearty' : '豐富版',
              calories: Math.round((standard.calories ?? 0) * 1.15),
              protein: Math.round((standard.protein ?? 0) * 1.15),
              carbs: Math.round((standard.carbs ?? 0) * 1.15),
              fat: Math.round((standard.fat ?? 0) * 1.15),
              fiber: Math.round((standard.fiber ?? 0) * 1.15),
              foods: (standard.foods ?? []).map((f: any) => ({
                ...f,
                calories: Math.round((Number(f.calories) || 0) * 1.15),
                protein: Math.round((Number(f.protein) || 0) * 1.15),
                carbs: Math.round((Number(f.carbs) || 0) * 1.15),
                fat: Math.round((Number(f.fat) || 0) * 1.15),
                fiber: Math.round((Number(f.fiber) || 0) * 1.15),
              })),
            }
            validateAndCorrectMeal(generous)
            data.options.push(generous)
            console.log('✅ Auto-generated 2nd option (豐富版)')
          }
          console.log('✅ Generated', data.options.length, 'option(s) (validated)')
          data.options?.forEach((opt: any, i: number) => {
            const names = (opt.foods ?? []).map((f: any) => f.name).join('、')
            console.log(`   Option ${i + 1} foods:`, names || '(none)')
          })
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
            validateAndCorrectMeal(option)
            const validation = validateMealCalories(
              option.foods,
              option.calories,
              option.protein || 0,
              option.carbs || 0,
              option.fat || 0
            )
            if (!validation.valid) {
              const isNutrientMismatch = validation.reason && (
                validation.reason.includes('營養素與卡路里') ||
                validation.reason.includes('食物卡路里總和')
              )
              if (isNutrientMismatch) {
                console.warn(`⚠️ Option ${i + 1}: ${validation.reason} (ignored after auto-correct)`)
              } else {
                validationErrors.push(`選項 ${i + 1}: ${validation.reason}`)
                allValid = false
              }
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
        lastError = error.message || error.toString() || '生成失敗'
        const errStr = lastError ?? ''
        const is429 = /429|Too Many Requests|Resource exhausted/i.test(errStr)
        console.error(`❌ Attempt ${attempt} failed:`, lastError)
        if (is429) {
          // 免費配額已耗盡時不再重試，直接回友好訊息
          throw new Error('今日 AI 配額已用完，請明天再試')
        }
        
        if (attempt === maxRetries) {
          throw error as Error
        }
        
        const waitMs = 1000
        console.log(`⏳ Waiting ${waitMs}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, waitMs))
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
    
    if (/429|Too Many Requests|Resource exhausted|請求過多|配額已用完/.test(errorDetails)) {
      statusCode = 429
      errorMessage = '今日 AI 配額已用完，請明天再試'
    } else if (error.message?.includes('JSON') || error.message?.includes('格式')) {
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
