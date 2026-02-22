import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function POST(request: NextRequest) {
  try {
    const { image, mimeType } = await request.json()
    
    console.log('📷 Analyzing food image...')
    
    // 使用 v1beta API 中可用的模型（測試確認 gemini-2.0-flash 可用）
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    
    const prompt = `你是一個專業的香港營養師。

請分析這張食物照片，識別所有食物並估算營養素。

要求：
1. 識別照片中的所有食物
2. 使用廣東話名稱（例如：雞扒飯、炒菜心、雲吞麵）
3. 估算每項食物的份量（例如：1碟、半碗、100g）
4. 計算每項食物的營養素：
   - 卡路里（kcal）
   - 蛋白質（g）
   - 碳水化合物（g）
   - 脂肪（g）
   - 纖維（g）
5. 給出識別置信度（0-1）

注意：
- 考慮香港常見食物和烹調方式
- 份量估算要合理（參考標準餐具）
- 考慮醬汁、油脂等隱藏卡路里
- 如果有多項食物，分別列出
- 如果無法準確識別，在 warnings 中說明

回傳格式（純 JSON，不要任何其他文字）：
{
  "foods": [
    {
      "name": "雞扒飯",
      "portion": "1碟",
      "calories": 600,
      "protein": 35,
      "carbs": 70,
      "fat": 18,
      "fiber": 3,
      "confidence": 0.85,
      "notes": "包含雞扒、白飯、少量蔬菜"
    }
  ],
  "warnings": [
    "光線不足，識別可能不準確",
    "部分食物被遮擋"
  ],
  "suggestions": [
    "建議檢查份量是否正確",
    "隱藏油脂可能被低估"
  ]
}

請立即分析（純 JSON）：`

    const result = await model.generateContent([
      {
        inlineData: {
          data: image,
          mimeType: mimeType
        }
      },
      { text: prompt }
    ])
    
    const text = result.response.text()
    
    // 清理回應
    let cleanText = text.trim()
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/```\n?/g, '')
    }
    cleanText = cleanText.trim()
    
    console.log('📥 AI response (first 300 chars):', cleanText.substring(0, 300))
    
    const data = JSON.parse(cleanText)
    
    if (!data.foods || !Array.isArray(data.foods)) {
      throw new Error('Invalid response format')
    }
    
    console.log('✅ Identified', data.foods.length, 'foods')
    
    return NextResponse.json({
      success: true,
      data
    })
    
  } catch (error: any) {
    console.error('❌ Error analyzing image:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: '分析失敗，請重試或使用其他方式添加',
        details: error.message 
      },
      { status: 500 }
    )
  }
}