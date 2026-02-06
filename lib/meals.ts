import { supabase } from './supabase'
import type { Meal, Food } from '@/types/database'

const db = supabase as any

export type MealWithFoods = Meal & { foods: Food[] }

// 讀取用戶的餐單（指定日期範圍）
export async function fetchMeals(userId: string, startDate: string, endDate: string): Promise<MealWithFoods[]> {
  try {
    // 1. 讀取餐單
    const { data: meals, error: mealsError } = await db
      .from('meals')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    if (mealsError) throw mealsError

    if (!meals || meals.length === 0) {
      return []
    }

    // 2. 讀取所有餐單的食物
    const mealIds = meals.map((m: any) => m.id)
    const { data: foods, error: foodsError } = await db
      .from('foods')
      .select('*')
      .in('meal_id', mealIds)
      .order('order', { ascending: true })

    if (foodsError) throw foodsError

    // 3. 組合餐單和食物
    const mealsWithFoods: MealWithFoods[] = meals.map((meal: any) => ({
      ...(meal as Meal),
      foods: ((foods as any)?.filter((f: any) => f.meal_id === meal.id) as Food[]) || [],
    }))

    return mealsWithFoods
  } catch (error) {
    console.error('Error fetching meals:', error)
    return []
  }
}

// 更新餐次（記錄/取消記錄）
export async function updateMealConsumed(mealId: string, consumed: boolean, consumedAt: string | null) {
  try {
    const { error } = await db
      .from('meals')
      .update({
        consumed,
        consumed_at: consumedAt,
      } as any)
      .eq('id', mealId)

    if (error) throw error
    return { success: true as const }
  } catch (error) {
    console.error('Error updating meal:', error)
    return { success: false as const, error }
  }
}

// 批量更新餐單（調整後的多個餐次）
export async function updateMeals(mealsToUpdate: Array<{ id: string; updates: Record<string, any> }>) {
  try {
    const promises = mealsToUpdate.map(({ id, updates }) =>
      db
        .from('meals')
        .update(updates as any)
        .eq('id', id)
    )

    const results = await Promise.all(promises)

    const hasError = results.some((r) => r.error)
    if (hasError) {
      console.error('Some meal updates failed:', results.filter((r) => r.error))
    }

    return { success: !hasError }
  } catch (error) {
    console.error('Error updating meals:', error)
    return { success: false, error }
  }
}

// 批量更新食物（可選：用於調整後同步 foods）
export async function updateFoods(foodsToUpdate: Array<{ id: string; updates: Record<string, any> }>) {
  try {
    const promises = foodsToUpdate.map(({ id, updates }) =>
      db
        .from('foods')
        .update(updates as any)
        .eq('id', id)
    )

    const results = await Promise.all(promises)

    const hasError = results.some((r) => r.error)
    if (hasError) {
      console.error('Some food updates failed:', results.filter((r) => r.error))
    }

    return { success: !hasError }
  } catch (error) {
    console.error('Error updating foods:', error)
    return { success: false, error }
  }
}

// 創建初始餐單（新用戶第一次使用）- AI 生成版本
export async function createInitialMeals(
  userId: string,
  profile?: {
    calorie_target: number
    protein_target: number
    carbs_target: number
    fat_target: number
    fiber_target: number
    dietary_restrictions?: string[]
    dietary_habit?: string
    allergies?: string[]
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('🎬 Creating initial meals for user:', userId)

    // 如果沒有提供 profile，從數據庫讀取
    let userProfile = profile
    if (!userProfile) {
      console.log('📖 Reading profile from database...')
      const { data } = await db
        .from('profiles')
        .select('calorie_target, protein_target, carbs_target, fat_target, fiber_target, dietary_restrictions, dietary_habit, allergies')
        .eq('id', userId)
        .single()

      if (!data) {
        throw new Error('Profile not found')
      }

      userProfile = data
    }

    if (!userProfile) throw new Error('Profile not found')

    console.log('📊 User profile:', userProfile)
    console.log('🍽️ Dietary preferences:', {
      restrictions: userProfile.dietary_restrictions || [],
      habit: userProfile.dietary_habit || 'none',
      allergies: userProfile.allergies || []
    })
    console.log('🤖 Calling AI API to generate meals...')

    // 構建完整 URL
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    const apiUrl = `${baseUrl}/api/generate-meals`
    console.log('📡 API URL:', apiUrl)

    // 調用 AI API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        calorieTarget: userProfile.calorie_target,
        proteinTarget: userProfile.protein_target,
        carbsTarget: userProfile.carbs_target,
        fatTarget: userProfile.fat_target,
        fiberTarget: userProfile.fiber_target,
        days: 3,
        dietaryRestrictions: userProfile.dietary_restrictions || [],
        dietaryHabit: userProfile.dietary_habit || 'none',
        allergies: userProfile.allergies || []
      }),
    })

    console.log('📡 Response status:', response.status)
    console.log('📡 Response ok:', response.ok)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ API error response:', errorText)
      throw new Error(`API request failed: ${response.status} ${errorText}`)
    }

    const result = await response.json()
    console.log('📡 API result success:', result.success)
    console.log('📡 API meals count:', result.meals?.length)

    if (!result.success) {
      throw new Error(result.error || 'AI generation failed')
    }

    const { meals: aiMeals, stats } = result
    console.log('✅ AI generated', aiMeals.length, 'meals')
    console.log('📊 Stats:', stats)


    // 準備插入數據
    const today = new Date()
    const mealsToInsert = []
    const foodsToInsert = []

    // 按日期分組
    const mealsByDay: { [key: number]: any[] } = {}
    aiMeals.forEach((meal: any) => {
      if (!mealsByDay[meal.day]) {
        mealsByDay[meal.day] = []
      }
      mealsByDay[meal.day].push(meal)
    })

    console.log('📦 Organizing meals by day...')

    const days = 3

    // 用於存儲每個 meal 對應的 foods（在插入 meals 後使用）
    const mealFoodsMap: Array<{ mealIndex: number; foods: any[] }> = []

    // 為每一天創建餐單
    for (let dayOffset = 0; dayOffset < days; dayOffset++) {
      const date = new Date(today)
      date.setDate(today.getDate() + dayOffset)
      const dateStr = date.toISOString().split('T')[0]

      const dayMeals = mealsByDay[dayOffset + 1] || []
      console.log(`📅 Day ${dayOffset + 1} (${dateStr}):`, dayMeals.length, 'meals')

      for (const aiMeal of dayMeals) {
        const mealIndex = mealsToInsert.length

        mealsToInsert.push({
          // 不設置 id，讓 Supabase 自動生成 UUID
          user_id: userId,
          date: dateStr,
          type: aiMeal.type,
          emoji: aiMeal.emoji,
          calories: aiMeal.calories,
          protein: aiMeal.protein,
          carbs: aiMeal.carbs,
          fat: aiMeal.fat,
          fiber: aiMeal.fiber,
          consumed: false,
          is_special_event: false,
          is_adjusted: false,
        })

        // 準備食物（暫時存儲，等插入 meals 後再使用返回的 UUID）
        if (aiMeal.foods && Array.isArray(aiMeal.foods)) {
          mealFoodsMap.push({
            mealIndex,
            foods: aiMeal.foods.map((food: any, index: number) => ({
              name: food.name,
              calories: food.calories,
              protein: food.protein,
              carbs: food.carbs,
              fat: food.fat,
              fiber: food.fiber,
              order: index,
            })),
          })
        }
      }
    }

    console.log('📦 Prepared', mealsToInsert.length, 'meals')
    console.log('📋 First meal (without id):', { ...mealsToInsert[0], id: '(will be generated)' })

    // === 過濾已存在的餐單 ===
    const datesToCheck = Array.from(new Set(mealsToInsert.map(m => m.date)))
    console.log('🔍 Checking existing meals for dates:', datesToCheck)
    
    const { data: existingMeals, error: checkError } = await db
      .from('meals')
      .select('date, type')
      .eq('user_id', userId)
      .in('date', datesToCheck)
      
    if (checkError) {
      console.error('❌ Failed to check existing meals:', checkError)
      // 如果檢查失敗，我們可以選擇繼續（可能會報錯）或者拋出異常
      // 這裡選擇繼續，讓數據庫約束來處理
    }
    
    const existingSet = new Set((existingMeals as { date: string; type: string }[] | null)?.map(m => `${m.date}-${m.type}`) || [])
    console.log('🔍 Existing meals found:', existingSet.size)
    
    const finalMealsToInsert: any[] = []
    const finalMealFoodsMap: Array<{ mealIndex: number; foods: any[] }> = []
    
    for (let i = 0; i < mealsToInsert.length; i++) {
      const meal = mealsToInsert[i]
      const key = `${meal.date}-${meal.type}`
      
      if (!existingSet.has(key)) {
        const newIndex = finalMealsToInsert.length
        finalMealsToInsert.push(meal)
        
        // 遷移對應的 foods，並更新 mealIndex 為新數組的索引
        const foodsEntry = mealFoodsMap.find(map => map.mealIndex === i)
        if (foodsEntry) {
          finalMealFoodsMap.push({
            mealIndex: newIndex,
            foods: foodsEntry.foods
          })
        }
      }
    }
    
    console.log(`🔍 Filtered duplicates: ${mealsToInsert.length} -> ${finalMealsToInsert.length} meals`)
    
    if (finalMealsToInsert.length === 0) {
      console.log('✅ All meals already exist, skipping insertion')
      return { success: true }
    }

    // 插入 meals（讓 Supabase 自動生成 UUID）
    console.log('💾 Inserting meals to Supabase...')
    const { data: insertedMeals, error: mealsError } = await db
      .from('meals')
      .insert(finalMealsToInsert as any)
      .select()

    if (mealsError) {
      console.error('❌ Meals insert error:', mealsError)
      console.error('Error code:', mealsError.code)
      console.error('Error message:', mealsError.message)
      console.error('Error details:', mealsError.details)
      throw new Error(`Failed to insert meals: ${mealsError.message}`)
    }

    if (!insertedMeals || insertedMeals.length === 0) {
      throw new Error('No meals were inserted')
    }

    const insertedMealsArray = (insertedMeals as any) || []
    console.log('✅ Inserted', insertedMealsArray.length, 'meals')

    // 構建食物查找表 (Key: date-type -> Foods)
    // 這是為了防止 insertedMeals 返回順序不一致導致的索引錯位
    const foodsLookup: Record<string, any[]> = {}
    
    mealsToInsert.forEach((meal, index) => {
      const key = `${meal.date}-${meal.type}`
      const foodsEntry = mealFoodsMap.find(m => m.mealIndex === index)
      if (foodsEntry) {
        foodsLookup[key] = foodsEntry.foods
      }
    })

    // 使用返回的 insertedMeals 來匹配和構建 foodsToInsert
    console.log('🔍 Building foodsToInsert using date-type matching...')
    
    for (const insertedMeal of insertedMealsArray) {
      const key = `${insertedMeal.date}-${insertedMeal.type}`
      const foods = foodsLookup[key]
      
      if (!foods) {
        console.warn(`⚠️ No foods found for inserted meal: ${key} (ID: ${insertedMeal.id})`)
        continue
      }

      console.log(`✅ Found ${foods.length} foods for meal ${key} (ID: ${insertedMeal.id})`)

      // 為每個 food 添加 meal_id
      const foodsWithMealId = foods.map((food: any) => ({
        meal_id: insertedMeal.id,
        name: food.name,
        calories: food.calories || 0,
        protein: food.protein || 0,
        carbs: food.carbs || 0,
        fat: food.fat || 0,
        fiber: food.fiber || 0,
        order: food.order || 0,
      }))

      foodsToInsert.push(...foodsWithMealId)
    }

    // === 插入 foods ===
    console.log('🔍 DEBUG: Checking foods insertion...')
    console.log('🔍 foodsToInsert type:', typeof foodsToInsert)
    console.log('🔍 foodsToInsert is array?', Array.isArray(foodsToInsert))
    console.log('🔍 foodsToInsert.length:', foodsToInsert.length)

    if (Array.isArray(foodsToInsert) && foodsToInsert.length > 0) {
      console.log('✅ Condition passed: will insert foods')
      console.log('💾 Inserting', foodsToInsert.length, 'foods to Supabase...')
      console.log('📋 First 3 foods to insert:', JSON.stringify(foodsToInsert.slice(0, 3), null, 2))

      try {
        const { data: insertedFoods, error: foodsError } = await db
          .from('foods')
          .insert(foodsToInsert as any)
          .select()

        console.log('📡 Foods insert response received')
        console.log('📡 Error:', foodsError)
        console.log('📡 Data length:', insertedFoods?.length)
        if (insertedFoods && insertedFoods.length > 0) {
          console.log('📡 First inserted food:', JSON.stringify(insertedFoods[0], null, 2))
        }

        if (foodsError) {
          console.error('❌ Foods insert error:', foodsError)
          console.error('Error code:', foodsError.code)
          console.error('Error message:', foodsError.message)
          console.error('Error details:', JSON.stringify(foodsError.details))
          console.error('Error hint:', foodsError.hint)
          console.error('Full error object:', JSON.stringify(foodsError, null, 2))

          // 記錄完整的 foodsToInsert 以便調試
          console.error('📋 Full foodsToInsert array:', JSON.stringify(foodsToInsert, null, 2))

          throw new Error(`Failed to insert foods: ${foodsError.message} (code: ${foodsError.code})`)
        } else {
          console.log('✅ Inserted', insertedFoods?.length, 'foods successfully')
          if (insertedFoods && insertedFoods.length > 0) {
            console.log('📋 First inserted food:', JSON.stringify(insertedFoods[0], null, 2))
          }
        }
      } catch (error) {
        console.error('💥 Exception during foods insert:', error)
        console.error('Exception details:', JSON.stringify(error, null, 2))
      }
    } else {
      console.error('❌ Condition failed: NOT inserting foods')
      console.error('❌ Why?')
      console.error('   - Is array?', Array.isArray(foodsToInsert))
      console.error('   - Length:', foodsToInsert?.length)
      console.error('   - Type:', typeof foodsToInsert)
      if (foodsToInsert) {
        console.error('   - foodsToInsert:', JSON.stringify(foodsToInsert, null, 2))
      }
    }

    console.log('🏁 Foods insertion section completed')

    // 最後的成功訊息改為更準確
    const actualFoodsCount = foodsToInsert?.length || 0
    console.log(`🎉 Finished. Attempted to create ${mealsToInsert.length} meals with ${actualFoodsCount} foods`)

    return { success: true }
  } catch (error: any) {
    console.error('💥 Error creating initial meals:', error)
    console.error('Error name:', error.name)
    console.error('Error message:', error.message)
    if (error.stack) {
      console.error('Error stack:', error.stack)
    }
    return { success: false, error: error.message }
  }
}

