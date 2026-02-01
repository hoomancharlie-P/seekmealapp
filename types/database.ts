export interface Profile {
  id: string
  username: string | null
  calorie_target: number
  protein_target: number
  carbs_target: number
  fat_target: number
  fiber_target: number
  created_at: string
  updated_at: string
  dietary_restrictions: string[]
  dietary_habit: 'none' | 'vegetarian' | 'low_carb' | 'keto'
  allergies: string[]
  // 基本資料
  gender: 'male' | 'female'
  age: number | null
  height: number | null
  weight: number | null
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active'
  goal: 'lose' | 'maintain' | 'gain'
}

export interface Meal {
  id: string
  user_id: string
  date: string
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  emoji: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  consumed: boolean
  consumed_at: string | null
  is_special_event: boolean
  special_event_type: string | null
  special_event_description: string | null
  special_event_calories: number | null
  special_event_ai_suggestions?: string[] | null
  is_adjusted: boolean
  adjusted_from: number | null
  created_at: string
  updated_at: string
  foods?: Food[]
}

export interface Food {
  id: string
  meal_id: string
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number | null
  order: number
  created_at: string
}

