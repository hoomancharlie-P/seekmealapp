'use client'

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/hooks/useAuth'

export default function AuthGuard({ children }: { children: ReactNode }) {
  console.log('🔒 AuthGuard render')

  const { user, loading } = useAuth()
  const router = useRouter()

  console.log('🔒 AuthGuard - user:', user)
  console.log('🔒 AuthGuard - loading:', loading)

  useEffect(() => {
    console.log('🔒 AuthGuard mounted (client)')
  }, [])

  useEffect(() => {
    console.log('🔒 AuthGuard useEffect - user:', user, 'loading:', loading)

    if (!loading && !user) {
      console.log('🔒 No user, redirecting to /auth')
      router.push('/auth')
    }
  }, [user, loading, router])

  if (loading) {
    console.log('🔒 AuthGuard - showing loading')
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">😺</div>
          <p className="text-gray-600">載入中...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    console.log('🔒 AuthGuard - no user, returning null')
    return null
  }

  console.log('🔒 AuthGuard - user exists, rendering children')
  return <>{children}</>
}

