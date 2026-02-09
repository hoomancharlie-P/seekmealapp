import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userId,
      mealId,
      mealType,
      date,
      calorieTarget,
      proteinTarget,
      carbsTarget,
      fatTarget,
      fiberTarget,
      dietaryRestrictions = [],
      dietaryHabit = 'none',
      allergies = []
    } = body
    
    console.log('🔄 Regenerating meal:', { mealId, mealType, calorieTarget })
    
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }
    const supabase = createClient(url, serviceKey)

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    
    // 餐次名稱
    const mealNames: Record<string, string> = {
      breakfast: '早餐',
      lunch: '午餐',
      dinner: '晚餐',
      snack: '小食'
    }
    const mealName = mealNames[mealType] || mealType
    
    // 餐次 emoji
    const mealEmojis: Record<string, string> = {
      breakfast: '🌅',
      lunch: '🌤️',
      dinner: '🌙',
      snack: '🍎'
    }
    
    // 構建 prompt
    const prompt = `你是一個專業的香港營養師。

請為用戶生成一個${mealName}餐單。

營養目標：
- 卡路里：${calorieTarget} 卡
- 蛋白質：${proteinTarget}g
- 碳水化合物：${carbsTarget}g
- 脂肪：${fatTarget}g
- 纖維：${fiberTarget}g

${dietaryRestrictions.length > 0 ? `
用戶不吃：${dietaryRestrictions.map((r: string) => {
  const names: Record<string, string> = {
    beef: '牛肉', pork: '豬肉', chicken: '雞肉', seafood: '海鮮',
    egg: '蛋類', dairy: '奶類', nuts: '堅果', soy: '大豆製品'
  }
  return names[r] || r
}).join('、')}
⚠️ 絕對不能包含以上食材
` : ''}

${dietaryHabit !== 'none' ? `
飲食習慣：${(() => {
  const habits: Record<string, string> = {
    vegetarian: '素食（不吃肉）',
    low_carb: '低碳水',
    keto: '生酮飲食'
  }
  return habits[dietaryHabit] || dietaryHabit
})()}
` : ''}

${allergies.length > 0 ? `
過敏食物：${allergies.join('、')}
🚨 絕對不能包含以上食材
` : ''}

要求：
1. 食物名稱使用廣東話（例如：水煮蛋、雞胸肉、糙米飯）
2. 明確份量（例如：雞蛋 2隻、雞胸肉 150g）
3. 不要用小數份量
4. 包含 2-4 項食物
5. 符合香港飲食習慣
6. 營養素盡量接近目標值

${mealType === 'breakfast' ? '早餐要簡單易準備（5-10分鐘），例如：雞蛋、麵包、牛奶、燕麥' : ''}
${mealType === 'lunch' ? '午餐要營養豐富、飽腹感強，例如：肉類 + 米飯/粉麵 + 蔬菜' : ''}
${mealType === 'dinner' ? '晚餐要均衡健康、不過量，例如：魚類/瘦肉 + 糙米/藜麥 + 大量蔬菜' : ''}
${mealType === 'snack' ? '小食要低卡健康、易攜帶，例如：水果、原味堅果、乳酪' : ''}

回傳格式（只回傳 JSON，不要任何其他文字）：
{
  "type": "${mealType}",
  "emoji": "${mealEmojis[mealType] || '🍽️'}",
  "calories": ${calorieTarget},
  "protein": ${proteinTarget},
  "carbs": ${carbsTarget},
  "fat": ${fatTarget},
  "fiber": ${fiberTarget},
  "foods": [
    {
      "name": "水煮蛋 2隻",
      "calories": 140,
      "protein": 12,
      "carbs": 2,
      "fat": 10,
      "fiber": 0
    }
  ]
}

請立即生成（純 JSON）：`

    console.log('📤 Sending to Gemini...')
    
    const result = await model.generateContent(prompt)
    const text = result.response.text()
    
    // 清理回應
    let cleanText = text.trim()
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/```\n?/g, '')
    }
    cleanText = cleanText.trim()
    
    console.log('📥 Response:', cleanText.substring(0, 200))
    
    // 解析 JSON
    const mealData = JSON.parse(cleanText)
    
    if (!mealData.foods || !Array.isArray(mealData.foods)) {
      throw new Error('Invalid meal data')
    }
    
    console.log('✅ Generated meal with', mealData.foods.length, 'foods')
    
    // 更新數據庫
    // 1. 刪除舊的 foods
    const { error: deleteFoodsError } = await supabase
      .from('foods')
      .delete()
      .eq('meal_id', mealId)
    
    if (deleteFoodsError) {
      console.error('Delete foods error:', deleteFoodsError)
      throw deleteFoodsError
    }
    
    // 2. 更新 meal
    const { error: updateMealError } = await supabase
      .from('meals')
      .update({
        calories: mealData.calories,
        protein: mealData.protein,
        carbs: mealData.carbs,
        fat: mealData.fat,
        fiber: mealData.fiber,
        // 重置調整狀態
        is_adjusted: false,
        adjusted_from: null,
        is_special_event: false, // 如果重新生成，取消特殊活動狀態
        special_event_type: null,
        special_event_description: null,
        special_event_calories: null,
        special_event_ai_suggestions: null
      })
      .eq('id', mealId)
    
    if (updateMealError) {
      console.error('Update meal error:', updateMealError)
      throw updateMealError
    }
    
    // 3. 插入新的 foods
    const foodsToInsert = mealData.foods.map((food: any, index: number) => ({
      meal_id: mealId,
      name: food.name,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      fiber: food.fiber,
      order: index
    }))
    
    const { error: insertFoodsError } = await supabase
      .from('foods')
      .insert(foodsToInsert)
    
    if (insertFoodsError) {
      console.error('Insert foods error:', insertFoodsError)
      throw insertFoodsError
    }
    
    console.log('✅ Meal regenerated successfully')
    
    return NextResponse.json({
      success: true,
      meal: mealData
    })
    
  } catch (error: any) {
    console.error('❌ Regenerate meal error:', error)
    return NextResponse.json(
      { error: 'Failed to regenerate meal', details: error.message },
      { status: 500 }
    )
  }
}
