'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import AuthGuard from '@/components/AuthGuard'

export default function TravelFuturePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const days = searchParams.get('days')
  const destination = searchParams.get('destination')
  
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center"
        >
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-20 h-20 mx-auto mb-6 text-6xl"
          >
            📦
          </motion.div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            ✈️ 旅遊計劃已啟動
          </h1>
          
          <div className="bg-blue-50 rounded-xl p-4 mb-6 text-left">
            <p className="text-gray-700 mb-3">
              <span className="font-semibold">目的地：</span>{destination || '未知'}
            </p>
            <p className="text-gray-700 mb-3">
              <span className="font-semibold">出發日期：</span>還有 {days || '未知'} 天
            </p>
            <div className="mt-4 pt-4 border-t border-blue-200">
              <p className="text-sm text-gray-600">
                💡 <span className="font-semibold">旅遊餐單已儲存</span>
              </p>
              <p className="text-sm text-gray-600 mt-2">
                在出發前2天，系統會自動啟用旅行餐單，你可以在主頁查看。
              </p>
            </div>
          </div>
          
          <button
            onClick={() => router.push('/settings')}
            className="mt-6 w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-colors"
          >
            我知道了
          </button>
        </motion.div>
      </div>
    </AuthGuard>
  )
}
