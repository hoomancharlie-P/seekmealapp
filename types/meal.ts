// 餐單類型定義

export interface FoodItem {
  id?: string
  meal_id?: string
  name: string
  calories: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  order?: number
}

export interface Meal {
  id: string
  date: string // YYYY-MM-DD
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  emoji: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  foods: FoodItem[]
  consumed: boolean
  consumedAt?: Date
  
  // 特殊活動相關
  isSpecialEvent?: boolean
  specialEvent?: {
    type: 'hotpot' | 'bbq' | 'buffet' | 'birthday' | 'drinks' | 'other'
    description?: string
    estimatedCalories: number
    aiSuggestions: string[]
  }
  
  // 調整標記
  isAdjusted?: boolean
  adjustedFrom?: number // 原本的卡路里
}
