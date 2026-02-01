'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { Meal } from '@/types/meal'

interface EditMealModalProps {
  meal: Meal | null
  isOpen: boolean
  onClose: () => void
  onRegenerateMeal: (mealId: string) => void
  onReplaceFood: (mealId: string) => void
  onRecordActual: (mealId: string) => void
  onSpecialEvent: (mealId: string) => void
}

export default function EditMealModal({
  meal,
  isOpen,
  onClose,
  onRegenerateMeal,
  onReplaceFood,
  onRecordActual,
  onSpecialEvent
}: EditMealModalProps) {
  
  if (!meal) return null
  
  // 餐次名稱
  const mealTypeName = {
    breakfast: '早餐',
    lunch: '午餐',
    dinner: '晚餐',
    snack: '小食'
  }[meal.type]
  
  // 選項按鈕配置（已記錄的餐次不顯示「更換餐單」）
  const allOptions = [
    {
      id: 'special-event',
      icon: '🎉',
      label: '有特殊活動',
      description: '今餐有聚會、應酬等',
      onClick: () => {
        onSpecialEvent(meal.id)
        onClose()
      },
      highlight: true
    },
    {
      id: 'regenerate',
      icon: '🔄',
      label: '更換餐單',
      description: '想食第啲野',
      onClick: () => {
        onRegenerateMeal(meal.id)
        onClose()
      }
    },
    {
      id: 'record',
      icon: '✍️',
      label: '手動記錄',
      description: '記錄真實吃的',
      onClick: () => {
        onRecordActual(meal.id)
        onClose()
      }
    }
  ]
  const options = allOptions.filter((o) => o.id !== 'regenerate' || !meal.consumed)
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />
          
          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-w-2xl mx-auto"
          >
            <div className="bg-white rounded-t-3xl shadow-2xl">
              {/* 拖動條 */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-12 h-1 bg-gray-300 rounded-full" />
              </div>
              
              {/* 標題 */}
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900">
                  管理{mealTypeName}
                </h2>
              </div>
              
              {/* 選項列表 */}
              <div className="px-6 py-4 space-y-2 max-h-[70vh] overflow-y-auto">
                {options.map((option) => (
                  <button
                    key={option.id}
                    onClick={option.onClick}
                    type="button"
                    className={`
                      w-full text-left p-4 rounded-2xl transition-all
                      ${option.highlight
                        ? 'bg-yellow-50 hover:bg-yellow-100 border-2 border-yellow-200'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{option.icon}</span>
                      <div className="flex-1">
                        <div className={`font-semibold ${
                          option.highlight ? 'text-yellow-900' : 'text-gray-900'
                        }`}>
                          {option.label}
                          {option.highlight && (
                            <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full">
                              新功能
                            </span>
                          )}
                        </div>
                        <div className={`text-sm mt-0.5 ${
                          option.highlight ? 'text-yellow-700' : 'text-gray-500'
                        }`}>
                          {option.description}
                        </div>
                      </div>
                      <svg 
                        className="w-5 h-5 text-gray-400" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
              
              {/* 取消按鈕 */}
              <div className="px-6 py-4 border-t border-gray-100">
                <button
                  onClick={onClose}
                  type="button"
                  className="w-full py-3 text-gray-600 hover:text-gray-900 font-medium transition-colors"
                >
                  ✕ 取消
                </button>
              </div>
              
              {/* 底部安全區域 (iPhone 等) */}
              <div className="pb-safe-area-inset-bottom" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
