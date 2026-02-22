import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

type FoodInput = {
  id?: string
  name: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  portion?: string
}

function getAuth(request: NextRequest): Promise<{ supabase: any; userId: string }> {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const tempClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    return tempClient.auth.getUser(token).then(({ data: { user }, error }) => {
      if (error || !user) throw new Error('Unauthorized')
      const supabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      )
      return { supabase, userId: user.id }
    })
  }
  return createClient().then(async (supabase) => {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Unauthorized')
    return { supabase, userId: user.id }
  })
}

/**
 * PUT /api/meals/[mealId]/foods
 * 修改單項食物：以新列表替換該餐所有食物（可增/刪），並依食物重算餐單總營養與卡路里。
 * Body: { foods: Array<{ name, calories?, protein?, carbs?, fat?, fiber?, portion? }> }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ mealId: string }> }
) {
  try {
    const { mealId } = await params
    if (!mealId) {
      return NextResponse.json({ error: 'Missing mealId' }, { status: 400 })
    }

    const { supabase, userId } = await getAuth(request).catch(() => {
      throw new Error('UNAUTH')
    })

    const body = await request.json().catch(() => ({}))
    const { foods: foodsInput } = body as { foods?: FoodInput[] }

    if (!Array.isArray(foodsInput)) {
      return NextResponse.json({ error: '請提供 foods 陣列' }, { status: 400 })
    }

    const { data: meal, error: mealError } = await supabase
      .from('meals')
      .select('id, user_id')
      .eq('id', mealId)
      .single()

    if (mealError || !meal) {
      return NextResponse.json({ error: '找不到該餐' }, { status: 404 })
    }
    if (meal.user_id !== userId) {
      return NextResponse.json({ error: '無權限操作此餐' }, { status: 403 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const writeClient =
      supabaseUrl && serviceKey
        ? createSupabaseClient(supabaseUrl, serviceKey)
        : supabase

    const normalized = foodsInput.map((f: FoodInput, i: number) => ({
      name: typeof f.name === 'string' ? (f.portion ? `${f.name} ${f.portion}`.trim() : f.name) : String(f.name ?? ''),
      calories: Math.max(0, Number(f.calories) ?? 0),
      protein: Math.max(0, Number(f.protein) ?? 0),
      carbs: Math.max(0, Number(f.carbs) ?? 0),
      fat: Math.max(0, Number(f.fat) ?? 0),
      fiber: Math.max(0, Number(f.fiber) ?? 0),
      order: i
    }))

    const totalCalories = normalized.reduce((s, f) => s + f.calories, 0)
    const totalProtein = normalized.reduce((s, f) => s + f.protein, 0)
    const totalCarbs = normalized.reduce((s, f) => s + f.carbs, 0)
    const totalFat = normalized.reduce((s, f) => s + f.fat, 0)
    const totalFiber = normalized.reduce((s, f) => s + f.fiber, 0)

    const { error: delErr } = await writeClient.from('foods').delete().eq('meal_id', mealId)
    if (delErr) {
      console.error('PUT foods delete:', delErr)
      return NextResponse.json({ error: '更新食物失敗' }, { status: 500 })
    }

    if (normalized.length > 0) {
      const toInsert = normalized.map((f) => ({
        meal_id: mealId,
        name: f.name,
        calories: f.calories,
        protein: f.protein,
        carbs: f.carbs,
        fat: f.fat,
        fiber: f.fiber,
        order: f.order
      }))
      const { error: insErr } = await writeClient.from('foods').insert(toInsert)
      if (insErr) {
        console.error('PUT foods insert:', insErr)
        return NextResponse.json({ error: '寫入食物失敗' }, { status: 500 })
      }
    }

    const now = new Date().toISOString()
    const { error: updateErr } = await writeClient
      .from('meals')
      .update({
        calories: totalCalories,
        protein: totalProtein,
        carbs: totalCarbs,
        fat: totalFat,
        fiber: totalFiber,
        updated_at: now
      })
      .eq('id', mealId)

    if (updateErr) {
      console.error('PUT foods update meal:', updateErr)
      return NextResponse.json({ error: '更新餐單總營養失敗' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      meal: {
        id: mealId,
        calories: totalCalories,
        protein: totalProtein,
        carbs: totalCarbs,
        fat: totalFat,
        fiber: totalFiber
      },
      foods: normalized.map((f, i) => ({ ...f, order: i }))
    })
  } catch (e: any) {
    if (e?.message === 'UNAUTH') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('PUT foods error:', e)
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
