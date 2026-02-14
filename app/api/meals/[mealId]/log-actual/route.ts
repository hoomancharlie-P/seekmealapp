import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

type FoodInput = {
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
 * POST /api/meals/[mealId]/log-actual
 * 記錄實際：更新該餐的實際卡路里/營養（及可選的實際食物列表），並標記為已食用。
 * Body: { calories?, protein?, carbs?, fat?, fiber?, foods? }
 */
export async function POST(
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
    const { calories, protein, carbs, fat, fiber, foods: foodsInput } = body as {
      calories?: number
      protein?: number
      carbs?: number
      fat?: number
      fiber?: number
      foods?: FoodInput[]
    }

    const hasTotals =
      typeof calories === 'number' ||
      typeof protein === 'number' ||
      typeof carbs === 'number' ||
      typeof fat === 'number' ||
      typeof fiber === 'number'
    const hasFoods = Array.isArray(foodsInput) && foodsInput.length > 0

    if (!hasTotals && !hasFoods) {
      return NextResponse.json(
        { error: '請提供整餐卡路里/營養（calories, protein, carbs, fat, fiber）或食物列表（foods）' },
        { status: 400 }
      )
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

    // 使用 service role 寫入，避免 RLS 在 mobile → API 情境下阻擋
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const writeClient =
      supabaseUrl && serviceKey
        ? createSupabaseClient(supabaseUrl, serviceKey)
        : supabase

    let finalCalories: number
    let finalProtein: number
    let finalCarbs: number
    let finalFat: number
    let finalFiber: number

    if (hasFoods) {
      const normalized = foodsInput!.map((f: FoodInput, i: number) => ({
        name: typeof f.name === 'string' ? (f.portion ? `${f.name} ${f.portion}`.trim() : f.name) : String(f.name ?? ''),
        calories: Number(f.calories) ?? 0,
        protein: Number(f.protein) ?? 0,
        carbs: Number(f.carbs) ?? 0,
        fat: Number(f.fat) ?? 0,
        fiber: Number(f.fiber) ?? 0,
        order: i
      }))
      finalCalories = hasTotals ? Number(calories) ?? 0 : normalized.reduce((s, f) => s + f.calories, 0)
      finalProtein = hasTotals ? Number(protein) ?? 0 : normalized.reduce((s, f) => s + f.protein, 0)
      finalCarbs = hasTotals ? Number(carbs) ?? 0 : normalized.reduce((s, f) => s + f.carbs, 0)
      finalFat = hasTotals ? Number(fat) ?? 0 : normalized.reduce((s, f) => s + f.fat, 0)
      finalFiber = hasTotals ? Number(fiber) ?? 0 : normalized.reduce((s, f) => s + f.fiber, 0)

      const { error: delErr } = await writeClient.from('foods').delete().eq('meal_id', mealId)
      if (delErr) {
        console.error('log-actual delete foods:', delErr)
        return NextResponse.json({ error: '更新食物失敗' }, { status: 500 })
      }
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
        console.error('log-actual insert foods:', insErr)
        return NextResponse.json({ error: '寫入食物失敗' }, { status: 500 })
      }
    } else {
      finalCalories = Number(calories) ?? 0
      finalProtein = Number(protein) ?? 0
      finalCarbs = Number(carbs) ?? 0
      finalFat = Number(fat) ?? 0
      finalFiber = Number(fiber) ?? 0
    }

    const now = new Date().toISOString()
    const { error: updateErr } = await writeClient
      .from('meals')
      .update({
        calories: finalCalories,
        protein: finalProtein,
        carbs: finalCarbs,
        fat: finalFat,
        fiber: finalFiber,
        consumed: true,
        consumed_at: now,
        updated_at: now
      })
      .eq('id', mealId)

    if (updateErr) {
      console.error('log-actual update meal:', updateErr)
      return NextResponse.json({ error: '更新餐單失敗' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      meal: {
        id: mealId,
        calories: finalCalories,
        protein: finalProtein,
        carbs: finalCarbs,
        fat: finalFat,
        fiber: finalFiber,
        consumed: true,
        consumed_at: now
      }
    })
  } catch (e: any) {
    if (e?.message === 'UNAUTH') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('log-actual error:', e)
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
