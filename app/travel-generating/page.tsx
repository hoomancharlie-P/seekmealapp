'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import AuthGuard from '@/components/AuthGuard'

function TravelGeneratingPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('正在生成旅遊餐單...')
  
  useEffect(() => {
    // 檢查是否有錯誤參數
    const error = searchParams.get('error')
    if (error) {
      setStatus('生成失敗')
      setTimeout(() => {
        router.push('/settings')
      }, 2000)
      return
    }
    
    // 檢查是否成功
    const success = searchParams.get('success')
    if (success === 'true') {
      const destination = searchParams.get('destination') || ''
      setStatus('✅ 旅遊餐單生成完成！')
      setTimeout(() => {
        router.push('/?travelModeActivated=true')
      }, 2000)
      return
    }
    
    // 如果沒有參數，可能是直接訪問，重定向到設置頁面
    if (!searchParams.toString()) {
      router.push('/settings')
    }
  }, [searchParams, router])
  
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-20 h-20 mx-auto mb-6"
          >
            <div className="w-full h-full rounded-full border-4 border-blue-200 border-t-blue-600"></div>
          </motion.div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            🌍 旅遊餐單生成中…
          </h1>
          
          <p className="text-gray-600 mb-6">
            {status}
          </p>
          
          <div className="flex justify-center gap-2">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0 }}
              className="w-2 h-2 bg-blue-600 rounded-full"
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
              className="w-2 h-2 bg-blue-600 rounded-full"
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
              className="w-2 h-2 bg-blue-600 rounded-full"
            />
          </div>
        </motion.div>
      </div>
    </AuthGuard>
  )
}

export default function TravelGeneratingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">載入中...</div>}>
      <TravelGeneratingPageContent />
    </Suspense>
  )
}
