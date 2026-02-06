import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

interface Message {
  role: 'user' | 'assistant'
  content: string
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

export async function POST(request: NextRequest) {
  try {
    console.log('=== Gemini Coach API Called ===')
    
    const body = await request.json()
    const { message, userData, conversationHistory } = body
    
    console.log('Message:', message)
    console.log('UserData:', userData)
    console.log('ConversationHistory length:', conversationHistory?.length || 0)
    console.log('ConversationHistory roles:', conversationHistory?.map((m: Message) => m.role) || [])
    
    // Verify API Key
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ Gemini API Key not found!')
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      )
    }
    
    console.log('✅ API Key exists')
    
    // Build system instruction (system prompt)
    const systemInstruction = `你係一個專業但親切嘅 AI 飲食教練，名叫「食喵教練」。

用戶當前狀態：
- 今日已攝取：${userData.currentCalories} / ${userData.targetCalories} 卡（剩餘 ${userData.remainingCalories} 卡）
- 蛋白質：${userData.currentNutrition.protein}g / ${userData.targetNutrition.protein}g
- 碳水化合物：${userData.currentNutrition.carbs}g / ${userData.targetNutrition.carbs}g
- 脂肪：${userData.currentNutrition.fat}g / ${userData.targetNutrition.fat}g
- 纖維：${userData.currentNutrition.fiber}g / ${userData.targetNutrition.fiber}g

你的回應原則：
1. 用廣東話（口語化、親切）
2. 根據用戶剩餘卡路里給建議
3. 如果問「可以食 X 嗎？」，分析卡路里並給建議（可以/唔建議/要控制份量）
4. 如果問「而家可以食咩？」，推薦 3-5 個選擇（附卡路里）
5. 如果問營養問題，檢查用戶當前營養狀況並給建議
6. 保持簡潔，每次回應 100-200 字
7. 使用 emoji 增加親和力（但唔好過度）
8. 友善、專業、鼓勵

守護欄（處理不同類型問題）：
9. 飲食/營養/健康相關問題 → 正常回應，並連結到用戶當前狀況
10. 一般生活問題（天氣、心情、工作等）→ 簡短回應後，溫柔引導回飲食話題
11. 非飲食服務請求（寫作/編程/翻譯等）→ 禮貌拒絕，說明你係飲食教練
12. 私密/不適當問題 → 禮貌拒絕，提醒專注於飲食目標

回應例子：

【飲食建議】
用戶：「我可以食珍珠奶茶嗎？」
你：「珍珠奶茶一般有 400-500 卡，而你仲有 ${userData.remainingCalories} 卡。
${userData.remainingCalories >= 500 
  ? '✓ 可以飲！但建議揀「少糖」或「無糖」' 
  : userData.remainingCalories >= 300
    ? '⚠️ 可以飲，但揀「少糖 + 去珍珠」（省 100 卡）'
    : '❌ 建議唔好飲，試下無糖茶或黑咖啡？（0-5 卡）'
}
記得記錄呀！😊」

用戶：「而家可以食咩？」
你：「你仲有 ${userData.remainingCalories} 卡，推薦：

✓ 雞胸沙律（~250 卡）- 高蛋白低脂
✓ 糙米飯 + 蒸魚（~300 卡）- 營養均衡
✓ 希臘乳酪 + 水果（~150 卡）- 健康小食

記得選其中一款就好！💪」

用戶：「點樣增加蛋白質？」
你：「你今日仲差 ${userData.targetNutrition.protein - userData.currentNutrition.protein}g 蛋白質。建議：

✓ 水煮蛋 2隻（12g 蛋白質）
✓ 雞胸 100g（30g 蛋白質）
✓ 希臘乳酪 1杯（10g 蛋白質）

選其中一款就達標啦！😊」

【健康知識】
用戶：「生酮飲食係咩？」
你：「生酮飲食係極低碳水（<50g/日）、高脂肪嘅飲食法，令身體燃燒脂肪產生酮體。

不過以你今日嘅目標（碳水 ${userData.targetNutrition.carbs}g），唔建議突然轉生酮。如果想試，應該同營養師商量先。

你今日仲差 ${userData.targetNutrition.carbs - userData.currentNutrition.carbs}g 碳水，建議先達標今日目標！💪」

【一般生活問題】
用戶：「今日天氣好熱呀」
你：「係呀，天氣熱記得補充水分！💧 
順便問下，你今日仲有 ${userData.remainingCalories} 卡，諗住食咩？」

【非飲食服務】
用戶：「幫我寫封 email」
你：「不好意思，我係飲食教練，唔識幫你寫 email 😅
不過我可以幫你計劃餐單、分析營養！有咩飲食問題可以問我。」

CRITICAL：
- 永遠根據用戶當前數據給建議
- 如果超標，溫柔提醒但唔好責備
- 如果達標，給予鼓勵
- 保持正面、支持的態度
- 即使離題也要溫柔引導回飲食話題`

    // Choose model(s). Some projects have 0 free-tier quota for certain models (limit: 0).
    const modelCandidates = [
      process.env.GEMINI_MODEL,
      // Prefer stable, broadly available models first
      'gemini-2.0-flash',
      // v1beta commonly exposes -latest variants for 1.5
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro-latest',
      // Keep legacy name as a last resort
      'gemini-1.5-flash',
      // Keep exp last (often has restricted / 0 quota)
      'gemini-2.0-flash-exp',
    ].filter(Boolean) as string[]
    console.log('Model candidates:', modelCandidates)
    
    // Convert conversation history to Gemini format
    // CRITICAL: First message MUST be 'user' role, not 'model'
    // Filter and convert conversation history
    type HistoryItem = { role: 'user' | 'model'; parts: Array<{ text: string }> }
    let history: HistoryItem[] = []
    
    if (conversationHistory && conversationHistory.length > 0) {
      // Convert to Gemini format
      const converted: HistoryItem[] = conversationHistory
        .slice(-5) // Take last 5 messages
        .map((msg: Message) => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        }))
      
      console.log('Converted history roles:', converted.map((h: HistoryItem) => h.role))
      
      // Remove any leading 'model' messages (Gemini requires 'user' first)
      let startIndex = 0
      while (startIndex < converted.length && converted[startIndex].role === 'model') {
        console.warn(`Skipping leading model message at index ${startIndex}`)
        startIndex++
      }
      
      history = converted.slice(startIndex)
      
      // Final check: ensure first message is 'user'
      if (history.length > 0 && history[0].role !== 'user') {
        console.error('ERROR: History still does not start with user role!', history[0])
        history = [] // Clear history if still invalid
      }
    }
    
    console.log('Final history length:', history.length)
    console.log('Final history roles:', history.map((h: HistoryItem) => h.role))
    
    // Try models in order. If a model has free-tier quota limit 0, fallback to another.
    let lastError: unknown = undefined
    for (const modelName of modelCandidates) {
      try {
        console.log(`Creating Gemini model: ${modelName}`)
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500,
          },
        })

        // Start chat with history (only if valid)
        let chat
        if (history.length > 0 && history[0].role === 'user') {
          console.log('Starting chat with history')
          chat = model.startChat({
            history: history,
          })
        } else {
          // Start fresh chat if no valid history
          console.log('Starting fresh chat (no valid history)')
          chat = model.startChat()
        }

        // Send message
        console.log(`Sending message to Gemini (${modelName})...`)
        const result = await chat.sendMessage(message)
        const response = result.response
        const reply = response.text()
    
        console.log('✅ Gemini response received')
        console.log('Reply:', reply.substring(0, 100) + '...')

        return NextResponse.json({ reply, model: modelName })
      } catch (err: any) {
        lastError = err
        // Attach model info for downstream error handling/logging
        try {
          err.triedModel = modelName
        } catch {}
        const status = err?.status || err?.statusCode || err?.response?.status
        const msg = (err?.message || err?.toString?.() || '').toLowerCase()
        const isLimitZero =
          msg.includes('limit: 0') ||
          msg.includes('quota exceeded for metric') && msg.includes('limit: 0')
        const isModelNotFound =
          status === 404 ||
          msg.includes('is not found for api version') ||
          (msg.includes('models/') && msg.includes('not found'))

        console.error(`❌ Model attempt failed: ${modelName}`, { status, isLimitZero, isModelNotFound })

        // Fallback when this looks like a model-specific quota=0 OR model not available for this API/key
        if (status === 429 && isLimitZero) {
          console.warn(`Falling back to next model because ${modelName} has quota limit 0`)
          continue
        }
        if (isModelNotFound) {
          console.warn(`Falling back to next model because ${modelName} is not available for this API/key`)
          continue
        }

        // Otherwise, rethrow and let outer catch handle it
        throw err
      }
    }

    // If we exhausted all model fallbacks, throw the last error
    throw lastError || new Error('All Gemini model candidates failed')
    
  } catch (error: any) {
    console.error('❌ Gemini API Error:', error)
    console.error('Error name:', error.name)
    console.error('Error message:', error.message)
    console.error('Error status:', error.status || error.statusCode)
    console.error('Error code:', error.code)
    
    // Try to extract more error details from Gemini API response
    let errorDetails: any = {}
    try {
      if (error.response) {
        errorDetails = error.response
      }
      if (error.cause) {
        errorDetails = { ...errorDetails, cause: error.cause }
      }
      // Check for Gemini-specific error fields
      if (error.statusText) {
        errorDetails.statusText = error.statusText
      }
    } catch (e) {
      console.error('Could not extract error details:', e)
    }
    
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
    console.error('Error details:', errorDetails)
    
    // Handle specific Gemini errors
    let errorMessage = 'Failed to get response'
    let statusCode = 500
    let isRateLimit = false
    let isQuotaExceeded = false
    
    // Check error status code first
    const errorStatus = error.status || error.statusCode || error.response?.status || errorDetails?.status
    const errorCode = error.code || errorDetails?.code || ''
    const errorMsg = (error.message || error.toString() || '').toLowerCase()
    const fullErrorString = JSON.stringify(error).toLowerCase()
    
    console.error('🔍 Error Analysis:', {
      errorStatus,
      errorCode,
      errorMsg: errorMsg.substring(0, 200),
      hasQuota: errorMsg.includes('quota') || fullErrorString.includes('quota'),
      hasRateLimit: errorMsg.includes('rate') || fullErrorString.includes('rate'),
      hasResourceExhausted: errorMsg.includes('resource_exhausted') || errorCode === 'RESOURCE_EXHAUSTED'
    })
    
    // More precise rate limit detection
    // RESOURCE_EXHAUSTED is the gRPC error code for quota/rate limit
    // Distinguish between quota (daily limit) and rate limit (per minute)
    if (
      errorStatus === 429 || 
      errorCode === 'RESOURCE_EXHAUSTED' ||
      errorMsg.includes('429') || 
      errorMsg.includes('resource_exhausted') ||
      errorMsg.includes('quota') || 
      errorMsg.includes('rate limit') ||
      errorMsg.includes('rate_limit') ||
      errorMsg.includes('too many requests') ||
      fullErrorString.includes('quota') ||
      fullErrorString.includes('resource_exhausted')
    ) {
      // Check if it's quota (daily limit) vs rate limit (per minute)
      // Gemini API typically uses RESOURCE_EXHAUSTED for both, but we can infer from context
      const hasQuotaKeyword = errorMsg.includes('quota') || 
                              errorMsg.includes('daily') || 
                              fullErrorString.includes('quota') ||
                              fullErrorString.includes('daily')
      
      const hasRateLimitKeyword = errorMsg.includes('rate limit') ||
                                   errorMsg.includes('rate_limit') ||
                                   fullErrorString.includes('rate limit')
      
      // If explicitly mentions quota, it's quota; otherwise default to quota for RESOURCE_EXHAUSTED
      if (hasQuotaKeyword || (!hasRateLimitKeyword && errorCode === 'RESOURCE_EXHAUSTED')) {
        errorMessage = 'Daily quota exceeded'
        statusCode = 429
        isRateLimit = false
        isQuotaExceeded = true
        console.error('⚠️ Daily quota exceeded (not rate limit)')
      } else {
        errorMessage = 'Rate limit exceeded'
        statusCode = 429
        isRateLimit = true
        isQuotaExceeded = false
        console.error('⚠️ Rate limit exceeded (too many requests per minute)')
      }
      
      console.error('Error details:', { errorStatus, errorCode, errorMsg: errorMsg.substring(0, 100), isQuotaExceeded, isRateLimit })
    } else if (errorStatus === 404 || errorMsg.includes('is not found for api version') || errorMsg.includes('models/') && errorMsg.includes('not found')) {
      errorMessage = 'Model not available'
      statusCode = 400
      console.error('⚠️ Model not available for this API/key', { triedModel: error?.triedModel })
    } else if (errorStatus === 401 || errorMsg.includes('api key') || errorMsg.includes('401') || errorMsg.includes('unauthenticated')) {
      errorMessage = 'Invalid API key'
      statusCode = 401
    } else if (errorMsg.includes('safety') || errorMsg.includes('safety')) {
      errorMessage = 'Content blocked by safety filters'
      statusCode = 400
    } else if (errorMsg.includes('first content should be with role')) {
      errorMessage = 'Invalid conversation history format'
      statusCode = 400
      console.error('Gemini history format error - first message must be user role')
    } else if (errorStatus === 503 || errorMsg.includes('503') || errorMsg.includes('unavailable')) {
      errorMessage = 'Service temporarily unavailable'
      statusCode = 503
    } else {
      // For unknown errors, log more details
      console.error('⚠️ Unknown error type, defaulting to generic error')
      console.error('Full error object:', error)
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: error.message || error.toString(),
        status: errorStatus,
        code: errorCode,
        isRateLimit: isRateLimit,
        isQuotaExceeded: isQuotaExceeded,
        triedModel: error?.triedModel,
        rawError: process.env.NODE_ENV === 'development' ? {
          name: error.name,
          message: error.message,
          status: errorStatus,
          code: errorCode
        } : undefined
      },
      { status: statusCode }
    )
  }
}
