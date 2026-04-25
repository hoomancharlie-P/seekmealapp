import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text } = body
    
    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json(
        { 
          success: false, 
          error: '請輸入食物描述',
          details: '輸入為空或格式不正確'
        },
        { status: 400 }
      )
    }
    
    // 清理輸入：統一符號（將各種加號統一為 +）
    const cleanedText = text.trim()
      .replace(/[＋＋]/g, '+')  // 全角加號轉為半角
      .replace(/\s*\+\s*/g, ' + ')  // 統一加號格式
      .replace(/\s+/g, ' ')  // 多個空格轉為單個空格
    
    console.log('💬 Analyzing food text:', cleanedText)
    
    // 使用 v1beta API 中可用的模型（測試確認 gemini-2.0-flash 可用）
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    
    const prompt = `你是一個專業的香港營養師。

用戶描述了他們吃的食物：
"${cleanedText}"

請分析並識別所有食物，估算營養素。

要求：
1. 識別所有提到的食物
2. 使用廣東話名稱
3. 估算合理的份量
4. 計算每項食物的營養素（卡路里、蛋白質、碳水、脂肪、纖維）
5. 考慮香港常見食物和標準份量

例子：
輸入："一碗雲吞麵 + 無糖可樂"
輸出：
{
  "foods": [
    {
      "name": "雲吞麵",
      "portion": "1碗",
      "calories": 450,
      "protein": 18,
      "carbs": 65,
      "fat": 12,
      "fiber": 3
    },
    {
      "name": "無糖可樂",
      "portion": "1杯",
      "calories": 0,
      "protein": 0,
      "carbs": 0,
      "fat": 0,
      "fiber": 0
    }
  ]
}

回傳格式（純 JSON，不要任何其他文字）：
{
  "foods": [
    {
      "name": "食物名稱",
      "portion": "份量",
      "calories": 卡路里,
      "protein": 蛋白質,
      "carbs": 碳水,
      "fat": 脂肪,
      "fiber": 纖維
    }
  ],
  "notes": "分析備註（如果有不確定的地方）"
}

請立即分析（純 JSON）：`

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()
    
    if (!responseText || !responseText.trim()) {
      throw new Error('AI 沒有返回任何內容')
    }
    
    // 清理回應
    let cleanText = responseText.trim()
    
    // 移除可能的 markdown 代碼塊
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/```\n?/g, '')
    }
    
    // 嘗試提取 JSON（可能在文字中間）
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      cleanText = jsonMatch[0]
    }
    
    cleanText = cleanText.trim()
    
    console.log('📥 AI response (first 500 chars):', cleanText.substring(0, 500))
    
    // 嘗試解析 JSON
    let data
    try {
      data = JSON.parse(cleanText)
    } catch (parseError: any) {
      console.error('❌ JSON parse error:', parseError.message)
      console.error('Raw response:', cleanText)
      throw new Error(`AI 返回格式錯誤：${parseError.message}`)
    }
    
    if (!data || typeof data !== 'object') {
      throw new Error('AI 返回的數據格式不正確')
    }
    
    if (!data.foods || !Array.isArray(data.foods)) {
      throw new Error('AI 返回的數據缺少 foods 數組')
    }
    
    if (data.foods.length === 0) {
      throw new Error('未能識別到任何食物')
    }
    
    // 驗證和清理每個食物的字段
    for (const food of data.foods) {
      if (!food.name || typeof food.name !== 'string') {
        throw new Error('食物缺少名稱')
      }
      
      // 確保所有營養素字段都是數字，缺失則設為 0
      food.calories = typeof food.calories === 'number' ? Math.max(0, food.calories) : 0
      food.protein = typeof food.protein === 'number' ? Math.max(0, food.protein) : 0
      food.carbs = typeof food.carbs === 'number' ? Math.max(0, food.carbs) : 0
      food.fat = typeof food.fat === 'number' ? Math.max(0, food.fat) : 0
      food.fiber = typeof food.fiber === 'number' ? Math.max(0, food.fiber) : 0
      
      // portion 是可選的
      if (food.portion && typeof food.portion !== 'string') {
        food.portion = String(food.portion)
      }
    }
    
    console.log('✅ Identified', data.foods.length, 'foods')
    
    return NextResponse.json({
      success: true,
      data
    })
    
  } catch (error: any) {
    console.error('❌ Error analyzing text:', error)
    console.error('Error stack:', error.stack)
    console.error('Error name:', error.name)
    
    // 根據錯誤類型返回不同的狀態碼和訊息
    let statusCode = 500
    let errorMessage = '分析失敗，請重試'
    let errorDetails = error.message || error.toString()
    
    if (error.message?.includes('JSON') || error.message?.includes('格式')) {
      statusCode = 422  // Unprocessable Entity
      errorMessage = 'AI 返回格式錯誤，請重試'
    } else if (error.message?.includes('識別')) {
      statusCode = 400  // Bad Request
      errorMessage = '未能識別到食物，請嘗試更詳細的描述'
    } else if (error.message?.includes('API') || error.message?.includes('quota')) {
      statusCode = 503  // Service Unavailable
      errorMessage = 'AI 服務暫時不可用，請稍後重試'
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage,
        details: errorDetails
      },
      { status: statusCode }
    )
  }
}