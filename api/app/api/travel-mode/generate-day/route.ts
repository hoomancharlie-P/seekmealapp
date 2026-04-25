import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { generateTravelMealsForDay } from '../route'

/** POST: 為指定日期生成一天旅遊餐單（用於主頁補充缺少的日期） */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, date, destination, cuisine } = body

    if (!userId || !date || !destination) {
      return NextResponse.json({ error: 'Missing userId, date or destination' }, { status: 400 })
    }

    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
    let currentUserId: string | null = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const temp = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data: { user } } = await temp.auth.getUser(token)
      if (user) currentUserId = user.id
    } else {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) currentUserId = user.id
    }

    if (!currentUserId || currentUserId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    await generateTravelMealsForDay(userId, date, destination, cuisine || 'general', profile)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('❌ generate-day error:', error)
    return NextResponse.json(
      { error: '生成失敗', details: error?.message },
      { status: 500 }
    )
  }
}
