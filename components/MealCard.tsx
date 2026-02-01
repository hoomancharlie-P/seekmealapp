'use client'

import type { Meal } from '@/types/meal'

interface MealCardProps {
  meal: Meal
  onMarkConsumed: (mealId: string) => void
  onEdit?: (mealId: string) => void  // 暫時可選，Task 1.6 會用到
  onSpecialEvent?: (mealId: string) => void  // 暫時可選，Week 5 會用到
  onCancelSpecialEvent?: (mealId: string) => void  // 取消特殊活動
  onFoodClick?: (meal: Meal, food: any) => void // 點擊食物
  onAddFood?: (meal: Meal) => void // 添加食物
  showActions?: boolean  // 是否顯示操作按鈕（用於未來餐單）
  isTravelMeal?: boolean  // 是否為旅行餐單
}

export default function MealCard({ 
  meal, 
  onMarkConsumed, 
  onEdit, 
  onSpecialEvent, 
  onCancelSpecialEvent,
  onFoodClick,
  onAddFood,
  showActions = true,
  isTravelMeal = false
}: MealCardProps) {
  
  // 餐次名稱轉換
  const mealTypeName = {
    breakfast: '早餐',
    lunch: '午餐',
    dinner: '晚餐',
    snack: '小食'
  }[meal.type]

  const displayCalories =
    meal.isSpecialEvent && meal.specialEvent?.estimatedCalories
      ? meal.specialEvent.estimatedCalories
      : meal.calories
  
  // 處理食物名稱顯示（旅遊模式格式：用戶語言（當地語言 - 英文））
  const formatFoodName = (name: string) => {
    // 匹配格式：中文名稱（當地語言 = 英文）或（當地語言 - 英文）
    // 例如：印式扁豆咖哩(Dal makhani = Lentil curry) 或 韓式牛肉粥(소고기죽 - beef congee)
    const matchWithEqual = name.match(/^(.+?)\s*[（(](.+?)\s*=\s*(.+?)[)）]/)
    const matchWithDash = name.match(/^(.+?)\s*[（(](.+?)\s*-\s*(.+?)[)）]/)
    
    if (matchWithEqual) {
      const [, chineseName, localName, englishName] = matchWithEqual
      return { chineseName, localName, englishName, separator: '=' }
    }
    
    if (matchWithDash) {
      const [, chineseName, localName, englishName] = matchWithDash
      return { chineseName, localName, englishName, separator: '-' }
    }
    
    // 匹配格式：中文名稱（英文） - 如果當地語言是英文，只顯示一次
    const simpleMatch = name.match(/^(.+?)\s*[（(](.+?)[)）]/)
    if (simpleMatch) {
      const [, chineseName, englishName] = simpleMatch
      return { chineseName, localName: null, englishName, separator: null }
    }
    
    // 沒有匹配，返回原名稱
    return { chineseName: name, localName: null, englishName: null, separator: null }
  }

  return (
    <div
      className={`
        rounded-2xl p-4 shadow-md transition-all duration-300
        bg-white
        ${meal.consumed ? 'opacity-75' : 'hover:-translate-y-1 hover:shadow-lg'}
      `}
    >
      {/* Header - 極簡：無旅遊標籤，統一用餐次 emoji */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-2xl">{meal.emoji}</span>
          <span className="font-semibold text-gray-900">
            {mealTypeName}
          </span>
          
          {/* Badge 區域（後續用） */}
          {meal.isAdjusted && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              🔽 已調整
            </span>
          )}
          {meal.isSpecialEvent && (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
              🎉 特殊活動
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-semibold text-gray-600">
            {displayCalories} 卡
          </span>
          {meal.isSpecialEvent && meal.specialEvent?.estimatedCalories ? (
            <span className="text-xs text-gray-400">
              (原本 {meal.calories})
            </span>
          ) : null}
          {onEdit && !meal.consumed && showActions && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEdit(meal.id)
              }}
              type="button"
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
              title="編輯餐單"
            >
              ✏️
            </button>
          )}
        </div>
      </div>

      {/* 食物列表 */}
      <ul className="space-y-2 mb-3 text-xs">
        {meal.foods.map((food, i) => {
          const nameParts = formatFoodName(food.name)
          const hasTranslation = nameParts.localName !== null || nameParts.englishName !== null
          
          // 計算是否需要換行
          const chineseNameLength = nameParts.chineseName.length
          const translationLength = hasTranslation 
            ? (nameParts.localName ? nameParts.localName.length : 0) + 
              (nameParts.englishName ? nameParts.englishName.length : 0) + 
              (nameParts.separator ? 3 : 0) + 2 // +2 for brackets
            : 0
          
          // 對於旅遊餐單，翻譯部分總是換行（不論名稱長度）
          // 對於非旅遊餐單，根據長度決定是否換行
          const needsNewLine = isTravelMeal ? hasTranslation : (chineseNameLength + translationLength > 20)
          
          return (
            <li 
              key={i} 
              className={`
                rounded-lg p-2 transition-colors
                ${meal.isSpecialEvent 
                  ? 'bg-gray-100 text-gray-400 line-through'  // 特殊活動：變灰 + 刪除線
                  : 'bg-white' // 普通背景
                }
              `}
            >
              <div className="flex items-start gap-2">
                <span className={`${meal.isSpecialEvent ? 'text-gray-400' : 'text-primary-500'} mt-0.5`}>•</span>
                <div className="flex-1 min-w-0">
                  {/* 第一行：中文名稱 + 翻譯（如果不需要換行）+ 營養價值和卡路里（右對齊） */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className={`font-medium ${meal.isSpecialEvent ? 'text-gray-400' : 'text-gray-900'}`}>
                        {nameParts.chineseName}
                        {hasTranslation && !needsNewLine && (
                          <>
                            <span className="font-medium">（</span>
                            {nameParts.localName && (
                              <>
                                <span className="font-medium">{nameParts.localName}</span>
                                {nameParts.separator && (
                                  <span className="font-medium"> {nameParts.separator} </span>
                                )}
                              </>
                            )}
                            {nameParts.englishName && (
                              <span className="font-medium">{nameParts.englishName}</span>
                            )}
                            <span className="font-medium">）</span>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`whitespace-nowrap ${meal.isSpecialEvent ? 'text-gray-300' : 'text-gray-500'}`}>
                        P{food.protein || 0}g/ C{food.carbs || 0}g/ F{food.fat || 0}g
                      </span>
                      <span className={`font-semibold whitespace-nowrap ${meal.isSpecialEvent ? 'text-gray-400' : 'text-gray-900'}`}>
                        {food.calories}卡
                      </span>
                    </div>
                  </div>
                  
                  {/* 第二行：翻譯部分（如果名稱太長需要換行，或總是顯示翻譯） */}
                  {hasTranslation && needsNewLine && (
                    <div className={`mt-1 ${meal.isSpecialEvent ? 'text-gray-400' : 'text-gray-600'}`}>
                      <span className="font-medium">（</span>
                      {nameParts.localName && (
                        <>
                          <span className="font-medium">{nameParts.localName}</span>
                          {nameParts.separator && (
                            <span className="font-medium"> {nameParts.separator} </span>
                          )}
                        </>
                      )}
                      {nameParts.englishName && (
                        <span className="font-medium">{nameParts.englishName}</span>
                      )}
                      <span className="font-medium">）</span>
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {/* 加入食物按鈕（只在未記錄且非特殊活動時顯示）*/}
      {onAddFood && !meal.consumed && !meal.isSpecialEvent && showActions && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onAddFood(meal)
          }}
          className="w-full mb-3 py-2 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-primary-300 hover:text-primary-600 transition-colors flex items-center justify-center gap-2 text-xs"
        >
          <span>➕</span>
          <span className="font-medium">管理食物</span>
        </button>
      )}

      {/* 特殊活動顯示 */}
      {meal.isSpecialEvent && (
        <div className="mb-3 p-3 bg-orange-50 border-2 border-orange-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🎉</span>
            <span className="font-semibold text-orange-900">
              {meal.specialEvent?.type === 'hotpot' ? '火鍋' : 
               meal.specialEvent?.type === 'bbq' ? '燒烤' : 
               meal.specialEvent?.type === 'buffet' ? '自助餐' : 
               meal.specialEvent?.type === 'birthday' ? '生日飯' : 
               meal.specialEvent?.type === 'drinks' ? '飲野' : '其他'} 
              {' '}{meal.specialEvent?.estimatedCalories} 卡
            </span>
          </div>
          <div className="text-xs text-gray-500 mb-2">
            (原本 {meal.calories} 卡)
          </div>
          
          {/* AI 建議 */}
          {meal.specialEvent && meal.specialEvent.aiSuggestions && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-700">💡 AI 建議：</div>
              {meal.specialEvent.aiSuggestions.slice(0, 5).map((suggestion, i) => (
                <div key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                  {suggestion.startsWith('✓') ? (
                    <>
                      <span className="text-yellow-600 flex-shrink-0">✓</span>
                      <span>{suggestion.replace('✓ ', '')}</span>
                    </>
                  ) : (
                    <span>• {suggestion}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 按鈕區域 */}
      {showActions && (
        <div className="space-y-2">
          {/* 取消特殊活動按鈕 */}
          {meal.isSpecialEvent && onCancelSpecialEvent && !meal.consumed && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCancelSpecialEvent(meal.id)
              }}
              type="button"
              className="w-full bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl px-4 py-2 font-medium transition-colors text-sm border border-gray-200"
            >
              ↶ 取消特殊活動
            </button>
          )}
          
          {/* 跟住食 / 記錄按鈕（Toggle） */}
          {meal.isSpecialEvent && !meal.consumed ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onMarkConsumed(meal.id)
              }}
              type="button"
              className="w-full bg-primary-100 hover:bg-primary-200 text-primary-700 rounded-xl px-4 py-2 font-medium transition-all text-sm hover:scale-[1.02]"
            >
              ✍️ 之後記錄實際吃的
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onMarkConsumed(meal.id)
              }}
              type="button"
              className={`
                w-full py-2 rounded-xl font-semibold transition-all text-sm
                ${meal.consumed
                  ? 'bg-gray-200 hover:bg-gray-350 text-gray-600'
                  : isTravelMeal
                  ? 'bg-blue-400 text-white hover:bg-blue-500'
                  : 'bg-primary-100 hover:bg-primary-200 text-primary-700 hover:scale-[1.02]'
                }
              `}
            >
              {meal.consumed ? '✓ 已記錄' : '✓ 跟住食'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
