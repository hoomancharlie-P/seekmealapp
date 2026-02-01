import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * GET /api/meals?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * 服務端取得當前用戶的餐單（含 foods），供主頁等頁面使用，避免瀏覽器直連 Supabase 造成 CORS/502。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Missing startDate or endDate' }, { status: 400 })
    }

    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
    let supabase: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createSupabaseClient>
    let userId: string

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const tempClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data: { user }, error } = await tempClient.auth.getUser(token)
      if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
      supabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      )
    } else {
      supabase = await createClient()
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    const { data: meals, error: mealsError } = await supabase
      .from('meals')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    if (mealsError) {
      console.error('GET /api/meals meals error:', mealsError)
      return NextResponse.json({ error: mealsError.message }, { status: 500 })
    }

    if (!meals?.length) {
      return NextResponse.json([])
    }

    const mealIds = meals.map((m: { id: string }) => m.id)
    const { data: foods, error: foodsError } = await supabase
      .from('foods')
      .select('*')
      .in('meal_id', mealIds)
      .order('order', { ascending: true })

    if (foodsError) {
      console.error('GET /api/meals foods error:', foodsError)
      return NextResponse.json({ error: foodsError.message }, { status: 500 })
    }

    const mealsWithFoods = meals.map((meal: any) => ({
      ...meal,
      foods: (foods || []).filter((f: any) => f.meal_id === meal.id),
    }))

    return NextResponse.json(mealsWithFoods)
  } catch (e: any) {
    console.error('GET /api/meals error:', e)
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
