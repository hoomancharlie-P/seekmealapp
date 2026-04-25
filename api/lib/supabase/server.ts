import { cookies } from 'next/headers'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

function extractAccessToken(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null
  try {
    const parsed = JSON.parse(cookieValue)
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0]
    if (parsed && typeof parsed.access_token === 'string') return parsed.access_token
  } catch {
    // Ignore invalid cookie JSON
  }
  return null
}

export async function createClient(): Promise<SupabaseClient<Database>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
  }

  if (!supabaseAnonKey) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  const cookieStore = await cookies()

  // Try known Supabase auth cookie formats.
  const candidateCookies = cookieStore.getAll().map((c) => c.value)
  const accessToken =
    candidateCookies.map((v) => extractAccessToken(v)).find(Boolean) ?? null

  if (accessToken) {
    return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }

  return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey)
}
