'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    console.log('🔐 useAuth - checking user')

    // 檢查當前用戶
    supabase.auth.getUser().then(({ data: { user } }) => {
      console.log('🔐 useAuth - got user:', user)
      setUser(user)
      setLoading(false)
    })

    // 監聽認證狀態變化
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔐 useAuth - auth state changed:', event)
      setUser(session?.user ?? null)

      if (event === 'SIGNED_IN') {
        // 檢查當前路徑，如果是特殊頁面（如等待頁面），不要自動重定向
        const currentPath = window.location.pathname
        const skipRedirectPaths = ['/travel-future', '/travel-completed', '/travel-generating']
        
        if (!skipRedirectPaths.includes(currentPath)) {
          console.log('🔐 User signed in, redirecting to /')
          router.push('/')
          router.refresh()
        } else {
          console.log('🔐 User signed in, but staying on', currentPath, '(special page)')
        }
      }

      if (event === 'SIGNED_OUT') {
        // 檢查當前路徑，如果已經在登入頁面，不要重定向
        const currentPath = window.location.pathname
        if (currentPath !== '/auth') {
          console.log('🔐 User signed out, redirecting to /auth')
          router.push('/auth')
          router.refresh()
        }
      }
    })

    return () => {
      console.log('🔐 useAuth - cleanup')
      subscription.unsubscribe()
    }
  }, [router])

  const signOut = async () => {
    console.log('🔐 Signing out')
    await supabase.auth.signOut()
  }

  return {
    user,
    loading,
    signOut,
  }
}

