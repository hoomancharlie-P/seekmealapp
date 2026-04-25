'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/hooks/useAuth'
import { fetchMeals } from '@/lib/meals'
import { triggerTravelModeActivation, triggerTravelModeUpdate } from './api-trigger'

// 滾輪式顯示不同國家的食物名稱組件
function FoodNameRotator({ destination }: { destination: string }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  
  // 根據目的地選擇對應的食物列表
  const getFoodNames = (dest: string): string[] => {
    const lower = dest.toLowerCase()
    
    if (lower.includes('日本') || lower.includes('japan')) {
      return ['日式拉麵', '壽司', '天婦羅', '丼飯', '章魚燒', '大阪燒']
    } else if (lower.includes('韓國') || lower.includes('korea')) {
      return ['韓式烤肉', '泡菜鍋', '石鍋拌飯', '韓式炸雞', '海鮮煎餅', '人參雞湯']
    } else if (lower.includes('泰國') || lower.includes('thailand')) {
      return ['泰式炒河粉', '綠咖哩', '冬陰功湯', '芒果糯米飯', '泰式酸辣湯', '泰式炒飯']
    } else if (lower.includes('台灣') || lower.includes('taiwan')) {
      return ['滷肉飯', '牛肉麵', '小籠包', '珍珠奶茶', '蚵仔煎', '鹽酥雞']
    } else if (lower.includes('英國') || lower.includes('uk') || lower.includes('britain')) {
      return ['英式早餐', '炸魚薯條', '牧羊人派', '約克郡布丁', '司康餅', '英式下午茶']
    } else if (lower.includes('美國') || lower.includes('usa') || lower.includes('america')) {
      return ['美式漢堡', 'BBQ 烤肉', '美式鬆餅', '紐約披薩', '美式炸雞', '蘋果派']
    } else if (lower.includes('印度') || lower.includes('india')) {
      return ['印度咖哩', '烤餅', '印度烤雞', '扁豆咖哩', '印度奶茶', '印度炒飯']
    } else if (lower.includes('馬來西亞') || lower.includes('malaysia')) {
      return ['椰漿飯', '沙爹', '叻沙', '炒粿條', '肉骨茶', '馬來西亞炒飯']
    } else {
      // 通用食物列表
      return ['當地特色菜', '傳統料理', '經典美食', '招牌菜式', '人氣美食', '必試料理']
    }
  }
  
  const foodNames = getFoodNames(destination)
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % foodNames.length)
    }, 2000) // 每2秒切換一次
    
    return () => clearInterval(interval)
  }, [foodNames.length])
  
  return (
    <div className="h-12 mb-4 flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.p
          key={currentIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5 }}
          className="text-gray-600 text-lg font-medium"
        >
          {foodNames[currentIndex]}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}

function TravelWaitingPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [status, setStatus] = useState('🌍 旅遊餐單生成中...')
  const [stage, setStage] = useState<'initializing' | 'activating' | 'generating' | 'completed' | 'error'>('initializing')
  const [checkCount, setCheckCount] = useState(0)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const maxChecks = 120 // 最多檢查120次（約120秒）
  const [apiTriggered, setApiTriggered] = useState(false)
  const [apiCallStartTime, setApiCallStartTime] = useState<number | null>(null)
  
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const destination = searchParams.get('destination')
  const action = searchParams.get('action') || 'activate' // 'activate' 或 'update'
  const cuisine = searchParams.get('cuisine') || ''
  
  // 觸發 API 調用的 useEffect（只執行一次）
  useEffect(() => {
    // 如果沒有必要參數，顯示錯誤並提供返回按鈕
    if (!startDate || !endDate) {
      console.log('⚠️ Missing required parameters')
      setStage('error')
      setError('缺少必要參數，請返回設定頁面重新操作')
      return
    }
    
    // 如果認證還在加載，顯示初始狀態
    if (authLoading) {
      setStage('initializing')
      setStatus('正在載入...')
      return
    }
    
    // 如果用戶還沒加載完成，等待
    if (!user) {
      console.log('⏳ Waiting for user authentication...')
      setStage('initializing')
      setStatus('正在驗證用戶身份...')
      return
    }
    
    // 觸發 API 調用（只在第一次載入時觸發）
    if (!apiTriggered) {
      setApiTriggered(true)
      setStage('activating')
      setStatus('正在啟動旅遊模式...')
      setApiCallStartTime(Date.now())
      
      // 延遲一點時間確保頁面已渲染，然後觸發 API
      setTimeout(async () => {
        try {
          const detectCuisine = (dest: string): string => {
            const lower = dest.toLowerCase()
            if (lower.includes('日本') || lower.includes('japan')) return 'japanese'
            if (lower.includes('韓國') || lower.includes('korea')) return 'korean'
            if (lower.includes('泰國') || lower.includes('thailand')) return 'thai'
            if (lower.includes('台灣') || lower.includes('taiwan')) return 'taiwanese'
            if (lower.includes('英國') || lower.includes('uk') || lower.includes('britain')) return 'british'
            if (lower.includes('美國') || lower.includes('usa') || lower.includes('america')) return 'western'
            if (lower.includes('印度') || lower.includes('india')) return 'indian'
            return 'general'
          }
          
          const finalCuisine = cuisine || detectCuisine(destination || '')
          
          console.log('🚀 Starting API call...', { action, destination, startDate, endDate, finalCuisine })
          
          let result
          if (action === 'update') {
            result = await triggerTravelModeUpdate(destination || '', startDate, endDate, finalCuisine)
          } else {
            result = await triggerTravelModeActivation(destination || '', startDate, endDate, finalCuisine)
          }
          
          console.log('✅ API call triggered successfully', result)
          
          // 如果是未來旅程，跳轉到未來旅程頁面
          if (result.futureTravel) {
            setStage('completed')
            setStatus('✅ 旅遊模式已啟動（未來旅程）')
            setTimeout(() => {
              router.push(`/travel-future?days=${result.daysUntilStart}&destination=${encodeURIComponent(destination || '')}`)
            }, 2000)
            return
          }
          
          // 正常旅程，開始生成餐單
          setStage('generating')
          setStatus('✅ 旅遊模式已啟動，正在生成餐單...')
          
          // 確保 apiCallStartTime 已設置（用於後續餐單檢查）
          if (!apiCallStartTime) {
            setApiCallStartTime(Date.now())
          }
        } catch (error: any) {
          console.error('❌ Error triggering API:', error)
          setStage('error')
          
          // 清除 apiCallStartTime，因為 API 調用失敗了
          setApiCallStartTime(null)
          
          // 檢查是否是網絡錯誤
          let errorMessage = error.message || '啟動失敗，請重試'
          if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError') || error.name === 'TypeError') {
            errorMessage = '網絡連接失敗，請檢查網絡連接後重試'
          } else if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
            errorMessage = '認證失敗，請重新登入'
          } else if (error.message?.includes('500') || error.message?.includes('Internal Server Error')) {
            errorMessage = '服務器錯誤，請稍後重試'
          } else if (error.message?.includes('餐單生成')) {
            errorMessage = '餐單生成失敗，請稍後重試'
          }
          
          setError(`啟動失敗：${errorMessage}。請檢查網絡連接或稍後重試。`)
          setStatus(`啟動失敗：${errorMessage}`)
          // 不自動跳轉，讓用戶查看錯誤並選擇操作
        }
      }, 300) // 減少延遲時間，讓 API 更快觸發
    }
  }, [user, authLoading, startDate, endDate, destination, router, apiTriggered, action, cuisine])
  
  // 檢查餐單生成狀態的 useEffect（在 API 觸發後開始檢查）
  useEffect(() => {
    if (!user || !startDate || !endDate) {
      return
    }
    
    // 如果 API 還沒觸發，或者還在啟動階段，等待
    if (!apiTriggered || stage !== 'generating') {
      return
    }
    
    // 如果已經出錯或完成，不繼續檢查（斷言以通過 TS 比較，stage 可能因閉包而與外層不同）
    const s = stage as 'generating' | 'error' | 'completed'
    if (s === 'error' || s === 'completed') {
      return
    }
    
    // 如果沒有 apiCallStartTime，說明 API 調用可能失敗了，不開始檢查
    if (!apiCallStartTime) {
      console.warn('⚠️ No apiCallStartTime, API call may have failed')
      return
    }
    
    let intervalId: ReturnType<typeof setInterval> | null = null
    let isDone = false
    let currentCheckCount = 0
    let lastMealCount = 0
    let failureCount = 0
    const maxFailures = 5 // 最多連續失敗5次
    
    const checkMealsGenerated = async () => {
      if (isDone) return true
      
      currentCheckCount++
      setCheckCount(currentCheckCount)
      
      try {
        // 檢查是否有旅遊餐單已生成
        const meals = await fetchMeals(user.id, startDate, endDate)
        
        // 檢查是否有旅遊餐單（通過檢查餐單日期範圍和數量）
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        
        // 計算應該有多少天的餐單
        const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
        const expectedMealsPerDay = 4 // 每天4餐
        const expectedTotalMeals = daysDiff * expectedMealsPerDay
        
        // 檢查是否有足夠的餐單（只檢查在 API 調用之後生成的餐單）
        const travelMeals = meals.filter(m => {
          const mealDate = new Date(m.date)
          mealDate.setHours(0, 0, 0, 0)
          // 檢查日期範圍
          if (mealDate < start || mealDate > end) return false
          // 如果 API 調用開始時間存在，只檢查之後生成的餐單
          if (apiCallStartTime) {
            const mealCreatedAt = m.created_at ? new Date(m.created_at).getTime() : 0
            // 允許10秒誤差（考慮時區和處理時間）
            return mealCreatedAt >= apiCallStartTime - 10000
          }
          // 如果沒有開始時間，檢查是否有 is_travel_meal 標記（如果數據庫支持）
          // 或者檢查所有在日期範圍內的餐單
          return true
        })
        
        console.log(`🔍 Checking meals: found ${travelMeals.length}, expected ~${expectedTotalMeals}`)
        
        // 如果餐單數量沒有增加，增加失敗計數
        // 但只有在檢查了足夠次數後才開始計數失敗（給 API 一些時間開始生成）
        if (currentCheckCount > 15) { // 等待至少15秒後才開始檢查是否卡住
          if (travelMeals.length === lastMealCount && travelMeals.length === 0) {
            // 如果一直沒有餐單生成，增加失敗計數
            failureCount++
            if (failureCount >= maxFailures) {
              console.warn('⚠️ Meal generation seems stuck, no meals found after multiple checks')
              // 設置錯誤狀態，但繼續檢查（可能只是慢）
              if (failureCount >= maxFailures * 2) {
                // 如果失敗次數過多，停止檢查並顯示錯誤
                isDone = true
                setStage('error')
                setError('餐單生成時間過長，可能出現問題。您可以稍後在主頁查看，或返回設定頁面重試。')
                setStatus('生成時間過長')
                if (intervalId) clearInterval(intervalId)
                return true
              }
            }
          } else if (travelMeals.length > lastMealCount) {
            // 如果餐單數量增加了，重置失敗計數
            failureCount = 0
          }
        }
        lastMealCount = travelMeals.length
        
        if (travelMeals.length >= expectedTotalMeals * 0.8) {
          // 如果生成了至少80%的餐單，認為生成完成
          isDone = true
          setStage('completed')
          setStatus('✅ 旅遊餐單生成完成！')
          setProgress(100)
          if (intervalId) clearInterval(intervalId)
          setTimeout(() => {
            router.push(`/travel-completed?destination=${encodeURIComponent(destination || '')}`)
          }, 1500)
          return true
        }
        
        // 更新狀態顯示進度
        const currentProgress = Math.min(100, Math.round((travelMeals.length / expectedTotalMeals) * 100))
        setProgress(currentProgress)
        
        if (currentProgress > 0) {
          setStatus(`🌍 旅遊餐單生成中... (${currentProgress}%)`)
        } else {
          setStatus('🌍 旅遊餐單生成中...')
        }
        
        // 檢查是否超時
        if (currentCheckCount >= maxChecks) {
          // 超時，檢查是否有任何餐單生成
          if (travelMeals.length === 0) {
            // 如果完全沒有餐單，可能是 API 調用失敗了
            isDone = true
            setStage('error')
            setError('餐單生成超時，可能出現問題。請返回設定頁面重試，或稍後在主頁查看。')
            setStatus('生成超時')
          } else {
            // 如果有部分餐單，認為生成完成（可能部分失敗）
            isDone = true
            setStage('completed')
            setStatus('✅ 旅遊餐單生成完成！')
            setProgress(100)
          }
          if (intervalId) clearInterval(intervalId)
          return true
        }
        
        return false
      } catch (error: any) {
        console.error('❌ Error checking meals:', error)
        failureCount++
        if (failureCount >= maxFailures) {
          isDone = true
          setStage('error')
          setError('檢查餐單時發生錯誤，請返回設定頁面重試')
          setStatus('檢查失敗')
          if (intervalId) clearInterval(intervalId)
          return true
        }
        return false
      }
    }
    
    // 等待 API 觸發後再開始檢查（給 API 一些時間開始生成餐單）
    const startCheckingTimeout = setTimeout(() => {
      // 檢查 stage 是否仍然是 'generating'（如果已經出錯，不開始檢查）
      if (stage !== 'generating') {
        console.log('⚠️ Stage is not generating, skipping meal check')
        return
      }
      
      // 立即檢查一次
      checkMealsGenerated()
      
      // 每1秒檢查一次
      intervalId = setInterval(async () => {
        // 再次檢查 stage（可能在檢查過程中出錯了）
        if (stage !== 'generating') {
          if (intervalId) clearInterval(intervalId)
          return
        }
        const done = await checkMealsGenerated()
        if (done && intervalId) {
          clearInterval(intervalId)
        }
      }, 1000)
    }, 3000) // 等待3秒讓 API 開始處理
    
    return () => {
      if (intervalId) clearInterval(intervalId)
      clearTimeout(startCheckingTimeout)
    }
  }, [user, startDate, endDate, destination, router, maxChecks, apiTriggered, stage, apiCallStartTime])
  
  // 如果認證還在加載，顯示等待頁面的加載畫面（不使用 AuthGuard，避免雙重加載）
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-20 h-20 mx-auto mb-6"
          >
            <div className="w-full h-full rounded-full border-4 border-blue-200 border-t-blue-600"></div>
          </motion.div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">🌍 旅遊餐單生成中…</h1>
          <p className="text-gray-600 mb-4 text-lg">正在載入...</p>
          {destination && (
            <p className="text-sm text-gray-500 mb-6">目的地：{destination}</p>
          )}
        </motion.div>
      </div>
    )
  }
  
  // 如果沒有用戶，顯示錯誤（不使用 AuthGuard，避免跳轉）
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center"
        >
          <div className="w-20 h-20 mx-auto mb-6 text-6xl">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">發生錯誤</h1>
          <p className="text-gray-600 mb-4 text-lg">用戶未登入，請先登入</p>
          <button
            onClick={() => router.push('/auth')}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            前往登入
          </button>
        </motion.div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center"
        >
          {/* 加載動畫 */}
          {stage !== 'error' && stage !== 'completed' && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-20 h-20 mx-auto mb-6"
            >
              <div className="w-full h-full rounded-full border-4 border-blue-200 border-t-blue-600"></div>
            </motion.div>
          )}
          
          {/* 完成圖標 */}
          {stage === 'completed' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="w-20 h-20 mx-auto mb-6 text-6xl"
            >
              ✅
            </motion.div>
          )}
          
          {/* 錯誤圖標 */}
          {stage === 'error' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-20 h-20 mx-auto mb-6 text-6xl"
            >
              ⚠️
            </motion.div>
          )}
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {stage === 'completed' ? '✅ 完成' : stage === 'error' ? '發生錯誤' : '🌍 旅遊餐單生成中…'}
          </h1>
          
          {/* 滾輪式顯示不同國家的食物名稱（在啟動中或生成中時顯示） */}
          {(stage === 'activating' || stage === 'generating') && (
            <FoodNameRotator destination={destination || ''} />
          )}
          
          {/* 其他狀態顯示 */}
          {stage !== 'activating' && stage !== 'generating' && (
            <p className="text-gray-600 mb-4 text-lg">
              {status}
            </p>
          )}
          
          {/* 進度條 */}
          {stage === 'generating' && progress > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full"
              />
            </div>
          )}
          
          {destination && (
            <p className="text-sm text-gray-500 mb-6">
              目的地：{destination}
            </p>
          )}
          
          {/* 錯誤訊息和操作按鈕 */}
          {stage === 'error' && error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-left">
              <p className="text-red-800 text-sm mb-4">{error}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // 重試：重新觸發 API 調用
                    setApiTriggered(false)
                    setStage('initializing')
                    setError(null)
                    setStatus('正在重試...')
                  }}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  重試
                </button>
                <button
                  onClick={() => {
                    // 清除可能的錯誤狀態，確保設定頁面正確顯示
                    router.push('/settings?travelModeActivationFailed=true')
                  }}
                  className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  返回設定
                </button>
              </div>
            </div>
          )}
          
          {/* 加載動畫點 */}
          {stage !== 'error' && stage !== 'completed' && (
            <div className="flex justify-center gap-2 mb-4">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                className="w-2 h-2 bg-blue-600 rounded-full"
              />
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                className="w-2 h-2 bg-blue-600 rounded-full"
              />
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                className="w-2 h-2 bg-blue-600 rounded-full"
              />
            </div>
          )}
          
          {stage !== 'error' && (
            <p className="text-xs text-gray-400 mt-6">
              {stage === 'initializing' && '正在初始化...'}
              {stage === 'activating' && '正在啟動旅遊模式...'}
              {stage === 'generating' && '請稍候，正在為您生成專屬旅遊餐單...'}
              {stage === 'completed' && '餐單已生成完成！'}
            </p>
          )}
        </motion.div>
      </div>
  )
}

export default function TravelWaitingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">載入中...</div>}>
      <TravelWaitingPageContent />
    </Suspense>
  )
}
