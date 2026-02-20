'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import AuthGuard from '@/components/AuthGuard'
import BottomNav from '@/components/BottomNav'
import { supabase } from '@/lib/supabase'
import { fetchMeals } from '@/lib/meals'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface UserData {
  currentCalories: number
  targetCalories: number
  remainingCalories: number
  currentNutrition: {
    protein: number
    carbs: number
    fat: number
    fiber: number
  }
  targetNutrition: {
    protein: number
    carbs: number
    fat: number
    fiber: number
  }
}

export default function CoachPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [lastRequestTime, setLastRequestTime] = useState<number>(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Gemini API 免费 tier 限制：每分钟 5 次请求（每 12 秒一次）
  const MIN_REQUEST_INTERVAL = 13000 // 13 秒（比 12 秒稍长，留出安全余量）
  
  const defaultUserData: UserData = {
    currentCalories: 0,
    targetCalories: 2000,
    remainingCalories: 2000,
    currentNutrition: { protein: 0, carbs: 0, fat: 0, fiber: 0 },
    targetNutrition: { protein: 150, carbs: 200, fat: 65, fiber: 25 },
  }
  const [userData, setUserData] = useState<UserData>(defaultUserData)
  const [userDataReady, setUserDataReady] = useState(false)

  // 從 Supabase 載入 profile + 當日 meals，計算 userData
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) {
          setUserData(defaultUserData)
          setUserDataReady(true)
          return
        }
        const today = new Date()
        const y = today.getFullYear()
        const m = String(today.getMonth() + 1).padStart(2, '0')
        const d = String(today.getDate()).padStart(2, '0')
        const todayStr = `${y}-${m}-${d}`
        const { data: profile } = await supabase
          .from('profiles')
          .select('calorie_target, protein_target, carbs_target, fat_target, fiber_target')
          .eq('id', user.id)
          .single()
        const meals = await fetchMeals(user.id, todayStr, todayStr)
        if (cancelled) return
        const consumed = meals.filter((m: any) => m.consumed)
        const currentCalories = consumed.reduce((sum: number, m: any) => sum + (m.is_special_event && m.special_event_calories ? m.special_event_calories : m.calories || 0), 0)
        const currentNutrition = consumed.reduce(
          (acc: { protein: number; carbs: number; fat: number; fiber: number }, m: any) => ({
            protein: acc.protein + (m.protein || 0),
            carbs: acc.carbs + (m.carbs || 0),
            fat: acc.fat + (m.fat || 0),
            fiber: acc.fiber + (m.fiber || 0),
          }),
          { protein: 0, carbs: 0, fat: 0, fiber: 0 }
        )
        const targetCalories = profile?.calorie_target ?? 2000
        const targetNutrition = {
          protein: profile?.protein_target ?? 150,
          carbs: profile?.carbs_target ?? 200,
          fat: profile?.fat_target ?? 65,
          fiber: profile?.fiber_target ?? 25,
        }
        setUserData({
          currentCalories,
          targetCalories,
          remainingCalories: Math.max(0, targetCalories - currentCalories),
          currentNutrition,
          targetNutrition,
        })
      } catch (e) {
        if (!cancelled) setUserData(defaultUserData)
      } finally {
        if (!cancelled) setUserDataReady(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // 從 localStorage 載入對話歷史；若無則顯示歡迎訊息
  const messagesLoadedRef = useRef(false)
  useEffect(() => {
    if (messagesLoadedRef.current) return
    messagesLoadedRef.current = true
    const stored = localStorage.getItem('seekmeal_coach_messages')
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Array<Omit<Message, 'timestamp'> & { timestamp: number }>
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })))
          return
        }
      } catch (e) {
        console.error('Failed to parse coach messages', e)
      }
    }
    setMessages([{
      id: '1',
      role: 'assistant',
      content: '你好！我係你嘅 AI 飲食教練 💬\n\n有咩可以幫到你？',
      timestamp: new Date(),
    }])
  }, [])

  // 持久化對話到 localStorage（取最近 50 則）
  useEffect(() => {
    if (messages.length === 0) return
    try {
      const toSave = messages.slice(-50).map((m) => ({ ...m, timestamp: m.timestamp.getTime() }))
      localStorage.setItem('seekmeal_coach_messages', JSON.stringify(toSave))
    } catch (e) {
      console.error('Failed to save coach messages', e)
    }
  }, [messages])
  
  // 自動滾動到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])
  
  // 發送訊息（可傳入快捷問題文字直接發送）
  const handleSend = async (quickMessage?: string) => {
    const textToSend = (quickMessage ?? input.trim()).trim()
    if (!textToSend || isTyping) return

    // 檢查請求間隔（避免觸發速率限制）
    const now = Date.now()
    const timeSinceLastRequest = now - lastRequestTime
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = Math.ceil((MIN_REQUEST_INTERVAL - timeSinceLastRequest) / 1000)
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `⚠️ 請稍候 ${waitTime} 秒後再發送\n\n免費版 Gemini API 限制：每 12 秒只能發送一次請求。`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
      return
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date()
    }
    if (!quickMessage) setInput('')
    setIsTyping(true)
    setLastRequestTime(now)

    setMessages(prev => [...prev, userMessage])

    const conversationHistory = [
      ...messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      })),
      { role: 'user' as const, content: textToSend }
    ]
    
    let errorData: any = {} // 在外部作用域定义，以便在 catch 块中使用
    
    try {
      const response = await fetch('/api/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          userData,
          conversationHistory
        })
      })
      
      if (!response.ok) {
        // 尝试获取详细的错误信息
        let errorDetails = 'API 請求失敗'
        try {
          errorData = await response.json()
          errorDetails = errorData.error || errorData.details || errorDetails
          console.error('API Error Response:', errorData)
          console.error('Error Status:', response.status)
          console.error('Error Code:', errorData.code)
          console.error('Is Rate Limit:', errorData.isRateLimit)
          console.error('Is Quota Exceeded:', errorData.isQuotaExceeded)
        } catch (e) {
          console.error('API Error Status:', response.status, response.statusText)
        }
        
        // 构建更详细的错误消息，包含配额信息
        let errorMsg = `${response.status}: ${errorDetails}`
        if (errorData.code) {
          errorMsg = `${errorMsg} [Code: ${errorData.code}]`
        }
        if (errorData.isQuotaExceeded) {
          errorMsg = `Daily quota exceeded: ${errorMsg}`
        }
        throw new Error(errorMsg)
      }
      
      const data = await response.json()
      
      if (!data.reply) {
        throw new Error('API 回應格式錯誤：缺少 reply 欄位')
      }
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply,
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, aiMessage])
    } catch (error) {
      console.error('Error:', error)
      
      // 提供更详细的错误信息
      let errorContent = '抱歉，出現錯誤。請稍後再試。'
      
      if (error instanceof Error) {
        const errorMsg = error.message
        
        // Only show "API Key 未設置" when server explicitly says so.
        // 500 can be many things (model not found, quota=0, etc).
        if (errorMsg.includes('api key not configured')) {
          errorContent = '❌ API Key 未設置\n\n請檢查：\n1. .env.local 文件是否存在\n2. GEMINI_API_KEY 是否正確設置\n3. 是否已重啟開發服務器（npm run dev）\n4. 前往 https://aistudio.google.com/app/apikey 獲取 API Key'
        } else if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
          errorContent = '❌ API Key 無效\n\n請檢查：\n1. API Key 是否正確\n2. API Key 是否已過期\n3. 前往 https://aistudio.google.com/app/apikey 檢查 API Key 狀態'
        } else if (
          errorMsg.includes('429') || 
          errorMsg.includes('rate limit') || 
          errorMsg.includes('quota') || 
          errorMsg.includes('RESOURCE_EXHAUSTED') || 
          errorMsg.includes('resource_exhausted') || 
          errorMsg.includes('Daily quota') || 
          errorMsg.includes('quota exceeded') ||
          errorMsg.includes('Rate limit exceeded')
        ) {
          // 檢查是否是配額問題（每日限制）還是速率限制（每分鐘限制）
          // 優先檢查 errorData 中的標誌
          const isQuotaIssue = errorData.isQuotaExceeded === true ||
                               errorMsg.includes('quota') || 
                               errorMsg.includes('Daily quota') || 
                               errorMsg.includes('RESOURCE_EXHAUSTED') ||
                               errorMsg.includes('quota exceeded')
          
          const isRateLimitIssue = errorData.isRateLimit === true &&
                                   !isQuotaIssue
          
          if (isQuotaIssue) {
            errorContent = '❌ API 每日配額已用完\n\n免費版 Gemini API 有每日請求限制。\n\n可能原因：\n1. 今日已達到免費配額上限\n2. API Key 的每日配額已用完\n3. 其他應用或服務也在使用同一個 API Key\n\n解決方法：\n1. 等待明天配額重置（通常是 UTC 時間 00:00）\n2. 前往 https://aistudio.google.com/app/apikey 檢查配額使用情況\n3. 考慮升級到付費計劃以獲得更高配額\n4. 檢查是否有其他應用在使用同一個 API Key\n\n參考：https://ai.google.dev/pricing'
          } else if (isRateLimitIssue) {
            errorContent = '⚠️ API 請求過於頻繁\n\n免費版 Gemini API 速率限制：\n• 每 12 秒只能發送 1 次請求\n• 每分鐘最多 5 次請求\n\n解決方法：\n1. 等待 12-15 秒後再試\n2. 不要快速連續發送消息\n3. 考慮升級 API 計劃以獲得更高限制\n\n參考：https://ai.google.dev/pricing'
          } else {
            // 默認顯示配額錯誤（因為 429 通常是配額問題）
            errorContent = '❌ API 配額或速率限制\n\n可能原因：\n1. 每日配額已用完\n2. 請求過於頻繁\n\n解決方法：\n1. 等待一段時間後再試\n2. 前往 https://aistudio.google.com/app/apikey 檢查配額\n3. 考慮升級 API 計劃\n\n參考：https://ai.google.dev/pricing'
          }
        } else if (errorMsg.includes('model is not found') || errorMsg.includes('not found for api version')) {
          errorContent = '❌ Gemini Model 不可用\n\n呢個通常代表：\n1. 你指定嘅 model 名稱喺當前 API 版本不可用\n2. 你個 Project / Key 未開通該 model\n\n建議：\n1. 先唔好自己填 model，交俾系統 fallback\n2. 或喺 AI Studio / Cloud Console 確認可用 model\n\n（請睇 server terminal 會顯示 tried model）'
        } else if (errorMsg.includes('Failed to get response')) {
          errorContent = '❌ API 連接失敗\n\n請檢查：\n1. 網絡連接\n2. 查看 server terminal 詳細錯誤（通常會係 quota 或 model 問題）'
        } else if (errorMsg.includes('500')) {
          errorContent = '❌ 伺服器錯誤（500）\n\n請打開 server terminal，貼出最新一段錯誤（會包含 status / model / quota 訊息），我幫你定位。'
        } else {
          errorContent = `❌ 錯誤：${errorMsg}\n\n請查看瀏覽器控制台（F12）獲取詳細信息。`
        }
      }
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsTyping(false)
    }
  }
  
  // 快捷問題（5～6 個，點擊直接發送）
  const quickQuestions = [
    '而家可以食咩？',
    '點樣增加蛋白質？',
    '點解體重冇變？',
    '外食點揀好？',
    '幾時食最好？',
    '明日餐單有咩建議？',
  ]

  const handleQuickQuestion = (question: string) => {
    handleSend(question)
  }
  
  // Enter 發送
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }
  
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 flex flex-col pb-16">
        {/* Header */}
        <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
          <button 
            onClick={() => router.back()} 
            className="text-gray-600 hover:text-gray-900 transition-colors"
            type="button"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold flex-1 text-center">AI 飲食教練</h1>
          <div className="w-6" /> {/* Spacer */}
        </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl w-full mx-auto pb-40">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              msg.role === 'user' 
                ? 'bg-primary-500 text-white' 
                : 'bg-white text-gray-800 shadow-sm border border-gray-100'
            }`}>
              {msg.role === 'assistant' && (
                <div className="text-xl mb-1">💬</div>
              )}
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {msg.content}
              </div>
              <div className={`text-xs mt-2 ${
                msg.role === 'user' ? 'text-primary-100' : 'text-gray-400'
              }`}>
                {msg.timestamp.toLocaleTimeString('zh-HK', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </div>
            </div>
          </motion.div>
        ))}
        
        {/* Typing Indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100">
              <div className="flex gap-1">
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                  className="w-2 h-2 bg-gray-400 rounded-full"
                />
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                  className="w-2 h-2 bg-gray-400 rounded-full"
                />
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                  className="w-2 h-2 bg-gray-400 rounded-full"
                />
              </div>
            </div>
          </motion.div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* 快捷問題（5～6 個，點擊直接發送） */}
      <div className="px-4 py-3 bg-white border-t max-w-2xl w-full mx-auto">
        <div className="flex gap-2 overflow-x-auto pb-2 flex-wrap justify-center">
          {quickQuestions.map((q) => (
            <button
              key={q}
              onClick={() => handleQuickQuestion(q)}
              disabled={isTyping}
              type="button"
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-sm whitespace-nowrap transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
      
        {/* Input (above bottom nav) */}
        <div className="fixed bottom-16 left-0 right-0 bg-white border-t px-4 py-3 shadow-lg">
          <div className="max-w-2xl mx-auto flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="輸入訊息..."
              rows={1}
              className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-primary-400 resize-none max-h-32"
              style={{ minHeight: '48px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              type="button"
              className="px-6 py-3 bg-primary-500 text-white rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-600 transition-colors font-medium shadow-md hover:shadow-lg"
            >
              發送
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    </AuthGuard>
  )
}
