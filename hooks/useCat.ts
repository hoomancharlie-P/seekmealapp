// 貓狀態管理 Hook

import { useState, useEffect, useMemo, useCallback } from 'react'
import type { CatState, CatExpression, CatInteractionType } from '@/types/cat'
import { getExpressionByInteraction } from '@/lib/cat/expressions'
import {
  calculateCatActivityScore,
  getCatStateByActivityScore,
  calculateRecordFrequencyScore,
  calculateGoalAchievementScore,
  calculateUsageFrequencyScore,
  calculateUsageDurationScore
} from '@/lib/cat/stateCalculator'

interface UseCatProps {
  meals: Array<{ consumed: boolean; date?: string }>
  consumedCalories: number
  calorieTarget: number
  lastLoginAt?: Date | null
  averageSessionDuration?: number
}

export function useCat({
  meals,
  consumedCalories,
  calorieTarget,
  lastLoginAt = null,
  averageSessionDuration = 0
}: UseCatProps) {
  const [currentExpression, setCurrentExpression] = useState<CatExpression>('neutral')
  const [lastInteraction, setLastInteraction] = useState<CatInteractionType | null>(null)
  const [consecutiveDays, setConsecutiveDays] = useState(0) // 簡化版，實際應該從數據庫獲取

  // 計算貓的狀態
  const catState = useMemo<CatState>(() => {
    // 簡化版計算：基於記錄的餐數
    const consumedMeals = meals.filter(m => m.consumed).length
    const totalMeals = meals.length
    
    // 模擬活躍度計算
    const recordFrequency = totalMeals > 0 ? (consumedMeals / totalMeals) * 100 : 0
    const goalAchievement = consumedCalories >= calorieTarget ? 100 : (consumedCalories / calorieTarget) * 100
    const usageFrequency = lastLoginAt ? calculateUsageFrequencyScore(lastLoginAt, 7) : 50
    const usageDuration = calculateUsageDurationScore(averageSessionDuration)

    const activityScore = calculateCatActivityScore({
      recordFrequency,
      goalAchievement,
      usageFrequency,
      usageDuration
    })

    return getCatStateByActivityScore(activityScore)
  }, [meals, consumedCalories, calorieTarget, lastLoginAt, averageSessionDuration])

  // 根據時間和狀態設置默認表情
  useEffect(() => {
    const hour = new Date().getHours()
    
    // 如果沒有互動，根據時間設置默認表情
    if (!lastInteraction) {
      if (hour >= 22 || hour < 6) {
        setCurrentExpression('sleepy')
      } else {
        setCurrentExpression('neutral')
      }
    }
  }, [lastInteraction])

  // 觸發互動
  const triggerInteraction = useCallback((type: CatInteractionType, context?: {
    isOverGoal?: boolean
    overGoalPercentage?: number
  }) => {
    setLastInteraction(type)
    
    const expression = getExpressionByInteraction(type, {
      ...context,
      consecutiveDays
    })
    
    setCurrentExpression(expression)
    
    // 如果是記錄餐單，更新連續天數（簡化版）
    if (type === 'record-meal') {
      // 實際應該檢查是否連續達標
    }
  }, [consecutiveDays])

  // 檢查是否超標
  const isOverGoal = consumedCalories > calorieTarget
  const overGoalPercentage = calorieTarget > 0 
    ? ((consumedCalories / calorieTarget) * 100) 
    : 0

  return {
    catState,
    currentExpression,
    triggerInteraction,
    isOverGoal,
    overGoalPercentage
  }
}
