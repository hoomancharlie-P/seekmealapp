'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Cat from '@/components/Cat'
import MealCard from '@/components/MealCard'
import EditMealModal from '@/components/EditMealModal'
import SpecialEventModal, { type SpecialEventData } from '@/components/SpecialEventModal'
import AdjustmentPreviewModal from '@/components/AdjustmentPreviewModal'
import { adjustMealPlan, type AdjustMealPlanOutput, type AdjustmentOption } from '@/lib/adjustMealPlan'
import { fetchMeals, createInitialMeals, updateMealConsumed, updateMeals, updateFoods, type MealWithFoods } from '@/lib/meals'
import type { CatExpression } from '@/types/cat'
import type { Meal } from '@/types/meal'
import AuthGuard from '@/components/AuthGuard'
import { useAuth } from '@/app/hooks/useAuth'
import { useStreak } from '@/app/hooks/useStreak'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'
import BottomNav from '@/components/BottomNav'
import MealCardSkeleton from '@/components/MealCardSkeleton'
import toast from 'react-hot-toast'

/** 將餐單生成 API 錯誤轉為用戶可讀訊息（429/500/parse 等） */
function getFriendlyMealError(raw: string | undefined): string {
  if (!raw) return '請稍後重試。'
  const lower = raw.toLowerCase()
  if (lower.includes('429') || lower.includes('too many requests') || lower.includes('resource exhausted') || lower.includes('限流'))
    return '請求過於頻繁，請稍後 1–2 分鐘再試。'
  if (lower.includes('parse') || lower.includes('unexpected token') || lower.includes('json'))
    return '餐單暫時無法生成，請重試。'
  if (lower.includes('500') || lower.includes('failed to fetch') || lower.includes('network'))
    return '網絡或服務暫時異常，請稍後重試。'
  if (lower.includes('401') || lower.includes('unauthorized'))
    return '請重新登入後再試。'
  return raw.length > 80 ? raw.slice(0, 80) + '…' : raw
}

function getLocalSpecialEventSuggestions(mealId: string): string[] | null {
  try {
    const raw = localStorage.getItem(`specialEventSuggestions:${mealId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : null
  } catch {
    return null
  }
}

function setLocalSpecialEventSuggestions(mealId: string, suggestions: string[]) {
  try {
    localStorage.setItem(`specialEventSuggestions:${mealId}`, JSON.stringify(suggestions))
  } catch {
    // ignore
  }
}

function dbMealToUiMeal(meal: MealWithFoods, hasDbAiSuggestionsColumn: boolean): Meal {
  const dbSuggestions = hasDbAiSuggestionsColumn ? (meal as any).special_event_ai_suggestions : null
  const aiSuggestions = Array.isArray(dbSuggestions) ? dbSuggestions.filter((x) => typeof x === 'string') : []

  return {
    id: meal.id,
    date: meal.date,
    type: meal.type,
    emoji: meal.emoji,
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    fiber: meal.fiber,
    foods: (meal.foods || []).map((f) => ({
      id: f.id,
      meal_id: f.meal_id,
      name: f.name,
      calories: f.calories,
      protein: f.protein,
      carbs: f.carbs,
      fat: f.fat,
      fiber: f.fiber ?? undefined,
      order: f.order,
    })),
    consumed: meal.consumed,
    consumedAt: meal.consumed_at ? new Date(meal.consumed_at) : undefined,
    isSpecialEvent: meal.is_special_event,
    specialEvent: meal.is_special_event
      ? {
          type: (meal.special_event_type as any) || 'other',
          description: meal.special_event_description ?? undefined,
          estimatedCalories: meal.special_event_calories ?? 0,
          aiSuggestions,
        }
      : undefined,
    isAdjusted: meal.is_adjusted,
    adjustedFrom: meal.adjusted_from ?? undefined,
  }
}

export default function Home() {
  console.log('🏠 Home page render')
  const router = useRouter()
  const { user, signOut, loading: authLoading } = useAuth()

  // 用戶資料
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [allMeals, setAllMeals] = useState<Meal[]>([])
  const [loadingMeals, setLoadingMeals] = useState(true)
  const [hasDbAiSuggestionsColumn, setHasDbAiSuggestionsColumn] = useState<boolean | null>(null)
  const [isRegenerating, setIsRegenerating] = useState(false)
  
  // 旅遊模式狀態（在checkTravelMode中設置）
  const [travelMode, setTravelMode] = useState(false)
  const [travelPlan, setTravelPlan] = useState<any>(null)
  const isGeneratingTravelMeals = useRef(false)

  const { currentStreak: streak } = useStreak(user?.id ?? undefined, profile?.calorie_target ?? 2000)

  // 讀取用戶資料
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setProfile(null)
      setLoadingProfile(false)
      return
    }

    const fetchProfile = async () => {
      try {
        setLoadingProfile(true)
        const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        if (error) throw error
        setProfile(data)
      } catch (error) {
        console.error('Error fetching profile:', error)
      } finally {
        setLoadingProfile(false)
      }
    }

    fetchProfile()
  }, [user, authLoading])

  // 偵測 DB 是否有 special_event_ai_suggestions 欄位（有就完全唔用 localStorage）
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setHasDbAiSuggestionsColumn(null)
      return
    }

    let cancelled = false

    const probe = async () => {
      try {
        const { error } = await supabase
          .from('meals')
          .select('special_event_ai_suggestions')
          .eq('user_id', user.id)
          .limit(1)

        if (cancelled) return

        if (!error) {
          setHasDbAiSuggestionsColumn(true)
          return
        }

        const msg = (error as any)?.message as string | undefined
        // Postgres undefined_column is 42703; Supabase surfaces as message containing "column" + "does not exist"
        if (msg && msg.toLowerCase().includes('does not exist') && msg.toLowerCase().includes('column')) {
          setHasDbAiSuggestionsColumn(false)
          return
        }

        // Unknown error: assume column exists to avoid local overrides
        console.error('Probe special_event_ai_suggestions failed:', error)
        setHasDbAiSuggestionsColumn(true)
      } catch (e) {
        if (cancelled) return
        console.error('Probe special_event_ai_suggestions threw:', e)
        // Conservative default
        setHasDbAiSuggestionsColumn(true)
      }
    }

    probe()

    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  // 更換餐單（智能推薦入口）
  const handleRegenerateMeal = async (mealId: string) => {
    const meal = allMeals.find(m => m.id === mealId)
    if (!meal || !user || !profile) return
    
    // 檢查是否已記錄
    if (meal.consumed) {
      toast.error('已記錄的餐次無法更換')
      return
    }
    
    // 關閉編輯選單
    setShowEditModal(false)
    
    // 打開選擇模式彈窗
    setReplacingMeal(meal)
    setReplacementMode('select')
  }

  // === 智能餐單推薦處理函數 (Task 6.6) ===
  
  const handleQuickGenerate = async () => {
    if (!user || !profile || !replacingMeal) return
    
    setQuickGenerating(true)
    
    try {
      console.log('🎲 Quick generating meal...')
      
      // 快速生成直接使用「自己煮」，嚴格符合營養目標
      const location = 'home_cook'
      
      // 計算目標卡路里
      const mealTarget = replacingMeal.calories
      
      // 獲取其他餐次
      const today = new Date().toISOString().split('T')[0]
      const todayMeals = allMeals.filter(m => m.date === today && m.id !== replacingMeal.id)
      
      const response = await fetch('/api/smart-meal-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          mealType: replacingMeal.type,
          mode: 'quick',
          location,
          targetCalories: mealTarget,
          targetProtein: profile.protein_target / 4,
          targetCarbs: profile.carbs_target / 4,
          targetFat: profile.fat_target / 4,
          targetFiber: profile.fiber_target / 4,
          dietaryRestrictions: profile.dietary_restrictions || [],
          dietaryHabit: profile.dietary_habit || 'none',
          allergies: profile.allergies || [],
          otherMeals: todayMeals
        })
      })
      
      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error)
      }
      
      console.log('✅ Quick generated meal')
      
      const newMeal = result.data.meal
      
      // 檢查是否需要調整其他餐次
      const caloriesDiff = newMeal.calories - mealTarget
      const needsAdjustment = location === 'eating_out' && caloriesDiff > 50
      
      if (needsAdjustment) {
        // 計算調整
        const unconsumedMeals = todayMeals.filter(m => !m.consumed)
        
        if (unconsumedMeals.length === 0) {
          // 所有其他餐次已記錄，無法調整；仍套用新餐單
          await applyMeal(replacingMeal, newMeal)
          toast(
            `這個餐單會超標 ${caloriesDiff} 卡。其他餐次已記錄，無法自動調整，今天會超標約 ${caloriesDiff} 卡`,
            { duration: 4000 }
          )
        } else {
          // 自動調整其他餐次
          const adjustments = calculateAdjustments(unconsumedMeals, caloriesDiff)
          
          // 顯示調整說明
          const adjustmentText = adjustments.map(adj => {
            const names: Record<string, string> = {
              breakfast: '早餐',
              lunch: '午餐',
              dinner: '晚餐',
              snack: '小食'
            }
            return `${names[adj.type]}減少 ${adj.reduction} 卡`
          }).join('\n')
          
          toast.success(
            `已生成並自動調整。因為外食卡路里較高，已為你調整：${adjustmentText}。今日總計：${profile.calorie_target} 卡 ✅`,
            { duration: 4000 }
          )
          
          // 應用調整
          await applyMealAndAdjustments(replacingMeal, newMeal, adjustments)
        }
      } else {
        // 不需要調整，直接應用
        await applyMeal(replacingMeal, newMeal)
      }
      
      // 重新載入餐單
      const startDate = new Date()
      const endDate = new Date()
      endDate.setDate(endDate.getDate() + 2)
      const updatedMeals = await fetchMeals(
        user.id,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      )
      const uiMeals = updatedMeals.map(x => dbMealToUiMeal(x, hasDbAiSuggestionsColumn ?? true))
      
      if (hasDbAiSuggestionsColumn) {
        setAllMeals(uiMeals)
      } else {
        setAllMeals(
          uiMeals.map((m) => {
            if (!m.isSpecialEvent) return m
            const stored = getLocalSpecialEventSuggestions(m.id)
            if (!stored || !m.specialEvent) return m
            return { ...m, specialEvent: { ...m.specialEvent, aiSuggestions: stored } }
          })
        )
      }
      
      // 關閉彈窗
      setQuickGenerating(false)
      setReplacingMeal(null)
      setReplacementMode(null)
      
    } catch (error) {
      console.error('Quick generate error:', error)
      setQuickGenerating(false)
      toast.error('生成失敗，請重試')
    }
  }

  // 計算調整方案
  const calculateAdjustments = (unconsumedMeals: any[], totalReduction: number) => {
    const adjustments = []
    
    // 優先調整晚餐和小食
    const dinner = unconsumedMeals.find(m => m.type === 'dinner')
    const snack = unconsumedMeals.find(m => m.type === 'snack')
    
    if (dinner && snack) {
      // 晚餐 70%，小食 30%
      adjustments.push({
        type: 'dinner',
        reduction: Math.round(totalReduction * 0.7)
      })
      adjustments.push({
        type: 'snack',
        reduction: Math.round(totalReduction * 0.3)
      })
    } else if (dinner) {
      // 只有晚餐
      adjustments.push({
        type: 'dinner',
        reduction: totalReduction
      })
    } else if (snack) {
      // 只有小食
      adjustments.push({
        type: 'snack',
        reduction: totalReduction
      })
    }
    
    return adjustments
  }

  // 應用餐單並調整其他餐次
  const applyMealAndAdjustments = async (
    oldMeal: any,
    newMeal: any,
    adjustments: any[]
  ) => {
    if (!newMeal?.foods?.length) {
      throw new Error('餐單沒有食物資料，請重試')
    }
    const { error: delErr } = await supabase
      .from('foods')
      .delete()
      .eq('meal_id', oldMeal.id)
    if (delErr) throw delErr

    const { error: updErr } = await supabase
      .from('meals')
      .update({
        calories: newMeal.calories,
        protein: newMeal.protein,
        carbs: newMeal.carbs,
        fat: newMeal.fat,
        fiber: newMeal.fiber
      })
      .eq('id', oldMeal.id)
    if (updErr) throw updErr

    const foodsToInsert = newMeal.foods.map((food: any, index: number) => ({
      meal_id: oldMeal.id,
      name: food.name ?? '',
      calories: Number(food.calories) || 0,
      protein: Number(food.protein) || 0,
      carbs: Number(food.carbs) || 0,
      fat: Number(food.fat) || 0,
      fiber: Number(food.fiber) || 0,
      order: index
    }))
    const { error: insErr } = await supabase
      .from('foods')
      .insert(foodsToInsert)
    if (insErr) throw insErr
    
    // 4. 調整其他餐次
    for (const adj of adjustments) {
      const mealToAdjust = allMeals.find(
        m => m.date === oldMeal.date && m.type === adj.type
      )
      
      if (!mealToAdjust) continue
      
      const newCalories = Math.max(50, mealToAdjust.calories - adj.reduction)
      const ratio = newCalories / mealToAdjust.calories
      
      await supabase
        .from('meals')
        .update({
          calories: newCalories,
          protein: Math.round(mealToAdjust.protein * ratio),
          carbs: Math.round(mealToAdjust.carbs * ratio),
          fat: Math.round(mealToAdjust.fat * ratio),
          fiber: Math.round(mealToAdjust.fiber * ratio)
        })
        .eq('id', mealToAdjust.id)
    }
  }

  // 應用餐單（不調整其他）
  const applyMeal = async (oldMeal: any, newMeal: any) => {
    if (!newMeal?.foods?.length) {
      throw new Error('餐單沒有食物資料，請重試')
    }
    const { error: delErr } = await supabase
      .from('foods')
      .delete()
      .eq('meal_id', oldMeal.id)
    if (delErr) throw delErr

    const { error: updErr } = await supabase
      .from('meals')
      .update({
        calories: newMeal.calories,
        protein: newMeal.protein,
        carbs: newMeal.carbs,
        fat: newMeal.fat,
        fiber: newMeal.fiber
      })
      .eq('id', oldMeal.id)
    if (updErr) throw updErr

    const foodsToInsert = newMeal.foods.map((food: any, index: number) => ({
      meal_id: oldMeal.id,
      name: food.name ?? '',
      calories: Number(food.calories) || 0,
      protein: Number(food.protein) || 0,
      carbs: Number(food.carbs) || 0,
      fat: Number(food.fat) || 0,
      fiber: Number(food.fiber) || 0,
      order: index
    }))
    const { error: insErr } = await supabase
      .from('foods')
      .insert(foodsToInsert)
    if (insErr) throw insErr
  }

  // 智能推薦
  const handleSmartRecommend = async (increaseRandomness: boolean = false) => {
    if (!user || !profile || !replacingMeal) return
    
    if (!smartParams.taste || !smartParams.location || !smartParams.style) {
      toast('請選擇口味、地點和風格')
      return
    }
    
    setSmartRecommendHint(
      increaseRandomness
        ? '正在換上同類型不同菜式…'
        : 'AI 正在推薦...'
    )
    setSmartGenerating(true)
    
    try {
      console.log('💭 Smart recommending...', { increaseRandomness })
      
      const mealTarget = replacingMeal.calories
      const today = new Date().toISOString().split('T')[0]
      const todayMeals = allMeals.filter(m => m.date === today && m.id !== replacingMeal.id)
      
      const response = await fetch('/api/smart-meal-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          mealType: replacingMeal.type,
          mode: 'smart',
          taste: smartParams.taste,
          location: smartParams.location,
          style: smartParams.style,
          cuisines: smartParams.cuisines,
          foodType: smartParams.foodType,
          customInput: smartParams.customInput,
          targetCalories: mealTarget,
          targetProtein: profile.protein_target / 4,
          targetCarbs: profile.carbs_target / 4,
          targetFat: profile.fat_target / 4,
          targetFiber: profile.fiber_target / 4,
          dietaryRestrictions: profile.dietary_restrictions || [],
          dietaryHabit: profile.dietary_habit || 'none',
          allergies: profile.allergies || [],
          otherMeals: todayMeals,
          increaseRandomness // 增加隨機性標記
        })
      })
      
      // 檢查 HTTP 響應狀態
      if (!response.ok) {
        const errorText = await response.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch {
          throw new Error(`服務器錯誤 (${response.status}): ${errorText.substring(0, 100)}`)
        }
        throw new Error(errorData.error || errorData.details || `服務器錯誤 (${response.status})`)
      }
      
      // 解析 JSON 響應
      let result
      try {
        result = await response.json()
      } catch (parseError: any) {
        throw new Error(`響應格式錯誤：${parseError.message}`)
      }
      
      if (!result.success) {
        throw new Error(result.error || result.details || '推薦失敗')
      }
      
      // 驗證返回的數據格式
      if (!result.data || !result.data.options || !Array.isArray(result.data.options)) {
        throw new Error('返回的數據格式不正確')
      }
      
      if (result.data.options.length === 0) {
        throw new Error('未能生成推薦選項，請重試')
      }
      
      console.log('✅ Got smart recommendations:', result.data.options.length)
      
      setSmartOptions(result.data.options)
      setSmartGenerating(false)
      if (increaseRandomness) {
        setShowReRecommendBanner(true)
        setTimeout(() => setShowReRecommendBanner(false), 2500)
      }
      
    } catch (error: any) {
      console.error('Smart recommend error:', error)
      setSmartGenerating(false)
      
      // 根據錯誤類型顯示不同訊息
      const errorMessage = error?.message || error?.toString() || '推薦失敗，請重試'
      console.error('Error details:', errorMessage)
      
      if (errorMessage.includes('網絡') || errorMessage.includes('fetch')) {
        toast.error('網絡連接失敗，請檢查網絡後重試')
      } else if (errorMessage.includes('JSON') || errorMessage.includes('格式')) {
        toast.error('數據格式錯誤，請重試或聯繫支持')
      } else if (errorMessage.includes('服務器') || errorMessage.includes('503')) {
        toast.error('AI 服務暫時不可用，請稍後重試')
      } else {
        toast.error(`推薦失敗：${errorMessage}`)
      }
    }
  }

  const handleApplyOption = async (option: any, adjustment: 'adjust' | 'keep') => {
    if (!replacingMeal || isApplyingOption) return
    setIsApplyingOption(true)
    try {
      console.log('💾 Applying option with adjustment:', adjustment)
      
      const caloriesDiff = option.calories - replacingMeal.calories
      
      if (adjustment === 'adjust' && caloriesDiff > 50) {
        // 計算調整
        const today = new Date().toISOString().split('T')[0]
        const todayMeals = allMeals.filter(m => m.date === today && m.id !== replacingMeal.id)
        const unconsumedMeals = todayMeals.filter(m => !m.consumed)
        
        if (unconsumedMeals.length === 0) {
          toast('其他餐次已記錄，無法調整，今天會超標 ' + caloriesDiff + ' 卡', { duration: 4000 })
          // 仍然應用，但不調整
          await applyMeal(replacingMeal, option)
        } else {
          const adjustments = calculateAdjustments(unconsumedMeals, caloriesDiff)
          await applyMealAndAdjustments(replacingMeal, option, adjustments)
        }
      } else {
        // 不調整，直接應用
        await applyMeal(replacingMeal, option)
      }
      
      // 重新載入
      const startDate = new Date()
      const endDate = new Date()
      endDate.setDate(endDate.getDate() + 2)
      const updatedMeals = await fetchMeals(
        user.id,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      )
      const uiMeals = updatedMeals.map(x => dbMealToUiMeal(x, hasDbAiSuggestionsColumn ?? true))
      
      if (hasDbAiSuggestionsColumn) {
        setAllMeals(uiMeals)
      } else {
        setAllMeals(
          uiMeals.map((m) => {
            if (!m.isSpecialEvent) return m
            const stored = getLocalSpecialEventSuggestions(m.id)
            if (!stored || !m.specialEvent) return m
            return { ...m, specialEvent: { ...m.specialEvent, aiSuggestions: stored } }
          })
        )
      }
      
      // 關閉所有彈窗
      setSelectedOption(null)
      setAdjustmentChoice(null)
      setShowAdjustmentChoiceModal(false)
      setSmartOptions([])
      setReplacingMeal(null)
      setReplacementMode(null)
      setSmartParams({
        taste: '',
        location: '',
        style: '',
        cuisines: [],
        foodType: '',
        customInput: ''
      })
      
      toast.success('餐單已更新！')
      
    } catch (error) {
      console.error('Apply option error:', error)
      toast.error('應用失敗，請重試')
    } finally {
      setIsApplyingOption(false)
    }
  }

  // === 手動記錄實際吃的 (Task 6.4) ===
  const handleManualRecord = (meal: any) => {
    console.log('📝 Manual record for meal:', meal.id)
    setManualRecording({
      meal,
      foods: [],
      addMethod: 'select'
    })
  }

  // 處理拍照
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setPhotoAnalyzing(true)
    
    try {
      // 轉換為 base64
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = reader.result as string
        const base64Data = base64.split(',')[1]
        
        console.log('📤 Uploading image...')
        
        // 調用 API
        const response = await fetch('/api/analyze-food-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64Data,
            mimeType: file.type
          })
        })
        
        const result = await response.json()
        
        if (!result.success) {
          throw new Error(result.error)
        }
        
        console.log('✅ AI analysis:', result.data)
        
        // 添加識別的食物
        const newFoods = result.data.foods.map((food: any, index: number) => ({
          id: `photo-${Date.now()}-${index}`,
          name: food.name + (food.portion ? ` ${food.portion}` : ''),
          portion: food.portion,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          fiber: food.fiber,
          confidence: food.confidence,
          notes: food.notes
        }))
        
        // 處理識別結果
        if (manualRecording) {
          setManualRecording(prev => prev ? {
            ...prev,
            foods: [...prev.foods, ...newFoods],
            addMethod: null // 轉為列表視圖
          } : null)
        } else if (managingFoods) {
          // 如果是食物管理模式，直接添加到數據庫
          try {
             const foodsToInsert = newFoods.map((f: any) => ({
                meal_id: managingFoods.meal.id,
                name: f.name + (f.portion ? ` ${f.portion}` : ''),
                calories: f.calories,
                protein: f.protein,
                carbs: f.carbs,
                fat: f.fat,
                fiber: f.fiber
             }))
             
             const { error } = await supabase.from('foods').insert(foodsToInsert)
             if (error) throw error
             
             await refreshMealData(managingFoods.meal.id)
             setManagingFoods(prev => prev ? { ...prev, mode: 'list' } : null)
             
             setToastMessage('食物已添加！')
             setShowToast(true)
             setTimeout(() => setShowToast(false), 2000)
          } catch (e) {
             console.error('Batch add error:', e)
             toast.error('添加失敗，請重試')
          }
        }
        
        // 顯示警告（如果有）
        if (result.data.warnings && result.data.warnings.length > 0) {
          setAiDisclaimer(result.data.warnings.join('。'))
          setTimeout(() => setAiDisclaimer(null), 3000)
        }
        
        setPhotoAnalyzing(false)
      }
      
      reader.onerror = () => {
        console.error('File read error')
        setPhotoAnalyzing(false)
        toast.error('讀取照片失敗，請重試')
      }
      
      reader.readAsDataURL(file)
      
    } catch (error) {
      console.error('Photo analysis error:', error)
      setPhotoAnalyzing(false)
      toast.error('分析失敗，請重試或使用其他方式')
    }
  }

  // 處理文字分析
  const handleTextAnalysis = async () => {
    if (!textInput.trim()) {
      toast('請輸入食物描述')
      return
    }
    
    setTextAnalyzing(true)
    
    try {
      console.log('📤 Analyzing text:', textInput)
      
      const response = await fetch('/api/analyze-food-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textInput })
      })
      
      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error)
      }
      
      console.log('✅ AI analysis:', result.data)
      
      // 添加識別的食物
      const newFoods = result.data.foods.map((food: any, index: number) => ({
        id: `text-${Date.now()}-${index}`,
        name: food.name + (food.portion ? ` ${food.portion}` : ''),
        portion: food.portion,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fiber: food.fiber
      }))
      
      setManualRecording(prev => prev ? {
        ...prev,
        foods: [...prev.foods, ...newFoods],
        addMethod: null
      } : null)
      
      setTextInput('')
      setTextAnalyzing(false)
      
    } catch (error) {
      console.error('Text analysis error:', error)
      setTextAnalyzing(false)
      toast.error('分析失敗，請重試')
    }
  }

  const handleAddFood = () => {
    if (!newFood.name || !newFood.calories) {
      toast('請至少填寫食物名稱和卡路里')
      return
    }
    
    if (!manualRecording) return
    
    const food = {
      id: `temp-${Date.now()}`,
      name: newFood.name + (newFood.portion ? ` ${newFood.portion}` : ''),
      portion: newFood.portion,
      calories: parseInt(newFood.calories) || 0,
      protein: parseInt(newFood.protein) || 0,
      carbs: parseInt(newFood.carbs) || 0,
      fat: parseInt(newFood.fat) || 0,
      fiber: parseInt(newFood.fiber) || 0
    }
    
    setManualRecording({
      ...manualRecording,
      foods: [...manualRecording.foods, food],
      addMethod: null
    })
    
    // 重置表單
    setNewFood({
      name: '',
      portion: '',
      calories: '',
      protein: '',
      carbs: '',
      fat: '',
      fiber: ''
    })
    
    setAddingFood(false)
  }

  const handleRemoveFood = (foodId: string) => {
    if (!manualRecording) return
    
    setManualRecording({
      ...manualRecording,
      foods: manualRecording.foods.filter(f => f.id !== foodId)
    })
  }

  const handleConfirmManualRecord = async () => {
    if (!manualRecording || manualRecording.foods.length === 0) {
      toast('請至少添加一項食物')
      return
    }
    
    try {
      console.log('💾 Saving manual record...')
      
      const meal = manualRecording.meal
      const foods = manualRecording.foods
      
      // 計算總營養素
      const totalCalories = foods.reduce((sum, f) => sum + f.calories, 0)
      const totalProtein = foods.reduce((sum, f) => sum + f.protein, 0)
      const totalCarbs = foods.reduce((sum, f) => sum + f.carbs, 0)
      const totalFat = foods.reduce((sum, f) => sum + f.fat, 0)
      const totalFiber = foods.reduce((sum, f) => sum + f.fiber, 0)
      
      console.log('📊 Total nutrition:', {
        calories: totalCalories,
        protein: totalProtein,
        carbs: totalCarbs,
        fat: totalFat,
        fiber: totalFiber
      })
      
      // 1. 刪除原有的 foods
      const { error: deleteFoodsError } = await supabase
        .from('foods')
        .delete()
        .eq('meal_id', meal.id)
      
      if (deleteFoodsError) {
        console.error('Delete foods error:', deleteFoodsError)
        throw deleteFoodsError
      }
      
      console.log('✅ Deleted old foods')
      
      // 2. 更新 meal
      const { error: updateMealError } = await supabase
        .from('meals')
        .update({
          calories: totalCalories,
          protein: totalProtein,
          carbs: totalCarbs,
          fat: totalFat,
          fiber: totalFiber,
          consumed: true,
          consumed_at: new Date().toISOString()
        })
        .eq('id', meal.id)
      
      if (updateMealError) {
        console.error('Update meal error:', updateMealError)
        throw updateMealError
      }
      
      console.log('✅ Updated meal')
      
      // 3. 插入新的 foods
      const foodsToInsert = foods.map((food, index) => ({
        meal_id: meal.id,
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
      
      console.log('✅ Inserted new foods')
      
      // 4. 重新載入餐單
      const startDate = new Date()
      const endDate = new Date()
      endDate.setDate(endDate.getDate() + 2)
      
      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]
      
      const updatedMeals = await fetchMeals(user?.id || '', startDateStr, endDateStr)
      // 需要轉換為 UI 格式
      const uiMeals = updatedMeals.map(x => dbMealToUiMeal(x, hasDbAiSuggestionsColumn ?? true))
      
      if (hasDbAiSuggestionsColumn) {
        setAllMeals(uiMeals)
      } else {
        setAllMeals(
          uiMeals.map((m) => {
            if (!m.isSpecialEvent) return m
            const stored = getLocalSpecialEventSuggestions(m.id)
            if (!stored || !m.specialEvent) return m
            return { ...m, specialEvent: { ...m.specialEvent, aiSuggestions: stored } }
          })
        )
      }
      
      // 5. 關閉彈窗
      setManualRecording(null)
      
      const mealNames: Record<string, string> = {
        breakfast: '早餐',
        lunch: '午餐',
        dinner: '晚餐',
        snack: '小食'
      }
      setToastMessage(`${mealNames[meal.type] || '餐次'}已記錄！`)
      setShowToast(true)
      setTimeout(() => setShowToast(false), 2000)
      
    } catch (error) {
      console.error('💥 Error saving manual record:', error)
      toast.error('記錄失敗，請重試')
    }
  }

  // 讀取餐單
  // 檢查旅遊模式（等待用戶認證完成後再執行）
  useEffect(() => {
    if (authLoading || !user) return
    
    checkTravelMode()
  }, [authLoading, user])
  
  const checkTravelMode = async () => {
    if (!user) return
    
    try {
      // 獲取 session 並在請求中包含 token
      const { data: { session } } = await supabase.auth.getSession()
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      
      const response = await fetch('/api/travel-mode', {
        method: 'GET',
        headers,
        credentials: 'include'
      })
      
      if (!response.ok) {
        // 如果是 401，可能是認證問題，但不影響頁面顯示
        if (response.status === 401) {
          console.warn('⚠️ Travel mode check: Unauthorized (may be normal if session not ready)')
          return
        }
        throw new Error(`HTTP ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.active && data.plan) {
        const today = new Date().toISOString().split('T')[0]
        const endDate = data.plan.end_date

        // 若已過結束日期，自動停用（呼叫 API 更新，避免客戶端直連 travel_plans）
        if (today > endDate) {
          console.log('🌍 Travel plan expired, deactivating...')
          try {
            const { data: { session } } = await supabase.auth.getSession()
            const headers: HeadersInit = { 'Content-Type': 'application/json' }
            if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
            await fetch('/api/travel-mode', {
              method: 'DELETE',
              headers,
              credentials: 'include'
            })
          } catch (_) { /* ignore */ }
          setTravelMode(false)
          setTravelPlan(null)
        } else {
          setTravelMode(true)
          setTravelPlan(data.plan)
        }
      } else {
        setTravelMode(false)
        setTravelPlan(null)
      }
    } catch (error) {
      console.error('Error checking travel mode:', error)
      // 不設置狀態，保持默認值
    }
  }

  // 檢查特定日期是否在旅遊期間（僅在旅遊日期當天顯示標識）
  const isDateInTravel = (date: string): boolean => {
    if (!travelPlan) return false
    const checkDate = new Date(date)
    checkDate.setHours(0, 0, 0, 0)
    const startDate = new Date(travelPlan.start_date)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(travelPlan.end_date)
    endDate.setHours(23, 59, 59, 999)
    return checkDate >= startDate && checkDate <= endDate
  }

  const getTravelDestination = (): string => {
    return travelPlan?.destination || ''
  }

  /** 為指定日期生成一天旅遊餐單（呼叫 generate-day API） */
  const generateTravelMealForDate = async (date: string, activePlan: { destination: string; cuisine?: string }) => {
    const { data: { session } } = await supabase.auth.getSession()
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
    const response = await fetch('/api/travel-mode/generate-day', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        userId: user!.id,
        date,
        destination: activePlan.destination,
        cuisine: activePlan.cuisine || 'general'
      })
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err?.error || `HTTP ${response.status}`)
    }
  }

  /** 檢查未來 3 天（旅遊期間內）是否缺餐單，缺則順序呼叫 generate-day 補充，避免 rate limit */
  const checkAndGenerateTravelMeals = async (reloadMeals?: () => Promise<void>) => {
    if (!user) return

    if (isGeneratingTravelMeals.current) {
      console.log('⏳ Already generating travel meals, skipping...')
      return
    }
    isGeneratingTravelMeals.current = true

    try {
      // 使用 API 取得活躍計劃，避免客戶端直連 travel_plans 造成 406（.single() 無結果時）
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      const res = await fetch('/api/travel-mode', { method: 'GET', headers, credentials: 'include' })
      if (!res.ok) {
        isGeneratingTravelMeals.current = false
        return
      }
      const data = await res.json()
      const activePlan = data.active && data.plan ? data.plan : null

      if (!activePlan) {
        isGeneratingTravelMeals.current = false
        return
      }

      console.log('🌍 Active travel plan found:', activePlan)

      const today = new Date()
      const datesToCheck: string[] = []
      for (let i = 0; i < 3; i++) {
        const date = new Date(today)
        date.setDate(today.getDate() + i)
        const dateStr = date.toISOString().split('T')[0]
        if (dateStr >= activePlan.start_date && dateStr <= activePlan.end_date) {
          datesToCheck.push(dateStr)
        }
      }

      if (datesToCheck.length === 0) {
        isGeneratingTravelMeals.current = false
        return
      }

      console.log('📅 Checking dates:', datesToCheck)

      const datesToGenerate: string[] = []
      for (const date of datesToCheck) {
        const { data: meals } = await supabase
          .from('meals')
          .select('id')
          .eq('user_id', user.id)
          .eq('date', date)
          .limit(1)
        if (!meals || meals.length === 0) datesToGenerate.push(date)
      }

      if (datesToGenerate.length === 0) {
        console.log('✅ All meals exist')
        isGeneratingTravelMeals.current = false
        return
      }

      console.log('🔄 Generating meals for:', datesToGenerate)

      for (let i = 0; i < datesToGenerate.length; i++) {
        const date = datesToGenerate[i]
        console.log('🔄 Generating meal for', date)
        try {
          await generateTravelMealForDate(date, activePlan)
          console.log('✅ Meal generated for', date)
          if (i < datesToGenerate.length - 1) {
            console.log('⏳ Waiting 2s before next generation...')
            await new Promise((resolve) => setTimeout(resolve, 2000))
          }
        } catch (error) {
          console.error('❌ Error generating meal for', date, error)
        }
      }

      if (reloadMeals) {
        await reloadMeals()
      }
      console.log('✅ Travel meals generation completed')
    } catch (error) {
      console.error('Error checking travel meals:', error)
    } finally {
      isGeneratingTravelMeals.current = false
    }
  }
  
  // 檢查URL參數，如果旅遊模式已啟動或結束，刷新餐單
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (authLoading) return
    if (!user) return
    if (hasDbAiSuggestionsColumn === null) return
    
    const params = new URLSearchParams(window.location.search)
    const travelModeActivated = params.get('travelModeActivated')
    const travelModeDeactivated = params.get('travelModeDeactivated')
    
    if (travelModeActivated === 'true' || travelModeDeactivated === 'true') {
      console.log('🔄 Travel mode changed, refreshing meals...')
      
      // 清除URL參數
      window.history.replaceState({}, '', '/')
      
      // 重新檢查旅遊模式狀態
      checkTravelMode().then(() => {
        // 強制刷新餐單
        console.log('🔄 Forcing meal refresh after travel mode change...')
        // 觸發 loadMeals 重新執行（通過改變依賴項）
        setAllMeals([])
        setLoadingMeals(true)
        // 使用 setTimeout 確保狀態更新後再重新載入
        setTimeout(() => {
          window.location.reload()
        }, 100)
      })
    }
  }, [user, hasDbAiSuggestionsColumn, authLoading])
  
  useEffect(() => {
    console.log('🔵 loadMeals useEffect triggered, user:', user?.id, 'travelMode:', travelMode)

    if (authLoading) return
    if (!user) {
      console.log('🔴 No user, skipping loadMeals')
      setAllMeals([])
      setLoadingMeals(false)
      return
    }

    // Wait until we've determined whether DB has the suggestions column (prevents using localStorage when DB is available)
    if (hasDbAiSuggestionsColumn === null) return

    console.log('🟢 User exists, starting loadMeals')
    setLoadingMeals(true)

    const loadMeals = async () => {
      try {
        console.log('✅ Loading meals for user:', user.id)

        // 若有活躍旅遊計劃，先檢查並補充未來 3 天缺的餐單（順序生成 + 2s 間隔，避免 rate limit）
        await checkAndGenerateTravelMeals(loadMeals)

        // 獲取日期範圍
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        let endDate = new Date()
        
        // 如果有旅遊模式，顯示到旅程結束日期
        if (travelMode && travelPlan) {
          const planEndDate = new Date(travelPlan.end_date)
          planEndDate.setHours(23, 59, 59, 999)
          // 顯示到旅程結束日期，但不超過今天+30天（防止過長）
          const maxDate = new Date(today)
          maxDate.setDate(maxDate.getDate() + 30)
          endDate = planEndDate > maxDate ? maxDate : planEndDate
          console.log('✈️ Travel mode active, showing meals until:', planEndDate.toISOString().split('T')[0])
        } else {
          // 預設：只顯示未來2天
          endDate.setDate(today.getDate() + 2)
          console.log('📅 Default mode, showing next 2 days')
        }

        const startDateStr = today.toISOString().split('T')[0]
        const endDateStr = endDate.toISOString().split('T')[0]

        console.log('📅 Date range:', startDateStr, 'to', endDateStr)

        const meals = await fetchMeals(user.id, startDateStr, endDateStr)
        console.log('📊 Fetched meals:', meals.length)

        // 旅遊餐單由 checkAndGenerateTravelMeals 在主頁載入時補齊
        
        // 檢查今天有沒有餐單
        const todayMeals = meals.filter(m => m.date === startDateStr)
        console.log('📊 Today meals:', todayMeals.length)

        if (todayMeals.length === 0) {
          console.log('🆕 No meals found for today')
          
          // 檢查是否有未來的餐單（可能是旅行模式結束後留下的）
          const futureMeals = meals.filter(m => m.date > startDateStr)
          console.log('📊 Future meals:', futureMeals.length)
          
          // 如果有未來的餐單，不需要生成新餐單，直接使用現有的
          // 這可以避免在旅行模式結束後錯誤地重新生成餐單
          if (futureMeals.length > 0) {
            console.log('✅ Found future meals, using existing meals (no regeneration needed)')
            const uiMeals = meals.map(x => dbMealToUiMeal(x, hasDbAiSuggestionsColumn ?? true))
            if (hasDbAiSuggestionsColumn) {
              setAllMeals(uiMeals)
            } else {
              setAllMeals(
                uiMeals.map((m) => {
                  if (!m.isSpecialEvent) return m
                  const stored = getLocalSpecialEventSuggestions(m.id)
                  if (!stored || !m.specialEvent) return m
                  return { ...m, specialEvent: { ...m.specialEvent, aiSuggestions: stored } }
                })
              )
            }
            setLoadingMeals(false)
            return
          }

          // 旅遊模式且無餐單：重新載入主頁，讓 checkAndGenerateTravelMeals 再次執行補齊餐單
          if (travelMode && travelPlan?.start_date && travelPlan?.end_date && travelPlan?.destination) {
            console.log('✈️ Travel mode active but no meals — reloading to trigger checkAndGenerateTravelMeals')
            window.location.href = '/'
            setLoadingMeals(false)
            return
          }
          
          // 只有在確實沒有任何未來餐單且非旅遊模式時才生成預設餐單
          // 2a. 刪除所有過期未使用的餐單
          console.log('🗑️ Deleting expired unused meals...')
          const { error: deleteError } = await supabase
            .from('meals')
            .delete()
            .eq('user_id', user.id)
            .lt('date', startDateStr)
            .eq('consumed', false)
          
          if (deleteError) {
            console.error('Delete error:', deleteError)
          } else {
            console.log('✅ Deleted expired meals')
          }
          
          // 確保 profile 已載入
          if (!profile) {
            console.log('⏳ Waiting for profile...')
            return
          }

          // 2b. 生成新餐單
          console.log('🤖 Generating new meals...')
          const result = await createInitialMeals(user.id, {
            calorie_target: profile.calorie_target,
            protein_target: profile.protein_target,
            carbs_target: profile.carbs_target,
            fat_target: profile.fat_target,
            fiber_target: profile.fiber_target,
            dietary_restrictions: profile.dietary_restrictions || [],
            dietary_habit: profile.dietary_habit || 'none',
            allergies: profile.allergies || []
          })

          console.log('🎉 Create result:', result)

          if (result.success) {
            console.log('✅ Meals created successfully, fetching...')
            const newMeals = await fetchMeals(user.id, startDateStr, endDateStr)
            console.log('📊 New meals fetched:', newMeals.length)
            
            const uiMeals = newMeals.map((x) => dbMealToUiMeal(x, hasDbAiSuggestionsColumn ?? true))
            if (hasDbAiSuggestionsColumn) {
              setAllMeals(uiMeals)
            } else {
              setAllMeals(uiMeals)
            }
          } else {
            console.error('❌ Failed to create meals:', result.error)
            toast.error('餐單生成失敗：' + getFriendlyMealError(result.error) + ' 請重試或聯絡支援。', { duration: 5000 })
          }
        } else {
          // 3. 今天有餐單，檢查未來夠不夠 3 天
          const uniqueDates = Array.from(new Set(meals.map(m => m.date))).sort()
          console.log('📊 Unique dates:', uniqueDates.length, uniqueDates)
          
          if (uniqueDates.length < 3) {
            console.log('⚠️ Future meals < 3 days, need to generate more')
            
            if (!profile) {
              console.log('⏳ Waiting for profile...')
              return
            }
            
            console.log(`🤖 Generating more days...`)
            
            const result = await createInitialMeals(user.id, {
              calorie_target: profile.calorie_target,
              protein_target: profile.protein_target,
              carbs_target: profile.carbs_target,
              fat_target: profile.fat_target,
              fiber_target: profile.fiber_target,
              dietary_restrictions: profile.dietary_restrictions || [],
              dietary_habit: profile.dietary_habit || 'none',
              allergies: profile.allergies || []
            })
            
            if (result.success) {
              const updatedMeals = await fetchMeals(user.id, startDateStr, endDateStr)
              console.log('📊 Updated meals:', updatedMeals.length)
              
              const uiMeals = updatedMeals.map((x) => dbMealToUiMeal(x, hasDbAiSuggestionsColumn))
              if (hasDbAiSuggestionsColumn) {
                setAllMeals(uiMeals)
              } else {
                setAllMeals(
                  uiMeals.map((m) => {
                    if (!m.isSpecialEvent) return m
                    const stored = getLocalSpecialEventSuggestions(m.id)
                    if (!stored || !m.specialEvent) return m
                    return { ...m, specialEvent: { ...m.specialEvent, aiSuggestions: stored } }
                  })
                )
              }
            } else {
              // 生成失敗（例如 429）時仍顯示已取得的餐單，避免主頁空白
              console.warn('⚠️ Generating more days failed, showing existing meals')
              const uiMeals = meals.map((x) => dbMealToUiMeal(x, hasDbAiSuggestionsColumn ?? true))
              if (hasDbAiSuggestionsColumn) {
                setAllMeals(uiMeals)
              } else {
                setAllMeals(
                  uiMeals.map((m) => {
                    if (!m.isSpecialEvent) return m
                    const stored = getLocalSpecialEventSuggestions(m.id)
                    if (!stored || !m.specialEvent) return m
                    return { ...m, specialEvent: { ...m.specialEvent, aiSuggestions: stored } }
                  })
                )
              }
              setShowToast(true)
              setToastMessage(getFriendlyMealError(result.error) + '，目前顯示已有餐單。')
              setTimeout(() => setShowToast(false), 4000)
            }
          } else {
            console.log('✅ Have enough future meals (3 days)')
            
            const uiMeals = meals.map((x) => dbMealToUiMeal(x, hasDbAiSuggestionsColumn))
            if (hasDbAiSuggestionsColumn) {
              setAllMeals(uiMeals)
            } else {
              setAllMeals(
                uiMeals.map((m) => {
                  if (!m.isSpecialEvent) return m
                  const stored = getLocalSpecialEventSuggestions(m.id)
                  if (!stored || !m.specialEvent) return m
                  return { ...m, specialEvent: { ...m.specialEvent, aiSuggestions: stored } }
                })
              )
            }
          }
        }
      } catch (error) {
        console.error('❌ Error loading meals:', error)
      } finally {
        setLoadingMeals(false)
      }
    }

    loadMeals()
  }, [user, hasDbAiSuggestionsColumn, authLoading, travelMode, travelPlan])

  // 顯示用戶名（優先用 username，沒有就用郵箱前綴）
  const displayName = profile?.username || user?.email?.split('@')[0] || '用戶'
  const [isSticky, setIsSticky] = useState(false)
  const [catExpression, setCatExpression] = useState<CatExpression>('neutral')
  const [expandedDates, setExpandedDates] = useState<string[]>([])
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [showCoachTooltip, setShowCoachTooltip] = useState(false)
  
  // 手動記錄相關狀態
  const [manualRecording, setManualRecording] = useState<{
    meal: any
    foods: Array<{
      id: string
      name: string
      portion: string
      calories: number
      protein: number
      carbs: number
      fat: number
      fiber: number
    }>
    addMethod: 'select' | 'photo' | 'text' | 'quick' | null
  } | null>(null)

  const [addingFood, setAddingFood] = useState(false)
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false)
  const [textAnalyzing, setTextAnalyzing] = useState(false)
  const [textInput, setTextInput] = useState('')
  
  // 單項食物編輯狀態
  const [managingFoods, setManagingFoods] = useState<{
    meal: any
    mode: 'list' | 'select' | 'text' | 'quick'
  } | null>(null)

  // UX Optimization
  const [aiDisclaimer, setAiDisclaimer] = useState<string | null>(null)

  const [newFood, setNewFood] = useState({
    name: '',
    portion: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    fiber: ''
  })
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedMealForEdit, setSelectedMealForEdit] = useState<Meal | null>(null)
  
  // 旅遊模式已在上面聲明，這裡不再重複
  const [showSpecialEventModal, setShowSpecialEventModal] = useState(false)
  const [selectedMealForEvent, setSelectedMealForEvent] = useState<Meal | null>(null)
  const [showAdjustmentPreview, setShowAdjustmentPreview] = useState(false)
  const [adjustmentResult, setAdjustmentResult] = useState<AdjustMealPlanOutput | null>(null)
  const [currentEventData, setCurrentEventData] = useState<SpecialEventData | null>(null)

  // === 智能餐單推薦狀態 (Task 6.6) ===
  const [replacingMeal, setReplacingMeal] = useState<any | null>(null)
  const [replacementMode, setReplacementMode] = useState<'select' | 'quick' | 'smart' | null>(null)
  const [quickGenerating, setQuickGenerating] = useState(false)
  const [smartParams, setSmartParams] = useState({
    taste: '',
    location: '',
    style: '',
    cuisines: [] as string[],
    foodType: '',
    customInput: ''
  })
  const [smartGenerating, setSmartGenerating] = useState(false)
  const [smartOptions, setSmartOptions] = useState<any[]>([])
  const [selectedOption, setSelectedOption] = useState<any | null>(null)
  const [adjustmentChoice, setAdjustmentChoice] = useState<'adjust' | 'keep' | null>(null)
  const [showAdjustmentChoiceModal, setShowAdjustmentChoiceModal] = useState(false)
  const [isApplyingOption, setIsApplyingOption] = useState(false)
  const [smartRecommendHint, setSmartRecommendHint] = useState('')
  const [showReRecommendBanner, setShowReRecommendBanner] = useState(false)

  // 快速生成 useEffect
  useEffect(() => {
    if (replacementMode === 'quick' && replacingMeal && !quickGenerating) {
      handleQuickGenerate()
    }
  }, [replacementMode, replacingMeal, quickGenerating])

  // 智能推薦：選擇調整方式後套用
  useEffect(() => {
    if (adjustmentChoice && selectedOption && replacingMeal) {
      handleApplyOption(selectedOption, adjustmentChoice)
    }
  }, [adjustmentChoice, selectedOption, replacingMeal])

  useEffect(() => {
    console.log('🏠 Home page mounted (client)')
  }, [])

  useEffect(() => {
    // 檢查是否首次使用（localStorage）
    let showTimer: ReturnType<typeof setTimeout> | undefined
    let hideTimer: ReturnType<typeof setTimeout> | undefined

    try {
      const hasSeenCoachTooltip = localStorage.getItem('hasSeenCoachTooltip')
      if (!hasSeenCoachTooltip) {
        showTimer = setTimeout(() => setShowCoachTooltip(true), 2000) // 2秒後顯示
        hideTimer = setTimeout(() => {
          setShowCoachTooltip(false)
          localStorage.setItem('hasSeenCoachTooltip', 'true')
        }, 8000) // 8秒後自動消失
      }
    } catch {
      // ignore (e.g. privacy mode)
    }

    return () => {
      if (showTimer) clearTimeout(showTimer)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [])

  // 營養目標（優先用 profile，無就 fallback）
  const nutritionTargets = useMemo(() => {
    return {
      calorieTarget: profile?.calorie_target || 1200,
      proteinTarget: profile?.protein_target || 60,
      carbsTarget: profile?.carbs_target || 150,
      fatTarget: profile?.fat_target || 40,
      fiberTarget: profile?.fiber_target || 28
    }
  }, [profile])

  // 取得今日日期（YYYY-MM-DD）
  const getToday = () => {
    return new Date().toISOString().split('T')[0]
  }

  // 生成初始餐單數據（使用動態日期）
  const generateInitialMeals = (): Meal[] => {
    const today = getToday()
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const dayAfterTomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    return [
      // ===== Day 1: 今日 =====
      {
        id: `breakfast-${today}`,
        date: today,
        type: 'breakfast',
        emoji: '🌅',
        calories: 300,
        protein: 15,
        carbs: 45,
        fat: 8,
        fiber: 6,
        foods: [
          { name: '燕麥粥 1碗', calories: 150, protein: 5, carbs: 27, fat: 3, fiber: 4 },
          { name: '水煮蛋 1隻', calories: 70, protein: 6, carbs: 1, fat: 5, fiber: 0 },
          { name: '香蕉 半條', calories: 80, protein: 1, carbs: 20, fat: 0, fiber: 2 }
        ],
        consumed: false
      },
      {
        id: `lunch-${today}`,
        date: today,
        type: 'lunch',
        emoji: '🌤️',
        calories: 450,
        protein: 35,
        carbs: 50,
        fat: 12,
        fiber: 8,
        foods: [
          { name: '雞胸沙律', calories: 250, protein: 30, carbs: 10, fat: 8, fiber: 5 },
          { name: '糙米飯 半碗', calories: 150, protein: 3, carbs: 32, fat: 1, fiber: 2 },
          { name: '蘋果 1個', calories: 50, protein: 0, carbs: 13, fat: 0, fiber: 2 }
        ],
        consumed: false
      },
      {
        id: `dinner-${today}`,
        date: today,
        type: 'dinner',
        emoji: '🌙',
        calories: 420,
        protein: 30,
        carbs: 48,
        fat: 10,
        fiber: 7,
        foods: [
          { name: '清蒸魚', calories: 180, protein: 25, carbs: 0, fat: 8, fiber: 0 },
          { name: '炒菜心', calories: 60, protein: 3, carbs: 8, fat: 2, fiber: 3 },
          { name: '白飯 半碗', calories: 180, protein: 2, carbs: 40, fat: 0, fiber: 1 }
        ],
        consumed: false
      },
      {
        id: `snack-${today}`,
        date: today,
        type: 'snack',
        emoji: '🍎',
        calories: 100,
        protein: 1,
        carbs: 25,
        fat: 0,
        fiber: 3,
        foods: [
          { name: '蘋果 1個', calories: 80, protein: 0, carbs: 21, fat: 0, fiber: 3 },
          { name: '杏仁 10粒', calories: 20, protein: 1, carbs: 4, fat: 0, fiber: 0 }
        ],
        consumed: false
      },
      
      // ===== Day 2: 明日 =====
      {
        id: `breakfast-${tomorrow}`,
        date: tomorrow,
        type: 'breakfast',
        emoji: '🌅',
        calories: 320,
        protein: 18,
        carbs: 42,
        fat: 9,
        fiber: 7,
        foods: [
          { name: '全麥麵包 2片', calories: 140, protein: 8, carbs: 26, fat: 2, fiber: 4 },
          { name: '花生醬 1匙', calories: 90, protein: 4, carbs: 3, fat: 7, fiber: 1 },
          { name: '牛奶 1杯', calories: 90, protein: 8, carbs: 12, fat: 2, fiber: 0 }
        ],
        consumed: false
      },
      {
        id: `lunch-${tomorrow}`,
        date: tomorrow,
        type: 'lunch',
        emoji: '🌤️',
        calories: 480,
        protein: 32,
        carbs: 55,
        fat: 13,
        fiber: 9,
        foods: [
          { name: '三文魚', calories: 240, protein: 28, carbs: 0, fat: 12, fiber: 0 },
          { name: '糙米飯 半碗', calories: 150, protein: 3, carbs: 32, fat: 1, fiber: 2 },
          { name: '西蘭花', calories: 90, protein: 3, carbs: 18, fat: 0, fiber: 5 }
        ],
        consumed: false
      },
      {
        id: `dinner-${tomorrow}`,
        date: tomorrow,
        type: 'dinner',
        emoji: '🌙',
        calories: 400,
        protein: 28,
        carbs: 45,
        fat: 11,
        fiber: 8,
        foods: [
          { name: '豬扒', calories: 200, protein: 22, carbs: 0, fat: 11, fiber: 0 },
          { name: '炒雜菜', calories: 80, protein: 4, carbs: 12, fat: 2, fiber: 5 },
          { name: '白飯 半碗', calories: 180, protein: 2, carbs: 40, fat: 0, fiber: 1 }
        ],
        consumed: false
      },
      {
        id: `snack-${tomorrow}`,
        date: tomorrow,
        type: 'snack',
        emoji: '🍎',
        calories: 100,
        protein: 1,
        carbs: 25,
        fat: 0,
        fiber: 3,
        foods: [
          { name: '蘋果 1個', calories: 80, protein: 0, carbs: 21, fat: 0, fiber: 3 },
          { name: '杏仁 10粒', calories: 20, protein: 1, carbs: 4, fat: 0, fiber: 0 }
        ],
        consumed: false
      },
      
      // ===== Day 3: 後日 =====
      {
        id: `breakfast-${dayAfterTomorrow}`,
        date: dayAfterTomorrow,
        type: 'breakfast',
        emoji: '🌅',
        calories: 310,
        protein: 16,
        carbs: 48,
        fat: 7,
        fiber: 6,
        foods: [
          { name: '鬆餅 2塊', calories: 160, protein: 6, carbs: 28, fat: 3, fiber: 2 },
          { name: '希臘乳酪', calories: 100, protein: 10, carbs: 8, fat: 4, fiber: 0 },
          { name: '藍莓 1杯', calories: 50, protein: 1, carbs: 12, fat: 0, fiber: 2 }
        ],
        consumed: false
      },
      {
        id: `lunch-${dayAfterTomorrow}`,
        date: dayAfterTomorrow,
        type: 'lunch',
        emoji: '🌤️',
        calories: 460,
        protein: 30,
        carbs: 52,
        fat: 14,
        fiber: 7,
        foods: [
          { name: '牛肉炒麵', calories: 380, protein: 25, carbs: 45, fat: 12, fiber: 4 },
          { name: '涼拌青瓜', calories: 40, protein: 2, carbs: 8, fat: 1, fiber: 2 },
          { name: '橙 1個', calories: 40, protein: 1, carbs: 10, fat: 0, fiber: 2 }
        ],
        consumed: false
      },
      {
        id: `dinner-${dayAfterTomorrow}`,
        date: dayAfterTomorrow,
        type: 'dinner',
        emoji: '🌙',
        calories: 430,
        protein: 32,
        carbs: 46,
        fat: 12,
        fiber: 9,
        foods: [
          { name: '雞胸肉', calories: 200, protein: 30, carbs: 0, fat: 8, fiber: 0 },
          { name: '烤薯仔', calories: 130, protein: 3, carbs: 30, fat: 0, fiber: 3 },
          { name: '沙律', calories: 100, protein: 2, carbs: 15, fat: 4, fiber: 4 }
        ],
        consumed: false
      },
      {
        id: `snack-${dayAfterTomorrow}`,
        date: dayAfterTomorrow,
        type: 'snack',
        emoji: '🍎',
        calories: 100,
        protein: 1,
        carbs: 25,
        fat: 0,
        fiber: 3,
        foods: [
          { name: '蘋果 1個', calories: 80, protein: 0, carbs: 21, fat: 0, fiber: 3 },
          { name: '杏仁 10粒', calories: 20, protein: 1, carbs: 4, fat: 0, fiber: 0 }
        ],
        consumed: false
      }
    ]
  }

  // 餐單數據（從 Supabase 載入）

  // 取得今日餐單（按順序排序：breakfast, lunch, dinner, snack）
  const todayMeals = useMemo(() => {
    const today = getToday()
    const mealOrder = { breakfast: 1, lunch: 2, dinner: 3, snack: 4 }
    return allMeals
      .filter(meal => meal.date === today)
      .sort((a, b) => mealOrder[a.type] - mealOrder[b.type])
  }, [allMeals])

  // 計算當日所有餐單的營養總和（作為目標值）
  const todayMealsTargets = useMemo(() => {
    return todayMeals.reduce(
      (acc, meal) => {
        // 如果是特殊活動餐次，使用 estimatedCalories，否則使用 calories
        const mealCalories = meal.isSpecialEvent && meal.specialEvent?.estimatedCalories
          ? meal.specialEvent.estimatedCalories
          : meal.calories

        acc.calories += mealCalories
        acc.protein += meal.protein
        acc.carbs += meal.carbs
        acc.fat += meal.fat
        acc.fiber += meal.fiber
        return acc
      },
      {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
      }
    )
  }, [todayMeals])

  // 取得未來餐單（明日和後日）
  const futureMeals = useMemo(() => {
    const today = getToday()
    return allMeals.filter(meal => meal.date > today)
  }, [allMeals])

  // 按日期分組
  const mealsByDate = useMemo(() => {
    const grouped: Record<string, Meal[]> = {}
    allMeals.forEach(meal => {
      if (!grouped[meal.date]) {
        grouped[meal.date] = []
      }
      grouped[meal.date].push(meal)
    })
    return grouped
  }, [allMeals])

  // 監聽滾動事件
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset
      setIsSticky(scrollY > 280)
    }

    // 初始檢查
    handleScroll()

    // 添加事件監聽器
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // 動態日期顯示
  const todayDisplay = useMemo(() => {
    const date = new Date()
    const month = date.getMonth() + 1
    const day = date.getDate()
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    const weekday = weekdays[date.getDay()]
    return `今日 ${month}月${day}日 (${weekday})`
  }, [])

  // 計算今日已記錄的營養進度（只計算已記錄的餐次）
  const consumedNutrition = useMemo(() => {
    return todayMeals
      .filter(meal => meal.consumed)
      .reduce((acc, meal) => {
        // 如果是特殊活動餐次，使用 estimatedCalories，否則使用 calories
        const mealCalories = meal.isSpecialEvent && meal.specialEvent?.estimatedCalories 
          ? meal.specialEvent.estimatedCalories 
          : meal.calories
        
        acc.calories += mealCalories
        acc.protein += meal.protein
        acc.carbs += meal.carbs
        acc.fat += meal.fat
        acc.fiber += meal.fiber
        return acc
      }, {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0
      })
  }, [todayMeals])

  // 儲存用戶數據到 localStorage（供 AI 教練使用）
  useEffect(() => {
    const userData = {
      currentCalories: consumedNutrition.calories,
      targetCalories: nutritionTargets.calorieTarget,
      remainingCalories: nutritionTargets.calorieTarget - consumedNutrition.calories,
      currentNutrition: {
        protein: consumedNutrition.protein,
        carbs: consumedNutrition.carbs,
        fat: consumedNutrition.fat,
        fiber: consumedNutrition.fiber
      },
      targetNutrition: {
        protein: nutritionTargets.proteinTarget,
        carbs: nutritionTargets.carbsTarget,
        fat: nutritionTargets.fatTarget,
        fiber: nutritionTargets.fiberTarget
      }
    }
    localStorage.setItem('userData', JSON.stringify(userData))
  }, [consumedNutrition, nutritionTargets])

  // 計算卡路里百分比
  const caloriePercentage = useMemo(() => {
    return Math.min((consumedNutrition.calories / nutritionTargets.calorieTarget) * 100, 100)
  }, [consumedNutrition.calories, nutritionTargets.calorieTarget])

  // 處理「記錄這餐」按鈕點擊
  const handleMealConsumed = async (mealId: string) => {
    // 找到餐次
    const meal = allMeals.find(m => m.id === mealId)
    if (!meal) return
    
    const mealTypeName = {
      breakfast: '早餐',
      lunch: '午餐',
      dinner: '晚餐',
      snack: '小食'
    }[meal.type]
    
    // Toggle 狀態（記錄 ↔ 取消）
    const newConsumedState = !meal.consumed
    const consumedAtDate = newConsumedState ? new Date() : undefined
    const consumedAtIso = consumedAtDate ? consumedAtDate.toISOString() : null

    console.log('Updating meal consumed:', mealId, newConsumedState)

    // 樂觀更新 UI
    setAllMeals(prev => prev.map(m =>
      m.id === mealId
        ? {
            ...m,
            consumed: newConsumedState,
            consumedAt: consumedAtDate
          }
        : m
    ))

    // 儲存到 Supabase
    const result = await updateMealConsumed(mealId, newConsumedState, consumedAtIso)
    if (!result.success) {
      console.error('Failed to update meal consumed')
      // 失敗則回滾
      setAllMeals(prev => prev.map(m =>
        m.id === mealId
          ? {
              ...m,
              consumed: meal.consumed,
              consumedAt: meal.consumedAt
            }
          : m
      ))
      toast.error('記錄失敗，請重試')
      return
    }
    
    // 根據狀態顯示不同反饋
    if (newConsumedState) {
      // 記錄成功
      setCatExpression('happy')
      setToastMessage(`${mealTypeName}記錄成功！+${meal.calories} 卡`)
    } else {
      // 取消記錄
      setCatExpression('curious')
      setToastMessage(`已取消${mealTypeName}記錄 -${meal.calories} 卡`)
    }
    
    setTimeout(() => setCatExpression('neutral'), 3000)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
    
    // 注意：進度環和進度條會自動更新（因為 consumedNutrition 是 useMemo）
  }

  // 處理編輯點擊（使用新版選單）
  const handleEdit = (mealId: string) => {
    const meal = allMeals.find(m => m.id === mealId)
    if (meal) {
      setSelectedMealForEdit(meal)
      setShowEditModal(true)
    }
  }


  // === 食物管理 (Task 6.5) ===
  const handleManageFoods = (meal: any) => {
    setManagingFoods({
      meal,
      mode: 'list'
    })
  }

  const handleDeleteFoodItem = async (foodId: string) => {
    if (!managingFoods) return
    const confirmed = window.confirm('確定要刪除這項食物嗎？')
    if (!confirmed) return

    try {
      // 刪除食物
      const { error } = await supabase
        .from('foods')
        .delete()
        .eq('id', foodId)
      
      if (error) throw error
      
      // 刷新數據
      await refreshMealData(managingFoods.meal.id)
      
      setToastMessage('食物已刪除')
      setShowToast(true)
      setTimeout(() => setShowToast(false), 2000)
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('刪除失敗，請重試')
    }
  }

  const handleAddFoodItem = async (newFood: any) => {
    if (!managingFoods) return
    
    try {
      // 獲取當前餐單的最大 order 值
      const { data: existingFoods } = await supabase
        .from('foods')
        .select('order')
        .eq('meal_id', managingFoods.meal.id)
        .order('order', { ascending: false })
        .limit(1)
      
      const maxOrder = existingFoods && existingFoods.length > 0 
        ? (existingFoods[0].order ?? -1) 
        : -1
      
      // 插入新食物
      const foodToInsert = {
        meal_id: managingFoods.meal.id,
        name: newFood.name + (newFood.portion ? ` ${newFood.portion}` : ''),
        calories: Number(newFood.calories) || 0,
        protein: Number(newFood.protein) || 0,
        carbs: Number(newFood.carbs) || 0,
        fat: Number(newFood.fat) || 0,
        fiber: Number(newFood.fiber) || 0,
        order: maxOrder + 1
      }
      
      const { error } = await supabase
        .from('foods')
        .insert(foodToInsert)
      
      if (error) throw error
      
      // 刷新數據
      await refreshMealData(managingFoods.meal.id)
      
      // 返回列表視圖
      setManagingFoods(prev => prev ? { ...prev, mode: 'list' } : null)
      
      setToastMessage('食物已添加！')
      setShowToast(true)
      setTimeout(() => setShowToast(false), 2000)
    } catch (error) {
      console.error('Add food error:', error)
      toast.error('添加失敗，請重試')
    }
  }

  // 輔助函數：刷新餐單數據
  const refreshMealData = async (mealId: string) => {
    // 重新計算 Meal 營養
    // 這裡需要重新 fetch 這個 meal 的 foods 來計算
    // 但為了簡單和一致性，我們觸發全量 fetch 或者單個 fetch
    // 由於我們現有的架構依賴 allMeals，我們重新 fetch 幾天
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + 2)
    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]
    
    // 1. 先獲取最新的 foods 列表來計算營養
    const { data: foods } = await supabase
      .from('foods')
      .select('*')
      .eq('meal_id', mealId)
    
    if (foods) {
      const totalCalories = foods.reduce((sum, f) => sum + f.calories, 0)
      const totalProtein = foods.reduce((sum, f) => sum + f.protein, 0)
      const totalCarbs = foods.reduce((sum, f) => sum + f.carbs, 0)
      const totalFat = foods.reduce((sum, f) => sum + f.fat, 0)
      const totalFiber = foods.reduce((sum, f) => sum + f.fiber, 0)
      
      // 2. 更新 Meal
      await supabase.from('meals').update({
        calories: totalCalories,
        protein: totalProtein,
        carbs: totalCarbs,
        fat: totalFat,
        fiber: totalFiber
      }).eq('id', mealId)
    }

    // 3. 刷新 UI
    const updatedMeals = await fetchMeals(user?.id || '', startDateStr, endDateStr)
    const uiMeals = updatedMeals.map(x => dbMealToUiMeal(x, hasDbAiSuggestionsColumn ?? true))
    
    // 更新 managingFoods 中的 meal 引用，以顯示最新數據
    const updatedMeal = uiMeals.find(m => m.id === mealId)
    if (updatedMeal) {
      setManagingFoods(prev => prev ? { ...prev, meal: updatedMeal } : null)
    }

    if (hasDbAiSuggestionsColumn) {
      setAllMeals(uiMeals)
    } else {
      setAllMeals(
        uiMeals.map((m) => {
          if (!m.isSpecialEvent) return m
          const stored = getLocalSpecialEventSuggestions(m.id)
          if (!stored || !m.specialEvent) return m
          return { ...m, specialEvent: { ...m.specialEvent, aiSuggestions: stored } }
        })
      )
    }
  }


  const handleRecordActual = (mealId: string) => {
    const meal = allMeals.find(m => m.id === mealId)
    if (meal) {
      handleManualRecord(meal)
    }
  }

  const handleSpecialEvent = (mealId: string) => {
    const meal = allMeals.find(m => m.id === mealId)
    if (meal) {
      setSelectedMealForEvent(meal)
      setShowSpecialEventModal(true)
    }
  }

  // 取消特殊活動
  const handleCancelSpecialEvent = async (mealId: string) => {
    const meal = allMeals.find(m => m.id === mealId)
    if (!meal || !meal.isSpecialEvent) return

    console.log('Canceling special event for meal:', mealId)

    const prevMealsSnapshot = allMeals

    // 找到當天所有餐次（包括被調整過的）
    const todayDate = meal.date
    const todayMeals = allMeals.filter(m => m.date === todayDate)

    // 準備更新：恢復特殊活動餐次和所有被調整過的餐次
    const mealsToUpdate: Array<{ id: string; updates: Record<string, any> }> = []

    // 1. 恢復特殊活動餐次
    mealsToUpdate.push({
      id: mealId,
      updates: {
        is_special_event: false,
        special_event_type: null,
        special_event_description: null,
        special_event_calories: null,
        ...(hasDbAiSuggestionsColumn ? { special_event_ai_suggestions: null } : {}),
      },
    })

    // 2. 恢復所有被調整過的餐次（如果有 adjustedFrom，恢復原本的營養值）
    for (const m of todayMeals) {
      if (m.isAdjusted && m.adjustedFrom !== undefined) {
        mealsToUpdate.push({
          id: m.id,
          updates: {
            calories: m.adjustedFrom,
            // 根據原本的比例恢復營養素
            protein: Math.round((m.protein / m.calories) * m.adjustedFrom),
            carbs: Math.round((m.carbs / m.calories) * m.adjustedFrom),
            fat: Math.round((m.fat / m.calories) * m.adjustedFrom),
            fiber: Math.round((m.fiber / m.calories) * m.adjustedFrom),
            is_adjusted: false,
            adjusted_from: null,
          },
        })
      }
    }

    // 樂觀更新 UI
    setAllMeals(prev =>
      prev.map(m => {
        if (m.id === mealId) {
          // 恢復特殊活動餐次
          const { isSpecialEvent, specialEvent, ...rest } = m
          return rest
        }
        if (m.isAdjusted && m.adjustedFrom !== undefined && m.date === todayDate) {
          // 恢復被調整過的餐次
          return {
            ...m,
            calories: m.adjustedFrom,
            protein: Math.round((m.protein / m.calories) * m.adjustedFrom),
            carbs: Math.round((m.carbs / m.calories) * m.adjustedFrom),
            fat: Math.round((m.fat / m.calories) * m.adjustedFrom),
            fiber: Math.round((m.fiber / m.calories) * m.adjustedFrom),
            isAdjusted: false,
            adjustedFrom: undefined,
          }
        }
        return m
      })
    )

    // 清除 localStorage 的 AI suggestions（如果有的話）
    if (hasDbAiSuggestionsColumn === false) {
      try {
        localStorage.removeItem(`specialEventSuggestions:${mealId}`)
      } catch {
        // ignore
      }
    }

    // 儲存到 Supabase
    const result = await updateMeals(mealsToUpdate)

    if (!result.success) {
      console.error('Failed to cancel special event')
      setAllMeals(prevMealsSnapshot)
      toast.error('取消特殊活動失敗，請重試')
      return
    }

    console.log('Special event canceled successfully')

    // 重新載入餐單以確保 UI 與 DB 一致
    try {
      if (user) {
        const today = new Date()
        const endDate = new Date()
        endDate.setDate(today.getDate() + 2)
        const startDateStr = today.toISOString().split('T')[0]
        const endDateStr = endDate.toISOString().split('T')[0]
        const refreshed = await fetchMeals(user.id, startDateStr, endDateStr)
        const uiMeals = refreshed.map(x => dbMealToUiMeal(x, hasDbAiSuggestionsColumn ?? true))
        if (hasDbAiSuggestionsColumn) {
          setAllMeals(uiMeals)
        } else {
          setAllMeals(
            uiMeals.map(m => {
              if (!m.isSpecialEvent) return m
              const stored = getLocalSpecialEventSuggestions(m.id)
              if (!stored || !m.specialEvent) return m
              return { ...m, specialEvent: { ...m.specialEvent, aiSuggestions: stored } }
            })
          )
        }
      }
    } catch (error) {
      console.error('Error refreshing meals after cancel:', error)
    }

    // 顯示成功提示
    setToastMessage('已取消特殊活動，餐單已恢復原狀')
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)

    setCatExpression('curious')
    setTimeout(() => setCatExpression('neutral'), 3000)
  }
  // 處理確認（暫時只 log，Task 2.2-2.4 會實現完整邏輯）
  const handleSpecialEventConfirm = (eventData: SpecialEventData) => {
    if (!selectedMealForEvent) return
    
    console.log('特殊活動數據:', eventData)
    
    // 1. 關閉特殊活動輸入 Modal
    setShowSpecialEventModal(false)
    
    // 2. 獲取當天所有餐次
    const todayDate = selectedMealForEvent.date
    const todayMealsForAdjustment = allMeals.filter(m => m.date === todayDate)
    
    // 3. 調用調整邏輯
    const result = adjustMealPlan({
      allMeals: todayMealsForAdjustment,
      eventMeal: selectedMealForEvent,
      eventData,
      userTarget: nutritionTargets
    })
    
    console.log('調整結果:', result)
    // 4. 儲存結果和事件數據
    setAdjustmentResult(result)
    setCurrentEventData(eventData)
    
    // 5. 顯示預覽 Modal（取代之前的 Toast）
    setShowAdjustmentPreview(true)
  }
  
  // 處理確認調整（完整實現）
  const handleAdjustmentConfirm = async (selectedOption: AdjustmentOption) => {
    if (!selectedMealForEvent || !adjustmentResult || !currentEventData) return

    console.log('Confirming adjustment')

    const prevMealsSnapshot = allMeals

    // Persist AI suggestions: DB first; localStorage only if DB column doesn't exist
    if (hasDbAiSuggestionsColumn === false) {
      setLocalSpecialEventSuggestions(selectedMealForEvent.id, adjustmentResult.aiSuggestions)
    }

    // 準備更新（meals）
    const mealsToUpdate: Array<{ id: string; updates: Record<string, any> }> = selectedOption.adjustedMeals.map((m) => ({
      id: m.id,
      updates: {
        calories: m.calories,
        protein: m.protein,
        carbs: m.carbs,
        fat: m.fat,
        fiber: m.fiber,
        is_adjusted: m.isAdjusted || false,
        adjusted_from: m.adjustedFrom || null,
      },
    }))

    mealsToUpdate.push({
      id: selectedMealForEvent.id,
      updates: {
        is_special_event: true,
        special_event_type: currentEventData.type,
        special_event_description: currentEventData.description || null,
        special_event_calories: adjustmentResult.analysis.eventCalories,
        ...(hasDbAiSuggestionsColumn ? { special_event_ai_suggestions: adjustmentResult.aiSuggestions } : {}),
      },
    })

    // 準備更新（foods）
    const foodsToUpdate: Array<{ id: string; updates: Record<string, any> }> = []
    for (const m of selectedOption.adjustedMeals) {
      for (const f of m.foods) {
        if (!f.id) continue
        const updates: Record<string, any> = { calories: f.calories }
        if (typeof f.protein === 'number') updates.protein = f.protein
        if (typeof f.carbs === 'number') updates.carbs = f.carbs
        if (typeof f.fat === 'number') updates.fat = f.fat
        if (typeof f.fiber === 'number') updates.fiber = f.fiber
        if (typeof f.order === 'number') updates.order = f.order
        foodsToUpdate.push({ id: f.id, updates })
      }
    }

    // 1) 樂觀更新 UI
    setAllMeals(prev => prev.map(meal => {
      const adjustedMeal = selectedOption.adjustedMeals.find(m => m.id === meal.id)
      if (adjustedMeal) return adjustedMeal

      if (meal.id === selectedMealForEvent.id) {
        return {
          ...meal,
          isSpecialEvent: true,
          specialEvent: {
            type: currentEventData.type,
            description: currentEventData.description,
            estimatedCalories: adjustmentResult.analysis.eventCalories,
            aiSuggestions: adjustmentResult.aiSuggestions
          }
        }
      }

      return meal
    }))

    // 2) 儲存到 Supabase
    const mealsResult = await updateMeals(mealsToUpdate)
    const foodsResult = foodsToUpdate.length > 0 ? await updateFoods(foodsToUpdate) : { success: true }

    if (!mealsResult.success || !foodsResult.success) {
      console.error('Failed to save adjustment', { mealsResult, foodsResult })
      setAllMeals(prevMealsSnapshot)
      toast.error('調整儲存失敗，請重試')
      return
    }

    console.log('Adjustment saved successfully')

    // Re-fetch meals so UI always matches DB (avoids "badges updated but calories didn't" confusion)
    try {
      if (user) {
        const today = new Date()
        const endDate = new Date()
        endDate.setDate(today.getDate() + 2)
        const startDateStr = today.toISOString().split('T')[0]
        const endDateStr = endDate.toISOString().split('T')[0]
        const refreshed = await fetchMeals(user.id, startDateStr, endDateStr)
        const uiMeals = refreshed.map((x) => dbMealToUiMeal(x, hasDbAiSuggestionsColumn ?? true))
        if (hasDbAiSuggestionsColumn) {
          setAllMeals(uiMeals)
        } else {
          setAllMeals(
            uiMeals.map((m) => {
              if (!m.isSpecialEvent) return m
              const stored = getLocalSpecialEventSuggestions(m.id)
              if (!stored || !m.specialEvent) return m
              return { ...m, specialEvent: { ...m.specialEvent, aiSuggestions: stored } }
            })
          )
        }
      }
    } catch (e) {
      console.error('Failed to refresh meals after adjustment:', e)
    }

    // 3) 關閉 Modal
    setShowAdjustmentPreview(false)
    setSelectedMealForEvent(null)
    setAdjustmentResult(null)
    setCurrentEventData(null)

    // 4) 顯示成功提示
    setToastMessage('餐單已調整完成！🎉')
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)

    // 5) 更新貓表情
    setCatExpression('satisfied')
    setTimeout(() => setCatExpression('neutral'), 4000)
  }
  const getProgressEmoji = () => {
    if (consumedNutrition.calories === 0) return '🍽️'
    if (consumedNutrition.calories < nutritionTargets.calorieTarget * 0.5) return '😊'
    if (consumedNutrition.calories < nutritionTargets.calorieTarget) return '💪'
    if (consumedNutrition.calories <= nutritionTargets.calorieTarget * 1.1) return '🎉'
    return '😅'
  }

  // 切換日期展開/收起
  const toggleDate = (date: string) => {
    setExpandedDates(prev => 
      prev.includes(date) 
        ? prev.filter(d => d !== date)
        : [...prev, date]
    )
  }

  // 展開/收起所有未來日期
  const toggleAllFutureDates = () => {
    const futureDates = Object.entries(mealsByDate)
      .filter(([date]) => date > getToday())
      .map(([date]) => date)
    
    const allExpanded = futureDates.every(date => expandedDates.includes(date))
    
    if (allExpanded) {
      // 收起所有
      setExpandedDates(prev => prev.filter(date => !futureDates.includes(date)))
    } else {
      // 展開所有
      setExpandedDates(prev => {
        const combined = [...prev, ...futureDates]
        return Array.from(new Set(combined))
      })
    }
  }

  return (
    <AuthGuard>
      {authLoading || loadingProfile || loadingMeals ? (
        <div className="min-h-screen bg-gray-50 pb-24">
          <div className="max-w-2xl mx-auto p-6">
            {authLoading || loadingProfile ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="text-6xl mb-4 animate-bounce">😺</div>
                <p className="text-gray-600">載入用戶資料...</p>
              </div>
            ) : (
              <div className="space-y-6">
                <MealCardSkeleton />
                <MealCardSkeleton />
                <MealCardSkeleton />
                <p className="text-center text-sm text-gray-500">載入餐單中...</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="min-h-screen pb-24"
          style={{
            background: 'linear-gradient(180deg, #C5E1A5 0%, #E8F5E9 15%, #FFFFFF 35%, #F5F5F5 100%)'
          }}
        >
        {/* Header - 極簡，無頂部條帶 */}
        <div className="px-6 py-6">
          <div className="max-w-2xl mx-auto">
            <header className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    👋 Hello {displayName}
                  </h1>
                  <p className="text-sm mt-1 text-gray-600">
                    {new Date().toLocaleDateString('zh-HK', {
                      month: 'long',
                      day: 'numeric',
                      weekday: 'short'
                    })}
                  </p>
                </div>
                <Cat expression={catExpression} />
              </div>

              <div className="flex items-center gap-3">
                {streak >= 1 && (
                  <button
                    type="button"
                    onClick={() => router.push('/progress')}
                    className="px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700"
                  >
                    🔥 連續{streak}天
                  </button>
                )}
              </div>
            </header>
          </div>
        </div>

      {/* Sticky Bar (滾動 >280px 時出現) */}
      {isSticky && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-b border-gray-200 shadow-sm">
          <div className="max-w-2xl mx-auto px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cat expression={catExpression} size="small" />
                <span className="text-sm font-semibold text-gray-900">{displayName}</span>
              </div>
              
              <div className="flex-1 mx-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div 
                      className="h-full bg-primary-500 transition-all duration-500 rounded-full"
                      style={{ width: `${Math.min((consumedNutrition.calories / nutritionTargets.calorieTarget) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
              
              <div className="text-xs font-mono font-semibold text-gray-700 whitespace-nowrap">
                {consumedNutrition.calories} / {nutritionTargets.calorieTarget} 卡
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 主內容區 */}
      <div className={`max-w-2xl mx-auto px-4 ${isSticky ? 'pt-16' : ''}`}>
        {/* 今日進度大卡片 */}
        <div className="bg-white rounded-3xl shadow-lg p-6 mb-6">
          {/* 圓環進度圖 */}
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="relative w-40 h-40 flex items-center justify-center">
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                {/* 背景圓環 */}
                <circle cx="80" cy="80" r="70" fill="none" stroke="#F0F0F0" strokeWidth="12" />
                {/* 進度圓環 */}
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  fill="none"
                  stroke="#8BC34A"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 70}`}
                  strokeDashoffset={`${2 * Math.PI * 70 * (1 - consumedNutrition.calories / nutritionTargets.calorieTarget)}`}
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              {/* 中心 Emoji（根據進度變化）*/}
              <motion.div 
                key={consumedNutrition.calories}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', duration: 0.5 }}
                className="text-6xl"
              >
                {getProgressEmoji()}
              </motion.div>
            </div>
          </div>

          {/* 營養進度條（4 項）*/}
          <div className="space-y-3">
            {[
              { emoji: '🥩', name: '蛋白質', current: consumedNutrition.protein, target: nutritionTargets.proteinTarget },
              { emoji: '🍚', name: '碳水', current: consumedNutrition.carbs, target: nutritionTargets.carbsTarget },
              { emoji: '🧈', name: '脂肪', current: consumedNutrition.fat, target: nutritionTargets.fatTarget },
              { emoji: '🥬', name: '纖維', current: consumedNutrition.fiber, target: nutritionTargets.fiberTarget }
            ].map((nutrient, index) => {
              // 目標值始終使用 profile 的目標值（不因特殊活動而改變）
              const target = nutrient.target
              
              // 如果 target 為 0，避免除以 0
              const percentage = target > 0 ? (nutrient.current / target) * 100 : 0
              
              // 只有當超過目標 3% 以上時，才顯示警告顏色
              // 例如：目標 118g，如果 consumed <= 121.54g (103%)，不顯示警告
              const isOverTarget = percentage > 103
              
              return (
                <motion.div 
                  key={nutrient.name} 
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="flex items-center gap-2 w-24">
                    <span className="text-lg">{nutrient.emoji}</span>
                    <span className="text-sm font-medium text-gray-700">{nutrient.name}</span>
                  </div>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <motion.div 
                      className={`h-full rounded-full transition-colors ${
                        isOverTarget ? 'bg-amber-500' : 'bg-primary-500'
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(percentage, 100)}%` }}
                      transition={{ duration: 0.5, delay: 0.2 + index * 0.1, ease: 'easeOut' }}
                    />
                  </div>
                  <span className={`text-xs font-mono font-semibold w-28 text-right ${
                    isOverTarget ? 'text-amber-700' : 'text-gray-700'
                  }`}>
                    {Math.round(nutrient.current)}/{Math.round(target)}g ({Math.round(percentage)}%)
                  </span>
                </motion.div>
              )
            })}
          </div>

          {/* 卡路里比例 */}
          <div className="mt-6 text-center">
            <p className="text-lg font-semibold text-gray-900">
              {consumedNutrition.calories} / {nutritionTargets.calorieTarget} 卡
            </p>
          </div>
        </div>
        {/* 餐單卡片區域 - 極簡旅遊標識：僅日期標題標註目的地 + 旅遊日按鈕淺藍 */}
        {/* 今日餐單 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                <span>
                  {new Date(getToday()).toLocaleDateString('zh-HK', { month: 'long', day: 'numeric' })}
                  （今日）
                </span>
                {isDateInTravel(getToday()) && (
                  <>
                    <span className="text-sm">✈️</span>
                    <span className="text-sm font-medium text-blue-600">
                      {getTravelDestination()}
                    </span>
                  </>
                )}
              </h2>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-gray-900">
                {todayMeals.reduce((sum, m) => sum + m.calories, 0)}/{profile?.calorie_target ?? 0} 卡
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {todayMeals.map((meal, index) => (
              <motion.div
                key={meal.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
              >
                <MealCard
                  meal={meal}
                  onMarkConsumed={handleMealConsumed}
                  onEdit={handleEdit}
                  onSpecialEvent={handleSpecialEvent}
                  onCancelSpecialEvent={handleCancelSpecialEvent}
                  isTravelMeal={(() => {
                    // 檢查是否為旅行餐單
                    if (!travelMode || !travelPlan) return false
                    const mealDate = new Date(meal.date)
                    const startDate = new Date(travelPlan.start_date)
                    const endDate = new Date(travelPlan.end_date)
                    startDate.setHours(0, 0, 0, 0)
                    endDate.setHours(23, 59, 59, 999)
                    mealDate.setHours(0, 0, 0, 0)
                    return mealDate >= startDate && mealDate <= endDate
                  })()}
                  onAddFood={handleManageFoods}
                />
              </motion.div>
            ))}
          </div>
        </div>

        {/* 未來餐單 - 日期卡片展開式 */}
        <div className="mb-6">
          {/* 展開/收起所有按鈕 */}
          {Object.entries(mealsByDate).filter(([date]) => date > getToday()).length > 0 && (
            <div className="flex justify-center mb-3">
              <button
                onClick={toggleAllFutureDates}
                type="button"
                className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              >
                <svg 
                  className={`w-3.5 h-3.5 transition-transform ${
                    Object.entries(mealsByDate)
                      .filter(([date]) => date > getToday())
                      .every(([date]) => expandedDates.includes(date))
                      ? 'rotate-180' : ''
                  }`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span>
                  {Object.entries(mealsByDate)
                    .filter(([date]) => date > getToday())
                    .every(([date]) => expandedDates.includes(date))
                    ? '收起所有餐單' : '展開所有餐單'}
                </span>
              </button>
            </div>
          )}
          <div className="space-y-2 mt-3">
            {Object.entries(mealsByDate)
              .filter(([date]) => date > getToday())  // 只顯示未來日期
              .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
              .map(([date, meals]) => {
                const dateObj = new Date(date)
                const month = dateObj.getMonth() + 1
                const day = dateObj.getDate()
                const weekdays = ['日', '一', '二', '三', '四', '五', '六']
                const weekday = weekdays[dateObj.getDay()]
                const isExpanded = expandedDates.includes(date)
                
                // 計算當天總卡路里
                const totalCalories = meals.reduce((sum, m) => sum + m.calories, 0)
                
                // 定義餐次順序
                const mealOrder: Record<string, number> = {
                  breakfast: 1,
                  lunch: 2,
                  dinner: 3,
                  snack: 4
                }

                // 對餐單進行排序
                const sortedMeals = [...meals].sort((a, b) => {
                  return (mealOrder[a.type] || 99) - (mealOrder[b.type] || 99)
                })

                const isTravelDate = isDateInTravel(date)
                
                return (
                  <div key={date} className="rounded-xl overflow-hidden border bg-white border-gray-200">
                    {/* 日期卡片 Header（可點擊展開）- 極簡：僅標註目的地 */}
                    <button
                      onClick={() => toggleDate(date)}
                      type="button"
                      className="w-full px-4 py-3 transition-colors flex items-center justify-between bg-gray-50 hover:bg-gray-100"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-left">
                          <div className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                            <span>{month}月{day}日 ({weekday})</span>
                            {isTravelDate && (
                              <>
                                <span className="text-sm">✈️</span>
                                <span className="text-sm font-medium text-blue-600">
                                  {getTravelDestination()}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            共 {meals.length} 餐 · {totalCalories} 卡
                          </div>
                        </div>
                      </div>
                      <svg 
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {/* 展開的餐單列表 */}
                    {isExpanded && (
                      <div className="px-4 pb-4 bg-gray-50 space-y-3">
                        {sortedMeals.map((meal, index) => (
                          <motion.div
                            key={meal.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                          >
                            <MealCard 
                              meal={meal} 
                              onMarkConsumed={handleMealConsumed}
                              onEdit={handleEdit}
                              showActions={false}
                              isTravelMeal={(() => {
                                // 檢查是否為旅行餐單
                                if (!travelMode || !travelPlan) return false
                                const mealDate = new Date(meal.date)
                                const startDate = new Date(travelPlan.start_date)
                                const endDate = new Date(travelPlan.end_date)
                                startDate.setHours(0, 0, 0, 0)
                                endDate.setHours(23, 59, 59, 999)
                                mealDate.setHours(0, 0, 0, 0)
                                return mealDate >= startDate && mealDate <= endDate
                              })()}
                            />
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      </div>


      {/* Success Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40"
          >
            <div className={`
              px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3
              ${toastMessage.includes('取消') 
                ? 'bg-gray-600 text-white'  // 取消：灰色
                : 'bg-primary-600 text-white'  // 成功：綠色
              }
            `}>
              <span className="text-xl">
                {toastMessage.includes('取消') ? '↩️' : '✓'}
              </span>
              <span className="font-medium">{toastMessage}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI 教練浮動按鈕 */}
      <div className="fixed bottom-24 right-6 z-40">
        <motion.button
          onClick={() => {
            setShowCoachTooltip(false)
            try {
              localStorage.setItem('hasSeenCoachTooltip', 'true')
            } catch {
              // ignore
            }
            router.push('/coach')
          }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:shadow-primary-500/50 transition-shadow"
        >
          <span className="text-2xl">💬</span>
        </motion.button>

        {/* 首次使用提示 */}
        <AnimatePresence>
          {showCoachTooltip && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute bottom-16 right-0 bg-white rounded-2xl shadow-2xl p-4 w-64 border-2 border-primary-200"
            >
              <button
                type="button"
                onClick={() => {
                  setShowCoachTooltip(false)
                  try {
                    localStorage.setItem('hasSeenCoachTooltip', 'true')
                  } catch {
                    // ignore
                  }
                }}
                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                ✕
              </button>
              <div className="flex items-start gap-3">
                <span className="text-3xl flex-shrink-0">💬</span>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">AI 飲食教練</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    有飲食問題？問我啦！我會根據你今日嘅進度給建議 😊
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>


      {/* === 智能餐單推薦彈窗 (Task 6.6) === */}
      
      {/* 選擇模式彈窗 */}
      {replacingMeal && replacementMode === 'select' && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center sm:justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setReplacingMeal(null)
              setReplacementMode(null)
            }
          }}
        >
          <motion.div
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg p-6 pb-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                🔄 更換{(() => {
                  const names: Record<string, string> = {
                    breakfast: '早餐',
                    lunch: '午餐',
                    dinner: '晚餐',
                    snack: '小食'
                  }
                  return names[replacingMeal.type] || '餐次'
                })()}
              </h3>
              <button
                onClick={() => {
                  setReplacingMeal(null)
                  setReplacementMode(null)
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-3">
              {/* 快速生成 */}
              <button
                onClick={() => setReplacementMode('quick')}
                className="w-full flex items-start gap-3 p-4 bg-purple-50 border-2 border-purple-200 rounded-xl hover:bg-purple-100 active:scale-[0.98] transition-all"
              >
                <span className="text-3xl flex-shrink-0">🎲</span>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-semibold text-gray-900">快速生成</div>
                  <div className="text-sm text-gray-600 mt-1">
                    根據營養目標快速生成
                  </div>
                </div>
                <span className="text-gray-400 text-xl flex-shrink-0">›</span>
              </button>
              
              {/* 智能推薦 */}
              <button
                onClick={() => setReplacementMode('smart')}
                className="w-full flex items-start gap-3 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl hover:bg-blue-100 active:scale-[0.98] transition-all"
              >
                <span className="text-3xl flex-shrink-0">💭</span>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-semibold text-gray-900">唔知食咩好</div>
                  <div className="text-sm text-gray-600 mt-1">
                    告訴我你的想法，AI 推薦
                  </div>
                </div>
                <span className="text-gray-400 text-xl flex-shrink-0">›</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 快速生成加載 */}
      {replacementMode === 'quick' && quickGenerating && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full text-center"
          >
            <div className="text-6xl mb-4">🎲</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              正在根據你的營養目標生成新餐單
            </h3>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-600 to-blue-600"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 5, ease: 'linear' }}
              />
            </div>
          </motion.div>
        </div>
      )}

      {/* 智能推薦選擇 */}
      {replacementMode === 'smart' && !smartGenerating && smartOptions.length === 0 && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center sm:justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setReplacementMode('select')
              setSmartParams({
                taste: '',
                location: '',
                style: '',
                cuisines: [],
                foodType: '',
                customInput: ''
              })
            }
          }}
        >
          <motion.div
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6 pb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                💭 唔知{(() => {
                  const names: Record<string, string> = {
                    breakfast: '早餐',
                    lunch: '午餐',
                    dinner: '晚餐',
                    snack: '小食'
                  }
                  return names[replacingMeal?.type || ''] || '餐次'
                })()}食咩好
              </h3>
              <button
                onClick={() => {
                  setReplacementMode('select')
                  setSmartParams({
                    taste: '',
                    location: '',
                    style: '',
                    cuisines: [],
                    foodType: '',
                    customInput: ''
                  })
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              {/* 口味 */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  你今日想清淡定重口味？
                </label>
                <div className="flex gap-2">
                  {[
                    { value: 'light', label: '清淡' },
                    { value: 'heavy', label: '重口味' },
                    { value: 'random', label: '隨便' }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setSmartParams({ ...smartParams, taste: option.value })}
                      className={`flex-1 py-2.5 px-4 rounded-lg border-2 font-medium transition-all ${
                        smartParams.taste === option.value
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 地點 */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  外食定自己煮？
                </label>
                <div className="flex gap-2">
                  {[
                    { value: 'eating_out', label: '外食' },
                    { value: 'home_cook', label: '自己煮' }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setSmartParams({ ...smartParams, location: option.value })}
                      className={`flex-1 py-2.5 px-4 rounded-lg border-2 font-medium transition-all ${
                        smartParams.location === option.value
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 風格：今日想食 — 2×2+1 網格 */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  今日想食...
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'comfort', emoji: '🥰', label: 'Comfort food' },
                    { value: 'healthy', emoji: '🌿', label: '健康清爽' },
                    { value: 'explore', emoji: '🎉', label: '嘗試新鮮' },
                    { value: 'filling', emoji: '💪', label: '飽足有力' },
                    { value: 'random', emoji: '🎲', label: '完全隨機' }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setSmartParams({ ...smartParams, style: option.value })}
                      className={`p-2.5 rounded-xl border-2 transition-all text-left ${
                        smartParams.style === option.value
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{option.emoji}</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {option.label}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 可選：手風琴 */}
              <details className="group border-t border-gray-200 pt-4 [&>summary::-webkit-details-marker]:hidden">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 font-medium list-none flex items-center gap-1 select-none">
                  <span className="group-open:rotate-90 transition-transform inline-block w-4">›</span>
                  想更具體？(可選)
                </summary>
                <div className="mt-3 space-y-3">
                  {/* 菜系 */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      菜系：
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: 'hk', emoji: '🇭🇰', label: '港式' },
                        { value: 'japanese', emoji: '🇯🇵', label: '日本' },
                        { value: 'korean', emoji: '🇰🇷', label: '韓國' },
                        { value: 'thai', emoji: '🇹🇭', label: '泰國' },
                        { value: 'western', emoji: '🇮🇹', label: '西餐' },
                        { value: 'other', emoji: '🌍', label: '其他' }
                      ].map(option => (
                        <button
                          key={option.value}
                          onClick={() => {
                            const cuisines = smartParams.cuisines.includes(option.value)
                              ? smartParams.cuisines.filter(c => c !== option.value)
                              : [...smartParams.cuisines, option.value]
                            setSmartParams({ ...smartParams, cuisines })
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            smartParams.cuisines.includes(option.value)
                              ? 'border-2 border-green-500 bg-green-100 text-green-800'
                              : 'border border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {option.emoji} {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* 主食類型 */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      主食類型：
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: 'rice', emoji: '🍚', label: '飯' },
                        { value: 'noodles', emoji: '🍜', label: '麵' },
                        { value: 'soup', emoji: '🍲', label: '湯' },
                        { value: 'light', emoji: '🥗', label: '輕食' }
                      ].map(option => (
                        <button
                          key={option.value}
                          onClick={() => setSmartParams({ 
                            ...smartParams, 
                            foodType: smartParams.foodType === option.value ? '' : option.value 
                          })}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            smartParams.foodType === option.value
                              ? 'border-2 border-orange-500 bg-orange-100 text-orange-800'
                              : 'border border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {option.emoji} {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* 自由輸入 */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      或者直接告訴我：
                    </label>
                    <textarea
                      value={smartParams.customInput}
                      onChange={(e) => setSmartParams({ ...smartParams, customInput: e.target.value })}
                      placeholder="天氣好冷，我想吃..."
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary-400 resize-none text-sm"
                    />
                  </div>
                </div>
              </details>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setReplacementMode('select')
                  setSmartParams({
                    taste: '',
                    location: '',
                    style: '',
                    cuisines: [],
                    foodType: '',
                    customInput: ''
                  })
                }}
                className="flex-1 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50"
              >
                返回
              </button>
              <button
                onClick={() => handleSmartRecommend()}
                disabled={!smartParams.taste || !smartParams.location || !smartParams.style}
                className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✨ 開始推薦
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 智能推薦加載 */}
      {smartGenerating && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full text-center flex flex-col"
          >
            <motion.div
              className="text-6xl mb-6"
              animate={{
                y: [0, -10, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              💭
            </motion.div>
            <h3 className="text-xl font-bold text-gray-900 mb-8">
              {smartRecommendHint || 'AI 正在推薦...'}
            </h3>
            <div className="mt-auto">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-600 to-purple-600"
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 10, ease: 'linear' }}
                />
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* 智能推薦結果 */}
      {smartOptions.length > 0 && !selectedOption && !smartGenerating && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center sm:justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSmartOptions([])
              setReplacementMode('select')
            }
          }}
        >
          <motion.div
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto p-5 pb-6"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">
                為你推薦 {smartOptions.length} 個選項
              </h3>
              <button
                onClick={() => {
                  setSmartOptions([])
                  setReplacementMode('select')
                }}
                className="text-gray-400 hover:text-gray-600 text-xl p-1"
              >
                ×
              </button>
            </div>
            
            {showReRecommendBanner && (
              <div className="mb-3 py-2 px-3 bg-primary-50 border border-primary-200 rounded-xl text-sm text-primary-700 font-medium text-center">
                已為你換上同類型不同菜式
              </div>
            )}
            
            <div className="space-y-3">
              {smartOptions.map((option, index) => {
                const targetCal = replacingMeal.calories
                const diff = option.calories - targetCal
                const overTarget = diff > 50
                const onTarget = !overTarget
                const isMiddle = index === 1
                
                // 卡片顏色：第一個=綠（達標），第二個=黃，第三個=橙（超標）
                let cardColorClass = ''
                if (isMiddle) {
                  // 中間卡片：黃色
                  cardColorClass = 'border-yellow-300 bg-yellow-50/50 hover:border-yellow-400 hover:bg-yellow-50/70'
                } else if (onTarget) {
                  // 第一個：達標=綠色
                  cardColorClass = 'border-green-200 bg-green-50/50 hover:border-green-300 hover:bg-green-50/70'
                } else {
                  // 第三個：超標=橙色
                  cardColorClass = 'border-orange-200 bg-orange-50/30 hover:border-orange-300 hover:bg-orange-50/50'
                }
                
                // 右上角：健康 / 均衡 / 豐富
                const optionLabels = ['健康', '均衡', '豐富']
                
                // 營養 Bar：灰色底 = 目標值（100%），彩色 = 實際值相對於目標值的比例
                // 目標營養值從 profile 獲取（每餐目標 = 每日目標 / 4）
                const targetP = profile ? profile.protein_target / 4 : 50
                const targetC = profile ? profile.carbs_target / 4 : 80
                const targetF = profile ? profile.fat_target / 4 : 30
                
                // 計算實際值相對於目標值的百分比（灰色底 bar 固定 100%，彩色 bar 顯示實際比例）
                const pctP = Math.min(100, ((option.protein ?? 0) / targetP) * 100)
                const pctC = Math.min(100, ((option.carbs ?? 0) / targetC) * 100)
                const pctF = Math.min(100, ((option.fat ?? 0) / targetF) * 100)
                
                return (
                  <motion.div
                    key={option.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`rounded-xl p-3 transition-all border relative ${cardColorClass}`}
                  >
                    {/* 左上角：總卡路里 */}
                    <div className="absolute top-2 left-3">
                      <span className="text-sm font-semibold text-gray-900">
                        {option.calories} 卡
                      </span>
                    </div>
                    
                    {/* 右上角：健康 / 均衡 / 豐富 */}
                    <div className="absolute top-2 right-3">
                      <span className="text-sm font-semibold text-gray-700">
                        {optionLabels[index]}
                      </span>
                    </div>
                    
                    {/* 右上角下方：符合目標/超出 X 卡 */}
                    <div className="absolute top-8 right-3 text-right">
                      {onTarget ? (
                        <span className="text-xs text-gray-500">
                          符合目標 <span className="text-green-600 font-medium">✓</span>
                        </span>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-xs text-gray-500">
                            目標 <span className="text-gray-700">{targetCal} 卡</span>
                          </span>
                          <span className="text-xs text-orange-600 font-medium">
                            超出 {diff} 卡
                          </span>
                          <span className="text-xs text-gray-400">可調整其他餐次</span>
                        </div>
                      )}
                    </div>
                    
                    {/* 重點：食物名稱 */}
                    <p className="text-sm font-medium text-gray-900 mb-2 line-clamp-2 pr-16 pt-8">
                      {option.foods?.map((f: any) => f.name).join('、') || option.name}
                    </p>
                    
                    {/* 營養 Bar：蛋白質、碳水、脂肪 - 並排居中顯示 */}
                    <div className="flex items-center justify-center gap-2.5 mb-2">
                      {/* 蛋白 */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs text-gray-500 shrink-0">蛋白</span>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden w-[50px]">
                          <div
                            className="h-full bg-blue-300 rounded-full"
                            style={{ width: `${pctP}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-600 shrink-0 whitespace-nowrap">{option.protein ?? 0}g</span>
                      </div>
                      {/* 碳水 */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs text-gray-500 shrink-0">碳水</span>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden w-[50px]">
                          <div
                            className="h-full bg-amber-300 rounded-full"
                            style={{ width: `${pctC}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-600 shrink-0 whitespace-nowrap">{option.carbs ?? 0}g</span>
                      </div>
                      {/* 脂肪 */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs text-gray-500 shrink-0">脂肪</span>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden w-[50px]">
                          <div
                            className="h-full bg-rose-300 rounded-full"
                            style={{ width: `${pctF}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-600 shrink-0 whitespace-nowrap">{option.fat ?? 0}g</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isApplyingOption) return
                        const caloriesDiff = option.calories - replacingMeal.calories
                        if (caloriesDiff > 50) {
                          setShowAdjustmentChoiceModal(true)
                          setSelectedOption(option)
                        } else {
                          handleApplyOption(option, 'keep')
                        }
                      }}
                      disabled={isApplyingOption}
                      className="w-full py-1.5 rounded-lg text-sm font-medium border border-gray-200 bg-white/80 text-gray-500 hover:border-gray-300 hover:text-gray-700 hover:bg-gray-50/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      選擇這個
                    </button>
                  </motion.div>
                )
              })}
            </div>
            
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setSmartOptions([])
                  setSmartParams({
                    taste: '',
                    location: '',
                    style: '',
                    cuisines: [],
                    foodType: '',
                    customInput: ''
                  })
                  setReplacementMode('smart')
                }}
                className="flex-1 py-2.5 text-sm border-2 border-gray-300 rounded-xl text-gray-700 font-semibold bg-white hover:bg-gray-50"
              >
                返回更改偏好
              </button>
              <button
                onClick={() => handleSmartRecommend(true)}
                className="flex-1 py-2.5 text-sm border-2 border-gray-300 rounded-xl text-gray-700 font-semibold bg-white hover:bg-gray-50"
              >
                換一批（同類型不同菜式）
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 選項詳情（已整合到結果頁面，此彈窗不再需要） */}
      {false && selectedOption && !adjustmentChoice && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center sm:justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedOption(null)
            }
          }}
        >
          <motion.div
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto p-6 pb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {selectedOption.name}
                </h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  {selectedOption.description}
                </p>
              </div>
              <button
                onClick={() => setSelectedOption(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="bg-blue-50 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                <div>
                  <div className="text-gray-600 text-xs">卡路里</div>
                  <div className="font-bold text-gray-900">{selectedOption.calories}</div>
                </div>
                <div>
                  <div className="text-gray-600 text-xs">蛋白質</div>
                  <div className="font-bold text-gray-900">{selectedOption.protein}g</div>
                </div>
                <div>
                  <div className="text-gray-600 text-xs">碳水</div>
                  <div className="font-bold text-gray-900">{selectedOption.carbs}g</div>
                </div>
                <div>
                  <div className="text-gray-600 text-xs">脂肪</div>
                  <div className="font-bold text-gray-900">{selectedOption.fat}g</div>
                </div>
              </div>
            </div>
            
            <div className="mb-4">
              <div className="text-sm font-semibold text-gray-700 mb-2">食物列表：</div>
              <div className="space-y-2">
                {selectedOption.foods.map((food: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm">
                    <span className="text-gray-900">{food.name}</span>
                    <span className="text-gray-600 font-medium">{food.calories} 卡</span>
                  </div>
                ))}
              </div>
            </div>
            
            {selectedOption.calories > replacingMeal.calories + 50 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4 text-sm">
                <div className="text-orange-800 font-semibold mb-1">
                  ⚠️ 這個選項會超標 {selectedOption.calories - replacingMeal.calories} 卡
                </div>
                <div className="text-orange-700">
                  你可以選擇自動調整其他餐次，或保留其他餐次（今天會超標）
                </div>
              </div>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedOption(null)}
                className="flex-1 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50"
              >
                返回
              </button>
              <button
                onClick={() => {
                  const caloriesDiff = selectedOption.calories - replacingMeal.calories
                  if (caloriesDiff > 50) {
                    setShowAdjustmentChoiceModal(true)
                  } else {
                    handleApplyOption(selectedOption, 'keep')
                  }
                }}
                className="flex-1 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700"
              >
                選擇這個
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 調整選擇彈窗（僅在點擊「選擇這個」後顯示） */}
      {showAdjustmentChoiceModal && selectedOption && replacingMeal && selectedOption.calories > replacingMeal.calories + 50 && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-md p-6"
          >
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              💡 這個餐單會超標 {selectedOption.calories - replacingMeal.calories} 卡
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              如何處理？
            </p>
            
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowAdjustmentChoiceModal(false)
                  setAdjustmentChoice('adjust')
                }}
                className="w-full p-4 border-2 border-blue-200 bg-blue-50 rounded-xl text-left hover:bg-blue-100 transition-all"
              >
                <div className="font-semibold text-gray-900 mb-1">
                  ⚖️ 自動調整其他餐次
                </div>
                <div className="text-sm text-gray-600">
                  晚餐減少約 {Math.round((selectedOption.calories - replacingMeal.calories) * 0.7)} 卡
                  <br />
                  小食減少約 {Math.round((selectedOption.calories - replacingMeal.calories) * 0.3)} 卡
                  <br />
                  今日總計：{profile?.calorie_target} 卡 ✅
                </div>
              </button>
              
              <button
                onClick={() => {
                  setShowAdjustmentChoiceModal(false)
                  setAdjustmentChoice('keep')
                }}
                className="w-full p-4 border-2 border-orange-200 bg-orange-50 rounded-xl text-left hover:bg-orange-100 transition-all"
              >
                <div className="font-semibold text-gray-900 mb-1">
                  ✅ 保留其他餐次
                </div>
                <div className="text-sm text-gray-600">
                  晚餐和小食保持不變
                  <br />
                  今日總計：{profile ? profile.calorie_target + (selectedOption.calories - replacingMeal.calories) : 0} 卡 ⚠️
                  <br />
                  超標：+{selectedOption.calories - replacingMeal.calories} 卡
                </div>
              </button>
            </div>
            
            <button
              onClick={() => {
                setShowAdjustmentChoiceModal(false)
                setAdjustmentChoice(null)
                setSelectedOption(null)
              }}
              className="w-full mt-4 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50"
            >
              返回
            </button>
          </motion.div>
        </div>
      )}

      <BottomNav />

      {/* 手動記錄彈窗 */}
      <AnimatePresence>
        {manualRecording && (
          <div 
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center sm:justify-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                if (manualRecording.foods.length > 0) {
                  const confirmed = window.confirm('確定要放棄記錄嗎？')
                  if (!confirmed) return
                }
                setManualRecording(null)
                setAddingFood(false)
              }
            }}
          >
            <motion.div
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto p-6 pb-8"
            >
              {(!manualRecording.addMethod || manualRecording.addMethod === 'select') && (
                /* 列表或選擇視圖 */
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      記錄{(() => {
                        const names: Record<string, string> = {
                          breakfast: '早餐',
                          lunch: '午餐',
                          dinner: '晚餐',
                          snack: '小食'
                        }
                        return names[manualRecording.meal.type] || '餐次'
                      })()}
                    </h3>
                    <button
                      onClick={() => {
                        if (manualRecording.foods.length > 0) {
                          const confirmed = window.confirm('確定要放棄記錄嗎？')
                          if (!confirmed) return
                        }
                        setManualRecording(null)
                        setAddingFood(false)
                      }}
                      className="text-gray-400 hover:text-gray-600 text-2xl"
                    >
                      ×
                    </button>
                  </div>
                  
                  {/* 已添加的食物列表 */}
                  {manualRecording.foods.length > 0 && manualRecording.addMethod === null && (
                    <div className="space-y-3 mb-6">
                      <div className="text-sm font-semibold text-gray-700">
                        已添加的食物：
                      </div>
                      {manualRecording.foods.map((food) => (
                        <div
                          key={food.id}
                          className="flex items-center justify-between p-3 bg-green-50 border-2 border-green-200 rounded-xl"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900">{food.name}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              {food.calories} 卡
                              {food.protein > 0 && ` | 蛋白質 ${food.protein}g`}
                              {food.carbs > 0 && ` | 碳水 ${food.carbs}g`}
                              {food.fat > 0 && ` | 脂肪 ${food.fat}g`}
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveFood(food.id)}
                            className="ml-3 text-gray-400 hover:text-gray-600 text-2xl px-2"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      
                      {/* AI Disclaimer */}
                      <AnimatePresence>
                        {aiDisclaimer && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="text-xs text-gray-500 mb-2 text-center"
                          >
                            ⚠️ 提示：{aiDisclaimer}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      
                      {/* 總計 */}
                      <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
                        <div className="font-semibold text-gray-900 mb-2">總計：</div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-600">卡路里：</span>
                            <span className="font-semibold text-gray-900 ml-1">
                              {manualRecording.foods.reduce((sum, f) => sum + f.calories, 0)} 卡
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">蛋白質：</span>
                            <span className="font-semibold text-gray-900 ml-1">
                              {manualRecording.foods.reduce((sum, f) => sum + f.protein, 0)}g
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">碳水：</span>
                            <span className="font-semibold text-gray-900 ml-1">
                              {manualRecording.foods.reduce((sum, f) => sum + f.carbs, 0)}g
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">脂肪：</span>
                            <span className="font-semibold text-gray-900 ml-1">
                              {manualRecording.foods.reduce((sum, f) => sum + f.fat, 0)}g
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">纖維：</span>
                            <span className="font-semibold text-gray-900 ml-1">
                              {manualRecording.foods.reduce((sum, f) => sum + f.fiber, 0)}g
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 添加更多按鈕 */}
                      <button
                        onClick={() => setManualRecording(prev => prev ? { ...prev, addMethod: 'select' } : null)}
                        className="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-primary-400 hover:text-primary-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <span className="text-xl">➕</span>
                        <span className="font-medium">添加更多食物</span>
                      </button>
                    </div>
                  )}
                  
                  {/* 選擇添加方式 */}
                  {!addingFood && manualRecording.addMethod === 'select' && (
                    <div className="space-y-3 mb-6">
                      <div className="text-sm font-semibold text-gray-700 mb-3">
                        {manualRecording.foods.length > 0 ? '繼續添加：' : '選擇添加方式：'}
                      </div>
                      
                      {/* AI 拍照識別 */}
                      <label className="block">
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handlePhotoUpload}
                          className="hidden"
                          disabled={photoAnalyzing}
                        />
                        <div className="w-full flex items-start gap-3 p-4 bg-gray-50 border-2 border-gray-200 rounded-xl hover:bg-gray-100 cursor-pointer active:scale-[0.98] transition-all">
                          <span className="text-3xl flex-shrink-0">📷</span>
                          <div className="flex-1 text-left min-w-0">
                            <div className="font-semibold text-gray-900">AI 拍照識別</div>
                            <div className="text-sm text-gray-600 mt-1">
                              拍攝食物，自動分析
                            </div>
                          </div>
                          <span className="text-gray-400 text-xl flex-shrink-0">›</span>
                        </div>
                      </label>
                      
                      {/* 文字描述 */}
                      <button
                        onClick={() => setManualRecording(prev => prev ? { ...prev, addMethod: 'text' } : null)}
                        className="w-full flex items-start gap-3 p-4 bg-gray-50 border-2 border-gray-200 rounded-xl hover:bg-gray-100 active:scale-[0.98] transition-all"
                      >
                        <span className="text-3xl flex-shrink-0">💬</span>
                        <div className="flex-1 text-left min-w-0">
                          <div className="font-semibold text-gray-900">文字描述</div>
                          <div className="text-sm text-gray-600 mt-1">
                            輸入食物名稱，AI 分析
                          </div>
                        </div>
                        <span className="text-gray-400 text-xl flex-shrink-0">›</span>
                      </button>
                      
                      {/* 快速輸入 */}
                      <button
                        onClick={() => {
                          setManualRecording(prev => prev ? { ...prev, addMethod: 'quick' } : null)
                          setAddingFood(true)
                        }}
                        className="w-full flex items-start gap-3 p-4 bg-gray-50 border-2 border-gray-200 rounded-xl hover:bg-gray-100 active:scale-[0.98] transition-all"
                      >
                        <span className="text-3xl flex-shrink-0">⚡</span>
                        <div className="flex-1 text-left min-w-0">
                          <div className="font-semibold text-gray-900">快速輸入</div>
                          <div className="text-sm text-gray-600 mt-1">
                            直接輸入整餐營養素
                          </div>
                        </div>
                        <span className="text-gray-400 text-xl flex-shrink-0">›</span>
                      </button>

                      {/* 返回列表按鈕 (當有食物時) */}
                      {manualRecording.foods.length > 0 && (
                        <button
                          onClick={() => setManualRecording(prev => prev ? { ...prev, addMethod: null } : null)}
                          className="w-full py-3 text-gray-500 hover:text-gray-700 font-medium"
                        >
                          返回已添加列表
                        </button>
                      )}
                    </div>
                  )}

                  {/* 拍照分析中 */}
                  {photoAnalyzing && (
                    <div className="mb-6 p-6 bg-blue-50 border-2 border-blue-200 rounded-xl text-center">
                      <div className="text-4xl mb-3">🔍</div>
                      <div className="font-semibold text-gray-900 mb-2">AI 正在分析...</div>
                      <div className="text-sm text-gray-600">請稍候片刻</div>
                    </div>
                  )}

                  {/* 底部按鈕 - 只在非輸入狀態顯示 */}
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => {
                        if (manualRecording.foods.length > 0) {
                          const confirmed = window.confirm('確定要放棄記錄嗎？')
                          if (!confirmed) return
                        }
                        setManualRecording(null)
                        setAddingFood(false)
                      }}
                      className="flex-1 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleConfirmManualRecord}
                      disabled={manualRecording.foods.length === 0}
                      className="flex-1 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      確認記錄
                    </button>
                  </div>
                </>
              )}

              {/* 文字描述表單 */}
              {manualRecording.addMethod === 'text' && !textAnalyzing && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">文字描述</h3>
                    <button
                      onClick={() => setManualRecording(prev => prev ? { ...prev, addMethod: 'select' } : null)}
                      className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                      返回
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        描述你吃的食物：
                      </label>
                      <textarea
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="例如：一碗雲吞麵 + 無糖可樂"
                        rows={3}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-green-400 resize-none"
                      />
                    </div>
                    
                    <div className="text-xs text-gray-600 bg-white/50 rounded-lg p-3">
                      <div className="font-semibold mb-1">💡 例子：</div>
                      <div>• 一碗雲吞麵 + 無糖可樂</div>
                      <div>• 茶餐廳常餐（雞扒飯套餐）</div>
                      <div>• 兩隻水煮蛋 + 一片全麥麵包</div>
                    </div>
                    
                    <button
                      onClick={handleTextAnalysis}
                      disabled={!textInput.trim()}
                      className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      AI 分析
                    </button>
                  </div>
                </>
              )}

              {/* 文字分析中 */}
              {textAnalyzing && (
                <div className="mb-6 p-6 bg-green-50 border-2 border-green-200 rounded-xl text-center">
                  <div className="text-4xl mb-3">🤖</div>
                  <div className="font-semibold text-gray-900 mb-2">AI 正在分析...</div>
                  <div className="text-sm text-gray-600">「{textInput}」</div>
                </div>
              )}
              
              {/* 快速輸入表單 */}
              {manualRecording.addMethod === 'quick' && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">快速輸入</h3>
                    <button
                      onClick={() => {
                        setAddingFood(false)
                        setManualRecording(prev => prev ? { ...prev, addMethod: 'select' } : null)
                        setNewFood({
                          name: '',
                          portion: '',
                          calories: '',
                          protein: '',
                          carbs: '',
                          fat: '',
                          fiber: ''
                        })
                      }}
                      className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                      返回
                    </button>
                  </div>

                  <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        食物名稱 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newFood.name}
                        onChange={(e) => setNewFood({ ...newFood, name: e.target.value })}
                        placeholder="例如：雞扒飯"
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        份量（可選）
                      </label>
                      <input
                        type="text"
                        value={newFood.portion}
                        onChange={(e) => setNewFood({ ...newFood, portion: e.target.value })}
                        placeholder="例如：1碟、150g"
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        卡路里 <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={newFood.calories}
                          onChange={(e) => setNewFood({ ...newFood, calories: e.target.value })}
                          placeholder="600"
                          className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400"
                        />
                        <span className="text-gray-600">卡</span>
                      </div>
                    </div>
                    
                    {/* 其他營養素 */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="text-xs font-medium text-gray-500 mb-3">其他營養素（可選）</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        {/* 蛋白質 */}
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-600 min-w-[3em]">蛋白質</label>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              value={newFood.protein}
                              onChange={(e) => setNewFood({ ...newFood, protein: e.target.value })}
                              className="w-full pl-3 pr-6 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-400 transition-colors"
                              placeholder="0"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">g</span>
                          </div>
                        </div>

                        {/* 碳水 */}
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-600 min-w-[3em]">碳水</label>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              value={newFood.carbs}
                              onChange={(e) => setNewFood({ ...newFood, carbs: e.target.value })}
                              className="w-full pl-3 pr-6 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-400 transition-colors"
                              placeholder="0"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">g</span>
                          </div>
                        </div>

                        {/* 脂肪 */}
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-600 min-w-[3em]">脂肪</label>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              value={newFood.fat}
                              onChange={(e) => setNewFood({ ...newFood, fat: e.target.value })}
                              className="w-full pl-3 pr-6 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-400 transition-colors"
                              placeholder="0"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">g</span>
                          </div>
                        </div>

                        {/* 纖維 */}
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-600 min-w-[3em]">纖維</label>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              value={newFood.fiber}
                              onChange={(e) => setNewFood({ ...newFood, fiber: e.target.value })}
                              className="w-full pl-3 pr-6 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-400 transition-colors"
                              placeholder="0"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">g</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleAddFood}
                      className="w-full py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700"
                    >
                      添加
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 食物管理彈窗 */}
      <AnimatePresence>
        {managingFoods && (
          <div 
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center sm:justify-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setManagingFoods(null)
              }
            }}
          >
            <motion.div
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg p-6 pb-8"
            >
              {managingFoods.mode === 'list' && (
                /* 列表視圖 */
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      食物管理
                    </h3>
                    <button
                      onClick={() => setManagingFoods(null)}
                      className="text-gray-400 hover:text-gray-600 text-2xl"
                    >
                      ×
                    </button>
                  </div>

                  <div className="space-y-3 mb-6 max-h-[60vh] overflow-y-auto">
                    {managingFoods.meal.foods.map((food: any) => (
                      <div
                        key={food.id}
                        className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900">{food.name}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {food.calories} 卡 | P{food.protein} C{food.carbs} F{food.fat}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteFoodItem(food.id)}
                          className="ml-3 text-gray-400 hover:text-gray-600 p-2"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setManagingFoods({ ...managingFoods, mode: 'select' })}
                    className="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-primary-400 hover:text-primary-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="text-xl">➕</span>
                    <span className="font-medium">添加更多食物</span>
                  </button>
                </>
              )}

              {managingFoods.mode === 'select' && (
                /* 添加方式選擇視圖 */
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">選擇添加方式</h3>
                    <button
                      onClick={() => setManagingFoods({ ...managingFoods, mode: 'list' })}
                      className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                      返回列表
                    </button>
                  </div>

                  <div className="space-y-3">
                    {/* AI 拍照識別 */}
                    <label className="block">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoUpload}
                        className="hidden"
                        disabled={photoAnalyzing}
                      />
                      <div className="w-full flex items-start gap-3 p-4 bg-gray-50 border-2 border-gray-200 rounded-xl hover:bg-gray-100 cursor-pointer active:scale-[0.98] transition-all">
                        <span className="text-3xl flex-shrink-0">📷</span>
                        <div className="flex-1 text-left min-w-0">
                          <div className="font-semibold text-gray-900">AI 拍照識別</div>
                          <div className="text-sm text-gray-600 mt-1">拍攝食物，自動分析</div>
                        </div>
                        <span className="text-gray-400 text-xl flex-shrink-0">›</span>
                      </div>
                    </label>

                    {/* 文字描述 */}
                    <button
                      onClick={() => setManagingFoods({ ...managingFoods, mode: 'text' })}
                      className="w-full flex items-start gap-3 p-4 bg-gray-50 border-2 border-gray-200 rounded-xl hover:bg-gray-100 active:scale-[0.98] transition-all"
                    >
                      <span className="text-3xl flex-shrink-0">💬</span>
                      <div className="flex-1 text-left min-w-0">
                        <div className="font-semibold text-gray-900">文字描述</div>
                        <div className="text-sm text-gray-600 mt-1">輸入食物名稱</div>
                      </div>
                      <span className="text-gray-400 text-xl flex-shrink-0">›</span>
                    </button>

                    {/* 快速輸入 */}
                    <button
                      onClick={() => {
                        setNewFood({
                          name: '',
                          portion: '',
                          calories: '',
                          protein: '',
                          carbs: '',
                          fat: '',
                          fiber: ''
                        })
                        setManagingFoods({ ...managingFoods, mode: 'quick' })
                      }}
                      className="w-full flex items-start gap-3 p-4 bg-gray-50 border-2 border-gray-200 rounded-xl hover:bg-gray-100 active:scale-[0.98] transition-all"
                    >
                      <span className="text-3xl flex-shrink-0">⚡</span>
                      <div className="flex-1 text-left min-w-0">
                        <div className="font-semibold text-gray-900">快速輸入</div>
                        <div className="text-sm text-gray-600 mt-1">直接輸入營養素</div>
                      </div>
                      <span className="text-gray-400 text-xl flex-shrink-0">›</span>
                    </button>
                  </div>
                </>
              )}

              {managingFoods.mode === 'text' && (
                /* 文字描述輸入視圖 */
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">文字描述</h3>
                    <button
                      onClick={() => setManagingFoods({ ...managingFoods, mode: 'select' })}
                      className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                      返回
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        描述你吃的食物：
                      </label>
                      <textarea
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="例如：雲吞麵 + 一支豆漿"
                        rows={3}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-green-400 resize-none"
                      />
                    </div>
                    
                    <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3">
                      <div className="font-semibold mb-1">💡 例子：</div>
                      <div>• 雲吞麵 + 一支豆漿</div>
                      <div>• 茶餐廳常餐（雞扒飯套餐）</div>
                    </div>

                    <button
                      onClick={async () => {
                        if (!textInput.trim()) {
                          toast('請輸入食物描述')
                          return
                        }
                        
                        if (!managingFoods) return
                        
                        // 調用 AI API 分析文字
                        setTextAnalyzing(true)
                        
                        try {
                          console.log('📤 Analyzing text:', textInput)
                          
                          const response = await fetch('/api/analyze-food-text', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: textInput })
                          })
                          
                          // 檢查 HTTP 響應狀態
                          if (!response.ok) {
                            const errorText = await response.text()
                            let errorData
                            try {
                              errorData = JSON.parse(errorText)
                            } catch {
                              throw new Error(`服務器錯誤 (${response.status}): ${errorText.substring(0, 100)}`)
                            }
                            throw new Error(errorData.error || errorData.details || `服務器錯誤 (${response.status})`)
                          }
                          
                          // 解析 JSON 響應
                          let result
                          try {
                            result = await response.json()
                          } catch (parseError: any) {
                            throw new Error(`響應格式錯誤：${parseError.message}`)
                          }
                          
                          if (!result.success) {
                            throw new Error(result.error || result.details || '分析失敗')
                          }
                          
                          console.log('✅ AI analysis:', result.data)
                          
                          if (!result.data || !result.data.foods || !Array.isArray(result.data.foods)) {
                            throw new Error('AI 返回的數據格式不正確')
                          }
                          
                          if (result.data.foods.length === 0) {
                            toast.error('未能識別到食物，請重試')
                            setTextAnalyzing(false)
                            return
                          }
                          
                          // 獲取當前餐單的最大 order 值
                          const { data: existingFoods } = await supabase
                            .from('foods')
                            .select('order')
                            .eq('meal_id', managingFoods.meal.id)
                            .order('order', { ascending: false })
                            .limit(1)
                          
                          const maxOrder = existingFoods && existingFoods.length > 0 
                            ? (existingFoods[0].order ?? -1) 
                            : -1
                          
                          // 批量添加識別的食物
                          const foodsToInsert = result.data.foods.map((food: any, index: number) => ({
                            meal_id: managingFoods.meal.id,
                            name: food.name + (food.portion ? ` ${food.portion}` : ''),
                            calories: Math.round(Number(food.calories) || 0),
                            protein: Math.round(Number(food.protein) || 0),
                            carbs: Math.round(Number(food.carbs) || 0),
                            fat: Math.round(Number(food.fat) || 0),
                            fiber: Math.round(Number(food.fiber) || 0),
                            order: maxOrder + 1 + index
                          }))
                          
                          const { error } = await supabase
                            .from('foods')
                            .insert(foodsToInsert)
                          
                          if (error) throw error
                          
                          // 刷新數據
                          await refreshMealData(managingFoods.meal.id)
                          
                          // 返回列表視圖
                          setManagingFoods(prev => prev ? { ...prev, mode: 'list' } : null)
                          
                          setTextInput('')
                          setTextAnalyzing(false)
                          
                          setToastMessage(`已添加 ${result.data.foods.length} 項食物！`)
                          setShowToast(true)
                          setTimeout(() => setShowToast(false), 2000)
                          
                        } catch (error: any) {
                          console.error('Text analysis error:', error)
                          setTextAnalyzing(false)
                          
                          // 顯示更具體的錯誤訊息
                          const errorMessage = error?.message || error?.toString() || '分析失敗，請重試'
                          console.error('Error details:', errorMessage)
                          
                          // 根據錯誤類型顯示不同訊息
                          if (errorMessage.includes('網絡') || errorMessage.includes('fetch')) {
                            toast.error('網絡連接失敗，請檢查網絡後重試')
                          } else if (errorMessage.includes('JSON') || errorMessage.includes('格式')) {
                            toast.error('數據格式錯誤，請重試或聯繫支持')
                          } else if (errorMessage.includes('識別')) {
                            toast.error('未能識別到食物，請嘗試更詳細的描述（例如：一個橙、半杯無糖豆漿）')
                          } else {
                            toast.error(`分析失敗：${errorMessage}`)
                          }
                        }
                      }}
                      disabled={textAnalyzing}
                      className="w-full py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {textAnalyzing ? '分析中...' : '添加'}
                    </button>
                  </div>
                </>
              )}

              {managingFoods.mode === 'quick' && (
                /* 快速輸入視圖 */
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">快速輸入</h3>
                    <button
                      onClick={() => setManagingFoods({ ...managingFoods, mode: 'select' })}
                      className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                      返回
                    </button>
                  </div>

                  <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        食物名稱 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newFood.name}
                        onChange={(e) => setNewFood({ ...newFood, name: e.target.value })}
                        placeholder="例如：雞扒飯"
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        卡路里 <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={newFood.calories}
                          onChange={(e) => setNewFood({ ...newFood, calories: e.target.value })}
                          placeholder="600"
                          className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400"
                        />
                        <span className="text-gray-600">卡</span>
                      </div>
                    </div>

                    {/* 其他營養素 */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="text-xs font-medium text-gray-500 mb-3">其他營養素（可選）</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        {/* 蛋白質 */}
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-600 min-w-[3em]">蛋白質</label>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              value={newFood.protein}
                              onChange={(e) => setNewFood({ ...newFood, protein: e.target.value })}
                              className="w-full pl-3 pr-6 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-400 transition-colors"
                              placeholder="0"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">g</span>
                          </div>
                        </div>

                        {/* 碳水 */}
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-600 min-w-[3em]">碳水</label>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              value={newFood.carbs}
                              onChange={(e) => setNewFood({ ...newFood, carbs: e.target.value })}
                              className="w-full pl-3 pr-6 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-400 transition-colors"
                              placeholder="0"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">g</span>
                          </div>
                        </div>

                        {/* 脂肪 */}
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-600 min-w-[3em]">脂肪</label>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              value={newFood.fat}
                              onChange={(e) => setNewFood({ ...newFood, fat: e.target.value })}
                              className="w-full pl-3 pr-6 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-400 transition-colors"
                              placeholder="0"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">g</span>
                          </div>
                        </div>

                        {/* 纖維 */}
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-600 min-w-[3em]">纖維</label>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              value={newFood.fiber}
                              onChange={(e) => setNewFood({ ...newFood, fiber: e.target.value })}
                              className="w-full pl-3 pr-6 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-400 transition-colors"
                              placeholder="0"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">g</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={async () => {
                        if (!newFood.name || !newFood.calories) {
                          toast('請填寫名稱和卡路里')
                          return
                        }
                        
                        await handleAddFoodItem({
                          name: newFood.name,
                          calories: parseInt(newFood.calories) || 0,
                          protein: parseInt(newFood.protein) || 0,
                          carbs: parseInt(newFood.carbs) || 0,
                          fat: parseInt(newFood.fat) || 0,
                          fiber: parseInt(newFood.fiber) || 0
                        })
                        
                        setNewFood({
                          name: '',
                          portion: '',
                          calories: '',
                          protein: '',
                          carbs: '',
                          fat: '',
                          fiber: ''
                        })
                      }}
                      className="w-full py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700"
                    >
                      添加
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <EditMealModal
        meal={selectedMealForEdit}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onRegenerateMeal={handleRegenerateMeal}
        onReplaceFood={() => {}} // 廢棄
        onRecordActual={handleRecordActual}
        onSpecialEvent={handleSpecialEvent}
      />

      
      {/* Adjustment Preview Modal */}
      <AdjustmentPreviewModal
        isOpen={showAdjustmentPreview}
        onClose={() => setShowAdjustmentPreview(false)}
        adjustmentResult={adjustmentResult}
        eventMealType={selectedMealForEvent?.type || 'dinner'}
        onConfirm={handleAdjustmentConfirm}
      />
      {/* Special Event Modal */}
      <SpecialEventModal
        meal={selectedMealForEvent}
        isOpen={showSpecialEventModal}
        onClose={() => setShowSpecialEventModal(false)}
        onConfirm={handleSpecialEventConfirm}
      />
        </motion.div>
      )}
    </AuthGuard>
  )
}
