'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts'

const db = supabase as any

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface WeeklyProgressChartProps {
  userId: string
  profile: any
}

export default function WeeklyProgressChart({ userId, profile }: WeeklyProgressChartProps) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)
  const [selectedDay, setSelectedDay] = useState<any>(null)

  useEffect(() => {
    loadData()
  }, [userId])

  const loadData = async () => {
    try {
      const today = new Date()
      const dayOfWeek = today.getDay()

      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - dayOfWeek)
      weekStart.setHours(0, 0, 0, 0)

      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)

      const weekStartStr = toLocalDateStr(weekStart)
      const weekEndStr = toLocalDateStr(weekEnd)
      const todayStr = toLocalDateStr(today)

      const { data: meals, error } = await db
        .from('meals')
        .select('date, calories, protein, consumed')
        .eq('user_id', userId)
        .gte('date', weekStartStr)
        .lte('date', weekEndStr)

      if (error) throw error

      const days = ['日', '一', '二', '三', '四', '五', '六']
      const chartData: any[] = []
      const proteinTarget = profile?.protein_target ?? 0

      for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart)
        date.setDate(weekStart.getDate() + i)
        const dateStr = toLocalDateStr(date)

        type MealRow = { date: string; consumed: boolean; calories?: number; protein?: number }
        const dayMeals = (meals as MealRow[] | null)?.filter(m => m.date === dateStr && m.consumed) || []
        const totalCalories = dayMeals.reduce((sum: number, m: MealRow) => sum + (m.calories || 0), 0)
        const totalProtein = dayMeals.reduce((sum: number, m: MealRow) => sum + (m.protein || 0), 0)
        const target = profile?.calorie_target || 2000
        const percentage = totalCalories > 0 ? (totalCalories / target) * 100 : 0
        const proteinPercentage = proteinTarget > 0 && totalProtein > 0
          ? (totalProtein / proteinTarget) * 100
          : 0

        chartData.push({
          day: days[i],
          date: dateStr,
          dateDisplay: `${date.getMonth() + 1}/${date.getDate()}`,
          calories: totalCalories,
          target,
          percentage,
          totalProtein,
          proteinTarget,
          proteinPercentage,
          isToday: dateStr === todayStr,
          meals: dayMeals,
        })
      }

      const completedDays = chartData.filter(d => d.calories > 0)
      const targetDays = completedDays.filter(d => d.percentage >= 95 && d.percentage <= 105)
      const avgCalories = completedDays.length > 0
        ? Math.round(completedDays.reduce((sum, d) => sum + d.calories, 0) / completedDays.length)
        : 0
      const avgProtein = completedDays.length > 0 && proteinTarget > 0
        ? Math.round(completedDays.reduce((sum, d) => sum + d.totalProtein, 0) / completedDays.length)
        : 0

      setStats({
        targetDays: targetDays.length,
        totalDays: completedDays.length,
        targetRate: completedDays.length > 0 ? Math.round((targetDays.length / completedDays.length) * 100) : 0,
        avgCalories,
        avgProtein,
        proteinTarget,
      })
      setData(chartData)
    } catch (error) {
      console.error('Error loading weekly data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getBarColor = (percentage: number) => {
    if (percentage === 0) return '#e5e7eb'
    if (percentage >= 95 && percentage <= 105) return '#10b981'
    if ((percentage >= 90 && percentage < 95) || (percentage > 105 && percentage <= 110)) return '#f59e0b'
    return '#ef4444'
  }

  const handleBarClick = (payload: any) => {
    if (payload?.calories > 0) setSelectedDay(payload)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">載入中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {stats && stats.totalDays > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <div className="text-sm text-gray-600 mb-1">達標天數</div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.targetDays}/{stats.totalDays}
            </div>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <div className="text-sm text-gray-600 mb-1">平均卡路里</div>
            <div className="text-2xl font-bold text-gray-900">{stats.avgCalories}</div>
            <div className="text-xs text-gray-500">卡/天</div>
          </div>
          {stats.proteinTarget > 0 && (
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <div className="text-sm text-gray-600 mb-1">平均蛋白質</div>
              <div className="text-2xl font-bold text-gray-900">{stats.avgProtein}g</div>
              <div className="text-xs text-gray-500">/ {stats.proteinTarget}g 目標</div>
            </div>
          )}
          <div className="bg-purple-50 rounded-xl p-4 text-center">
            <div className="text-sm text-gray-600 mb-1">達標率</div>
            <div className="text-2xl font-bold text-gray-900">{stats.targetRate}%</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <div className="text-sm font-semibold text-gray-700 mb-4">本週卡路里進度</div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#999" />
            <YAxis
              domain={[0, (profile?.calorie_target || 2000) * 1.2]}
              tick={{ fontSize: 12 }}
              stroke="#999"
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload?.length) {
                  const d = payload[0].payload
                  return (
                    <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
                      <div className="text-sm font-semibold text-gray-900 mb-1">
                        星期{d.day} ({d.dateDisplay})
                      </div>
                      {d.calories > 0 ? (
                        <>
                          <div className="text-sm text-gray-700">卡路里：{d.calories} / {d.target} 卡（{d.percentage.toFixed(0)}%）</div>
                          {d.proteinTarget > 0 && (
                            <div className="text-sm text-gray-700">蛋白質：{d.totalProtein} / {d.proteinTarget}g（{d.proteinPercentage.toFixed(0)}%）</div>
                          )}
                          <div className="text-xs text-gray-500 mt-1">點擊查看詳情</div>
                        </>
                      ) : (
                        <div className="text-sm text-gray-500">未記錄</div>
                      )}
                    </div>
                  )
                }
                return null
              }}
            />
            <ReferenceLine
              y={profile?.calorie_target || 2000}
              stroke="#6b7280"
              strokeDasharray="5 5"
              strokeWidth={2}
            />
            <Bar dataKey="calories" radius={[8, 8, 0, 0]} cursor="pointer">
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getBarColor(entry.percentage)}
                  opacity={entry.isToday ? 1 : 0.8}
                  onClick={() => handleBarClick(entry)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-500 text-center">
            圖中灰色虛線為每日卡路里目標（{profile?.calorie_target || 2000} 卡）
          </p>
          <div className="flex items-center justify-center gap-4 text-xs flex-wrap">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded" />
              <span className="text-gray-600">達標 (95-105%)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-yellow-500 rounded" />
              <span className="text-gray-600">接近 (90-110%)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-500 rounded" />
              <span className="text-gray-600">偏離</span>
            </div>
          </div>
        </div>
      </div>

      {selectedDay && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">星期{selectedDay.day}</h3>
                <p className="text-sm text-gray-600">{selectedDay.dateDisplay}</p>
              </div>
              <button onClick={() => setSelectedDay(null)} className="text-gray-400 hover:text-gray-600 text-2xl">
                ×
              </button>
            </div>
            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">總攝入：</span>
                <span className="text-lg font-bold text-gray-900">{selectedDay.calories} 卡</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">目標：</span>
                <span className="text-lg font-semibold text-gray-700">{selectedDay.target} 卡</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">狀態：</span>
                <span
                  className={`text-sm font-semibold ${
                    selectedDay.percentage >= 95 && selectedDay.percentage <= 105
                      ? 'text-green-600'
                      : selectedDay.percentage >= 90 && selectedDay.percentage <= 110
                        ? 'text-yellow-600'
                        : 'text-red-600'
                  }`}
                >
                  {selectedDay.percentage >= 95 && selectedDay.percentage <= 105
                    ? '✓ 達標'
                    : selectedDay.percentage >= 90 && selectedDay.percentage <= 110
                      ? '⚠ 接近目標'
                      : '✗ 偏離目標'}{' '}
                  ({selectedDay.calories - selectedDay.target >= 0 ? '+' : ''}
                  {selectedDay.calories - selectedDay.target} 卡)
                </span>
              </div>
            </div>
            <button
              onClick={() => setSelectedDay(null)}
              className="w-full py-2 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200"
            >
              關閉
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
