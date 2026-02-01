'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 回傳當前連續達標天數（95–105% 目標卡路里）。
 * 第一天記錄或 0 天時不顯示，由呼叫方判斷。
 */
export function useStreak(userId: string | undefined, targetCalories: number) {
  const [currentStreak, setCurrentStreak] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId || !targetCalories) {
      setCurrentStreak(0)
      setLoading(false)
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        const hundredDaysAgo = new Date()
        hundredDaysAgo.setDate(hundredDaysAgo.getDate() - 100)
        const startStr = toLocalDateStr(hundredDaysAgo)

        const { data: meals, error } = await supabase
          .from('meals')
          .select('date, calories, consumed')
          .eq('user_id', userId)
          .eq('consumed', true)
          .gte('date', startStr)
          .order('date', { ascending: false })

        if (cancelled) return
        if (error) throw error

        if (!meals || meals.length === 0) {
          setCurrentStreak(0)
          setLoading(false)
          return
        }

        const dailyTotals: Record<string, number> = {}
        meals.forEach((meal: { date: string; calories: number }) => {
          if (!dailyTotals[meal.date]) dailyTotals[meal.date] = 0
          dailyTotals[meal.date] += meal.calories || 0
        })

        const lowerBound = targetCalories * 0.95
        const upperBound = targetCalories * 1.05
        const dailyStatus: Record<string, boolean> = {}
        Object.entries(dailyTotals).forEach(([date, total]) => {
          dailyStatus[date] = total >= lowerBound && total <= upperBound
        })

        let current = 0
        const checkDate = new Date()
        checkDate.setHours(0, 0, 0, 0)
        while (true) {
          const dateStr = toLocalDateStr(checkDate)
          if (dailyStatus[dateStr] === true) {
            current++
            checkDate.setDate(checkDate.getDate() - 1)
          } else {
            break
          }
        }

        setCurrentStreak(current)
      } catch (e) {
        if (!cancelled) setCurrentStreak(0)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [userId, targetCalories])

  return { currentStreak, loading }
}
