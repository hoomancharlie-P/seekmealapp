'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { AdjustMealPlanOutput, AdjustmentOption } from '@/lib/adjustMealPlan'

interface AdjustmentPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  adjustmentResult: AdjustMealPlanOutput | null
  eventMealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  onConfirm: (selectedOption: AdjustmentOption) => void
}

export default function AdjustmentPreviewModal({
  isOpen,
  onClose,
  adjustmentResult,
  eventMealType,
  onConfirm
}: AdjustmentPreviewModalProps) {
  
  if (!adjustmentResult) return null
  
  const { analysis, structuredSuggestions, options } = adjustmentResult
  
  const mealTypeName: Record<string, string> = {
    breakfast: '早餐',
    lunch: '午餐',
    dinner: '晚餐',
    snack: '小食'
  }
  
  const selectedOption = options[0]  // 直接用第一個方案
  
  // 計算已記錄卡路里
  const consumedCalories = analysis.originalTotal - analysis.eventCalories - analysis.remainingCalories
  
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
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-t-3xl shadow-2xl">
              {/* 拖動條 */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-12 h-1 bg-gray-300 rounded-full" />
              </div>
              
              {/* 標題 */}
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  餐單已調整
                  {analysis.willExceed ? (
                    <span className="text-yellow-600">⚠️</span>
                  ) : (
                    <span className="text-green-600">✓</span>
                  )}
                </h2>
              </div>
              
              {/* 內容區域 */}
              <div className="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto">
                
                {/* 分析結果卡片 */}
                <div className={`
                  p-4 rounded-2xl border-2
                  ${analysis.willExceed 
                    ? 'bg-yellow-50 border-yellow-200' 
                    : 'bg-green-50 border-green-200'
                  }
                `}>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-700">🎯 今日目標：</span>
                      <span className="font-semibold">{analysis.originalTotal} 卡</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700">📊 已記錄：</span>
                      <span className="font-semibold">{consumedCalories} 卡</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700">📉 剩餘：</span>
                      <span className="font-semibold">{analysis.remainingCalories} 卡</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700">🎉 活動：</span>
                      <span className="font-semibold">
                        {mealTypeName[eventMealType]}（{analysis.eventCalories} 卡）
                      </span>
                    </div>
                    
                    {analysis.willExceed && (
                      <div className="mt-3 pt-3 border-t border-yellow-300">
                        <div className="flex items-center gap-2 text-yellow-800">
                          <span className="text-lg">⚠️</span>
                          <span className="font-semibold">
                            預計會超標約 {analysis.exceedAmount} 卡
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* 調整後的餐單 */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <span>━━━</span>
                    <span>調整後的餐單</span>
                    <span>━━━</span>
                  </h3>
                  
                  <div className="space-y-3">
                    {selectedOption.adjustedMeals.map((meal) => (
                      <div key={meal.id} className="bg-gray-50 rounded-xl p-3">
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xl">{meal.emoji}</span>
                            <span className="font-semibold text-gray-900">
                              {mealTypeName[meal.type]}
                            </span>
                            {meal.isAdjusted && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                🔽 已調整
                              </span>
                            )}
                          </div>
                          <div className="text-sm">
                            <span className="font-semibold text-gray-900">{meal.calories} 卡</span>
                            {meal.isAdjusted && meal.adjustedFrom && (
                              <span className="text-gray-500 ml-1">
                                (原本 {meal.adjustedFrom})
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <ul className="space-y-2 text-xs">
                          {meal.foods.slice(0, 3).map((food, i) => (
                            <li key={i} className="bg-white rounded-lg p-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1">
                                  <span className="text-primary-500">•</span>
                                  <span className="font-medium text-gray-900">{food.name}</span>
                                  <span className="text-gray-300">
                                    P{food.protein || 0}g/ C{food.carbs || 0}g/ F{food.fat || 0}g
                                  </span>
                                </div>
                                <span className="font-semibold text-gray-900 whitespace-nowrap">
                                  {food.calories}卡
                                </span>
                              </div>
                            </li>
                          ))}
                          {meal.foods.length > 3 && (
                            <li className="text-gray-400 text-center">... 等 {meal.foods.length} 項</li>
                          )}
                        </ul>
                      </div>
                    ))}
                    
                    {/* 活動餐次 */}
                    <div className="bg-yellow-50 rounded-xl p-3 border-2 border-yellow-200">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xl">
                            {eventMealType === 'breakfast' ? '🌅' : 
                             eventMealType === 'lunch' ? '🌤️' : 
                             eventMealType === 'dinner' ? '🌙' : '🍎'}
                          </span>
                          <span className="font-semibold text-gray-900">
                            {mealTypeName[eventMealType]}
                          </span>
                          <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full">
                            🎉 特殊活動
                          </span>
                        </div>
                        <span className="font-semibold text-gray-900">
                          {analysis.eventCalories} 卡
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* AI 建議 - 自然流暢，無 subtitle */}
                {structuredSuggestions && (
                  <div className="bg-gradient-to-br from-primary-50 to-green-50 rounded-2xl p-5 border-2 border-primary-200">
                    <h3 className="text-sm font-semibold text-primary-800 mb-4 flex items-center gap-2">
                      💡 AI 建議
                    </h3>
                    
                    <div className="space-y-3 text-sm leading-relaxed">
                      {/* 同理心 - 大字體 */}
                      <p className="text-base font-medium text-gray-800">
                        {structuredSuggestions.empathy}
                      </p>
                      
                      {/* 困難 - 小字灰色 */}
                      <p className="text-xs text-gray-600">
                        {structuredSuggestions.difficulty}
                      </p>
                      
                      {/* 原則 - 綠色高亮框 */}
                      <p className="text-sm font-medium text-primary-700 bg-primary-100 px-4 py-2.5 rounded-xl">
                        {structuredSuggestions.principle}
                      </p>
                      
                      {/* 具體建議 - 清單 */}
                      <ul className="space-y-2.5 pt-2">
                        {structuredSuggestions.tips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-gray-700">
                            <span className="text-primary-500 text-base mt-0.5 flex-shrink-0">✓</span>
                            <span className="text-sm leading-relaxed">{tip.replace('✓ ', '')}</span>
                          </li>
                        ))}
                      </ul>
                      
                      {/* 鼓勵 - 大字體居中白框 */}
                      <p className="text-base font-semibold text-primary-700 bg-white px-4 py-3 rounded-xl text-center mt-4 shadow-sm">
                        {structuredSuggestions.encouragement}
                      </p>
                    </div>
                  </div>
                )}
                
              </div>
              
              {/* 按鈕區域 */}
              <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
                <button
                  onClick={onClose}
                  type="button"
                  className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                >
                  重新調整
                </button>
                <button
                  onClick={() => onConfirm(selectedOption)}
                  type="button"
                  className="flex-1 py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors shadow-md"
                >
                  確認使用
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
