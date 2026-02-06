'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Area, ComposedChart, ResponsiveContainer } from 'recharts'

const db = supabase as any
type WeightLogRow = { date: string; weight: number }

interface WeightPredictionChartProps {
  userId: string
  profile: any
}

export default function WeightPredictionChart({ userId, profile }: WeightPredictionChartProps) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [prediction, setPrediction] = useState<any>(null)
  
  const loadData = useCallback(async () => {
    try {
      // 1. 獲取過去 30 天體重記錄
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const { data: weightLogsRaw, error } = await db
        .from('weight_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('date', { ascending: true })
      
      if (error) throw error
      const weightLogs = (weightLogsRaw ?? []) as WeightLogRow[]
      
      if (!weightLogs.length) {
        // 沒有體重記錄
        setData([])
        setLoading(false)
        return
      }
      
      // 2. 計算預測
      const predictionData = calculatePrediction(weightLogs, profile)
      setPrediction(predictionData)
      
      // 計算目標體重
      let targetWeight = profile.target_weight
      if (!targetWeight && profile.goal && profile.weight) {
        const current = parseFloat(profile.weight)
        if (profile.goal === 'lose') {
          targetWeight = current * 0.9
        } else if (profile.goal === 'gain') {
          targetWeight = current * 1.1
        } else {
          targetWeight = current
        }
      }
      if (!targetWeight && weightLogs.length > 0) {
        targetWeight = Number(weightLogs[weightLogs.length - 1].weight)
      }
      
      // 3. 組合圖表數據
      const chartData = [
        // 實際記錄
        ...weightLogs.map((log: WeightLogRow) => ({
          date: new Date(log.date).toLocaleDateString('zh-HK', { month: 'short', day: 'numeric' }),
          actual: Number(log.weight),
          predicted: null,
          upperBound: null,
          lowerBound: null,
          target: targetWeight
        })),
        // 預測數據
        ...(predictionData?.predictions || []).map((p: any) => ({
          date: new Date(p.date).toLocaleDateString('zh-HK', { month: 'short', day: 'numeric' }),
          actual: null,
          predicted: p.weight,
          upperBound: p.upperBound,
          lowerBound: p.lowerBound,
          target: targetWeight
        }))
      ]
      
      setData(chartData)
      setLoading(false)
      
    } catch (error) {
      console.error('Error loading weight data:', error)
      setLoading(false)
    }
  }, [userId, profile])
  
  useEffect(() => {
    loadData()
  }, [loadData])
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">載入中...</div>
      </div>
    )
  }
  
  if (data.length === 0) {
    return (
      <div className="bg-gray-50 rounded-xl p-8 text-center">
        <span className="text-4xl mb-2 block">📊</span>
        <div className="text-gray-600 mb-2">暫無體重記錄</div>
        <div className="text-sm text-gray-500">
          請在設定中記錄你的體重
        </div>
      </div>
    )
  }
  
  const currentWeight = data.find(d => d.actual)?.actual || parseFloat(profile.weight) || 0
  // 計算目標體重：如果沒有 target_weight，根據 goal 估算
  let targetWeight = profile.target_weight
  if (!targetWeight && profile.goal && profile.weight) {
    const current = parseFloat(profile.weight)
    if (profile.goal === 'lose') {
      targetWeight = current * 0.9  // 減重 10%
    } else if (profile.goal === 'gain') {
      targetWeight = current * 1.1  // 增重 10%
    } else {
      targetWeight = current  // 維持
    }
  }
  if (!targetWeight) targetWeight = currentWeight  // 如果還是沒有，使用當前體重
  const remainingWeight = currentWeight - targetWeight
  
  return (
    <div className="space-y-4">
      {/* 摘要卡片 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 rounded-xl p-4 text-center">
          <div className="text-sm text-gray-600 mb-1">當前體重</div>
          <div className="text-2xl font-bold text-gray-900">
            {currentWeight.toFixed(1)} kg
          </div>
        </div>
        
        <div className="bg-green-50 rounded-xl p-4 text-center">
          <div className="text-sm text-gray-600 mb-1">目標體重</div>
          <div className="text-2xl font-bold text-gray-900">
            {targetWeight.toFixed(1)} kg
          </div>
        </div>
        
        <div className="bg-purple-50 rounded-xl p-4 text-center">
          <div className="text-sm text-gray-600 mb-1">還需減重</div>
          <div className="text-2xl font-bold text-gray-900">
            {remainingWeight > 0 ? remainingWeight.toFixed(1) : '0.0'} kg
          </div>
        </div>
      </div>
      
      {/* 預測信息 */}
      {prediction && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4">
          <div className="text-sm text-gray-700 mb-2">
            <span className="font-semibold">根據過去 7 天的進度：</span>
          </div>
          <ul className="space-y-1 text-sm text-gray-600 ml-4">
            <li>• 平均每天 {prediction.avgDailyDeficit > 0 ? '-' : '+'}{Math.abs(prediction.avgDailyDeficit)} 卡</li>
            <li>• 預計每週 {prediction.avgWeeklyLoss > 0 ? '-' : '+'}{Math.abs(prediction.avgWeeklyLoss).toFixed(2)} kg</li>
          </ul>
          
          {prediction.weeksToGoal && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-sm font-semibold text-gray-900 mb-1">
                💡 預測：
              </div>
              <div className="text-sm text-gray-700">
                按照目前進度，預計 <span className="font-bold text-primary-600">{prediction.weeksToGoal} 週</span> 後達成目標
                <span className="text-gray-500 ml-1">
                  ({new Date(prediction.goalDate).toLocaleDateString('zh-HK')})
                </span>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* 圖表 */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <div className="text-sm font-semibold text-gray-700 mb-4">
          體重走勢圖
        </div>
        
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12 }}
              stroke="#999"
            />
            <YAxis 
              domain={[
                Math.floor(Math.min(targetWeight - 2, currentWeight - 5)),
                Math.ceil(Math.max(targetWeight + 2, currentWeight + 2))
              ]}
              tick={{ fontSize: 12 }}
              stroke="#999"
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value: any) => value ? `${value.toFixed(1)} kg` : null}
            />
            <Legend 
              wrapperStyle={{ fontSize: '12px' }}
            />
            
            {/* 預測範圍（陰影） */}
            <Area
              type="monotone"
              dataKey="upperBound"
              stroke="none"
              fill="#93c5fd"
              fillOpacity={0.2}
              name="預測範圍"
            />
            <Area
              type="monotone"
              dataKey="lowerBound"
              stroke="none"
              fill="#93c5fd"
              fillOpacity={0.2}
            />
            
            {/* 目標線 */}
            <Line
              type="monotone"
              dataKey="target"
              stroke="#10b981"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="目標體重"
            />
            
            {/* 實際記錄 */}
            <Line 
              type="monotone" 
              dataKey="actual" 
              stroke="#2563eb" 
              strokeWidth={3}
              dot={{ r: 5, fill: '#2563eb' }}
              name="實際體重"
              connectNulls={false}
            />
            
            {/* 預測線 */}
            <Line 
              type="monotone" 
              dataKey="predicted" 
              stroke="#2563eb" 
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="預測體重"
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      
      {/* 加速建議 */}
      {prediction && prediction.weeksToGoal > 4 && (
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
          <div className="text-sm font-semibold text-gray-900 mb-2">
            💪 加速達標建議：
          </div>
          <ul className="space-y-1 text-sm text-gray-700 ml-4">
            <li>• 每天多走 3000 步 → 提前約 1 週</li>
            <li>• 減少 100 卡攝入 → 提前約 2 週</li>
            <li>• 增加運動 + 控制飲食 → 提前約 3 週</li>
          </ul>
        </div>
      )}
    </div>
  )
}

// 預測計算函數
function calculatePrediction(weightLogs: any[], profile: any) {
  // 1. 計算過去 7 天平均減重速度
  const recent7Days = weightLogs.slice(-7)
  
  if (recent7Days.length < 2) {
    return null
  }
  
  const firstWeight = parseFloat(recent7Days[0].weight)
  const lastWeight = parseFloat(recent7Days[recent7Days.length - 1].weight)
  const days = recent7Days.length - 1
  
  const avgDailyLoss = (firstWeight - lastWeight) / days
  const avgWeeklyLoss = avgDailyLoss * 7
  
  // 計算平均每日卡路里赤字
  const avgDailyDeficit = avgWeeklyLoss * 7700 / 7 // 7700 卡 = 1 kg
  
  // 2. 預測未來 12 週
  const predictions = []
  const currentWeight = lastWeight
  // 計算目標體重：如果沒有 target_weight，根據 goal 估算
  let targetWeight = profile.target_weight
  if (!targetWeight && profile.goal && profile.weight) {
    const current = parseFloat(profile.weight)
    if (profile.goal === 'lose') {
      targetWeight = current * 0.9  // 減重 10%
    } else if (profile.goal === 'gain') {
      targetWeight = current * 1.1  // 增重 10%
    } else {
      targetWeight = current  // 維持
    }
  }
  if (!targetWeight) targetWeight = currentWeight  // 如果還是沒有，使用當前體重
  
  let predictedWeight = currentWeight
  let weeksPassed = 0
  
  while (predictedWeight > targetWeight && weeksPassed < 12) {
    weeksPassed++
    
    // 應用衰減係數（代謝適應）
    const decayFactor = getDecayFactor(weeksPassed)
    const weeklyLoss = avgWeeklyLoss * decayFactor
    
    predictedWeight -= weeklyLoss
    predictedWeight = Math.max(predictedWeight, targetWeight)
    
    const predictionDate = new Date()
    predictionDate.setDate(predictionDate.getDate() + weeksPassed * 7)
    
    predictions.push({
      date: predictionDate.toISOString().split('T')[0],
      weight: predictedWeight,
      upperBound: Math.max(predictedWeight + weeklyLoss * 0.5, targetWeight), // 悲觀（減得慢）
      lowerBound: Math.max(predictedWeight - weeklyLoss * 0.5, targetWeight)  // 樂觀（減得快）
    })
  }
  
  // 3. 計算達標時間
  let weeksToGoal = null
  let goalDate = null
  
  if (avgWeeklyLoss > 0) {
    const remainingWeight = currentWeight - targetWeight
    weeksToGoal = Math.ceil(remainingWeight / avgWeeklyLoss)
    
    const goalDateObj = new Date()
    goalDateObj.setDate(goalDateObj.getDate() + weeksToGoal * 7)
    goalDate = goalDateObj.toISOString().split('T')[0]
  }
  
  return {
    avgDailyDeficit: Math.round(avgDailyDeficit),
    avgWeeklyLoss,
    predictions,
    weeksToGoal,
    goalDate
  }
}

// 衰減係數（模擬代謝適應）
function getDecayFactor(weeks: number): number {
  if (weeks <= 4) return 1.0
  if (weeks <= 8) return 0.9
  if (weeks <= 12) return 0.8
  return 0.7
}
