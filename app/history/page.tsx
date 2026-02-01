'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import AuthGuard from '@/components/AuthGuard'
import BottomNav from '@/components/BottomNav'
import { useAuth } from '@/app/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { fetchMeals } from '@/lib/meals'
import type { Profile } from '@/types/database'

function startOfDay(d: Date) {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

// IMPORTANT: use local date parts (NOT toISOString) to avoid timezone off-by-one.
function toLocalDateStr(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function parseLocalDateStr(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export default function HistoryPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const todayOnly = useMemo(() => startOfDay(new Date()), [])
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()))

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  const [meals, setMeals] = useState<any[]>([])
  const [loadingMeals, setLoadingMeals] = useState(true)

  const selectedDateOnly = useMemo(() => startOfDay(selectedDate), [selectedDate])
  const isToday = useMemo(() => selectedDateOnly.getTime() === todayOnly.getTime(), [selectedDateOnly, todayOnly])
  const isFutureDate = useMemo(() => selectedDateOnly.getTime() > todayOnly.getTime(), [selectedDateOnly, todayOnly])
  const selectedDateStr = useMemo(() => toLocalDateStr(selectedDateOnly), [selectedDateOnly])
  const todayStr = useMemo(() => toLocalDateStr(todayOnly), [todayOnly])

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
      } catch (e) {
        console.error('Error fetching profile:', e)
      } finally {
        setLoadingProfile(false)
      }
    }

    fetchProfile()
  }, [user, authLoading])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setMeals([])
      setLoadingMeals(false)
      return
    }
    if (isFutureDate) return

    const load = async () => {
      try {
        setLoadingMeals(true)
        const data = await fetchMeals(user.id, selectedDateStr, selectedDateStr)
        setMeals(data)
      } catch (e) {
        console.error('Error loading meals:', e)
        setMeals([])
      } finally {
        setLoadingMeals(false)
      }
    }

    load()
  }, [user, selectedDateStr, authLoading, isFutureDate])

  const sortedMeals = useMemo(() => {
    const order: Record<string, number> = { breakfast: 1, lunch: 2, dinner: 3, snack: 4 }
    return [...meals].sort((a, b) => (order[a.type] || 99) - (order[b.type] || 99))
  }, [meals])

  const consumedMeals = useMemo(() => sortedMeals.filter((m) => m.consumed), [sortedMeals])

  const totals = useMemo(() => {
    const acc = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    for (const m of consumedMeals) {
      acc.calories += m.is_special_event && m.special_event_calories ? m.special_event_calories : m.calories
      acc.protein += m.protein
      acc.carbs += m.carbs
      acc.fat += m.fat
      acc.fiber += m.fiber
    }
    return acc
  }, [consumedMeals])

  const calorieTarget = profile?.calorie_target || 0
  // 計算百分比：consumed calories / targeted calories
  const progress = calorieTarget
    ? Math.round((totals.calories / calorieTarget) * 100)
    : 0
  
  // 判斷警告顏色：超過 5% 進度條轉橙色，超過 10% 數字也轉橙色
  const isProgressBarWarning = progress > 105  // 超過 5%
  const isPercentageTextWarning = progress > 110  // 超過 10%

  const dailyStats = useMemo(() => {
    return {
      totalCalories: totals.calories,
      targetCalories: calorieTarget || 0,
      totalProtein: Math.round(totals.protein),
      totalCarbs: Math.round(totals.carbs),
      totalFat: Math.round(totals.fat),
      totalFiber: Math.round(totals.fiber),
      recordedMeals: consumedMeals.length,
      totalMeals: sortedMeals.length || 4,
    }
  }, [totals, calorieTarget, consumedMeals.length, sortedMeals.length])

  const handlePreviousDay = () => {
    const date = new Date(selectedDateOnly)
    date.setDate(date.getDate() - 1)
    setSelectedDate(startOfDay(date))
  }

  const handleNextDay = () => {
    const date = new Date(selectedDateOnly)
    date.setDate(date.getDate() + 1)

    const nextDay = startOfDay(date)

    // 只有在下一天不是未來日期時才允許
    if (nextDay.getTime() <= todayOnly.getTime()) {
      setSelectedDate(nextDay)
    }
  }

  const loading = authLoading || loadingProfile || loadingMeals

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 pb-24">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white border-b px-4 py-3 flex items-center justify-between shadow-sm">
          <button onClick={() => router.push('/')} className="text-gray-600 hover:text-gray-900">
            ← 返回
          </button>
          <h1 className="text-lg font-semibold">歷史記錄</h1>
          <button
            type="button"
            onClick={() => setSelectedDate(todayOnly)}
            disabled={isToday}
            className={`px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors ${
              isToday ? 'invisible pointer-events-none' : ''
            }`}
          >
            今日
          </button>
        </header>

        <div className="max-w-2xl mx-auto p-4 space-y-4">
          {/* 日期選擇 - 簡化版 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
          >
            {/* 日期導航 */}
            <div className="flex items-center justify-between">
              {/* 上一天按鈕 */}
              <button
                onClick={handlePreviousDay}
                type="button"
                className="w-10 h-10 flex items-center justify-center text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <span className="text-xl">‹</span>
              </button>

              {/* 中間日期顯示 */}
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">
                    {selectedDateOnly.toLocaleDateString('zh-HK', {
                      month: 'long',
                      day: 'numeric',
                      weekday: 'short',
                    })}
                  </div>
                  <div className="text-sm text-gray-500">{selectedDateStr}</div>
                  <div className={`text-xs font-semibold mt-1 ${isToday ? 'text-primary-600' : 'invisible'}`}>今天</div>
                </div>

                {/* 日曆圖標按鈕 */}
                <div className="relative">
                  <input
                    type="date"
                    value={selectedDateStr}
                    max={todayStr}
                    onChange={(e) => setSelectedDate(startOfDay(parseLocalDateStr(e.target.value)))}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <button
                    type="button"
                    className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <span className="text-xl">📅</span>
                  </button>
                </div>
              </div>

              {/* 下一天按鈕 */}
              <button
                onClick={handleNextDay}
                type="button"
                disabled={isToday}
                className="w-10 h-10 flex items-center justify-center text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <span className="text-xl">›</span>
              </button>
            </div>
          </motion.div>

          {/* 當日統計 - 優化版 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-primary-100 rounded-2xl p-5 border border-primary-200 shadow-sm"
          >
            <h2 className="font-semibold text-gray-900 mb-3 text-sm">當日統計</h2>

            {/* 卡路里進度 - 緊湊版 */}
            <div className="mb-3">
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <span className="text-2xl font-bold text-gray-900">{dailyStats.totalCalories}</span>
                  <span className="text-gray-700 text-sm ml-1">/ {dailyStats.targetCalories || '--'}</span>
                  <span className="text-gray-600 text-xs ml-1">卡</span>
                </div>
                <div
                  className={`text-base font-bold ${
                    isPercentageTextWarning ? 'text-amber-700' : 'text-gray-700'
                  }`}
                >
                  {dailyStats.targetCalories ? progress : 0}%
                </div>
              </div>

              {/* 進度條 */}
              <div className="h-2 bg-white/50 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    isProgressBarWarning ? 'bg-amber-500' : 'bg-green-600'
                  }`}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>

            {/* 營養素統計 - 緊湊版 */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-white/60 backdrop-blur-sm rounded-lg p-2">
                <div className="text-xs text-gray-600">蛋白質</div>
                <div className="text-base font-bold text-gray-900">{dailyStats.totalProtein}g</div>
              </div>
              <div className="bg-white/60 backdrop-blur-sm rounded-lg p-2">
                <div className="text-xs text-gray-600">碳水</div>
                <div className="text-base font-bold text-gray-900">{dailyStats.totalCarbs}g</div>
              </div>
              <div className="bg-white/60 backdrop-blur-sm rounded-lg p-2">
                <div className="text-xs text-gray-600">脂肪</div>
                <div className="text-base font-bold text-gray-900">{dailyStats.totalFat}g</div>
              </div>
              <div className="bg-white/60 backdrop-blur-sm rounded-lg p-2">
                <div className="text-xs text-gray-600">纖維</div>
                <div className="text-base font-bold text-gray-900">{dailyStats.totalFiber}g</div>
              </div>
            </div>

            {/* 記錄狀態 - 更緊湊 */}
            <div className="mt-3 pt-3 border-t border-green-400/30 text-center">
              <div className="text-xs text-gray-700">
                已記錄 <span className="font-bold">{dailyStats.recordedMeals}</span> / {dailyStats.totalMeals} 餐
              </div>
            </div>
          </motion.div>

          {/* Meals list */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>🍽️</span>
              <span>餐單</span>
            </h2>

            {loading ? (
              <div className="py-8 text-center text-gray-500">載入中...</div>
            ) : sortedMeals.length === 0 ? (
              <div className="py-8 text-center text-gray-500">還沒有餐單</div>
            ) : (
              <div className="space-y-3">
                {sortedMeals.map((m) => {
                  const mealTypeName: Record<string, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '小食' }
                  const mealCalories = m.is_special_event && m.special_event_calories ? m.special_event_calories : m.calories
                  return (
                    <div
                      key={m.id}
                      className={`rounded-2xl p-3 border-2 ${
                        m.consumed ? 'border-primary-200 bg-primary-50' : 'border-gray-100 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-2xl">{m.emoji}</span>
                          <span className="font-semibold text-gray-900">{mealTypeName[m.type] || m.type}</span>
                          {m.is_adjusted && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">🔽 已調整</span>
                          )}
                          {m.is_special_event && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">🎉 特殊活動</span>
                          )}
                          {m.consumed ? (
                            <span className="text-xs bg-primary-200 text-primary-800 px-2 py-0.5 rounded-full">✓ 已記錄</span>
                          ) : (
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">未記錄</span>
                          )}
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-mono font-semibold text-gray-700">{mealCalories} 卡</div>
                          {m.is_special_event && m.special_event_calories && (
                            <div className="text-xs text-gray-400">(原本 {m.calories})</div>
                          )}
                        </div>
                      </div>

                      <ul className="space-y-2 text-xs">
                        {(m.foods || []).map((f: any) => (
                          <li key={f.id} className="bg-white rounded-lg p-2 border border-gray-100">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-primary-500">•</span>
                                <span className="font-medium text-gray-900">{f.name}</span>
                                <span className="text-gray-300">
                                  P{f.protein}g/ C{f.carbs}g/ F{f.fat}g
                                </span>
                              </div>
                              <span className="font-semibold text-gray-900 whitespace-nowrap">{f.calories}卡</span>
                            </div>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-gray-600">
                        <div className="bg-white rounded-lg p-2 border border-gray-100 text-center">🥩 {m.protein}g</div>
                        <div className="bg-white rounded-lg p-2 border border-gray-100 text-center">🍚 {m.carbs}g</div>
                        <div className="bg-white rounded-lg p-2 border border-gray-100 text-center">🧈 {m.fat}g</div>
                        <div className="bg-white rounded-lg p-2 border border-gray-100 text-center">🥬 {m.fiber}g</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>
        </div>

        <BottomNav />
      </div>
    </AuthGuard>
  )
}

