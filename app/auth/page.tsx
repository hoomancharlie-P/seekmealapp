'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    console.log('🟢 handleSignUp called')
    console.log('📧 Email:', email)
    console.log('👤 Username:', username)

    try {
      console.log('📤 Calling supabase.auth.signUp...')

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username || email.split('@')[0],
          },
        },
      })

      console.log('📥 Sign up response:', { data, error: signUpError })

      if (signUpError) {
        console.error('❌ Sign up error:', signUpError)
        throw signUpError
      }

      console.log('✅ Sign up successful!')
      console.log('👤 User ID:', data.user?.id)
      console.log('📧 User email:', data.user?.email)

      if (data.session) {
        console.log('✅ Sign up successful, session:', data.session)
        console.log('🍪 Checking cookies after signup...')
        
        // 等待一下讓 cookies 設置
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // 檢查 session 是否已設置
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        console.log('📋 Current session after signup:', currentSession ? 'exists' : 'missing')
        
        if (currentSession) {
          console.log('🔀 Redirecting to /onboarding...')
          router.push('/onboarding')
          router.refresh()
          console.log('✅ Router.push called')
        } else {
          console.log('⚠️ Session not set after signup')
        }
      } else if (data.user) {
        // 如果沒有 session 但有 user，可能是需要郵箱驗證
        console.log('⚠️ User created but no session (may need email verification)')
        setError('請檢查您的郵箱以驗證帳號')
      } else {
        console.log('⚠️ No user data returned')
      }
    } catch (error: any) {
      console.error('💥 Catch block - Sign up error:', error)
      setError(error.message || '註冊失敗，請重試')
    } finally {
      console.log('🏁 handleSignUp finished')
      setLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (loginError) throw loginError

      if (data.session) {
        console.log('✅ Login successful, session:', data.session)
        console.log('🍪 Checking storage after login...')
        
        // 檢查所有可能的存儲位置
        console.log('🍪 document.cookie:', document.cookie)
        console.log('🍪 localStorage keys:', Object.keys(localStorage))
        console.log('🍪 sessionStorage keys:', Object.keys(sessionStorage))
        
        // 檢查 Supabase 相關的 localStorage
        const supabaseLocalStorage = Object.keys(localStorage).filter(k => k.includes('supabase') || k.startsWith('sb-'))
        console.log('🍪 Supabase localStorage keys:', supabaseLocalStorage)
        
        // 等待一下讓存儲設置
        await new Promise(resolve => setTimeout(resolve, 300))
        
        // 再次檢查
        console.log('🍪 document.cookie after wait:', document.cookie)
        const supabaseLocalStorageAfter = Object.keys(localStorage).filter(k => k.includes('supabase') || k.startsWith('sb-'))
        console.log('🍪 Supabase localStorage keys after wait:', supabaseLocalStorageAfter)
        
        // 檢查 session 是否已設置
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession()
        console.log('📋 Current session after login:', currentSession ? 'exists' : 'missing')
        if (sessionError) {
          console.error('❌ Session error:', sessionError)
        }
        
        if (currentSession) {
          console.log('✅ Session confirmed, redirecting...')
          router.push('/')
          router.refresh()
        } else {
          console.error('❌ Session not found after login')
          throw new Error('Session 設置失敗，請重試')
        }
      } else {
        throw new Error('登入失敗，未收到 session')
      }
    } catch (error: any) {
      console.error('Login error:', error)
      setError(error.message || '登入失敗，請檢查郵箱和密碼')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-green-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">😺</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">食喵 SeekMeal</h1>
          <p className="text-gray-600">{mode === 'login' ? '歡迎返嚟！' : '加入我哋啦！'}</p>
        </div>

        {/* Auth Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-gray-100">
          {/* Mode Toggle */}
          <div className="flex gap-2 mb-6 bg-gray-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => {
                setMode('login')
                setError('')
              }}
              className={`flex-1 py-2 rounded-lg font-medium transition-all ${
                mode === 'login' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-600'
              }`}
            >
              登入
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup')
                setError('')
              }}
              className={`flex-1 py-2 rounded-lg font-medium transition-all ${
                mode === 'signup' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-600'
              }`}
            >
              註冊
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm"
            >
              {error}
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={mode === 'login' ? handleLogin : handleSignUp} className="space-y-4">
            {/* Username (只在註冊時顯示) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">用戶名（可選）</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="輸入用戶名"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400 transition-colors"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">電郵地址</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400 transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 個字符"
                required
                minLength={6}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400 transition-colors"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md hover:shadow-lg"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  處理中...
                </span>
              ) : mode === 'login' ? (
                '登入'
              ) : (
                '註冊'
              )}
            </button>
          </form>

          {/* Extra Info */}
          {mode === 'signup' && (
            <p className="mt-4 text-xs text-gray-500 text-center">註冊即表示你同意我們的服務條款和隱私政策</p>
          )}
        </div>

        {/* Demo Account */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">測試帳號：demo@seekmeal.com / password123</p>
        </div>
      </motion.div>
    </div>
  )
}

