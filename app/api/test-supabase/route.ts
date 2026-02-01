import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // 測試連接
    const { data, error } = await supabase.from('profiles').select('*').limit(1)

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Supabase connected!',
      note:
        'This endpoint uses the anon key without an authenticated user context. If RLS is enabled (e.g. auth.uid() policies), data may be empty even when rows exist. Use /api/test-supabase/admin (dev only) or check Table Editor to verify rows.',
      data,
    })
  } catch (error: any) {
    console.error('Connection error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    )
  }
}

