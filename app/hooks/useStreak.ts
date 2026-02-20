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
 * Phase 7 寬鬆 Streak：只要當天有「任何一餐」已記錄（consumed），即算延續 streak。
 * 回傳 currentStreak（當前連續天數）、longestStreak（歷史最長連續天數）。
 */
export function useStreak(userId: string | undefined, _targetCalories?: number) {
  const [currentStreak, setCurrentStreak] = useState(0)
  const [longestStreak, setLongestStreak] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setCurrentStreak(0)
      setLongestStreak(0)
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
          .select('date, consumed')
          .eq('user_id', userId)
          .eq('consumed', true)
          .gte('date', startStr)
          .order('date', { ascending: false })

        if (cancelled) return
        if (error) throw error

        // 寬鬆：有記錄的日期集合（當天至少一餐 consumed）
        const daysWithRecord = new Set<string>()
        ;(meals || []).forEach((m: { date: string }) => daysWithRecord.add(m.date))

        // 當前連續天數（從今天往前數）
        let current = 0
        const checkDate = new Date()
        checkDate.setHours(0, 0, 0, 0)
        while (true) {
          const dateStr = toLocalDateStr(checkDate)
          if (daysWithRecord.has(dateStr)) {
            current++
            checkDate.setDate(checkDate.getDate() - 1)
          } else {
            break
          }
        }

        // 歷史最長連續天數：遍歷所有有記錄的日期，找最長連續區間
        const sortedDates = Array.from(daysWithRecord).sort()
        let longest = 0
        let runLength = 1
        for (let i = 1; i < sortedDates.length; i++) {
          const prev = new Date(sortedDates[i - 1])
          const curr = new Date(sortedDates[i])
          const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
          if (diffDays === 1) {
            runLength++
          } else {
            longest = Math.max(longest, runLength)
            runLength = 1
          }
        }
        longest = Math.max(longest, runLength, current)

        if (!cancelled) {
          setCurrentStreak(current)
          setLongestStreak(longest)
        }
      } catch (e) {
        if (!cancelled) {
          setCurrentStreak(0)
          setLongestStreak(0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [userId])

  return { currentStreak, longestStreak, loading }
}
