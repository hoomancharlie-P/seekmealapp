import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { extractJsonFromAiResponse } from '@/lib/ai-json'

// 檢查 GEMINI_API_KEY
const geminiApiKey = process.env.GEMINI_API_KEY
if (!geminiApiKey) {
  console.error('❌ GEMINI_API_KEY is missing!')
}

const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null

// POST - 啟動旅遊模式
export async function POST(request: NextRequest) {
  try {
    console.log('🌍 POST /api/travel-mode - Starting...')
    
    // 檢查環境變數
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('❌ Missing Supabase environment variables')
      return NextResponse.json({ 
        error: 'Server configuration error', 
        details: 'Missing Supabase credentials' 
      }, { status: 500 })
    }
    
    // 先檢查 Authorization header（如果客戶端使用 localStorage）
    // 注意：HTTP headers 在 Next.js 中是小寫的
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
    console.log('🔍 Checking authorization...')
    console.log('📋 Authorization header present:', !!authHeader)
    if (authHeader) {
      console.log('📋 Authorization header starts with Bearer:', authHeader.startsWith('Bearer '))
      console.log('📋 Authorization header length:', authHeader.length)
    }
    
    let user = null
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      console.log('🔑 Found Authorization header, using token')
      
      // 使用 token 創建臨時 client 來驗證用戶
      const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
      const tempClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        }
      )
      
      console.log('🔑 Validating token with Supabase...')
      const { data: { user: tokenUser }, error: tokenError } = await tempClient.auth.getUser(token)
      
      if (tokenError) {
        console.error('❌ Token validation error:', {
          message: tokenError.message,
          name: tokenError.name,
          status: (tokenError as any).status
        })
        return NextResponse.json({ 
          error: 'Unauthorized', 
          details: tokenError.message || 'Invalid or expired token',
          code: tokenError.name || 'INVALID_TOKEN'
        }, { status: 401 })
      }
      
      if (!tokenUser) {
        console.error('❌ Token validated but no user returned')
        return NextResponse.json({ 
          error: 'Unauthorized', 
          details: 'User not found',
          code: 'NO_USER'
        }, { status: 401 })
      }
      
      user = tokenUser
      console.log('✅ User authenticated via token:', user.id)
    } else {
      console.log('⚠️ No Authorization header found, trying cookies...')
      // 嘗試從 cookies 讀取 session
      const supabase = await createClient()
      console.log('✅ Supabase client created')
      
      // 檢查 cookies（用於調試）
      const cookieStore = await cookies()
      const allCookies = cookieStore.getAll()
      console.log('🍪 Cookies received:', {
        count: allCookies.length,
        names: allCookies.map(c => c.name)
      })
      
      // 先嘗試獲取 session（這會自動刷新過期的 session）
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.error('❌ Session error:', {
          message: sessionError.message,
          name: sessionError.name,
          status: (sessionError as any).status
        })
      }
      
      console.log('📋 Session check:', {
        hasSession: !!session,
        userId: session?.user?.id,
        expiresAt: session?.expires_at
      })
      
      // 嘗試獲取用戶（這也會自動刷新 session）
      const { data: { user: cookieUser }, error: authError } = await supabase.auth.getUser()
      
      if (authError) {
        console.error('❌ Auth error:', {
          message: authError.message,
          name: authError.name,
          status: authError.status,
          sessionExists: !!session
        })
        
        // 如果是 session missing 錯誤，提供更明確的提示
        if (authError.message?.includes('session') || authError.message?.includes('missing')) {
          return NextResponse.json({ 
            error: 'Unauthorized', 
            details: '認證會話已過期或不存在。請重新登入。',
            code: authError.name || 'SESSION_MISSING',
            hint: 'Please refresh the page and log in again'
          }, { status: 401 })
        }
        
        return NextResponse.json({ 
          error: 'Unauthorized', 
          details: authError.message,
          code: authError.name
        }, { status: 401 })
      }
      
      if (!cookieUser) {
        console.error('❌ No user found - session may have expired')
        return NextResponse.json({ 
          error: 'Unauthorized', 
          details: '用戶未找到。請重新登入。',
          code: 'NO_USER',
          hint: 'Please refresh the page and log in again'
        }, { status: 401 })
      }
      
      user = cookieUser
      console.log('✅ User authenticated via cookies:', user.id)
    }
    
    if (!user) {
      return NextResponse.json({ 
        error: 'Unauthorized', 
        details: '用戶未找到。請重新登入。',
        code: 'NO_USER'
      }, { status: 401 })
    }
    
    console.log('✅ User authenticated:', user.id)
    
    // 解析請求體
    let requestBody
    try {
      requestBody = await request.json()
    } catch (parseError: any) {
      console.error('❌ Error parsing request body:', parseError)
      return NextResponse.json({
        error: 'Invalid request body',
        details: parseError.message
      }, { status: 400 })
    }
    
    const { destination, cuisine, startDate, endDate } = requestBody
    
    console.log('🌍 Activating travel mode:', { destination, cuisine, startDate, endDate })
    
    // 驗證必需字段
    if (!destination || !startDate || !endDate) {
      return NextResponse.json({
        error: 'Missing required fields',
        details: 'destination, startDate, and endDate are required'
      }, { status: 400 })
    }
    
    // 創建 Supabase client
    // 由於我們已經驗證了用戶，使用 service role key 來執行數據庫操作
    // 這樣可以確保 RLS 政策不會阻擋操作
    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
    
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY is missing!')
      throw new Error('Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required')
    }
    
    console.log('🔑 Using service role key for database operations')
    const supabaseClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
    
    // 1. 停用現有旅遊計劃
    console.log('🔄 Step 1: Deactivating existing travel plans...')
    console.log('📋 User ID:', user.id)
    
    try {
      const { error: deactivateError, data: deactivateData } = await supabaseClient
        .from('travel_plans')
        .update({ active: false })
        .eq('user_id', user.id)
        .eq('active', true)
        .select()
      
      if (deactivateError) {
        console.error('❌ Error deactivating existing plans:', {
          message: deactivateError.message,
          details: deactivateError.details,
          hint: deactivateError.hint,
          code: deactivateError.code
        })
        // 不拋出錯誤，繼續執行（因為這不是關鍵操作）
      } else {
        console.log('✅ Existing travel plans deactivated. Count:', deactivateData?.length || 0)
      }
    } catch (deactivateException: any) {
      console.error('❌ Exception while deactivating plans:', deactivateException)
      // 不拋出錯誤，繼續執行
    }
    
    // 2. 創建新旅遊計劃
    console.log('🔄 Step 2: Creating new travel plan...')
    console.log('📋 Plan data:', {
      user_id: user.id,
      destination,
      cuisine: cuisine || 'general',
      start_date: startDate,
      end_date: endDate,
      active: true
    })
    
    let plan
    try {
      const { data: planData, error: planError } = await supabaseClient
        .from('travel_plans')
        .insert({
          user_id: user.id,
          destination,
          cuisine: cuisine || 'general',
          start_date: startDate,
          end_date: endDate,
          active: true
        })
        .select()
        .single()
      
      if (planError) {
        console.error('❌ Travel plan insert error:', {
          message: planError.message,
          details: planError.details,
          hint: planError.hint,
          code: planError.code
        })
        throw new Error(`創建旅遊計劃失敗：${planError.message}${planError.details ? ` (${planError.details})` : ''}`)
      }
      
      if (!planData) {
        console.error('❌ Travel plan created but no data returned')
        throw new Error('創建旅遊計劃失敗：未返回數據')
      }
      
      plan = planData
      console.log('✅ Travel plan created successfully. Plan ID:', plan.id)
    } catch (planException: any) {
      console.error('❌ Exception while creating travel plan:', {
        message: planException.message,
        stack: planException.stack,
        name: planException.name
      })
      throw planException
    }
    
    // 3. 檢查出發日期，決定是否立即生成餐單
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)
    const daysUntilStart = Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    console.log('📅 Days until travel start:', daysUntilStart)
    
    // 如果出發日在Day +4或以後，不立即生成餐單，只儲存計劃
    if (daysUntilStart >= 4) {
      console.log('📦 Travel starts in 4+ days, meals will be generated later')
      return NextResponse.json({
        success: true,
        plan,
        futureTravel: true,
        daysUntilStart,
        message: '旅遊計劃已啟動，餐單將在出發前自動生成'
      })
    }
    
    // 如果出發日在3天內，立即生成餐單
    console.log('🔄 Regenerating travel meals...')
    console.log('📋 Parameters:', { userId: user.id, startDate, endDate, destination, cuisine: cuisine || 'general' })
    
    // 驗證必要參數
    if (!startDate || !endDate || !destination) {
      console.error('❌ Missing required parameters for meal generation:', { startDate, endDate, destination })
      throw new Error('缺少必要參數：出發日期、結束日期或目的地')
    }
    
    // 驗證 GEMINI_API_KEY
    if (!genAI) {
      console.error('❌ GEMINI_API_KEY is not configured')
      throw new Error('AI 服務未配置，無法生成餐單')
    }
    
    try {
      console.log('🔄 Generating initial travel meals (future 3 days only)...', {
        userId: user.id,
        startDate,
        endDate,
        destination,
        cuisine: cuisine || 'general'
      })
      await generateInitialTravelMeals(supabaseClient, user.id, startDate, endDate, destination, cuisine || 'general')
      console.log('✅ Initial travel meals generated')
      try {
        await ensureDefaultMealsForVisibleWindow(supabaseClient, user.id, startDate, endDate)
      } catch (e) {
        console.warn('⚠️ ensureDefaultMealsForVisibleWindow failed', e)
      }
    } catch (mealError: any) {
      console.error('❌ Error regenerating meals:', {
        message: mealError.message,
        stack: mealError.stack,
        name: mealError.name,
        cause: mealError.cause,
        userId: user.id,
        startDate,
        endDate,
        destination
      })
      
      // 如果失敗過多或全部失敗，刪除已創建的計劃並拋出錯誤
      if (mealError.message?.includes('失敗過多') || mealError.message?.includes('所有日期的餐單生成都失敗')) {
        // 刪除剛創建的計劃
        try {
          await supabaseClient
            .from('travel_plans')
            .delete()
            .eq('id', plan.id)
          console.log('🗑️ Deleted travel plan due to meal generation failure')
        } catch (deleteError) {
          console.error('❌ Error deleting travel plan:', deleteError)
        }
        // 拋出錯誤，讓外層 catch 處理
        throw new Error(`餐單生成失敗：${mealError.message}`)
      }
      
      // 部分失敗，返回成功但包含警告
      console.warn('⚠️ Meal generation partially failed, but continuing...')
      return NextResponse.json({
        success: true,
        plan,
        warning: '旅遊計劃已創建，但部分餐單生成失敗，請稍後重試',
        error: process.env.NODE_ENV === 'development' ? mealError.message : undefined
      })
    }
    
    return NextResponse.json({
      success: true,
      plan
    })
    
  } catch (error: any) {
    // 記錄完整的錯誤信息
    console.error('❌ Error activating travel mode:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause,
      // 記錄錯誤的完整對象（如果可能）
      error: error
    })
    
    // 打印完整的 stack trace
    if (error.stack) {
      console.error('📚 Full stack trace:', error.stack)
    }
    
    // 檢查錯誤訊息，如果是餐單生成相關的錯誤，提供更友好的錯誤訊息
    let errorDetails: string = error.message || '啟動旅遊模式失敗'
    let userFriendlyMessage = '啟動旅遊模式失敗'
    
    // 根據錯誤類型提供更友好的錯誤訊息
    if (error.message?.includes('餐單生成') || error.message?.includes('meal generation') || error.message?.includes('AI 生成餐單失敗')) {
      errorDetails = '生成旅遊餐單時發生錯誤，請稍後重試或檢查網絡連接'
      userFriendlyMessage = '餐單生成失敗'
    } else if (error.message?.includes('創建旅遊計劃失敗')) {
      errorDetails = error.message
      userFriendlyMessage = '創建旅遊計劃失敗'
    } else if (error.message?.includes('缺少必要參數')) {
      errorDetails = error.message
      userFriendlyMessage = '參數錯誤'
    } else if (error.message?.includes('AI 服務未配置') || error.message?.includes('GEMINI_API_KEY')) {
      errorDetails = 'AI 服務未配置，無法生成餐單'
      userFriendlyMessage = '服務配置錯誤'
    } else if (error.message?.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      errorDetails = '服務器配置錯誤'
      userFriendlyMessage = '服務器配置錯誤'
    }
    
    // 構建返回的錯誤對象
    const errorResponse: any = {
      success: false,
      error: userFriendlyMessage,
      details: errorDetails,
      code: error.name || 'UNKNOWN_ERROR'
    }
    
    // 在開發環境中添加更詳細的錯誤信息
    if (process.env.NODE_ENV === 'development') {
      errorResponse.message = error.message
      errorResponse.stack = error.stack?.split('\n').slice(0, 10).join('\n')
      errorResponse.name = error.name
      if (error.code) errorResponse.code = error.code
      if (error.details) errorResponse.originalDetails = error.details
      if (error.hint) errorResponse.hint = error.hint
    }
    
    return NextResponse.json(
      errorResponse,
      { status: 500 }
    )
  }
}

// PUT - 更新旅遊模式
export async function PUT(request: NextRequest) {
  try {
    console.log('✈️ PUT /api/travel-mode - Starting...')
    
    // 檢查環境變數
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('❌ Missing Supabase environment variables')
      return NextResponse.json({ 
        error: 'Server configuration error', 
        details: 'Missing Supabase credentials' 
      }, { status: 500 })
    }
    
    // 認證（與POST相同邏輯）
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
    let user = null
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
      const tempClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data: { user: tokenUser }, error: tokenError } = await tempClient.auth.getUser(token)
      if (tokenError || !tokenUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = tokenUser
    } else {
      const supabase = await createClient()
      const { data: { user: cookieUser }, error: authError } = await supabase.auth.getUser()
      if (authError || !cookieUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = cookieUser
    }
    
    // 解析請求體
    const requestBody = await request.json()
    const { destination, cuisine, startDate, endDate, keepExistingMeals } = requestBody
    
    if (!destination || !startDate || !endDate) {
      return NextResponse.json({
        error: 'Missing required fields',
        details: 'destination, startDate, and endDate are required'
      }, { status: 400 })
    }
    
    // 使用 service role key
    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
    }
    
    const supabaseClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
    
    // 1. 先獲取當前的旅遊計劃（在更新之前）
    console.log('📋 Step 1: Fetching current travel plan...')
    const { data: currentPlan, error: fetchError } = await supabaseClient
      .from('travel_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true)
      .single()
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('❌ Error fetching current travel plan:', fetchError)
      throw fetchError
    }
    
    // 2. 不刪除「舊範圍內、新範圍外」的餐單，讓用戶保留原有日期的餐單（例如泰國 1/29–1/30 改成韓國 1/31–1/31 時，1/29、1/30 的泰國餐單仍保留）
    
    // 3. 更新旅遊計劃
    console.log('📋 Step 2: Updating travel plan...')
    const { data: planData, error: planError } = await supabaseClient
      .from('travel_plans')
      .update({
        destination,
        cuisine: cuisine || 'general',
        start_date: startDate,
        end_date: endDate
      })
      .eq('user_id', user.id)
      .eq('active', true)
      .select()
      .single()
    
    if (planError) {
      console.error('❌ Error updating travel plan:', planError)
      throw planError
    }
    
    console.log('✅ Travel plan updated successfully')
    
    // 4. 重新生成新日期範圍的旅遊餐單（keepExistingMeals 時跳過已有餐單的日期）
    console.log('📋 Step 3: Regenerating travel meals for new date range...', { keepExistingMeals: !!keepExistingMeals })
    try {
      await regenerateTravelMeals(user.id, startDate, endDate, destination, cuisine || 'general', { keepExistingMeals: !!keepExistingMeals })
      console.log('✅ Travel meals regenerated successfully')
      try {
        await ensureDefaultMealsForVisibleWindow(supabaseClient, user.id, startDate, endDate)
      } catch (e) {
        console.warn('⚠️ ensureDefaultMealsForVisibleWindow failed', e)
      }
    } catch (regenerateError: any) {
      console.error('❌ Error regenerating travel meals:', regenerateError)
      // 不拋出錯誤，讓 API 返回成功，但記錄錯誤
      // 這樣等待頁面可以繼續檢查，如果餐單生成失敗，等待頁面會檢測到
      console.warn('⚠️ Meal regeneration had errors, but continuing...')
    }
    
    console.log('✅ Travel mode updated')
    
    return NextResponse.json({
      success: true,
      plan: planData
    })
    
  } catch (error: any) {
    console.error('❌ Error updating travel mode:', error)
    return NextResponse.json(
      { error: '更新旅遊模式失敗', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE - 停用旅遊模式
export async function DELETE(request: NextRequest) {
  try {
    console.log('✈️ DELETE /api/travel-mode - Starting...')
    
    // 認證
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
    let user = null
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
      const tempClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data: { user: tokenUser }, error: tokenError } = await tempClient.auth.getUser(token)
      if (tokenError || !tokenUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = tokenUser
    } else {
      const supabase = await createClient()
      const { data: { user: cookieUser }, error: authError } = await supabase.auth.getUser()
      if (authError || !cookieUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = cookieUser
    }
    
    // 使用 service role key
    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
    }
    
    const supabaseClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
    
    // 1. 獲取當前旅遊計劃
    const { data: activePlan, error: fetchError } = await supabaseClient
      .from('travel_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true)
      .single()
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('❌ Error fetching travel plan:', fetchError)
      throw fetchError
    }
    
    // 2. 停用旅遊計劃
    const { error: updateError } = await supabaseClient
      .from('travel_plans')
      .update({ active: false })
      .eq('user_id', user.id)
      .eq('active', true)
    
    if (updateError) {
      console.error('❌ Error deactivating travel plan:', updateError)
      throw updateError
    }
    
    // 3. 如果存在旅遊計劃，刪除未來的旅遊餐單並重新生成預設餐單
    if (activePlan) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString().split('T')[0]
      const endDate = new Date(activePlan.end_date)
      
      // 刪除今天之後未記錄的旅遊餐單
      const { error: deleteMealsError } = await supabaseClient
        .from('meals')
        .delete()
        .eq('user_id', user.id)
        .gt('date', todayStr)
        .eq('consumed', false)
      
      if (deleteMealsError) {
        console.error('❌ Error deleting future meals:', deleteMealsError)
        // 不拋出錯誤，繼續執行
      } else {
        console.log('✅ Deleted future unconsumed meals')
      }
      
      // 重新生成預設餐單（未來2天）
      // 獲取用戶profile
      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('calorie_target, protein_target, carbs_target, fat_target, fiber_target, dietary_restrictions, dietary_habit, allergies')
        .eq('id', user.id)
        .single()
      
      if (!profileError && profile) {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        const payload = {
          userId: user.id,
          calorieTarget: profile.calorie_target,
          proteinTarget: profile.protein_target,
          carbsTarget: profile.carbs_target,
          fatTarget: profile.fat_target,
          fiberTarget: profile.fiber_target,
          dietaryRestrictions: profile.dietary_restrictions || [],
          dietaryHabit: profile.dietary_habit || 'none',
          allergies: profile.allergies || [],
          days: 2
        }
        // 背景觸發預設餐單生成，不阻塞回應（避免客戶端長時間等待導致 Failed to fetch）
        fetch(`${baseUrl}/api/generate-meals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then((response) => {
            if (response.ok) console.log('✅ Regenerated default meals for next 2 days')
            else response.json().catch(() => ({})).then((d) => console.warn('⚠️ Meal generation request failed:', d))
          })
          .catch((regenerateError) => console.error('❌ Error regenerating default meals:', regenerateError))
      }
    }
    
    console.log('✅ Travel mode deactivated')
    
    return NextResponse.json({ success: true })
    
  } catch (error: any) {
    console.error('❌ Error deactivating travel mode:', error)
    return NextResponse.json(
      { error: '停用旅遊模式失敗', details: error.message },
      { status: 500 }
    )
  }
}

// GET - 檢查當前旅遊模式
export async function GET(request: NextRequest) {
  try {
    console.log('🌍 GET /api/travel-mode - Starting...')
    
    // 先檢查 Authorization header（如果客戶端使用 localStorage）
    const authHeader = request.headers.get('authorization')
    let user = null
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      console.log('🔑 Found Authorization header, using token')
      
      // 使用 token 創建臨時 client 來驗證用戶
      const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
      const tempClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        }
      )
      
      const { data: { user: tokenUser }, error: tokenError } = await tempClient.auth.getUser(token)
      
      if (tokenError || !tokenUser) {
        console.error('❌ Token validation error:', tokenError)
        return NextResponse.json({ 
          error: 'Unauthorized', 
          details: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        }, { status: 401 })
      }
      
      user = tokenUser
      console.log('✅ User authenticated via token:', user.id)
    } else {
      // 嘗試從 cookies 讀取 session
      const supabase = await createClient()
      console.log('✅ Supabase client created')
      
      const { data: { user: cookieUser }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !cookieUser) {
        console.error('❌ Auth error:', authError)
        return NextResponse.json({ 
          error: 'Unauthorized',
          details: authError?.message || 'User not found',
          code: authError?.name || 'NO_USER'
        }, { status: 401 })
      }
      
      user = cookieUser
      console.log('✅ User authenticated via cookies:', user.id)
    }
    
    if (!user) {
      return NextResponse.json({ 
        error: 'Unauthorized',
        details: 'User not found',
        code: 'NO_USER'
      }, { status: 401 })
    }
    
    // 使用 service role key 來執行數據庫操作
    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
    }
    
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
    
    const today = new Date().toISOString().split('T')[0]
    console.log('📅 Today:', today)
    console.log('👤 User ID:', user.id)
    
    // 查找活躍的旅遊計劃
    // 條件：active = true 且未結束（end_date >= today）
    // 注意：包括未來的計劃（start_date > today），因為它們也是已啟動的
    const { data: plans, error } = await supabase
      .from('travel_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true)
      .gte('end_date', today)  // 結束日期 >= 今天（包括未來的計劃）
    
    if (error) {
      console.error('❌ Error fetching travel plans:', error)
      throw error
    }
    
    console.log('📋 Found plans:', plans?.length || 0)
    
    // 過濾：結束日期 >= 今天（用戶在結束日期輸入抵港日期）
    // 找到最相關的計劃（優先選擇已開始的，如果沒有則選擇最近的未來計劃）
    const activePlan = plans?.length > 0 ? plans.reduce((latest: any, plan: any) => {
      if (!latest) return plan
      // 優先選擇已開始的計劃
      if (plan.start_date <= today && latest.start_date > today) return plan
      if (latest.start_date <= today && plan.start_date > today) return latest
      // 如果都是未來的，選擇最近的
      return plan.start_date < latest.start_date ? plan : latest
    }, null) : null
    
    console.log('✅ Active plan found:', activePlan ? 'yes' : 'no')
    if (activePlan) {
      console.log('📋 Plan details:', {
        id: activePlan.id,
        destination: activePlan.destination,
        start_date: activePlan.start_date,
        end_date: activePlan.end_date,
        active: activePlan.active
      })
    }
    
    return NextResponse.json({
      active: !!activePlan,
      plan: activePlan || null
    })
    
  } catch (error: any) {
    console.error('❌ Error in GET /api/travel-mode:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    return NextResponse.json({
      active: false,
      plan: null,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}

// 重新生成旅遊期間餐單的輔助函數（keepExistingMeals 時跳過已有餐單的日期）
async function regenerateTravelMeals(
  userId: string,
  startDate: string,
  endDate: string,
  destination: string,
  cuisine: string,
  options?: { keepExistingMeals?: boolean }
) {
  const keepExistingMeals = options?.keepExistingMeals === true
  console.log('🔄 regenerateTravelMeals called with:', { userId, startDate, endDate, destination, cuisine, keepExistingMeals })
  
  // 使用 service role key 來執行數據庫操作
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
  
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  }
  
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
  
  console.log('📋 Fetching user profile...')
  // 獲取用戶資料
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  
  if (profileError) {
    console.error('❌ Error fetching profile:', profileError)
    throw new Error(`Failed to fetch profile: ${profileError.message}`)
  }
  
  if (!profile) {
    console.error('❌ Profile not found for user:', userId)
    throw new Error('Profile not found')
  }
  
  console.log('✅ Profile found:', profile.id)
  
  // 計算日期範圍
  const start = new Date(startDate)
  const end = new Date(endDate)
  const dates: string[] = []
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0])
  }
  
  console.log('🔄 Regenerating meals for', dates.length, 'days (batch: one API call)')
  
  // 一次 API 呼叫生成多天餐單，大幅縮短時間（無需天與天之間 2 秒延遲）
  await generateTravelMealsBatch(supabase, userId, dates, destination, cuisine || 'general', profile, { keepExistingMeals })
}

/** 將 Date 轉為本地日期的 YYYY-MM-DD（避免 toISOString 用 UTC 導致時區少一天） */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 啟動時只生成未來 3 天（今天、明天、後天）且在旅遊期間內的餐單；保留已記錄餐次，刪除未記錄後重新生成 */
async function generateInitialTravelMeals(
  supabase: any,
  userId: string,
  startDate: string,
  endDate: string,
  destination: string,
  cuisine: string
) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dates: string[] = []
  for (let i = 0; i < 3; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const dateStr = toLocalDateString(d)
    if (dateStr >= startDate && dateStr <= endDate) dates.push(dateStr)
  }
  console.log('🔄 Generating initial travel meals for', dates.length, 'days:', dates)
  if (dates.length === 0) return

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (profileError || !profile) throw new Error('Profile not found')

  for (let i = 0; i < dates.length; i++) {
    const dateStr = dates[i]
    if (i > 0) await new Promise((r) => setTimeout(r, 2000))
    const { data: existingMeals } = await supabase
      .from('meals')
      .select('id, consumed')
      .eq('user_id', userId)
      .eq('date', dateStr)
    const unconsumedIds = (existingMeals || []).filter((m: any) => !m.consumed).map((m: any) => m.id)
    if (unconsumedIds.length > 0) {
      await supabase.from('foods').delete().in('meal_id', unconsumedIds)
      await supabase.from('meals').delete().in('id', unconsumedIds)
    }
    try {
      await generateTravelMealsForDay(userId, dateStr, destination, cuisine, profile)
    } catch (dayError: any) {
      console.warn(`⚠️ Initial meal generation failed for ${dateStr}:`, dayError?.message)
    }
  }
  console.log('✅ Initial travel meals generated')
}

/** 確保主頁可見的 3 天（今天、明天、後天）都有餐單；旅遊日以外的空缺日自動生成預設餐單 */
async function ensureDefaultMealsForVisibleWindow(
  supabase: any,
  userId: string,
  travelStartDate: string,
  travelEndDate: string
) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const visibleDates: string[] = []
  for (let i = 0; i < 3; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    visibleDates.push(toLocalDateString(d))
  }
  const travelStart = new Date(travelStartDate)
  const travelEnd = new Date(travelEndDate)
  travelStart.setHours(0, 0, 0, 0)
  travelEnd.setHours(23, 59, 59, 999)

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('calorie_target, protein_target, carbs_target, fat_target, fiber_target, dietary_restrictions, dietary_habit, allergies')
    .eq('id', userId)
    .single()
  if (profileError || !profile) return

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  for (const dateStr of visibleDates) {
    const date = new Date(dateStr)
    date.setHours(0, 0, 0, 0)
    if (date >= travelStart && date <= travelEnd) continue

    const { data: existing } = await supabase
      .from('meals')
      .select('id')
      .eq('user_id', userId)
      .eq('date', dateStr)
    if (existing && existing.length >= 4) continue

    try {
      const res = await fetch(`${baseUrl}/api/generate-meals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          calorieTarget: profile.calorie_target,
          proteinTarget: profile.protein_target,
          carbsTarget: profile.carbs_target,
          fatTarget: profile.fat_target,
          fiberTarget: profile.fiber_target,
          days: 1,
          dietaryRestrictions: profile.dietary_restrictions || [],
          dietaryHabit: profile.dietary_habit || 'none',
          allergies: profile.allergies || [],
        }),
      })
      if (!res.ok) continue
      const data = await res.json()
      const meals = (data.meals || []).filter((m: any) => m.day === 1)
      if (meals.length >= 4) {
        await insertMealsForDate(supabase, userId, dateStr, meals)
        console.log('✅ Ensured default meals for visible day:', dateStr)
      }
    } catch (e) {
      console.warn('⚠️ ensureDefaultMealsForVisibleWindow for', dateStr, e)
    }
  }
}

// 將單日餐單寫入 DB（供單日生成與批次生成共用）
async function insertMealsForDate(
  supabase: any,
  userId: string,
  date: string,
  meals: Array<{ type: string; calories?: number; protein?: number; carbs?: number; fat?: number; fiber?: number; foods?: Array<{ name?: string; calories?: number; protein?: number; carbs?: number; fat?: number; fiber?: number }> }>
) {
  const mealEmojis: Record<string, string> = {
    breakfast: '🌅',
    lunch: '☀️',
    dinner: '🌙',
    snack: '🍎'
  }
  let insertedMealCount = 0
  for (const meal of meals) {
    const mealData: Record<string, unknown> = {
      user_id: userId,
      date,
      type: meal.type,
      emoji: mealEmojis[meal.type] || '🍽️',
      calories: Math.round(meal.calories || 0),
      protein: Math.round(meal.protein || 0),
      carbs: Math.round(meal.carbs || 0),
      fat: Math.round(meal.fat || 0),
      fiber: Math.round(meal.fiber || 0),
      consumed: false
    }
    const { data: insertedMeal, error: mealError } = await supabase
      .from('meals')
      .insert(mealData)
      .select()
      .single()
    if (mealError) {
      console.error(`❌ Meal insert error for ${meal.type}:`, mealError.message)
      continue
    }
    if (!insertedMeal) continue
    insertedMealCount++
    if (meal.foods && Array.isArray(meal.foods) && meal.foods.length > 0) {
      const foodsToInsert = meal.foods.map((food: any, index: number) => ({
        meal_id: insertedMeal.id,
        name: food.name || '未命名食物',
        calories: Math.round(food.calories || 0),
        protein: Math.round(food.protein || 0),
        carbs: Math.round(food.carbs || 0),
        fat: Math.round(food.fat || 0),
        fiber: Math.round(food.fiber || 0),
        order: index
      }))
      await supabase.from('foods').insert(foodsToInsert)
    }
  }
  if (meals.length > 0 && insertedMealCount === 0) {
    throw new Error(`該日餐次寫入失敗（0/${meals.length}）`)
  }
}

// 一次 API 呼叫生成多天餐單（大幅縮短時間，無需天與天之間延遲）
async function generateTravelMealsBatch(
  supabase: any,
  userId: string,
  dates: string[],
  destination: string,
  cuisine: string,
  profile: any,
  options?: { keepExistingMeals?: boolean }
) {
  const keepExistingMeals = options?.keepExistingMeals === true
  if (!genAI) throw new Error('GEMINI_API_KEY is not configured')
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  const model = genAI!.getGenerativeModel({ model: modelName })
  const cuisineNames: Record<string, string> = {
    japanese: '日本料理', korean: '韓國料理', thai: '泰國料理', taiwanese: '台灣料理',
    malaysian: '馬來西亞料理', indian: '印度料理', british: '英式料理', western: '西式料理',
    general: '當地料理'
  }
  const cuisineName = cuisineNames[cuisine] || cuisine || '當地料理'
  const dietText = [
    profile.dietary_restrictions?.length ? `不吃：${(profile.dietary_restrictions as string[]).join('、')}` : '',
    profile.dietary_habit && profile.dietary_habit !== 'none' ? `飲食習慣：${profile.dietary_habit}` : '',
    profile.allergies?.length ? `過敏：${(profile.allergies as string[]).join('、')}` : ''
  ].filter(Boolean).join('\n')
  const prompt = `你是一個專業的營養師。
用戶正在 ${destination} 旅遊，請為以下 ${dates.length} 天生成餐單，日期為：${dates.join('、')}。

重要要求：
1. 所有餐單必須使用 ${cuisineName}
2. 選擇當地特色菜式，適合旅遊外食
3. 每天 4 餐：早餐、午餐、晚餐、小食

用戶營養目標（一天）：
- 卡路里：${profile.calorie_target} 卡
- 蛋白質：${profile.protein_target}g
- 碳水化合物：${profile.carbs_target}g
- 脂肪：${profile.fat_target}g
- 纖維：${profile.fiber_target}g
${dietText ? `用戶限制：\n${dietText}` : ''}

食物名稱格式："用戶語言名稱（當地語言 - 英文描述）"，例如：韓式牛肉粥(소고기죽 - beef congee)。

回傳純 JSON，格式如下（不要其他文字）：
{
  "days": [
    { "date": "${dates[0]}", "meals": [
      { "type": "breakfast", "calories": 340, "protein": 28, "carbs": 45, "fat": 8, "fiber": 6, "foods": [{ "name": "範例", "calories": 200, "protein": 15, "carbs": 30, "fat": 5, "fiber": 4 }] },
      { "type": "lunch", "calories": 500, "protein": 30, "carbs": 55, "fat": 20, "fiber": 6, "foods": [] },
      { "type": "dinner", "calories": 500, "protein": 30, "carbs": 55, "fat": 20, "fiber": 6, "foods": [] },
      { "type": "snack", "calories": 160, "protein": 12, "carbs": 15, "fat": 7, "fiber": 2, "foods": [] }
    ] }
  ]
}
每一天都要有一個對象，date 必須為 YYYY-MM-DD，meals 為 4 個餐次。請立即生成純 JSON：`

  let text: string | null = null
  const maxRetries = 3
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt - 1), 10000)))
      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Gemini API 調用超時（45秒）')), 45000))
      ]) as any
      text = result?.response?.text() || null
      if (text) break
    } catch (e: any) {
      const is429 = e?.message?.includes('429') || e?.message?.includes('Too Many Requests')
      if (is429 && attempt < maxRetries - 1) continue
      throw new Error(`AI 生成餐單失敗：${e?.message || e}`)
    }
  }
  if (!text) throw new Error('Gemini API 返回空文本')
  const cleanText = extractJsonFromAiResponse(text)
  let data: { days?: Array<{ date: string; meals: any[] }> }
  try {
    data = JSON.parse(cleanText)
  } catch (e: any) {
    throw new Error(`AI 返回的 JSON 格式錯誤：${e?.message}`)
  }
  if (!data?.days || !Array.isArray(data.days)) {
    throw new Error('AI 返回格式不正確：缺少 days 數組')
  }
  const dayMap: Record<string, any[]> = {}
  for (const d of data.days) {
    if (d.date && Array.isArray(d.meals)) dayMap[d.date] = d.meals
  }
  let successCount = 0
  let failureCount = 0
  const failureDates: string[] = []
  const failureReasons: string[] = []
  for (const date of dates) {
    try {
      const { data: existingMealsForDate } = await supabase.from('meals').select('id').eq('user_id', userId).eq('date', date)
      if (keepExistingMeals && existingMealsForDate?.length) {
        successCount++
        continue
      }
      if (existingMealsForDate?.length) {
        const ids = existingMealsForDate.map((m: any) => m.id)
        await supabase.from('foods').delete().in('meal_id', ids)
        await supabase.from('meals').delete().in('id', ids)
      }
      const meals = dayMap[date]
      if (!meals?.length) {
        failureCount++
        failureDates.push(date)
        failureReasons.push('batch missing meals')
        continue
      }
      await insertMealsForDate(supabase, userId, date, meals)
      successCount++
    } catch (e: any) {
      failureCount++
      failureDates.push(date)
      failureReasons.push(e?.message || 'unknown')
    }
  }
  console.log(`✅ Travel meals batch: ${successCount} success, ${failureCount} failed`)
  if (failureCount > 0) console.warn(`⚠️ Some dates failed: ${failureDates.join(', ')}`)
  if (failureCount > dates.length * 0.5) throw new Error(`餐單生成失敗過多：${failureCount}/${dates.length} 天失敗。失敗日期：${failureDates.join(', ')}`)
  if (successCount === 0 && dates.length > 0) throw new Error('餐單生成失敗：所有日期都無法生成餐單。')
}

export async function generateTravelMealsForDay(
  userId: string,
  date: string,
  destination: string,
  cuisine: string,
  profile: any
) {
  console.log(`🔄 generateTravelMealsForDay called for date: ${date}`)
  
  // 檢查 GEMINI_API_KEY
  if (!genAI) {
    throw new Error('GEMINI_API_KEY is not configured')
  }
  
  // 使用 service role key 來執行數據庫操作
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
  
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  }
  
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
  
  console.log('🤖 Calling Gemini API...')
  
  // 使用 v1beta API 中可用的模型（測試確認 gemini-2.0-flash 可用）
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  console.log(`🤖 Using model: ${modelName}`)
  const model = genAI!.getGenerativeModel({ model: modelName })
  
  const cuisineNames: Record<string, string> = {
    japanese: '日本料理',
    korean: '韓國料理',
    thai: '泰國料理',
    taiwanese: '台灣料理',
    malaysian: '馬來西亞料理',
    singaporean: '新加坡料理',
    indonesian: '印尼料理',
    indian: '印度料理',
    chinese: '中式料理',
    french: '法式料理',
    italian: '意大利料理',
    spanish: '西班牙料理',
    german: '德式料理',
    british: '英式料理',
    dutch: '荷蘭料理',
    swiss: '瑞士料理',
    austrian: '奧地利料理',
    australian: '澳洲料理',
    western: '西式料理',
    general: '當地料理'
  }
  
  const cuisineName = cuisineNames[cuisine] || cuisine || '當地料理'
  
  const prompt = `你是一個專業的營養師。

用戶正在 ${destination} 旅遊，請為他生成一天的餐單。

重要要求：
1. 所有餐單必須使用 ${cuisineName}
2. 選擇當地特色菜式
3. 適合旅遊時在餐廳/外食的選擇
4. 符合營養目標

用戶營養目標（一天）：
- 卡路里：${profile.calorie_target} 卡
- 蛋白質：${profile.protein_target}g
- 碳水化合物：${profile.carbs_target}g
- 脂肪：${profile.fat_target}g
- 纖維：${profile.fiber_target}g

用戶飲食限制：
${profile.dietary_restrictions && profile.dietary_restrictions.length > 0 
  ? `- 不吃：${profile.dietary_restrictions.map((r: string) => {
    const names: Record<string, string> = {
      beef: '牛肉', pork: '豬肉', chicken: '雞肉', seafood: '海鮮',
      egg: '蛋類', dairy: '奶類', nuts: '堅果', soy: '大豆製品'
    }
    return names[r] || r
  }).join('、')}` 
  : ''}
${profile.dietary_habit && profile.dietary_habit !== 'none' 
  ? `- 飲食習慣：${(() => {
    const habits: Record<string, string> = {
      vegetarian: '素食',
      low_carb: '低碳水',
      keto: '生酮飲食'
    }
    return habits[profile.dietary_habit] || profile.dietary_habit
  })()}` 
  : ''}
${profile.allergies && profile.allergies.length > 0 
  ? `- 過敏：${profile.allergies.join('、')}` 
  : ''}

請生成 4 個餐次：早餐、午餐、晚餐、小食

重要：食物名稱格式要求
- 所有食物名稱必須使用格式："用戶語言的食物名稱（當地語言名稱 - 英文名字）"
- 例如：韓式牛肉粥(소고기죽 - beef congee)
- 如果當地語言是英文（如美國、英國、澳洲、印度等），格式為："用戶語言的食物名稱（當地英文名稱 - 描述性英文名字）"
- 例如：印式扁豆咖哩(Dal makhani - Lentil Curry)、美式漢堡(Hamburger - Beef Burger)
- 如果當地英文名稱已經很描述性（如"Lentil Curry"），可以只顯示一次：印式扁豆咖哩(Lentil Curry)
- 當地語言名稱和英文名稱的字體大小與中文名稱一樣
- 對於沒有描述性的當地英文名稱（如印度菜的 "Dal makhani"），必須提供一個有描述性的英文名稱（如 "Lentil Curry"），讓用戶更容易理解並能在當地點餐

回傳格式（純 JSON，不要任何其他文字）：
{
  "meals": [
    {
      "type": "breakfast",
      "calories": 340,
      "protein": 28,
      "carbs": 45,
      "fat": 8,
      "fiber": 6,
      "foods": [
        {
          "name": "日式納豆定食(納豆定食 - Natto Teishoku)",
          "calories": 200,
          "protein": 15,
          "carbs": 30,
          "fat": 5,
          "fiber": 4
        }
      ]
    }
  ]
}

請立即生成（純 JSON）：`

  let result, text, data
  const maxRetries = 3
  let retryCount = 0
  
  while (retryCount < maxRetries) {
    try {
      console.log(`📤 Sending prompt to Gemini... (attempt ${retryCount + 1}/${maxRetries})`, {
        date,
        destination,
        cuisine,
        modelName: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        promptLength: prompt.length
      })
      
      // 如果不是第一次嘗試，等待一段時間（指數退避）
      if (retryCount > 0) {
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000) // 最多等待10秒
        console.log(`⏳ Waiting ${delay}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
      
      // 添加超時處理
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Gemini API 調用超時（30秒）')), 30000)
      })
      
      result = await Promise.race([
        model.generateContent(prompt),
        timeoutPromise
      ]) as any
      
      if (!result || !result.response) {
        throw new Error('Gemini API 返回空響應')
      }
      
      text = result.response.text()
      console.log('📥 Received response from Gemini, length:', text.length)
      
      if (!text || text.length === 0) {
        throw new Error('Gemini API 返回空文本')
      }
      
      // 成功，跳出重試循環
      break
    } catch (aiError: any) {
      const isRateLimitError = aiError.message?.includes('429') || 
                               aiError.message?.includes('Too Many Requests') ||
                               aiError.message?.includes('Resource exhausted')
      
      console.error(`❌ Error calling Gemini API (attempt ${retryCount + 1}/${maxRetries}):`, {
        message: aiError.message,
        name: aiError.name,
        isRateLimitError,
        retryCount
      })
      
      // 如果是 429 錯誤且還有重試機會，繼續重試
      if (isRateLimitError && retryCount < maxRetries - 1) {
        retryCount++
        console.log(`🔄 Rate limit error, will retry (${retryCount}/${maxRetries})...`)
        continue // 繼續重試循環
      }
      
      // 如果不是 429 錯誤，或者已經重試完畢，拋出錯誤
      console.error('❌ Error calling Gemini API or parsing response:', {
        message: aiError.message,
        stack: aiError.stack,
        name: aiError.name,
        responseText: text?.substring(0, 500), // 只記錄前 500 字符
        errorType: aiError.name,
        retryCount
      })
      
      // 根據錯誤類型提供更詳細的錯誤訊息
      let errorMessage = `AI 生成餐單失敗：${aiError.message}`
      if (aiError.message?.includes('404') || aiError.message?.includes('Not Found')) {
        errorMessage = 'AI 模型不可用，請檢查配置'
      } else if (isRateLimitError) {
        errorMessage = `AI API 請求過於頻繁（已重試 ${retryCount} 次），請稍後再試`
      } else if (aiError.message?.includes('401') || aiError.message?.includes('Unauthorized')) {
        errorMessage = 'AI API 認證失敗，請檢查 API 密鑰'
      } else if (aiError.message?.includes('JSON')) {
        errorMessage = `AI 返回的數據格式錯誤：${aiError.message}`
      }
      
      throw new Error(errorMessage)
    }
  }
  
  // 確保 text 存在（在重試循環成功後）
  if (!text) {
    throw new Error('Gemini API 返回空文本')
  }
  
  // 處理和解析 JSON（在重試循環外部）
  let cleanText = text.trim()
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/```\n?/g, '')
  }
  cleanText = cleanText.trim()
  
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    cleanText = jsonMatch[0]
  }
  
  console.log('🔄 Parsing JSON response...')
  console.log('📄 Clean text preview (first 500 chars):', cleanText.substring(0, 500))
  
  try {
    data = JSON.parse(cleanText)
    console.log('✅ JSON parsed successfully')
    console.log('📊 Parsed data keys:', Object.keys(data || {}))
    console.log('📊 Meals count:', data?.meals?.length || 0)
    
    // 驗證 data 是否存在
    if (!data) {
      throw new Error('JSON 解析後返回空對象')
    }
  } catch (parseError: any) {
    console.error('❌ JSON parse error:', {
      message: parseError.message,
      cleanTextLength: cleanText.length,
      cleanTextPreview: cleanText.substring(0, 500),
      cleanTextLast500: cleanText.substring(Math.max(0, cleanText.length - 500))
    })
    throw new Error(`AI 返回的 JSON 格式錯誤：${parseError.message}`)
  }
  
  // 驗證數據結構
  if (!data) {
    throw new Error('AI 返回的數據為空')
  }
  
  if (!data.meals || !Array.isArray(data.meals)) {
    console.error('❌ Invalid data structure:', {
      dataKeys: Object.keys(data),
      hasMeals: 'meals' in data,
      mealsType: typeof data.meals,
      mealsValue: data.meals
    })
    throw new Error('AI 返回的數據格式不正確：缺少 meals 數組')
  }
  
  console.log(`📋 Inserting ${data.meals.length} meals...`)
  if (data.meals.length !== 4) {
    console.warn(`⚠️ Expected 4 meals, but got ${data.meals.length}`)
  }
  await insertMealsForDate(supabase, userId, date, data.meals)
  console.log(`✅ All meals processed for date: ${date}`)
}
