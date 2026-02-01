// 這個文件用於在等待頁面觸發 API 調用
// 當頁面載入時，檢查 URL 參數並觸發相應的 API 調用

import { supabase } from '@/lib/supabase'

export async function triggerTravelModeActivation(
  destination: string,
  startDate: string,
  endDate: string,
  cuisine: string
) {
  try {
    console.log('🌍 Triggering travel mode activation from waiting page...')
    
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      throw new Error('No session found')
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    }
    
    if (session.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
    
    let response: Response
    try {
      response = await fetch('/api/travel-mode', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          destination,
          cuisine,
          startDate,
          endDate
        })
      })
    } catch (fetchError: any) {
      // 捕獲網絡錯誤（Failed to fetch）
      console.error('❌ Network error during fetch:', fetchError)
      throw new Error('網絡連接失敗，請檢查網絡連接')
    }
    
    if (!response.ok) {
      let errorData
      try {
        errorData = await response.json()
      } catch (parseError) {
        errorData = { error: '啟動失敗', details: `HTTP ${response.status}` }
      }
      
      // 優先使用 details，因為它通常包含更詳細的錯誤訊息
      const errorMessage = errorData.details || errorData.error || errorData.message || `HTTP ${response.status}`
      console.error('❌ API response error:', {
        status: response.status,
        statusText: response.statusText,
        errorData,
        errorMessage
      })
      throw new Error(errorMessage)
    }
    
    const data = await response.json()
    
    if (!data.success) {
      const errorMessage = data.error || data.details || '啟動失敗'
      console.error('❌ API returned success: false:', data)
      throw new Error(errorMessage)
    }
    
    // 如果有警告，記錄但不拋出錯誤
    if (data.warning) {
      console.warn('⚠️ API warning:', data.warning)
    }
    
    // 如果是未來旅程（Day +4或以後），返回特殊標記
    if (data.futureTravel) {
      console.log('📦 Future travel detected, meals will be generated later')
      return { ...data, futureTravel: true, daysUntilStart: data.daysUntilStart }
    }
    
    console.log('✅ Travel mode activated from waiting page')
    return data
  } catch (error: any) {
    console.error('❌ Error activating travel mode from waiting page:', error)
    throw error
  }
}

export async function triggerTravelModeUpdate(
  destination: string,
  startDate: string,
  endDate: string,
  cuisine: string
) {
  try {
    console.log('✈️ Triggering travel mode update from waiting page...')
    
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      throw new Error('No session found')
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    }
    
    if (session.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
    
    let response: Response
    try {
      response = await fetch('/api/travel-mode', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          destination,
          cuisine,
          startDate,
          endDate
        })
      })
    } catch (fetchError: any) {
      // 捕獲網絡錯誤（Failed to fetch）
      console.error('❌ Network error during fetch:', fetchError)
      throw new Error('網絡連接失敗，請檢查網絡連接')
    }
    
    if (!response.ok) {
      let errorData
      try {
        errorData = await response.json()
      } catch (parseError) {
        errorData = { error: '更新失敗', details: `HTTP ${response.status}` }
      }
      
      const errorMessage = errorData.error || errorData.details || `HTTP ${response.status}`
      console.error('❌ API response error:', {
        status: response.status,
        statusText: response.statusText,
        errorData
      })
      throw new Error(errorMessage)
    }
    
    const data = await response.json()
    
    if (!data.success) {
      const errorMessage = data.error || data.details || '更新失敗'
      console.error('❌ API returned success: false:', data)
      throw new Error(errorMessage)
    }
    
    // 如果有警告，記錄但不拋出錯誤
    if (data.warning) {
      console.warn('⚠️ API warning:', data.warning)
    }
    
    console.log('✅ Travel mode updated from waiting page')
    return data
  } catch (error: any) {
    console.error('❌ Error updating travel mode from waiting page:', error)
    throw error
  }
}
