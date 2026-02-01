'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import AuthGuard from '@/components/AuthGuard'

export default function TravelCompletedPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const destination = searchParams.get('destination')
  
  useEffect(() => {
    // 3秒後自動跳轉到主頁
    const timer = setTimeout(() => {
      router.push('/?travelModeActivated=true')
    }, 3000)
    
    return () => clearTimeout(timer)
  }, [router])
  
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="w-20 h-20 mx-auto mb-6 text-6xl"
          >
            ✅
          </motion.div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            🌍 旅遊餐單已生成
          </h1>
          
          {destination && (
            <div className="bg-blue-50 rounded-xl p-4 mb-6 text-left">
              <p className="text-gray-700 mb-2">
                <span className="font-semibold">目的地：</span>{destination}
              </p>
              <p className="text-sm text-gray-600">
                💡 你可以在主頁查看專屬的旅遊餐單
              </p>
            </div>
          )}
          
          <p className="text-sm text-gray-500 mb-6">
            3秒後自動返回主頁...
          </p>
          
          <button
            onClick={() => router.push('/?travelModeActivated=true')}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-colors"
          >
            立即查看餐單
          </button>
        </motion.div>
      </div>
    </AuthGuard>
  )
}
