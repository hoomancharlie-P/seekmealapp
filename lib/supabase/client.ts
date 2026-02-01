import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Database 類型定義 - 使用 any 以保持兼容性
// 如果需要完整的類型定義，可以從 types/database.ts 導入
export type Database = any

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
}

if (!supabaseAnonKey) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

// 使用 @supabase/ssr 的 createBrowserClient 以確保 cookies 正確設置
// 明確配置 cookies 選項，確保使用 document.cookie 而不是 localStorage
export const supabase: SupabaseClient<Database> = createBrowserClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    cookies: {
      getAll() {
        // 解析 document.cookie 並返回所有 cookies
        if (typeof document === 'undefined') return []
        const cookies = document.cookie.split(';').map(c => c.trim())
        return cookies
          .filter(c => c)
          .map(c => {
            const [name, ...valueParts] = c.split('=')
            return { name: name.trim(), value: valueParts.join('=') }
          })
      },
      setAll(cookiesToSet) {
        // 設置所有 cookies
        if (typeof document === 'undefined') return
        cookiesToSet.forEach(({ name, value, options }) => {
          let cookieString = `${name}=${value}`
          if (options?.path) cookieString += `; path=${options.path}`
          if (options?.maxAge) cookieString += `; max-age=${options.maxAge}`
          if (options?.sameSite) cookieString += `; SameSite=${options.sameSite}`
          if (options?.secure) cookieString += `; Secure`
          if (options?.domain) cookieString += `; domain=${options.domain}`
          document.cookie = cookieString
        })
      }
    }
  }
)

