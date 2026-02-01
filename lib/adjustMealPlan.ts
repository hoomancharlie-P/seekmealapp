import type { Meal } from '@/types/meal'
import type { SpecialEventData } from '@/components/SpecialEventModal'

// 輸入參數
export interface AdjustMealPlanInput {
  allMeals: Meal[]              // 當天所有餐次（3餐）
  eventMeal: Meal               // 有特殊活動的餐次
  eventData: SpecialEventData   // 特殊活動資料
  userTarget: {
    calorieTarget: number       // 用戶的每日卡路里目標
    proteinTarget: number
    carbsTarget: number
    fatTarget: number
    fiberTarget: number
  }
}

// 輸出結果
export interface AdjustMealPlanOutput {
  adjustedMeals: Meal[]         // 調整後的餐單（不包含 eventMeal）
  analysis: {
    originalTotal: number       // 原本總卡路里
    eventCalories: number       // 活動預計卡路里
    remainingCalories: number   // 剩餘可用卡路里
    willExceed: boolean         // 是否會超標
    exceedAmount: number        // 超標數量（如果有）
  }
  aiSuggestions: string[]           // AI 給的建議（陣列格式）
  structuredSuggestions?: {         // 結構化格式（可選，給 UI 更好展示）
    empathy: string                 // 同理心
    difficulty: string              // 困難點
    principle: string               // 原則
    tips: string[]                  // 具體建議（✓ 開頭的）
    encouragement: string           // 鼓勵
  }
  options: AdjustmentOption[]   // 多種調整方案
}

// 調整方案
export interface AdjustmentOption {
  id: string
  title: string
  description: string
  adjustedMeals: Meal[]
  impact: 'balanced' | 'control_event' | 'next_day_compensate'
}

export function adjustMealPlan(input: AdjustMealPlanInput): AdjustMealPlanOutput {
  
  // 1. 分析當前狀態
  const consumedMeals = input.allMeals.filter(m => m.consumed)
  const unconsumedMeals = input.allMeals.filter(
    m => !m.consumed && m.id !== input.eventMeal.id
  )
  
  const consumedCalories = consumedMeals.reduce((sum, m) => sum + m.calories, 0)
  
  // 2. 估算活動卡路里（根據策略調整）
  const eventCalories = estimateEventCalories(
    input.eventData.type,
    input.eventData.adjustmentStrategy
  )
  
  // 3. 計算剩餘卡路里
  const remaining = input.userTarget.calorieTarget - consumedCalories - eventCalories
  
  // 4. 判斷是否超標
  const willExceed = remaining < 0
  const exceedAmount = Math.abs(Math.min(0, remaining))
  
  // 5. 根據用戶選擇的策略生成方案
  const options: AdjustmentOption[] = []
  
  // 策略 1: 自動調整其他餐次（平均分配剩餘卡路里）
  if (input.eventData.adjustmentStrategy === 'auto-adjust-meals' && unconsumedMeals.length > 0) {
    const perMeal = remaining > 0 
      ? Math.floor(remaining / unconsumedMeals.length)
      : Math.floor((input.userTarget.calorieTarget - consumedCalories) / (unconsumedMeals.length + 1))  // 如果超標，重新分配
    
    options.push({
      id: 'auto-adjust',
      title: '自動調整其他餐次',
      description: `每餐約 ${perMeal} 卡`,
      adjustedMeals: unconsumedMeals.map(m => ({
        ...m,
        calories: perMeal,
        isAdjusted: true,
        adjustedFrom: m.calories,
        protein: Math.round((m.protein / m.calories) * perMeal),
        carbs: Math.round((m.carbs / m.calories) * perMeal),
        fat: Math.round((m.fat / m.calories) * perMeal),
        fiber: Math.round((m.fiber / m.calories) * perMeal),
        foods: m.foods.map(f => ({
          ...f,
          calories: Math.round((f.calories / m.calories) * perMeal),
          protein: f.protein ? Math.round((f.protein / m.calories) * perMeal) : undefined,
          carbs: f.carbs ? Math.round((f.carbs / m.calories) * perMeal) : undefined,
          fat: f.fat ? Math.round((f.fat / m.calories) * perMeal) : undefined,
          fiber: f.fiber ? Math.round((f.fiber / m.calories) * perMeal) : undefined
        }))
      })),
      impact: 'balanced'
    })
  }
  
  // 策略 2: 控制活動時的份量（其他餐次不變）
  if (input.eventData.adjustmentStrategy === 'control-event') {
    const otherMealsCalories = unconsumedMeals.reduce((sum, m) => sum + m.calories, 0)
    const controlCalories = Math.max(300, input.userTarget.calorieTarget - consumedCalories - otherMealsCalories)
    
    options.push({
      id: 'control-event',
      title: '控制活動時的份量',
      description: `建議控制在 ${controlCalories} 卡內`,
      adjustedMeals: unconsumedMeals,  // 其他餐次保持不變
      impact: 'control_event'
    })
  }
  
  // === 方案 3: 明日補償（如果超標）===
  if (willExceed) {
    options.push({
      id: 'option3',
      title: '今日超標，明日補償',
      description: `明日減少 ${exceedAmount} 卡（${input.userTarget.calorieTarget - exceedAmount}卡/天）`,
      adjustedMeals: unconsumedMeals, // 保持其他餐次不變
      impact: 'next_day_compensate'
    })
  }
  
  // 6. 生成 AI 建議
  const aiSuggestions = generateAISuggestions(input.eventData.type, remaining)
  
  // 將建議結構化（方便 UI 展示）
  const structuredSuggestions = {
    empathy: aiSuggestions[0],
    difficulty: aiSuggestions[1],
    principle: aiSuggestions[2],
    tips: aiSuggestions.slice(3, -1),  // 中間的都是具體建議
    encouragement: aiSuggestions[aiSuggestions.length - 1]
  }
  
  // 根據策略選擇默認方案
  const defaultOption = options.find(opt => 
    (input.eventData.adjustmentStrategy === 'auto-adjust-meals' && opt.id === 'auto-adjust') ||
    (input.eventData.adjustmentStrategy === 'control-event' && opt.id === 'control-event')
  ) || options[0]
  
  return {
    adjustedMeals: defaultOption?.adjustedMeals || unconsumedMeals,
    analysis: {
      originalTotal: input.userTarget.calorieTarget,
      eventCalories,
      remainingCalories: remaining,
      willExceed,
      exceedAmount
    },
    aiSuggestions,
    structuredSuggestions,
    options
  }
}

// 估算不同活動的卡路里
function estimateEventCalories(
  type: SpecialEventData['type'],
  strategy: SpecialEventData['adjustmentStrategy']
): number {
  const baseEstimates: Record<string, number> = {
    hotpot: 850,
    bbq: 800,
    buffet: 1200,
    birthday: 600,
    drinks: 500,
    other: 700
  }
  
  const baseCalories = baseEstimates[type] || 700
  
  // 如果選擇「控制活動份量」，估算較保守（假設用戶會控制）
  if (strategy === 'control-event') {
    return Math.round(baseCalories * 0.7)  // 減少 30%
  }
  
  return baseCalories
}

// 生成 AI 建議
function generateAISuggestions(
  type: SpecialEventData['type'], 
  remaining: number
): string[] {
  
  const isOverBudget = remaining < 0
  
  // 同理心 + 困難點 + 原則 + 建議 + 鼓勵
  const suggestions: Record<string, string[]> = {
    hotpot: [
      '火鍋聚會好開心，但容易不知不覺食多咗 😊',
      '困難：湯底、醬料、肉類卡路里都好高',
      '原則：選清淡湯底、控制肉類份量、多菜少醬',
      '✓ 選清湯底代替麻辣湯底（省 200-300 卡）',
      '✓ 多食蔬菜、菇類、海鮮（低卡高蛋白）',
      '✓ 肥牛、丸類淺嚐即止（每片肥牛 ~50 卡）',
      '✓ 沙茶醬、麻醬避免或減量（每匙 ~100 卡）',
      isOverBudget 
        ? '建議控制在 600-700 卡內，咁就唔會超太多 💪'
        : '預計可控制在 600-700 卡，你做得到！💪'
    ],
    
    bbq: [
      '燒烤氣氛好正，但煙韌位置多 🍖',
      '困難：醃料、油脂、啤酒卡路里好高',
      '原則：選瘦肉、少醬料、控制飲品',
      '✓ 選雞胸、魚代替肥牛、豬頸肉（每 100g 省 150 卡）',
      '✓ 多燒蔬菜：粟米、茄子、椒類',
      '✓ 醬料用碟仔裝，唔好直接淋上去',
      '✓ 啤酒改凍檸茶或水（每罐啤酒 ~150 卡）',
      isOverBudget
        ? '建議控制在 500-600 卡內，慢慢食就容易做到 💪'
        : '預計可控制在 500-600 卡，享受過程！💪'
    ],
    
    buffet: [
      '自助餐選擇多，但好容易「拎多咗」😅',
      '困難：心理上覺得要「食返本」、甜品誘惑大',
      '原則：用細碟、先菜後肉、甜品最後',
      '✓ 第一輪先食沙律、刺身、蔬菜（打底）',
      '✓ 用細碟裝食物，慢慢食，唔好貪心',
      '✓ 主菜選烤、蒸、少油炸（每件炸物 ~200 卡）',
      '✓ 甜品最多食 1-2 件，雪糕、蛋糕二揀一',
      '✓ 飲水或茶代替汽水、果汁',
      isOverBudget
        ? '建議控制在 800-900 卡內，食得開心最重要 💪'
        : '預計可控制在 800-900 卡，慢慢享受！💪'
    ],
    
    birthday: [
      '生日會梗係要慶祝，食少少甜嘢無問題 🎂',
      '困難：唔食蛋糕好似唔畀面、其他小食都好吸引',
      '原則：蛋糕淺嚐、其他甜品避免',
      '✓ 蛋糕食一小塊就好（1/8 件 ~300 卡）',
      '✓ 如果有其他甜品，就唔好再食蛋糕',
      '✓ 飲品選水或無糖茶',
      '✓ 如果有正餐，正常食就好，唔使特別節制',
      isOverBudget
        ? '建議控制在 400-500 卡內，開心最緊要 💪'
        : '預計可控制在 400-500 卡，盡情慶祝！💪'
    ],
    
    drinks: [
      '同朋友飲嘢傾計好正，但酒精卡路里唔少 🍺',
      '困難：氣氛好容易一杯接一杯、配小食更高卡',
      '原則：選低卡酒、飲水間隔、少食小食',
      '✓ 啤酒、紅酒好過雞尾酒（每杯雞尾酒 ~200-300 卡）',
      '✓ 每飲一杯酒就飲一杯水（減慢速度）',
      '✓ 小食選毛豆、刺身，避免炸物、芝士',
      '✓ 限制自己飲 2-3 杯就好',
      isOverBudget
        ? '建議控制在 300-400 卡內，適可而止 💪'
        : '預計可控制在 300-400 卡，開心就好！💪'
    ],
    
    other: [
      '特殊場合好難控制，但你願意留意已經好好 😊',
      '困難：唔知食乜、份量難估計',
      '原則：留意份量、慢慢食、多飲水',
      '✓ 如果可以揀，選蒸、烤多過炸',
      '✓ 份量減半，唔夠先再加',
      '✓ 多飲水，幫助消化',
      '✓ 食得慢啲，畀身體時間感覺飽',
      isOverBudget
        ? '今日超少少無問題，明日調整返就得 💪'
        : '做好準備，你一定得！💪'
    ]
  }
  
  return suggestions[type] || suggestions.other
}
