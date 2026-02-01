import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

export async function GET() {
  // Safety: don't expose a service-role powered endpoint in production.
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Missing env. Please set SUPABASE_SERVICE_ROLE_KEY (server-only) to use this dev admin test endpoint.',
      },
      { status: 500 }
    )
  }

  const admin = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await admin
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Supabase admin error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: 'Supabase admin query ok (RLS bypassed via service role).',
    count: data?.length ?? 0,
    data,
  })
}

