import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 客戶端（用於 client components）
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// 類型定義
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
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
          dietary_habit: string
          allergies: string[]
        }
        Insert: {
          id: string
          username?: string | null
          calorie_target?: number
          protein_target?: number
          carbs_target?: number
          fat_target?: number
          fiber_target?: number
          created_at?: string
          updated_at?: string
          dietary_restrictions?: string[]
          dietary_habit?: string
          allergies?: string[]
        }
        Update: {
          id?: string
          username?: string | null
          calorie_target?: number
          protein_target?: number
          carbs_target?: number
          fat_target?: number
          fiber_target?: number
          updated_at?: string
          dietary_restrictions?: string[]
          dietary_habit?: string
          allergies?: string[]
        }
      }
      meals: {
        Row: {
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
          special_event_ai_suggestions?: any
          is_adjusted: boolean
          adjusted_from: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
          emoji: string
          calories: number
          protein: number
          carbs: number
          fat: number
          fiber: number
          consumed?: boolean
          consumed_at?: string | null
          is_special_event?: boolean
          special_event_type?: string | null
          special_event_description?: string | null
          special_event_calories?: number | null
          special_event_ai_suggestions?: any
          is_adjusted?: boolean
          adjusted_from?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          consumed?: boolean
          consumed_at?: string | null
          is_special_event?: boolean
          special_event_type?: string | null
          special_event_description?: string | null
          special_event_calories?: number | null
          special_event_ai_suggestions?: any
          calories?: number
          protein?: number
          carbs?: number
          fat?: number
          fiber?: number
          is_adjusted?: boolean
          adjusted_from?: number | null
          updated_at?: string
        }
      }
      foods: {
        Row: {
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
        Insert: {
          id?: string
          meal_id: string
          name: string
          calories: number
          protein: number
          carbs: number
          fat: number
          fiber?: number | null
          order: number
          created_at?: string
        }
        Update: {
          name?: string
          calories?: number
          protein?: number
          carbs?: number
          fat?: number
          fiber?: number | null
          order?: number
        }
      }
    }
  }
}

