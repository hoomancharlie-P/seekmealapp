'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/hooks/useAuth'
import AuthGuard from '@/components/AuthGuard'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import type { Profile } from '@/types/database'
import BottomNav from '@/components/BottomNav'

type Gender = 'male' | 'female'
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active'
type Goal = 'lose' | 'maintain' | 'gain'

export default function SettingsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, signOut } = useAuth()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 編輯模式
  const [isEditing, setIsEditing] = useState(false)

  // 表單數據
  const [username, setUsername] = useState('')
  const [gender, setGender] = useState<Gender>('male')
  const [age, setAge] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('light')
  const [goal, setGoal] = useState<Goal>('maintain')
  
  // 飲食偏好
  const [editDietaryRestrictions, setEditDietaryRestrictions] = useState<string[]>([])
  const [editDietaryHabit, setEditDietaryHabit] = useState<'none' | 'vegetarian' | 'low_carb' | 'keto'>('none')
  const [editAllergies, setEditAllergies] = useState<string>('')
  
  // 旅遊模式
  const [travelMode, setTravelMode] = useState(false)
  const [travelPlan, setTravelPlan] = useState<any>(null)
  const [showTravelModal, setShowTravelModal] = useState(false)
  const [showEditTravelModal, setShowEditTravelModal] = useState(false)
  const [showModifyOverlapDialog, setShowModifyOverlapDialog] = useState(false)
  const [modifyOverlapDates, setModifyOverlapDates] = useState<string[]>([])
  const [pendingUpdateParams, setPendingUpdateParams] = useState<{ destination: string; startDate: string; endDate: string; cuisine: string } | null>(null)
  const [deactivatingTravel, setDeactivatingTravel] = useState(false)
  const [activatingTravel, setActivatingTravel] = useState(false)
  const [travelForm, setTravelForm] = useState({
    destination: '',
    cuisine: '',
    startDate: '',
    endDate: '',
    days: 7
  })
  

  // 不吃的食物選項
  const restrictionOptions = [
    { value: 'beef', label: '牛肉', emoji: '🐮' },
    { value: 'pork', label: '豬肉', emoji: '🐷' },
    { value: 'chicken', label: '雞肉', emoji: '🐔' },
    { value: 'seafood', label: '海鮮', emoji: '🦐' },
    { value: 'egg', label: '蛋類', emoji: '🥚' },
    { value: 'dairy', label: '奶類', emoji: '🥛' },
    { value: 'nuts', label: '堅果', emoji: '🥜' },
    { value: 'soy', label: '大豆製品', emoji: '🫘' }
  ]

  // 飲食習慣選項
  const habitOptions = [
    { value: 'none', label: '無特殊限制', description: '正常飲食' },
    { value: 'vegetarian', label: '素食', description: '不吃肉類' },
    { value: 'low_carb', label: '低碳水', description: '減少碳水化合物攝取' },
    { value: 'keto', label: '生酮飲食', description: '極低碳水、高脂肪' }
  ]

  // 讀取 profile
  useEffect(() => {
    if (!user) return

    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()

        if (error) throw error

        setProfile(data)
        setUsername(data.username || '')
        setEditDietaryRestrictions(data.dietary_restrictions || [])
        setEditDietaryHabit((data.dietary_habit as any) || 'none')
        setEditAllergies((data.allergies || []).join('、'))
      } catch (error) {
        console.error('Error fetching profile:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [user])
  
  // 檢查旅遊模式（等待用戶認證完成後再執行）
  useEffect(() => {
    if (!user) return // 等待用戶認證完成
    checkTravelMode()
  }, [user])
  
  // 當路由變化時重新檢查旅遊模式（用戶從其他頁面返回時）
  useEffect(() => {
    if (pathname === '/settings') {
      // 使用 setTimeout 確保在路由完全切換後再檢查
      const timer = setTimeout(() => {
        console.log('🔄 Route changed to /settings, checking travel mode...')
        checkTravelMode()
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [pathname])
  
  // 監聽 URL 參數變化（例如從 travel-future 返回時，或激活失敗時）
  useEffect(() => {
    if (pathname === '/settings') {
      const activationFailed = searchParams.get('travelModeActivationFailed')
      if (activationFailed === 'true') {
        console.log('🔄 Travel mode activation failed, clearing state...')
        // 立即清除狀態，確保不顯示「進行中」
        setTravelMode(false)
        setTravelPlan(null)
        // 清除 URL 參數
        window.history.replaceState({}, '', '/settings')
        // 強制重新檢查一次，確保狀態正確
        setTimeout(() => {
          checkTravelMode()
        }, 100)
        return
      }
      console.log('🔄 Search params changed, checking travel mode...')
      const timer = setTimeout(() => {
        checkTravelMode()
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [searchParams, pathname])
  
  // 當頁面獲得焦點時重新檢查旅遊模式（用戶從其他頁面返回時）
  useEffect(() => {
    const handleFocus = () => {
      if (pathname === '/settings') {
        console.log('🔄 Page focused, checking travel mode...')
        checkTravelMode()
      }
    }
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && pathname === '/settings') {
        console.log('🔄 Page visible, checking travel mode...')
        checkTravelMode()
      }
    }
    
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [pathname])
  
  const checkTravelMode = async () => {
    try {
      console.log('🔍 Checking travel mode status...')
      // 確保有 session，並在請求中包含 token
      const { data: { session } } = await supabase.auth.getSession()
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      
      // 如果 session 存在，添加 Authorization header
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      
      const response = await fetch('/api/travel-mode', {
        credentials: 'include', // 確保 cookies 被發送
        headers
      })
      
      if (!response.ok) {
        console.error('❌ Travel mode check failed:', response.status)
        setTravelMode(false)
        setTravelPlan(null)
        return
      }
      
      const data = await response.json()
      console.log('📊 Travel mode check result:', { active: data.active, hasPlan: !!data.plan })
      
      if (data.active && data.plan) {
        console.log('✅ Travel mode is active, updating state')
        setTravelMode(true)
        setTravelPlan(data.plan)
      } else {
        console.log('ℹ️ Travel mode is not active, clearing state')
        // 確保狀態被正確清理
        setTravelMode(false)
        setTravelPlan(null)
      }
    } catch (error) {
      console.error('❌ Error checking travel mode:', error)
      // 發生錯誤時也清理狀態，確保用戶可以重新啟動
      setTravelMode(false)
      setTravelPlan(null)
    }
  }
  
  // 智能識別目的地對應的料理風格
  const detectCuisineFromDestination = (destination: string): string => {
    if (!destination) return 'general'
    
    const lower = destination.toLowerCase()
    
    // 城市映射表（優先匹配）
    const cityMap: Record<string, string> = {
      // 印尼
      '峇里': 'indonesian', '巴厘': 'indonesian', 'bali': 'indonesian',
      '雅加達': 'indonesian', 'jakarta': 'indonesian',
      
      // 印度城市
      '新德里': 'indian', 'new delhi': 'indian', 'delhi': 'indian',
      '孟買': 'indian', 'mumbai': 'indian', 'bombay': 'indian',
      '班加羅爾': 'indian', 'bangalore': 'indian',
      '加爾各答': 'indian', 'kolkata': 'indian', 'calcutta': 'indian',
      '清奈': 'indian', 'chennai': 'indian', 'madras': 'indian',
      '海得拉巴': 'indian', 'hyderabad': 'indian',
      '齋浦爾': 'indian', 'jaipur': 'indian',
      '果阿': 'indian', 'goa': 'indian',
      
      // 日本城市
      '東京': 'japanese', 'tokyo': 'japanese',
      '大阪': 'japanese', 'osaka': 'japanese',
      '京都': 'japanese', 'kyoto': 'japanese',
      '沖繩': 'japanese', 'okinawa': 'japanese',
      '北海道': 'japanese', 'hokkaido': 'japanese',
      
      // 韓國城市
      '首爾': 'korean', 'seoul': 'korean',
      '釜山': 'korean', 'busan': 'korean',
      
      // 泰國城市
      '曼谷': 'thai', 'bangkok': 'thai',
      '清邁': 'thai', 'chiang mai': 'thai',
      '布吉': 'thai', 'phuket': 'thai',
      
      // 台灣城市
      '台北': 'taiwanese', 'taipei': 'taiwanese',
      '台中': 'taiwanese', 'taichung': 'taiwanese',
      '高雄': 'taiwanese', 'kaohsiung': 'taiwanese',
      
      // 內地城市
      '北京': 'chinese', 'beijing': 'chinese', 'peking': 'chinese',
      '上海': 'chinese', 'shanghai': 'chinese',
      '廣州': 'chinese', 'guangzhou': 'chinese',
      '深圳': 'chinese', 'shenzhen': 'chinese',
      '成都': 'chinese', 'chengdu': 'chinese',
      '重慶': 'chinese', 'chongqing': 'chinese',
      '杭州': 'chinese', 'hangzhou': 'chinese',
      '南京': 'chinese', 'nanjing': 'chinese',
      '蘇州': 'chinese', 'suzhou': 'chinese',
      '西安': 'chinese', 'xian': 'chinese',
      
      // 馬來西亞城市
      '吉隆坡': 'malaysian', 'kuala lumpur': 'malaysian', 'kl': 'malaysian',
      '檳城': 'malaysian', 'penang': 'malaysian',
      
      // 新加坡
      '新加坡': 'singaporean', 'singapore': 'singaporean',
      
      // 澳洲城市
      '悉尼': 'australian', 'sydney': 'australian',
      '墨爾本': 'australian', 'melbourne': 'australian',
      '布里斯班': 'australian', 'brisbane': 'australian',
      '珀斯': 'australian', 'perth': 'australian',
      
      // 歐洲城市
      '巴黎': 'french', 'paris': 'french',
      '羅馬': 'italian', 'rome': 'italian',
      '米蘭': 'italian', 'milan': 'italian',
      '威尼斯': 'italian', 'venice': 'italian',
      '佛羅倫薩': 'italian', 'florence': 'italian',
      '那不勒斯': 'italian', 'naples': 'italian',
      '馬德里': 'spanish', 'madrid': 'spanish',
      '巴塞羅那': 'spanish', 'barcelona': 'spanish',
      '塞維利亞': 'spanish', 'seville': 'spanish',
      '柏林': 'german', 'berlin': 'german',
      '慕尼黑': 'german', 'munich': 'german',
      '漢堡': 'german', 'hamburg': 'german',
      '法蘭克福': 'german', 'frankfurt': 'german',
      '倫敦': 'british', 'london': 'british',
      '愛丁堡': 'british', 'edinburgh': 'british',
      '曼徹斯特': 'british', 'manchester': 'british',
      '阿姆斯特丹': 'dutch', 'amsterdam': 'dutch',
      '鹿特丹': 'dutch', 'rotterdam': 'dutch',
      '維也納': 'austrian', 'vienna': 'austrian',
      '薩爾茨堡': 'austrian', 'salzburg': 'austrian',
      '蘇黎世': 'swiss', 'zurich': 'swiss',
      '日內瓦': 'swiss', 'geneva': 'swiss',
      '布魯塞爾': 'western', 'brussels': 'western',
      '里斯本': 'western', 'lisbon': 'western',
      '波爾圖': 'western', 'porto': 'western',
      '哥本哈根': 'western', 'copenhagen': 'western',
      '斯德哥爾摩': 'western', 'stockholm': 'western',
      '奧斯陸': 'western', 'oslo': 'western',
      '赫爾辛基': 'western', 'helsinki': 'western',
      
      // 美國城市
      '紐約': 'western', 'new york': 'western', 'nyc': 'western',
      '洛杉磯': 'western', 'los angeles': 'western', 'la': 'western',
      '三藩市': 'western', 'san francisco': 'western', 'sf': 'western',
      '芝加哥': 'western', 'chicago': 'western',
      '波士頓': 'western', 'boston': 'western',
      
      // 加拿大城市
      '多倫多': 'western', 'toronto': 'western',
      '溫哥華': 'western', 'vancouver': 'western',
      '蒙特利爾': 'western', 'montreal': 'western',
    }
    
    // 先檢查城市映射
    for (const [city, cuisine] of Object.entries(cityMap)) {
      if (lower.includes(city.toLowerCase())) {
        return cuisine
      }
    }
    
    // 國家關鍵字匹配
    if (lower.includes('日本') || lower.includes('japan')) return 'japanese'
    if (lower.includes('韓國') || lower.includes('korea')) return 'korean'
    if (lower.includes('泰國') || lower.includes('thailand')) return 'thai'
    if (lower.includes('台灣') || lower.includes('taiwan')) return 'taiwanese'
    if (lower.includes('馬來') || lower.includes('malaysia')) return 'malaysian'
    if (lower.includes('新加坡') || lower.includes('singapore')) return 'singaporean'
    if (lower.includes('印尼') || lower.includes('indonesia')) return 'indonesian'
    if (lower.includes('印度') || lower.includes('india')) return 'indian'
    if (lower.includes('中國') || lower.includes('china') || lower.includes('內地')) return 'chinese'
    
    // 歐洲國家
    if (lower.includes('法國') || lower.includes('france')) return 'french'
    if (lower.includes('意大利') || lower.includes('italy') || lower.includes('義大利') || lower.includes('italia')) return 'italian'
    if (lower.includes('西班牙') || lower.includes('spain') || lower.includes('españa')) return 'spanish'
    if (lower.includes('德國') || lower.includes('germany') || lower.includes('deutschland')) return 'german'
    if (lower.includes('英國') || lower.includes('uk') || lower.includes('united kingdom') || lower.includes('england')) return 'british'
    if (lower.includes('荷蘭') || lower.includes('netherlands') || lower.includes('holland')) return 'dutch'
    if (lower.includes('比利時') || lower.includes('belgium')) return 'western'
    if (lower.includes('瑞士') || lower.includes('switzerland')) return 'swiss'
    if (lower.includes('奧地利') || lower.includes('austria')) return 'austrian'
    if (lower.includes('葡萄牙') || lower.includes('portugal')) return 'western'
    if (lower.includes('丹麥') || lower.includes('denmark')) return 'western'
    if (lower.includes('瑞典') || lower.includes('sweden')) return 'western'
    if (lower.includes('挪威') || lower.includes('norway')) return 'western'
    if (lower.includes('芬蘭') || lower.includes('finland')) return 'western'
    if (lower.includes('希臘') || lower.includes('greece')) return 'western'
    if (lower.includes('歐洲') || lower.includes('europe')) return 'western'
    
    // 其他
    if (lower.includes('澳洲') || lower.includes('australia')) return 'australian'
    if (lower.includes('美國') || lower.includes('usa') || lower.includes('america') || lower.includes('united states')) return 'western'
    if (lower.includes('加拿大') || lower.includes('canada')) return 'western'
    
    // 默認
    return 'general'
  }
  
  const handleActivateTravel = async () => {
    if (!travelForm.destination || !travelForm.startDate || !travelForm.endDate) {
      toast('請填寫目的地及旅遊日期')
      return
    }

    const start = new Date(travelForm.startDate)
    const end = new Date(travelForm.endDate)
    if (end < start) {
      toast.error('回程日期不能早於出發日期')
      return
    }
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    if (days > 30) {
      toast.error('旅遊天數不能超過 30 天')
      return
    }

    const { data: existingPlan } = await supabase
      .from('travel_plans')
      .select('*')
      .eq('user_id', user!.id)
      .eq('active', true)
      .maybeSingle()

    if (existingPlan) {
      toast.error('已有進行中的旅遊計劃，請先結束再啟動新計劃')
      return
    }

    // 立即顯示「正在生成餐單」提示，再發送 API
    setActivatingTravel(true)
    await new Promise((r) => setTimeout(r, 0))

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      const cuisine = travelForm.cuisine || detectCuisineFromDestination(travelForm.destination) || 'general'

      const response = await fetch('/api/travel-mode', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          destination: travelForm.destination,
          cuisine,
          startDate: travelForm.startDate,
          endDate: travelForm.endDate
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || '啟動失敗')
      }

      setTravelMode(true)
      setTravelPlan(data.plan)
      setShowTravelModal(false)
      setTravelForm({ destination: '', cuisine: '', startDate: '', endDate: '', days: 7 })

      window.location.href = '/'
    } catch (error: any) {
      console.error('Error activating travel mode:', error)
      toast.error(error?.message || '啟動失敗，請重試')
      setActivatingTravel(false)
    }
  }
  
  const handleEditTravel = () => {
    if (!travelPlan) return
    const start = new Date(travelPlan.start_date)
    const end = new Date(travelPlan.end_date)
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    setTravelForm({
      destination: travelPlan.destination,
      cuisine: travelPlan.cuisine || '',
      startDate: travelPlan.start_date,
      endDate: travelPlan.end_date,
      days
    })
    setShowEditTravelModal(true)
  }

  const handleCloseEditTravelModal = () => {
    if (travelPlan) {
      const start = new Date(travelPlan.start_date)
      const end = new Date(travelPlan.end_date)
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
      setTravelForm({
        destination: travelPlan.destination,
        cuisine: travelPlan.cuisine || '',
        startDate: travelPlan.start_date,
        endDate: travelPlan.end_date,
        days
      })
    }
    setShowEditTravelModal(false)
  }
  
  /** 呼叫 PUT /api/travel-mode 重新生成旅遊餐單，完成後導向主頁（取代已移除的 travel-waiting 頁面） */
  const callPutTravelModeAndGoHome = async (
    destination: string,
    startDate: string,
    endDate: string,
    finalCuisine: string,
    keepExistingMeals: boolean
  ) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      const response = await fetch('/api/travel-mode', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          destination,
          startDate,
          endDate,
          cuisine: finalCuisine || 'general',
          keepExistingMeals
        })
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || '更新旅遊餐單失敗')
      router.push('/')
    } catch (e: any) {
      console.error('PUT travel-mode error:', e)
      toast.error(e?.message || '更新旅遊餐單失敗，請重試')
    }
  }

  const handleUpdateTravel = async () => {
    if (!travelForm.destination || !travelForm.startDate || !travelForm.endDate) {
      toast('請填寫目的地和旅遊日期')
      return
    }
    
    const destination = travelForm.destination
    const startDate = travelForm.startDate
    const endDate = travelForm.endDate
    let finalCuisine = travelForm.cuisine
    if (!finalCuisine) {
      finalCuisine = detectCuisineFromDestination(travelForm.destination)
    }
    
    // 若有現有旅程，計算新舊日期重疊；重疊且已有餐單的日期可讓用戶選擇保留或重新生成
    if (travelPlan?.start_date && travelPlan?.end_date) {
      const oldStart = new Date(travelPlan.start_date)
      const oldEnd = new Date(travelPlan.end_date)
      const newStart = new Date(startDate)
      const newEnd = new Date(endDate)
      const overlap: string[] = []
      const overlapStart = new Date(Math.max(oldStart.getTime(), newStart.getTime()))
      const overlapEnd = new Date(Math.min(oldEnd.getTime(), newEnd.getTime()))
      for (let d = new Date(overlapStart); d <= overlapEnd; d.setDate(d.getDate() + 1)) {
        overlap.push(d.toISOString().split('T')[0])
      }
      if (overlap.length > 0) {
        setModifyOverlapDates(overlap)
        setPendingUpdateParams({ destination, startDate, endDate, cuisine: finalCuisine })
        setShowModifyOverlapDialog(true)
        return
      }
    }
    
    await callPutTravelModeAndGoHome(destination, startDate, endDate, finalCuisine, false)
  }
  
  const handleDeactivateTravel = async () => {
    const confirmed = window.confirm('確定要結束旅遊模式嗎？結束後，未來的旅遊餐單將被刪除，並恢復為預設餐單。')
    if (!confirmed) return
    
    setDeactivatingTravel(true)
    try {
      console.log('✈️ Deactivating travel mode...')
      
      // 確保有 session，並在請求中包含 token
      const { data: { session } } = await supabase.auth.getSession()
      
      const headers: HeadersInit = {}
      
      // 如果 session 存在，添加 Authorization header
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      
      const response = await fetch('/api/travel-mode', {
        method: 'DELETE',
        headers,
        credentials: 'include' // 確保 cookies 被發送
      })
      
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error)
      }
      
      console.log('✅ Travel mode deactivated')
      
      setTravelMode(false)
      setTravelPlan(null)
      
      // 跳轉到主頁，讓主頁自動刷新餐單
      router.push('/?travelModeDeactivated=true')
      
    } catch (error: any) {
      console.error('Error deactivating travel mode:', error)
      toast.error(`結束失敗：${error.message || '請重試'}`)
    } finally {
      setDeactivatingTravel(false)
    }
  }
  
  // 計算 TDEE
  const calculateTDEE = () => {
    const w = parseFloat(weight)
    const h = parseFloat(height)
    const a = parseInt(age)

    if (!w || !h || !a) return 0

    // BMR
    let bmr = 0
    if (gender === 'male') {
      bmr = 66 + 13.7 * w + 5 * h - 6.8 * a
    } else {
      bmr = 655 + 9.6 * w + 1.8 * h - 4.7 * a
    }

    // 活動係數
    const activityMultiplier = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
    }

    const tdee = bmr * activityMultiplier[activityLevel]

    // 目標調整
    const goalAdjustment = {
      lose: -500,
      maintain: 0,
      gain: 300,
    }

    // 4. 四捨五入至 50
    const calories = tdee + goalAdjustment[goal]
    return Math.round(calories / 50) * 50
  }

  // 計算營養素
  const calculateNutrition = (calories: number) => {
    let proteinRatio = 0.3
    let carbsRatio = 0.4
    let fatRatio = 0.3

    if (goal === 'lose') {
      proteinRatio = 0.35
      carbsRatio = 0.35
      fatRatio = 0.3
    } else if (goal === 'gain') {
      proteinRatio = 0.3
      carbsRatio = 0.45
      fatRatio = 0.25
    }

    return {
      protein: Math.round((calories * proteinRatio) / 4),
      carbs: Math.round((calories * carbsRatio) / 4),
      fat: Math.round((calories * fatRatio) / 9),
      fiber: 28,
    }
  }

  // 進入編輯模式
  const handleStartEdit = () => {
    // 旅遊模式進行中時不允許修改營養目標
    if (travelMode && travelPlan) {
      const today = new Date().toISOString().split('T')[0]
      if (today >= travelPlan.start_date && today <= travelPlan.end_date) {
        toast.error('旅遊模式進行中，無法修改營養目標。請先結束旅遊模式再修改。')
        return
      }
    }
    setIsEditing(true)
    if (profile) {
      setGender((profile.gender as Gender) || 'male')
      setAge(profile.age ? profile.age.toString() : '')
      setHeight(profile.height ? profile.height.toString() : '')
      setWeight(profile.weight ? profile.weight.toString() : '')
      setActivityLevel((profile.activity_level as ActivityLevel) || 'light')
      setGoal((profile.goal as Goal) || 'maintain')
      
      setEditDietaryRestrictions(profile.dietary_restrictions || [])
      setEditDietaryHabit((profile.dietary_habit as any) || 'none')
      setEditAllergies((profile.allergies || []).join('、'))
    }
  }

  // 取消編輯
  const handleCancelEdit = () => {
    setIsEditing(false)
  }

  // 保存用戶名
  const handleSaveUsername = async () => {
    if (!user) return

    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').update({ username }).eq('id', user.id)

      if (error) throw error

      // 更新本地 state
      if (profile) {
        setProfile({ ...profile, username })
      }

      toast.success('用戶名已更新')
    } catch (error) {
      console.error('Error updating username:', error)
      toast.error('更新失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  // 保存營養目標和飲食偏好
  const handleSaveTargets = async () => {
    if (!user || !profile) return

    // 旅遊模式進行中時不允許儲存（須先結束旅遊模式）
    if (travelMode && travelPlan) {
      const today = new Date().toISOString().split('T')[0]
      if (today >= travelPlan.start_date && today <= travelPlan.end_date) {
        toast.error('旅遊模式進行中，無法修改營養目標。請先結束旅遊模式再修改。')
        return
      }
    }

    const calorieTarget = calculateTDEE()
    if (calorieTarget === 0) {
      toast('請填寫所有資料')
      return
    }

    const nutrition = calculateNutrition(calorieTarget)
    
    // 解析過敏食物
    const allergyList = editAllergies
      .split(/[,，、]/)
      .map(a => a.trim())
      .filter(a => a.length > 0)

    setSaving(true)
    try {
      // 1. 計算變化
      const calorieChange = Math.abs(calorieTarget - profile.calorie_target)
      const calorieChangePercent = profile.calorie_target > 0 
        ? (calorieChange / profile.calorie_target) * 100 
        : 100
      
      // 檢查飲食偏好是否改變
      const restrictionsChanged = 
        JSON.stringify(editDietaryRestrictions.sort()) !== 
        JSON.stringify((profile.dietary_restrictions || []).sort())
      
      const habitChanged = editDietaryHabit !== (profile.dietary_habit || 'none')
      
      const allergiesChanged = 
        JSON.stringify(allergyList.sort()) !== 
        JSON.stringify((profile.allergies || []).sort())
      
      const preferencesChanged = restrictionsChanged || habitChanged || allergiesChanged
      
      console.log('📊 Changes:', {
        calorieChangePercent: calorieChangePercent.toFixed(1) + '%',
        preferencesChanged,
        restrictionsChanged,
        habitChanged,
        allergiesChanged
      })

      // 定義保存操作（只保存 profile）
      const saveProfileOnly = async () => {
        const { error } = await supabase
          .from('profiles')
          .update({
            calorie_target: calorieTarget,
            protein_target: nutrition.protein,
            carbs_target: nutrition.carbs,
            fat_target: nutrition.fat,
            fiber_target: nutrition.fiber,
            dietary_restrictions: editDietaryRestrictions,
            dietary_habit: editDietaryHabit,
            allergies: allergyList,
            gender: gender,
            age: parseInt(age) || null,
            height: parseFloat(height) || null,
            weight: parseFloat(weight) || null,
            activity_level: activityLevel,
            goal: goal
          })
          .eq('id', user.id)

        if (error) throw error

        // 更新本地 state
        const { data: newProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        
        if (newProfile) setProfile(newProfile)
        setIsEditing(false)
        toast.success('設定已更新！')
        router.push('/')
      }

      // 定義保存並重新生成操作（旅遊模式下改為 PUT travel-mode 重新生成旅遊餐單，不刪餐單）
      const saveAndRegenerate = async () => {
        // 先保存 profile
        const { error } = await supabase
          .from('profiles')
          .update({
            calorie_target: calorieTarget,
            protein_target: nutrition.protein,
            carbs_target: nutrition.carbs,
            fat_target: nutrition.fat,
            fiber_target: nutrition.fiber,
            dietary_restrictions: editDietaryRestrictions,
            dietary_habit: editDietaryHabit,
            allergies: allergyList,
            gender: gender,
            age: parseInt(age) || null,
            height: parseFloat(height) || null,
            weight: parseFloat(weight) || null,
            activity_level: activityLevel,
            goal: goal
          })
          .eq('id', user.id)

        if (error) throw error

        // 旅遊模式：用新營養目標呼叫 PUT 重新生成旅遊餐單，完成後導向主頁
        if (travelMode && travelPlan?.start_date && travelPlan?.end_date && travelPlan?.destination) {
          await callPutTravelModeAndGoHome(
            travelPlan.destination,
            travelPlan.start_date,
            travelPlan.end_date,
            travelPlan.cuisine || 'general',
            false
          )
          return
        }

        // 非旅遊模式：刪除今天未記錄 + 未來餐單，跳轉主頁由主頁生成預設餐單
        const today = new Date().toISOString().split('T')[0]
        const { error: deleteError } = await supabase
          .from('meals')
          .delete()
          .eq('user_id', user.id)
          .or(`date.gt.${today},and(date.eq.${today},consumed.eq.false)`)

        if (deleteError) console.error('刪除餐單失敗:', deleteError)
        router.push('/')
      }

      // === Scenario 判斷 ===
      
      const habitNames: Record<string, string> = {
        none: '無特殊限制',
        vegetarian: '素食',
        low_carb: '低碳水',
        keto: '生酮飲食'
      }

      // Scenario 3: 兩者都改變
      if (preferencesChanged && calorieChangePercent > 5) {
        const confirmed = window.confirm(
          `你修改了以下設定：\n` +
          `• 飲食習慣：${habitNames[profile.dietary_habit as string || 'none']} → ${habitNames[editDietaryHabit]}\n` +
          `• 卡路里目標：${profile.calorie_target} → ${calorieTarget} (+${calorieChangePercent.toFixed(0)}%)\n\n` +
          `當前餐單不再適合新目標，需要重新生成。\n` +
          `(今天已記錄的餐次會保留)\n\n` +
          `確認生成新餐單？`
        )
        
        if (!confirmed) {
          setSaving(false)
          return
        }
        
        await saveAndRegenerate()
        return
      }
      
      // Scenario 2: 飲食習慣改變
      if (preferencesChanged) {
        let message = `你的飲食習慣已改為「${habitNames[editDietaryHabit]}」\n\n`
        
        if (editDietaryHabit === 'vegetarian') {
          message += '當前餐單包含肉類，需要重新生成。\n'
        } else {
          message += '當前餐單不再適合新偏好，需要重新生成。\n'
        }
        
        message += '(今天已記錄的餐次會保留)\n\n確認生成新餐單？'
        
        const confirmed = window.confirm(message)
        
        if (!confirmed) {
          setSaving(false)
          return
        }
        
        await saveAndRegenerate()
        return
      }
      
      // Scenario 1c: 卡路里變化 > 10%
      if (calorieChangePercent > 10) {
        const confirmed = window.confirm(
          `你的卡路里目標從 ${profile.calorie_target} 改為 ${calorieTarget} (+${calorieChangePercent.toFixed(0)}%)\n` +
          `卡路里目標變化較大\n\n` +
          `當前餐單不再適合新目標，需要重新生成。\n` +
          `(今天已記錄的餐次會保留)\n\n` +
          `確認重新生成？`
        )
        
        if (!confirmed) {
          setSaving(false)
          return
        }
        
        await saveAndRegenerate()
        return
      }
      
      // Scenario 1b: 卡路里變化 5-10%
      if (calorieChangePercent > 5) {
        const confirmed = window.confirm(
          `你的卡路里目標從 ${profile.calorie_target} 改為 ${calorieTarget} (+${calorieChangePercent.toFixed(0)}%)\n\n` +
          `可以重新生成餐單以符合新目標。\n` +
          `(今天已記錄的餐次會保留)\n\n` +
          `重新生成餐單？`
        )
        
        if (confirmed) {
          await saveAndRegenerate()
          return
        }
      }
      
      // Scenario 1a: < 5% - 直接保存
      await saveProfileOnly()

    } catch (error) {
      console.error('Error updating targets:', error)
      toast.error('更新失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  // 登出
  const handleSignOut = async () => {
    if (confirm('確定要登出嗎？')) {
      await signOut()
    }
  }

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-bounce">😺</div>
            <p className="text-gray-600">載入中...</p>
          </div>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 pb-20">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white border-b px-4 py-3 flex items-center justify-between shadow-sm">
          <button onClick={() => router.push('/')} className="text-gray-600 hover:text-gray-900">
            ← 返回
          </button>
          <h1 className="text-lg font-semibold">設定</h1>
          <div className="w-8" />
        </header>

        <div className="max-w-2xl mx-auto p-4 space-y-4">
          {/* 旅遊模式 - 移到頂部 */}
          {!isEditing && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🌍</span>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900">
                    旅遊模式
                  </h3>
                </div>
              </div>
              
              {travelMode && travelPlan ? (() => {
                const today = new Date().toISOString().split('T')[0]
                const startDate = travelPlan.start_date
                const endDate = travelPlan.end_date
                let status = ''
                let bgColor = ''
                if (today < startDate) {
                  status = '未開始'
                  bgColor = 'bg-gray-500'
                } else if (today >= startDate && today <= endDate) {
                  status = '旅遊中'
                  bgColor = 'bg-blue-600'
                } else {
                  status = '已結束'
                  bgColor = 'bg-green-600'
                }
                return (
                  <div className="bg-blue-50 rounded-xl p-4 mb-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="font-semibold text-gray-900 text-lg">
                            📍 {travelPlan.destination}
                          </div>
                          <span className={`px-2 py-0.5 ${bgColor} text-white text-xs rounded-full whitespace-nowrap`}>
                            {status}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          📅 {new Date(travelPlan.start_date).toLocaleDateString('zh-HK')} - {new Date(travelPlan.end_date).toLocaleDateString('zh-HK')}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 mt-3">
                      如要修改行程，請先結束旅遊模式再重新啟動
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={handleDeactivateTravel}
                        disabled={deactivatingTravel}
                        className="flex-1 py-3 border-2 border-red-300 text-red-700 rounded-xl font-semibold hover:bg-red-50 disabled:opacity-60 disabled:pointer-events-none"
                      >
                        {deactivatingTravel ? '結束中...' : '結束旅遊模式'}
                      </button>
                    </div>
                  </div>
                )
              })() : null}
              
              {!travelMode && (
                <button
                  onClick={() => setShowTravelModal(true)}
                  className="w-full py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
                >
                  ✈️ 設定旅遊計劃
                </button>
              )}
            </motion.div>
          )}

          {/* 用戶資料和營養目標 - 整合 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>👤</span>
              <span>用戶資料</span>
            </h2>

            <div className="space-y-3">
              {/* 郵箱 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">郵箱</label>
                <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-600 text-sm">{user?.email}</div>
              </div>

              {/* 用戶名 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">用戶名</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="輸入用戶名"
                    className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-primary-400 transition-colors text-sm"
                  />
                  <button
                    onClick={handleSaveUsername}
                    disabled={saving || username === profile?.username}
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        保存中...
                      </>
                    ) : (
                      '保存'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* 營養目標 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span>🎯</span>
                <span>營養目標</span>
              </h2>
              {!isEditing && (
                <button onClick={handleStartEdit} className="text-primary-600 hover:text-primary-700 font-medium">
                  修改
                </button>
              )}
            </div>

            {!isEditing ? (
              /* 顯示模式 */
              <div className="space-y-3">
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <span className="text-gray-600">每日卡路里</span>
                  <span className="font-semibold text-gray-900">{profile?.calorie_target} 卡</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <span className="text-gray-600">蛋白質</span>
                  <span className="font-semibold text-gray-900">{profile?.protein_target}g</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <span className="text-gray-600">碳水化合物</span>
                  <span className="font-semibold text-gray-900">{profile?.carbs_target}g</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <span className="text-gray-600">脂肪</span>
                  <span className="font-semibold text-gray-900">{profile?.fat_target}g</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <span className="text-gray-600">纖維</span>
                  <span className="font-semibold text-gray-900">{profile?.fiber_target}g</span>
                </div>
                
                {/* 飲食偏好顯示 */}
                {(profile?.dietary_restrictions?.length > 0 || 
                  profile?.dietary_habit !== 'none' || 
                  profile?.allergies?.length > 0) && (
                  <>
                    <div className="border-t border-gray-200 my-4" />
                    <h3 className="font-semibold text-gray-900 mb-3">飲食偏好</h3>
                    
                    <div className="space-y-2 text-sm">
                      {profile.dietary_restrictions && profile.dietary_restrictions.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-gray-600 whitespace-nowrap">不吃：</span>
                          <span className="text-gray-900">
                            {profile.dietary_restrictions.map(r => {
                              const names: Record<string, string> = {
                                beef: '牛肉',
                                pork: '豬肉',
                                chicken: '雞肉',
                                seafood: '海鮮',
                                egg: '蛋類',
                                dairy: '奶類',
                                nuts: '堅果',
                                soy: '大豆製品'
                              }
                              return names[r] || r
                            }).join('、')}
                          </span>
                        </div>
                      )}
                      
                      {profile.dietary_habit && profile.dietary_habit !== 'none' && (
                        <div className="flex items-start gap-2">
                          <span className="text-gray-600 whitespace-nowrap">飲食習慣：</span>
                          <span className="text-gray-900">
                            {(() => {
                              const habits: Record<string, string> = {
                                vegetarian: '素食',
                                low_carb: '低碳水',
                                keto: '生酮飲食'
                              }
                              return habits[profile.dietary_habit] || profile.dietary_habit
                            })()}
                          </span>
                        </div>
                      )}
                      
                      {profile.allergies && profile.allergies.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-gray-600 whitespace-nowrap">過敏：</span>
                          <span className="text-gray-900">{profile.allergies.join('、')}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* 編輯模式 */
              <div className="space-y-4">
                {/* 性別 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">性別</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setGender('male')}
                      className={`py-2 rounded-xl border-2 transition-all ${
                        gender === 'male' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200'
                      }`}
                    >
                      👨 男
                    </button>
                    <button
                      type="button"
                      onClick={() => setGender('female')}
                      className={`py-2 rounded-xl border-2 transition-all ${
                        gender === 'female' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200'
                      }`}
                    >
                      👩 女
                    </button>
                  </div>
                </div>

                {/* 年齡、身高、體重 */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">年齡</label>
                    <input
                      type="number"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">身高(cm)</label>
                    <input
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">體重(kg)</label>
                    <input
                      type="number"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400"
                    />
                  </div>
                </div>

                {/* 活動水平 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">活動水平</label>
                  <div className="space-y-2">
                    {[
                      { value: 'sedentary' as ActivityLevel, label: '久坐' },
                      { value: 'light' as ActivityLevel, label: '輕度活動' },
                      { value: 'moderate' as ActivityLevel, label: '中度活動' },
                      { value: 'active' as ActivityLevel, label: '高度活動' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setActivityLevel(option.value)}
                        className={`w-full text-left px-4 py-2 rounded-xl border-2 transition-all ${
                          activityLevel === option.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 目標 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">目標</label>
                  <div className="space-y-2">
                    {[
                      { value: 'lose' as Goal, label: '減肥 📉' },
                      { value: 'maintain' as Goal, label: '維持 ⚖️' },
                      { value: 'gain' as Goal, label: '增肌 💪' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setGoal(option.value)}
                        className={`w-full text-left px-4 py-2 rounded-xl border-2 transition-all ${
                          goal === option.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 計算結果預覽 */}
                {calculateTDEE() > 0 && (
                  <div className="bg-primary-50 rounded-xl p-4 border-2 border-primary-200">
                    <div className="text-sm text-gray-600 mb-2">新的營養目標</div>
                    <div className="text-2xl font-bold text-primary-600 mb-3">{calculateTDEE()} 卡/日</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>蛋白質: {calculateNutrition(calculateTDEE()).protein}g</div>
                      <div>碳水: {calculateNutrition(calculateTDEE()).carbs}g</div>
                      <div>脂肪: {calculateNutrition(calculateTDEE()).fat}g</div>
                      <div>纖維: {calculateNutrition(calculateTDEE()).fiber}g</div>
                    </div>
                  </div>
                )}

                {/* 飲食偏好編輯 */}
                <div className="space-y-6 pt-4 border-t border-gray-200">
                  <h3 className="font-semibold text-gray-900 text-lg">飲食偏好</h3>
                  
                  {/* 不吃的食物 */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">
                      不吃的食物（可多選）
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {restrictionOptions.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            if (editDietaryRestrictions.includes(option.value)) {
                              setEditDietaryRestrictions(editDietaryRestrictions.filter(r => r !== option.value))
                            } else {
                              setEditDietaryRestrictions([...editDietaryRestrictions, option.value])
                            }
                          }}
                          className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                            editDietaryRestrictions.includes(option.value)
                              ? 'border-primary-500 bg-primary-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span className="text-3xl">{option.emoji}</span>
                          <span className={`font-medium ${
                            editDietaryRestrictions.includes(option.value)
                              ? 'text-primary-700'
                              : 'text-gray-700'
                          }`}>
                            {option.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* 飲食習慣 */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">
                      飲食習慣
                    </label>
                    <div className="space-y-3">
                      {habitOptions.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setEditDietaryHabit(option.value as any)}
                          className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                            editDietaryHabit === option.value
                              ? 'border-primary-500 bg-primary-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="text-left">
                            <div className={`font-semibold ${
                              editDietaryHabit === option.value
                                ? 'text-primary-700'
                                : 'text-gray-900'
                            }`}>
                              {option.label}
                            </div>
                            <div className="text-sm text-gray-600">
                              {option.description}
                            </div>
                          </div>
                          {editDietaryHabit === option.value && (
                            <span className="text-primary-600 text-xl">●</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* 過敏食物 */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">
                      過敏食物（選填）
                    </label>
                    <input
                      type="text"
                      value={editAllergies}
                      onChange={(e) => setEditAllergies(e.target.value)}
                      placeholder="例如：花生、貝類、芒果"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400"
                    />
                  </div>
                </div>

                {/* 按鈕 */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleCancelEdit}
                    className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveTargets}
                    disabled={saving || calculateTDEE() === 0}
                    className="flex-1 py-3 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        保存中...
                      </>
                    ) : (
                      '保存'
                    )}
                  </button>
                </div>
              </div>
            )}
          </motion.div>


          {/* 登出按鈕 - 僅在非編輯模式顯示 */}
          {!isEditing && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <button
                onClick={handleSignOut}
                className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-semibold hover:bg-red-100 transition-colors border-2 border-red-200"
              >
                登出
              </button>
            </motion.div>
          )}
        </div>
      </div>
      
      {/* 旅遊模式設定彈窗 - 目的地最前、自由輸入為主、回程日期選擇器 */}
      {showTravelModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center sm:justify-center">
          <motion.div
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto p-6 pb-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">
                🌍 設定旅遊計劃
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowTravelModal(false)
                  setTravelForm({
                    destination: '',
                    cuisine: '',
                    startDate: '',
                    endDate: '',
                    days: 7
                  })
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-5">
              {/* 目的地 - 放最前面 */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  目的地：
                </label>
                <input
                  type="text"
                  value={travelForm.destination}
                  onChange={(e) => {
                    setTravelForm({
                      ...travelForm,
                      destination: e.target.value,
                      cuisine: ''
                    })
                  }}
                  onFocus={() => {
                    const presets = ['日本', '韓國', '泰國', '台灣', '馬來西亞', '英國', '美國']
                    if (presets.includes(travelForm.destination)) {
                      setTravelForm({ ...travelForm, destination: '', cuisine: '' })
                    }
                  }}
                  placeholder="例如：法國巴黎、日本東京"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 mb-3"
                />
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { name: '日本', cuisine: 'japanese', emoji: '🇯🇵' },
                    { name: '韓國', cuisine: 'korean', emoji: '🇰🇷' },
                    { name: '泰國', cuisine: 'thai', emoji: '🇹🇭' },
                    { name: '台灣', cuisine: 'taiwanese', emoji: '🇹🇼' },
                    { name: '馬來西亞', cuisine: 'malaysian', emoji: '🇲🇾' },
                    { name: '英國', cuisine: 'british', emoji: '🇬🇧' },
                    { name: '美國', cuisine: 'american', emoji: '🇺🇸' }
                  ].map((dest) => (
                    <button
                      key={dest.cuisine}
                      type="button"
                      onClick={() => setTravelForm({
                        ...travelForm,
                        destination: dest.name,
                        cuisine: dest.cuisine
                      })}
                      className={`px-3 py-2 rounded-lg border-2 transition-all text-sm ${
                        travelForm.destination === dest.name
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-base mr-1">{dest.emoji}</span>
                      <span className="font-medium text-gray-900">{dest.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 旅遊日期 */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  旅遊日期：
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-600 mb-2">
                      出發日期：
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(() => {
                        const today = new Date()
                        const tomorrow = new Date(today)
                        tomorrow.setDate(today.getDate() + 1)
                        const dayAfterTomorrow = new Date(today)
                        dayAfterTomorrow.setDate(today.getDate() + 2)
                        const options = [
                          { value: today.toISOString().split('T')[0], label: '今天', date: today.toLocaleDateString('zh-HK', { month: 'numeric', day: 'numeric' }) },
                          { value: tomorrow.toISOString().split('T')[0], label: '明天', date: tomorrow.toLocaleDateString('zh-HK', { month: 'numeric', day: 'numeric' }) },
                          { value: dayAfterTomorrow.toISOString().split('T')[0], label: '後天', date: dayAfterTomorrow.toLocaleDateString('zh-HK', { month: 'numeric', day: 'numeric' }) }
                        ]
                        return options.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setTravelForm({ ...travelForm, startDate: option.value })}
                            className={`p-2 rounded-lg border-2 transition-all ${
                              travelForm.startDate === option.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="text-xs font-semibold text-gray-900">{option.label}</div>
                            <div className="text-xs text-gray-600 mt-0.5">{option.date}</div>
                          </button>
                        ))
                      })()}
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-600 mb-2">
                      回程日期：
                    </label>
                    <input
                      type="date"
                      value={travelForm.endDate}
                      min={travelForm.startDate || new Date().toISOString().split('T')[0]}
                      max={(() => {
                        const maxDate = new Date(travelForm.startDate || new Date())
                        maxDate.setDate(maxDate.getDate() + 29)
                        return maxDate.toISOString().split('T')[0]
                      })()}
                      onChange={(e) => setTravelForm({ ...travelForm, endDate: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    />
                    {travelForm.startDate && travelForm.endDate && (
                      <div className="text-xs text-gray-600 mt-1 text-center">
                        {(() => {
                          const start = new Date(travelForm.startDate)
                          const end = new Date(travelForm.endDate)
                          const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
                          return `${days} 天`
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="bg-blue-50 rounded-xl p-4 text-sm text-gray-700">
                <div className="font-semibold mb-1">💡 提示：</div>
                <p className="mb-2">
                  旅遊模式開啟後，系統會自動生成當地特色餐單（最多 30 天），旅遊期間可手動記錄實際飲食。
                </p>
                <p>
                  在旅遊模式啟動後如要修改行程資料或營養目標，請先結束旅遊模式，再重新設定。
                </p>
              </div>
            </div>
            
            {activatingTravel && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 text-center">
                ✈️ 旅遊模式已啟動！正在生成餐單，請稍候…
              </div>
            )}
            
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowTravelModal(false)
                  setTravelForm({
                    destination: '',
                    cuisine: '',
                    startDate: '',
                    endDate: '',
                    days: 7
                  })
                }}
                disabled={activatingTravel}
                className="flex-1 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleActivateTravel}
                disabled={!travelForm.destination || !travelForm.startDate || !travelForm.endDate || activatingTravel}
                className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {activatingTravel ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    啟動中...
                  </span>
                ) : (
                  '✈️ 啟動旅遊模式'
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
      
      {/* 修改旅程彈窗 */}
      {showEditTravelModal && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center sm:justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseEditTravelModal()
            }
          }}
        >
          <motion.div
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto p-6 pb-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">
                ✈️ 修改旅程
              </h3>
              <button
                onClick={handleCloseEditTravelModal}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              {/* 目的地 */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  目的地：
                </label>
                <input
                  type="text"
                  value={travelForm.destination}
                  onChange={(e) => {
                    const newDestination = e.target.value
                    const hotDestinations = ['日本', '韓國', '泰國', '台灣', '英國', '美國', '馬來西亞']
                    const wasHotDestination = hotDestinations.includes(travelForm.destination)
                    
                    if (wasHotDestination && newDestination !== travelForm.destination) {
                      setTravelForm({ 
                        ...travelForm, 
                        destination: newDestination,
                        cuisine: ''
                      })
                    } else {
                      if (!travelForm.cuisine) {
                        const autoCuisine = detectCuisineFromDestination(newDestination)
                        setTravelForm({ 
                          ...travelForm, 
                          destination: newDestination,
                          cuisine: autoCuisine !== 'general' ? autoCuisine : ''
                        })
                      } else {
                        setTravelForm({ ...travelForm, destination: newDestination })
                      }
                    }
                  }}
                  placeholder="例如：日本東京、峇里、巴黎"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400"
                />
              </div>
              
              {/* 熱門目的地 */}
              <div>
                <div className="text-xs text-gray-500 mb-1.5">💡 熱門目的地：</div>
                <div className="flex flex-wrap gap-1">
                  {[
                    { name: '日本', cuisine: 'japanese', emoji: '🇯🇵' },
                    { name: '韓國', cuisine: 'korean', emoji: '🇰🇷' },
                    { name: '泰國', cuisine: 'thai', emoji: '🇹🇭' },
                    { name: '台灣', cuisine: 'taiwanese', emoji: '🇹🇼' },
                    { name: '英國', cuisine: 'british', emoji: '🇬🇧' },
                    { name: '美國', cuisine: 'western', emoji: '🇺🇸' },
                    { name: '馬來西亞', cuisine: 'malaysian', emoji: '🇲🇾' }
                  ].map((dest) => (
                    <button
                      key={dest.cuisine}
                      type="button"
                      onClick={() => {
                        if (travelForm.cuisine === dest.cuisine) {
                          setTravelForm({ 
                            ...travelForm, 
                            cuisine: '',
                            destination: travelForm.destination === dest.name ? '' : travelForm.destination
                          })
                        } else {
                          setTravelForm({ 
                            ...travelForm, 
                            destination: dest.name,
                            cuisine: dest.cuisine
                          })
                        }
                      }}
                      className={`px-2.5 py-1.5 rounded-lg border transition-all text-xs ${
                        travelForm.cuisine === dest.cuisine
                          ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <span className="mr-1">{dest.emoji}</span>
                      {dest.name}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 日期 */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  旅遊日期：
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">出發日期</label>
                    <input
                      type="date"
                      value={travelForm.startDate}
                      onChange={(e) => setTravelForm({ ...travelForm, startDate: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-primary-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">結束日期</label>
                    <input
                      type="date"
                      value={travelForm.endDate}
                      onChange={(e) => setTravelForm({ ...travelForm, endDate: e.target.value })}
                      min={travelForm.startDate || new Date().toISOString().split('T')[0]}
                      max={(() => {
                        const maxDate = new Date(travelForm.startDate || new Date())
                        maxDate.setDate(maxDate.getDate() + 29)
                        return maxDate.toISOString().split('T')[0]
                      })()}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-primary-400"
                    />
                    <div className="text-xs text-gray-500 mt-1.5">
                      💡 如回程有時差，請選擇抵港日期為結束日期。
                    </div>
                  </div>
                </div>
              </div>
              
              {/* 說明 */}
              <div className="bg-blue-50 rounded-xl p-4 text-sm text-gray-700">
                <div className="font-semibold mb-1">💡 修改後系統會：</div>
                <ul className="space-y-1 ml-4">
                  <li>• 重新生成旅遊期間的餐單</li>
                  <li>• 已記錄的餐次不會被修改</li>
                  <li>• 保持你的營養目標不變</li>
                </ul>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCloseEditTravelModal}
                className="flex-1 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleUpdateTravel}
                disabled={!travelForm.destination || !travelForm.startDate || !travelForm.endDate}
                className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✈️ 更新旅程
              </button>
            </div>
          </motion.div>
        </div>
      )}
      
      {/* 修改旅程：重疊日期提示（保留現有餐單或重新生成） */}
      {showModifyOverlapDialog && pendingUpdateParams && (
        <div 
          className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center sm:justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowModifyOverlapDialog(false)
              setPendingUpdateParams(null)
              setModifyOverlapDates([])
            }
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm"
          >
            <h3 className="text-lg font-bold text-gray-900 mb-3">修改旅程</h3>
            <p className="text-gray-700 text-sm mb-2">
              修改旅程後，以下日期已有餐單：
            </p>
            <p className="text-gray-600 text-sm mb-4 font-medium">
              {modifyOverlapDates.map(d => new Date(d).toLocaleDateString('zh-HK')).join('、')}
            </p>
            <p className="text-gray-600 text-sm mb-4">
              要保留這些日期的現有餐單，還是重新生成新目的地的餐單？
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  if (pendingUpdateParams) {
                    await callPutTravelModeAndGoHome(
                      pendingUpdateParams.destination,
                      pendingUpdateParams.startDate,
                      pendingUpdateParams.endDate,
                      pendingUpdateParams.cuisine,
                      true
                    )
                  }
                  setShowModifyOverlapDialog(false)
                  setPendingUpdateParams(null)
                  setModifyOverlapDates([])
                }}
                className="flex-1 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50"
              >
                保留現有餐單
              </button>
              <button
                onClick={async () => {
                  if (pendingUpdateParams) {
                    await callPutTravelModeAndGoHome(
                      pendingUpdateParams.destination,
                      pendingUpdateParams.startDate,
                      pendingUpdateParams.endDate,
                      pendingUpdateParams.cuisine,
                      false
                    )
                  }
                  setShowModifyOverlapDialog(false)
                  setPendingUpdateParams(null)
                  setModifyOverlapDates([])
                }}
                className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700"
              >
                重新生成
              </button>
            </div>
          </motion.div>
        </div>
      )}
      
      <BottomNav />
    </AuthGuard>
  )
}

