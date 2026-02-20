'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const db = supabase as any
import { motion } from 'framer-motion'
import BottomNav from '@/components/BottomNav'
import WeightPredictionChart from '@/components/WeightPredictionChart'
import WeeklyProgressChart from '@/components/WeeklyProgressChart'
import AuthGuard from '@/components/AuthGuard'
import { useStreak } from '@/app/hooks/useStreak'
import toast from 'react-hot-toast'
import { fetchMeals } from '@/lib/meals'
import type { Profile } from '@/types/database'

function startOfDay(d: Date) {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

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

export default function ProgressPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'progress' | 'history'>('progress')
  
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  
  // 歷史記錄相關狀態
  const todayOnly = useMemo(() => startOfDay(new Date()), [])
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()))
  const [meals, setMeals] = useState<any[]>([])
  const [loadingMeals, setLoadingMeals] = useState(true)
  const [historyViewMode, setHistoryViewMode] = useState<'date' | 'list'>('date')
  const [last30DaysSummary, setLast30DaysSummary] = useState<Array<{
    date: string
    dateDisplay: string
    calories: number
    protein: number
    caloriePct: number
    proteinPct: number
    isToday: boolean
  }>>([])
  const [loading30Days, setLoading30Days] = useState(false)
  
  // 體重記錄相關狀態
  const [showWeightModal, setShowWeightModal] = useState(false)
  const [weightInput, setWeightInput] = useState('')
  const [weightDate, setWeightDate] = useState(new Date().toISOString().split('T')[0])
  const [savingWeight, setSavingWeight] = useState(false)
  // 體重摘要（當前、目標、本週變化）
  const [weightSummary, setWeightSummary] = useState<{
    current: number | null
    target: number | null
    weekAgo: number | null
  }>({ current: null, target: null, weekAgo: null })
  
  const { currentStreak: streak, longestStreak, loading: streakLoading } = useStreak(
    user?.id
  )
  
  const selectedDateOnly = useMemo(() => startOfDay(selectedDate), [selectedDate])
  const isToday = useMemo(() => selectedDateOnly.getTime() === todayOnly.getTime(), [selectedDateOnly, todayOnly])
  const isFutureDate = useMemo(() => selectedDateOnly.getTime() > todayOnly.getTime(), [selectedDateOnly, todayOnly])
  const selectedDateStr = useMemo(() => toLocalDateStr(selectedDateOnly), [selectedDateOnly])
  const todayStr = useMemo(() => toLocalDateStr(todayOnly), [todayOnly])
  
  useEffect(() => {
    loadData()
  }, [])

  // 載入體重摘要（當前、目標、一週前）
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    const run = async () => {
      try {
        const todayStr = toLocalDateStr(new Date())
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        const weekAgoStr = toLocalDateStr(weekAgo)
        const { data: logs, error } = await db
          .from('weight_logs')
          .select('date, weight')
          .eq('user_id', user.id)
          .lte('date', todayStr)
          .order('date', { ascending: false })
          .limit(31)
        if (cancelled || error) return
        const list = (logs ?? []) as { date: string; weight: number }[]
        const current = list.length > 0 ? Number(list[0].weight) : null
        const weekAgoLog = list.find((l) => l.date <= weekAgoStr)
        const weekAgoWeight = weekAgoLog ? Number(weekAgoLog.weight) : null
        let target: number | null = profile?.target_weight ?? null
        if (!target && profile?.goal && profile?.weight) {
          const w = Number(profile.weight)
          if (profile.goal === 'lose') target = w * 0.9
          else if (profile.goal === 'gain') target = w * 1.1
          else target = w
        }
        if (!target && current != null) target = current
        if (!cancelled) setWeightSummary({ current, target, weekAgo: weekAgoWeight })
      } catch (e) {
        if (!cancelled) setWeightSummary({ current: null, target: null, weekAgo: null })
      }
    }
    run()
    return () => { cancelled = true }
  }, [user?.id, profile?.target_weight, profile?.goal, profile?.weight])

  // 載入最近 30 天每日摘要（歷史列表用）
  useEffect(() => {
    if (!user?.id || !profile) return
    let cancelled = false
    setLoading30Days(true)
    const run = async () => {
      try {
        const today = new Date()
        const from = new Date(today)
        from.setDate(from.getDate() - 30)
        const fromStr = toLocalDateStr(from)
        const todayStr = toLocalDateStr(today)
        const { data: rows, error } = await db
          .from('meals')
          .select('date, calories, protein, consumed')
          .eq('user_id', user.id)
          .gte('date', fromStr)
          .lte('date', todayStr)
        if (cancelled || error) return
        const byDate: Record<string, { calories: number; protein: number }> = {}
        ;(rows ?? []).forEach((r: { date: string; calories: number; protein: number; consumed: boolean }) => {
          if (!r.consumed) return
          if (!byDate[r.date]) byDate[r.date] = { calories: 0, protein: 0 }
          byDate[r.date].calories += r.calories ?? 0
          byDate[r.date].protein += r.protein ?? 0
        })
        const targetCal = profile.calorie_target || 2000
        const targetPro = profile.protein_target || 0
        const summary: typeof last30DaysSummary = []
        for (let d = new Date(today); summary.length < 30; d.setDate(d.getDate() - 1)) {
          const dateStr = toLocalDateStr(d)
          const tot = byDate[dateStr] ?? { calories: 0, protein: 0 }
          const caloriePct = targetCal > 0 ? Math.round((tot.calories / targetCal) * 100) : 0
          const proteinPct = targetPro > 0 ? Math.round((tot.protein / targetPro) * 100) : 0
          summary.push({
            date: dateStr,
            dateDisplay: d.toLocaleDateString('zh-HK', { month: 'short', day: 'numeric', weekday: 'short' }),
            calories: tot.calories,
            protein: tot.protein,
            caloriePct,
            proteinPct,
            isToday: dateStr === todayStr,
          })
        }
        if (!cancelled) setLast30DaysSummary(summary)
      } catch (e) {
        if (!cancelled) setLast30DaysSummary([])
      } finally {
        if (!cancelled) setLoading30Days(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [user?.id, profile?.calorie_target, profile?.protein_target])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      
      setUser(user)
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      
      setProfile(profile)
      setLoading(false)
      
    } catch (error) {
      console.error('Error loading data:', error)
      setLoading(false)
    }
  }
  
  // 載入歷史餐單
  useEffect(() => {
    if (!user || isFutureDate) {
      setMeals([])
      setLoadingMeals(false)
      return
    }
    
    const loadMeals = async () => {
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
    
    loadMeals()
  }, [user, selectedDateStr, isFutureDate])
  
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
  const progress = calorieTarget
    ? Math.round((totals.calories / calorieTarget) * 100)
    : 0
  
  const isProgressBarWarning = progress > 105
  const isPercentageTextWarning = progress > 110
  
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
    if (nextDay.getTime() <= todayOnly.getTime()) {
      setSelectedDate(nextDay)
    }
  }
  
  // 記錄體重
  const handleSaveWeight = async () => {
    const weight = parseFloat(weightInput)
    if (!weight || weight <= 0 || weight > 500) {
      toast.error('請輸入有效的體重（0-500 kg）')
      return
    }
    
    if (!user) return
    
    setSavingWeight(true)
    try {
      const { error } = await db
        .from('weight_logs')
        .upsert({
          user_id: user.id,
          weight: weight,
          date: weightDate
        }, {
          onConflict: 'user_id,date'
        })
      
      if (error) throw error
      
      toast.success('體重記錄已保存')
      setShowWeightModal(false)
      setWeightInput('')
      setWeightDate(new Date().toISOString().split('T')[0])
      
      window.location.reload()
      
    } catch (error) {
      console.error('Error saving weight:', error)
      toast.error('保存失敗，請重試')
    } finally {
      setSavingWeight(false)
    }
  }
  
  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-bounce">😺</div>
            <p className="text-gray-600">載入中...</p>
          </div>
        </div>
      </AuthGuard>
    )
  }
  
  if (!user || !profile) {
    return null
  }
  
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 pb-24">
        <div className="max-w-4xl mx-auto p-6">
          {/* Header - 左：標題；右：🔥 連續X天（僅 streak >= 1 顯示） */}
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">📊 進度追蹤</h1>
            <p className="text-gray-600 text-sm">查看你的體重變化和歷史記錄</p>
          </div>

          {/* 1. Streak 計數器 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-baseline gap-2">
                {streakLoading ? (
                  <span className="text-gray-400">載入中...</span>
                ) : (
                  <>
                    <span className="text-4xl font-bold text-gray-900">{streak}</span>
                    <span className="text-xl text-gray-600">天</span>
                  </>
                )}
                <span className="text-lg text-gray-500 ml-2">連續記錄</span>
              </div>
              {!streakLoading && longestStreak > 0 && (
                <div className="text-sm text-gray-500">
                  最長記錄 <span className="font-semibold text-gray-700">{longestStreak}</span> 天
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">當天有記錄任何一餐即算一天</p>
          </div>
          
          {/* Tab 切換 */}
          <div className="bg-white rounded-2xl p-1 shadow-sm border border-gray-100 mb-6 flex gap-2">
            <button
              onClick={() => setActiveTab('progress')}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all ${
                activeTab === 'progress'
                  ? 'bg-primary-500 text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              體重進度
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all ${
                activeTab === 'history'
                  ? 'bg-primary-500 text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              歷史記錄
            </button>
          </div>
          
          {/* Tab 內容 */}
          {activeTab === 'progress' ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* 2. 本週進度圖表 */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <WeeklyProgressChart userId={user.id} profile={profile} />
              </div>

              {/* 3. 體重追蹤：當前/目標/差值/本週變化 + 記錄 + 圖表 */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">⚖️ 體重追蹤</h3>
                  <button
                    onClick={() => setShowWeightModal(true)}
                    className="px-4 py-2 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 text-sm"
                  >
                    📝 記錄
                  </button>
                </div>
                {(weightSummary.current != null || weightSummary.target != null) && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <div className="text-xs text-gray-500">當前體重</div>
                      <div className="text-lg font-bold text-gray-900">
                        {weightSummary.current != null ? `${weightSummary.current} kg` : '--'}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <div className="text-xs text-gray-500">目標體重</div>
                      <div className="text-lg font-bold text-gray-900">
                        {weightSummary.target != null ? `${weightSummary.target} kg` : '--'}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <div className="text-xs text-gray-500">差值</div>
                      <div className="text-lg font-bold text-gray-900">
                        {weightSummary.current != null && weightSummary.target != null
                          ? `${(weightSummary.current - weightSummary.target) >= 0 ? '+' : ''}${(weightSummary.current - weightSummary.target).toFixed(1)} kg`
                          : '--'}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <div className="text-xs text-gray-500">本週變化</div>
                      <div className="text-lg font-bold text-gray-900">
                        {weightSummary.current != null && weightSummary.weekAgo != null
                          ? `${(weightSummary.current - weightSummary.weekAgo) >= 0 ? '+' : ''}${(weightSummary.current - weightSummary.weekAgo).toFixed(1)} kg`
                          : '--'}
                      </div>
                    </div>
                  </div>
                )}
                {weightSummary.current == null && weightSummary.target == null && (
                  <p className="text-sm text-gray-500 mb-4">記錄體重後可查看當前與目標、本週變化</p>
                )}
              </div>
              
              {/* 體重 30 天趨勢與預測 */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <WeightPredictionChart
                  userId={user.id}
                  profile={profile}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* 4. 歷史記錄：過去約 30 天，可切換日曆/列表 */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-900">📅 歷史記錄</h3>
                  <div className="flex rounded-xl overflow-hidden border border-gray-200">
                    <button
                      type="button"
                      onClick={() => setHistoryViewMode('date')}
                      className={`px-3 py-2 text-sm font-medium ${historyViewMode === 'date' ? 'bg-primary-500 text-white' : 'bg-gray-50 text-gray-600'}`}
                    >
                      日曆
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryViewMode('list')}
                      className={`px-3 py-2 text-sm font-medium ${historyViewMode === 'list' ? 'bg-primary-500 text-white' : 'bg-gray-50 text-gray-600'}`}
                    >
                      列表
                    </button>
                  </div>
                </div>
                {historyViewMode === 'list' ? (
                  <div className="max-h-80 overflow-y-auto space-y-2">
                    {loading30Days ? (
                      <div className="py-6 text-center text-gray-500 text-sm">載入中...</div>
                    ) : (
                      last30DaysSummary.map((day) => (
                        <button
                          key={day.date}
                          type="button"
                          onClick={() => {
                            setSelectedDate(startOfDay(parseLocalDateStr(day.date)))
                            setHistoryViewMode('date')
                          }}
                          className={`w-full flex items-center justify-between rounded-xl p-3 border text-left transition-colors ${
                            day.date === selectedDateStr
                              ? 'border-primary-300 bg-primary-50'
                              : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
                          }`}
                        >
                          <span className="text-sm font-medium text-gray-900">
                            {day.dateDisplay}
                            {day.isToday && <span className="ml-1 text-primary-600 text-xs">今天</span>}
                          </span>
                          <span className="text-xs text-gray-600">
                            卡 {day.caloriePct}% · 蛋白 {day.proteinPct}%
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              {historyViewMode === 'date' && (
              <>
              {/* 日期選擇 */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <button
                    onClick={handlePreviousDay}
                    type="button"
                    className="w-10 h-10 flex items-center justify-center text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <span className="text-xl">‹</span>
                  </button>
                  
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
                      {isToday && (
                        <div className="text-xs font-semibold mt-1 text-primary-600">今天</div>
                      )}
                    </div>
                    
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
                  
                  <button
                    onClick={handleNextDay}
                    type="button"
                    disabled={isToday}
                    className="w-10 h-10 flex items-center justify-center text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="text-xl">›</span>
                  </button>
                </div>
              </div>
              
              {/* 當日統計 */}
              <div className="bg-primary-100 rounded-2xl p-5 border border-primary-200 shadow-sm">
                <h2 className="font-semibold text-gray-900 mb-3 text-sm">當日統計</h2>
                
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
                  
                  <div className="h-2 bg-white/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isProgressBarWarning ? 'bg-amber-500' : 'bg-green-600'
                      }`}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                </div>
                
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
                
                <div className="mt-3 pt-3 border-t border-green-400/30 text-center">
                  <div className="text-xs text-gray-700">
                    已記錄 <span className="font-bold">{dailyStats.recordedMeals}</span> / {dailyStats.totalMeals} 餐
                  </div>
                </div>
              </div>
              
              {/* 餐單列表 */}
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span>🍽️</span>
                  <span>餐單</span>
                </h2>
                
                {loadingMeals ? (
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
              </div>
              </>
              )}
            </motion.div>
          )}
        </div>
        
        {/* 體重記錄彈窗 */}
        {showWeightModal && (
          <div 
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center sm:justify-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowWeightModal(false)
              }
            }}
          >
            <motion.div
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">
                  ⚖️ 記錄體重
                </h3>
                <button
                  onClick={() => setShowWeightModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    體重（kg）：
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="500"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    placeholder="例如：65.5"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400 text-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    日期：
                  </label>
                  <input
                    type="date"
                    value={weightDate}
                    onChange={(e) => setWeightDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowWeightModal(false)}
                  className="flex-1 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveWeight}
                  disabled={savingWeight || !weightInput}
                  className="flex-1 py-3 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingWeight ? '保存中...' : '保存'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
        
        <BottomNav />
      </div>
    </AuthGuard>
  )
}
