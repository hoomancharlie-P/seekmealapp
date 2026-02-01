'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Meal } from '@/types/meal'

interface SpecialEventModalProps {
  meal: Meal | null
  isOpen: boolean
  onClose: () => void
  onConfirm: (eventData: SpecialEventData) => void
}

export interface SpecialEventData {
  type: 'hotpot' | 'bbq' | 'buffet' | 'birthday' | 'drinks' | 'other'
  description?: string
  adjustmentStrategy: 'auto-adjust-meals' | 'control-event'
}

export default function SpecialEventModal({
  meal,
  isOpen,
  onClose,
  onConfirm
}: SpecialEventModalProps) {
  
  const [selectedType, setSelectedType] = useState<SpecialEventData['type'] | null>(null)
  const [description, setDescription] = useState('')
  const [adjustmentStrategy, setAdjustmentStrategy] = useState<'auto-adjust-meals' | 'control-event'>('auto-adjust-meals')
  
  if (!meal) return null
  
  // 餐次名稱
  const mealTypeName = {
    breakfast: '早餐',
    lunch: '午餐',
    dinner: '晚餐',
    snack: '小食'
  }[meal.type]
  
  // 活動類型選項
  const eventTypes = [
    { type: 'hotpot' as const, emoji: '🍲', label: '火鍋' },
    { type: 'bbq' as const, emoji: '🍖', label: '燒烤' },
    { type: 'buffet' as const, emoji: '🍱', label: '自助餐' },
    { type: 'birthday' as const, emoji: '🎂', label: '生日會' },
    { type: 'drinks' as const, emoji: '🍺', label: '飲酒' },
    { type: 'other' as const, emoji: '➕', label: '其他' }
  ]
  
  // 重置狀態
  const resetForm = () => {
    setSelectedType(null)
    setDescription('')
    setAdjustmentStrategy('auto-adjust-meals')
  }
  
  // 處理關閉
  const handleClose = () => {
    resetForm()
    onClose()
  }
  
  // 處理確認
  const handleConfirm = () => {
    if (!selectedType && !description.trim()) {
      alert('請選擇活動類型或輸入描述')
      return
    }
    
    const eventData: SpecialEventData = {
      type: selectedType || 'other',
      description: description.trim() || undefined,
      adjustmentStrategy
    }
    
    onConfirm(eventData)
    handleClose()
  }
  
  // 處理文字輸入（自動設為「其他」）
  const handleDescriptionChange = (text: string) => {
    setDescription(text)
    if (text.trim() && !selectedType) {
      setSelectedType('other')
    }
  }
  
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
            onClick={handleClose}
          />
          
          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-w-2xl mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-t-3xl shadow-2xl">
              {/* 拖動條 */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-12 h-1 bg-gray-300 rounded-full" />
              </div>
              
              {/* 標題 */}
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900">
                  🎉 {mealTypeName}有特殊活動
                </h2>
              </div>
              
              {/* 內容區域 */}
              <div className="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto">
                
                {/* 活動類型選擇 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    活動類型：
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {eventTypes.map((event) => (
                      <button
                        key={event.type}
                        onClick={() => setSelectedType(event.type)}
                        type="button"
                        className={`
                          p-4 rounded-2xl border-2 transition-all
                          ${selectedType === event.type
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                          }
                        `}
                      >
                        <div className="text-3xl mb-1">{event.emoji}</div>
                        <div className={`text-sm font-medium ${
                          selectedType === event.type ? 'text-primary-700' : 'text-gray-700'
                        }`}>
                          {event.label}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* 文字輸入 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    或者自己輸入：
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => handleDescriptionChange(e.target.value)}
                    placeholder="例如：朋友生日食蛋糕、公司聚餐..."
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-400 focus:outline-none resize-none"
                  />
                </div>
                
                {/* 調整方案 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    調整方案：
                  </label>
                  <div className="space-y-3">
                    {/* 方案 1: 自動調整其他餐次 */}
                    <button
                      onClick={() => setAdjustmentStrategy('auto-adjust-meals')}
                      type="button"
                      className={`
                        w-full p-4 rounded-xl border-2 transition-all text-left
                        ${adjustmentStrategy === 'auto-adjust-meals'
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                        }
                      `}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`
                          w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0
                          ${adjustmentStrategy === 'auto-adjust-meals' ? 'border-primary-500 bg-primary-500' : 'border-gray-300'}
                        `}>
                          {adjustmentStrategy === 'auto-adjust-meals' && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                              <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className={`font-medium text-sm ${
                            adjustmentStrategy === 'auto-adjust-meals' ? 'text-primary-700' : 'text-gray-700'
                          }`}>
                            自動調整其他餐次
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            減少其他餐次卡路里，留空間畀活動
                          </div>
                        </div>
                      </div>
                    </button>
                    
                    {/* 方案 2: 控制活動時的份量 */}
                    <button
                      onClick={() => setAdjustmentStrategy('control-event')}
                      type="button"
                      className={`
                        w-full p-4 rounded-xl border-2 transition-all text-left
                        ${adjustmentStrategy === 'control-event'
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                        }
                      `}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`
                          w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0
                          ${adjustmentStrategy === 'control-event' ? 'border-primary-500 bg-primary-500' : 'border-gray-300'}
                        `}>
                          {adjustmentStrategy === 'control-event' && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                              <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className={`font-medium text-sm ${
                            adjustmentStrategy === 'control-event' ? 'text-primary-700' : 'text-gray-700'
                          }`}>
                            控制活動時的份量
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            保持其他餐次不變，活動時控制食量
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
                
              </div>
              
              {/* 按鈕區域 */}
              <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
                <button
                  onClick={handleClose}
                  type="button"
                  className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirm}
                  type="button"
                  className="flex-1 py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors shadow-md"
                >
                  確認調整餐單
                </button>
              </div>
              
              {/* 底部安全區域 */}
              <div className="h-4" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
