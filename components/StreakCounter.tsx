'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import confetti from 'canvas-confetti'

const db = supabase as any

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface StreakCounterProps {
  userId: string
  targetCalories: number
}

export default function StreakCounter({ userId, targetCalories }: StreakCounterProps) {
  const [currentStreak, setCurrentStreak] = useState(0)
  const [longestStreak, setLongestStreak] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    calculateStreak()
  }, [userId, targetCalories])

  const calculateStreak = async () => {
    try {
      const hundredDaysAgo = new Date()
      hundredDaysAgo.setDate(hundredDaysAgo.getDate() - 100)
      const startStr = toLocalDateStr(hundredDaysAgo)

      const { data: meals, error } = await db
        .from('meals')
        .select('date, calories, consumed')
        .eq('user_id', userId)
        .eq('consumed', true)
        .gte('date', startStr)
        .order('date', { ascending: false })

      if (error) throw error

      if (!meals || meals.length === 0) {
        setCurrentStreak(0)
        setLongestStreak(0)
        setLoading(false)
        return
      }

      const dailyTotals: Record<string, number> = {}
      meals.forEach((meal: { date: string; calories?: number }) => {
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
      let checkDate = new Date()
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

      const sortedDates = Object.keys(dailyStatus).sort()
      let longest = 0
      let tempStreak = 0
      for (const date of sortedDates) {
        if (dailyStatus[date]) {
          tempStreak++
          longest = Math.max(longest, tempStreak)
        } else {
          tempStreak = 0
        }
      }

      const lastStreak = typeof window !== 'undefined' ? localStorage.getItem('lastStreak') : null
      if (lastStreak && parseInt(lastStreak, 10) < current) {
        const milestones = [3, 7, 14, 30, 60, 100]
        if (milestones.includes(current)) {
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })
        }
      }
      if (typeof window !== 'undefined') localStorage.setItem('lastStreak', current.toString())

      setCurrentStreak(current)
      setLongestStreak(longest)
    } catch (error) {
      console.error('Error calculating streak:', error)
    } finally {
      setLoading(false)
    }
  }

  const milestones = [
    { days: 3, label: '好開始！', emoji: '🌱' },
    { days: 7, label: '一週達成', emoji: '⭐' },
    { days: 14, label: '兩週了！', emoji: '🎯' },
    { days: 30, label: '一個月', emoji: '🏆' },
    { days: 60, label: '兩個月', emoji: '💎' },
    { days: 100, label: '百日堅持', emoji: '👑' },
  ]

  const nextMilestone = milestones.find(m => m.days > currentStreak)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-gray-500">載入中...</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="text-center mb-6">
        <div className="text-sm text-gray-600 mb-2">🔥 連續達標</div>
        {nextMilestone && (
          <div className="mb-4">
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-orange-400 to-red-500 h-full transition-all duration-500 rounded-full"
                style={{ width: `${Math.min((currentStreak / nextMilestone.days) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
        <div className="text-5xl font-bold text-gray-900 mb-2">{currentStreak}</div>
        <div className="text-sm text-gray-600">天</div>
        {nextMilestone && (
          <div className="mt-3 text-sm text-gray-600">
            下一個里程碑：<span className="font-semibold">{nextMilestone.days} 天</span> {nextMilestone.emoji}
          </div>
        )}
        {longestStreak > currentStreak && (
          <div className="mt-2 text-xs text-gray-500">最長記錄：{longestStreak} 天</div>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-xs font-semibold text-gray-700 mb-3">里程碑：</div>
        {milestones.map(milestone => {
          const achieved = currentStreak >= milestone.days
          const isNext = nextMilestone?.days === milestone.days
          return (
            <div
              key={milestone.days}
              className={`flex items-center justify-between p-2 rounded-lg ${
                achieved ? 'bg-green-50' : isNext ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{achieved ? '✅' : '🔒'}</span>
                <span className={`text-sm ${achieved ? 'text-gray-900 font-semibold' : 'text-gray-500'}`}>
                  {milestone.days} 天 - {milestone.label}
                </span>
              </div>
              {isNext && (
                <span className="text-xs text-blue-600 font-medium">還差 {milestone.days - currentStreak} 天</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
