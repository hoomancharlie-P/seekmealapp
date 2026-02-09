'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'

type Gender = 'male' | 'female'
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active'
type Goal = 'lose' | 'maintain' | 'gain'

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const maxSteps = 4
  const [loading, setLoading] = useState(false)
  const [focusedField, setFocusedField] = useState<'age' | 'height' | 'weight' | null>(null)
  const [showCustomCalories, setShowCustomCalories] = useState(false)
  const [customCalories, setCustomCalories] = useState('')
  const [showMacroEditor, setShowMacroEditor] = useState(false)
  const [proteinPct, setProteinPct] = useState(35)
  const [carbsPct, setCarbsPct] = useState(35)

  // Step 1: 基本資料
  const [gender, setGender] = useState<Gender>('male')
  const [age, setAge] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')

  // Step 2: 活動水平
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('light')

  // Step 3: 目標
  const [goal, setGoal] = useState<Goal>('lose')

  // Step 4: 飲食偏好
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([])
  const [dietaryHabit, setDietaryHabit] = useState<'none' | 'vegetarian' | 'low_carb' | 'keto'>('none')
  const [allergies, setAllergies] = useState<string>('')

  // 不吃的食物選項
  const restrictionOptions = [
    { value: 'beef', label: '牛肉', emoji: '🐮' },
    { value: 'pork', label: '豬肉', emoji: '🐷' },
    { value: 'chicken', label: '雞肉', emoji: '🐔' },
    { value: 'seafood', label: '海鮮', emoji: '🦐' },
    { value: 'egg', label: '蛋類', emoji: '🥚' },
    { value: 'dairy', label: '奶類', emoji: '🥛' },
    { value: 'nuts', label: '堅果', emoji: '🥜' },
    { value: 'soy', label: '大豆製品', emoji: '🫘' }
  ]

  // 飲食習慣選項
  const habitOptions = [
    { value: 'none', label: '無特殊限制', description: '正常飲食' },
    { value: 'vegetarian', label: '素食', description: '不吃肉類' },
    { value: 'low_carb', label: '低碳水', description: '減少碳水化合物攝取' },
    { value: 'keto', label: '生酮飲食', description: '極低碳水、高脂肪' }
  ]

  const roundTo50 = (n: number) => Math.round(n / 50) * 50

  const getDefaultMacroPct = (g: Goal) => {
    if (g === 'lose') return { protein: 35, carbs: 35 }
    if (g === 'gain') return { protein: 30, carbs: 45 }
    return { protein: 30, carbs: 40 } // maintain
  }

  const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
  const snapPct5 = (n: number) => Math.round(clampPct(n) / 5) * 5

  const handleProteinPctChange = (next: number) => {
    const p = snapPct5(next)
    let c = carbsPct
    // keep fat >= 0
    if (p + c > 100) c = 100 - p
    setProteinPct(p)
    setCarbsPct(snapPct5(c))
  }

  const handleCarbsPctChange = (next: number) => {
    const c = snapPct5(next)
    let p = proteinPct
    if (p + c > 100) p = 100 - c
    setCarbsPct(c)
    setProteinPct(snapPct5(p))
  }

  const fatPct = Math.max(0, 100 - proteinPct - carbsPct)

  const hydrateMacroPctForGoal = (g: Goal) => {
    const d = getDefaultMacroPct(g)
    setProteinPct(d.protein)
    setCarbsPct(d.carbs)
  }

  // 計算 TDEE（每日總消耗）
  const calculateTDEE = () => {
    const w = parseFloat(weight)
    const h = parseFloat(height)
    const a = parseInt(age)

    if (!w || !h || !a) return 0

    // 1. 計算基礎代謝率 BMR (Harris-Benedict 公式)
    let bmr = 0
    if (gender === 'male') {
      bmr = 66 + 13.7 * w + 5 * h - 6.8 * a
    } else {
      bmr = 655 + 9.6 * w + 1.8 * h - 4.7 * a
    }

    // 2. 根據活動水平調整
    const activityMultiplier = {
      sedentary: 1.2, // 久坐
      light: 1.375, // 輕度活動
      moderate: 1.55, // 中度活動
      active: 1.725, // 高度活動
    }

    const tdee = bmr * activityMultiplier[activityLevel]

    // 3. 根據目標調整卡路里
    const goalAdjustment = {
      lose: -500, // 減肥：-500 卡
      maintain: 0, // 維持：0
      gain: 300, // 增肌：+300 卡
    }

    // 4. 四捨五入至 50
    const calories = tdee + goalAdjustment[goal]
    return roundTo50(calories)
  }

  const calculateBaseTDEE = () => {
    const w = parseFloat(weight)
    const h = parseFloat(height)
    const a = parseInt(age)

    if (!w || !h || !a) return 0

    let bmr = 0
    if (gender === 'male') {
      bmr = 66 + 13.7 * w + 5 * h - 6.8 * a
    } else {
      bmr = 655 + 9.6 * w + 1.8 * h - 4.7 * a
    }

    const activityMultiplier = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
    }

    return bmr * activityMultiplier[activityLevel]
  }

  const getGoalCalories = (g: Goal) => {
    const base = calculateBaseTDEE()
    if (!base) return 0

    const goalAdjustment = {
      lose: -500,
      maintain: 0,
      gain: 300,
    }

    return roundTo50(base + goalAdjustment[g])
  }

  // 計算營養素目標
  const calculateNutrition = (calories: number) => {
    // 根據目標調整營養素比例（可自定義）
    const proteinRatio = proteinPct / 100
    const carbsRatio = carbsPct / 100
    const fatRatio = fatPct / 100

    return {
      protein: Math.round((calories * proteinRatio) / 4), // 1g 蛋白 = 4 卡
      carbs: Math.round((calories * carbsRatio) / 4), // 1g 碳水 = 4 卡
      fat: Math.round((calories * fatRatio) / 9), // 1g 脂肪 = 9 卡
      fiber: 28, // 固定 28g
    }
  }

  // 驗證當前步驟
  const validateStep = () => {
    if (step === 1) {
      if (!age || !height || !weight) {
        alert('請填寫所有資料')
        return false
      }
      const a = parseInt(age)
      const h = parseFloat(height)
      const w = parseFloat(weight)

      if (a < 18 || a > 100) {
        alert('年齡請填 18-100 之間')
        return false
      }
      if (h < 100 || h > 250) {
        alert('身高請填 100-250cm 之間')
        return false
      }
      if (w < 30 || w > 300) {
        alert('體重請填 30-300kg 之間')
        return false
      }
    }
    return true
  }

  // 下一步
  const handleNext = () => {
    if (validateStep()) {
      setStep(step + 1)
    }
  }

  // 上一步
  const handleBack = () => {
    setStep(step - 1)
  }

  // 完成設定
  const handleComplete = async () => {
    setLoading(true)

    try {
      const calorieTarget = previewCalories
      const nutrition = previewNutrition

      // 獲取當前用戶
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        alert('請先登入')
        router.push('/auth')
        return
      }

      // 解析過敏食物（逗號或頓號分隔）
      const allergyList = allergies
        .split(/[,，、]/)
        .map(a => a.trim())
        .filter(a => a.length > 0)

      console.log('💾 Saving profile with preferences...')
      console.log('Dietary restrictions:', dietaryRestrictions)
      console.log('Dietary habit:', dietaryHabit)
      console.log('Allergies:', allergyList)

      // 更新 profile（Supabase 客戶端泛型推斷為 never，用型別斷言繞過）
      const payload = {
        calorie_target: calorieTarget,
        protein_target: nutrition.protein,
        carbs_target: nutrition.carbs,
        fat_target: nutrition.fat,
        fiber_target: nutrition.fiber,
        dietary_restrictions: dietaryRestrictions,
        dietary_habit: dietaryHabit,
        allergies: allergyList,
        gender: gender,
        age: parseInt(age, 10) || null,
        height: parseFloat(height) || null,
        weight: parseFloat(weight) || null,
        activity_level: activityLevel,
        goal: goal
      }
      const { error } = await (supabase as any)
        .from('profiles')
        .update(payload)
        .eq('id', user.id)

      if (error) throw error

      console.log('✅ Profile saved with preferences')

      // 跳轉到主頁
      router.push('/')
      router.refresh()
    } catch (error) {
      console.error('Error updating profile:', error)
      alert('設定失敗，請重試')
    } finally {
      setLoading(false)
    }
  }

  // 計算預覽數據
  const computedCalories = getGoalCalories(goal)
  const manualCalories = roundTo50(parseFloat(customCalories) || 0)
  const previewCalories = showCustomCalories && manualCalories > 0 ? manualCalories : computedCalories
  const previewNutrition = calculateNutrition(previewCalories)

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-green-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>第 {step} 步 / 共 {maxSteps} 步</span>
            <span>{Math.round((step / maxSteps) * 100)}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary-500"
              initial={{ width: '0%' }}
              animate={{ width: `${(step / maxSteps) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          {/* 進度指示器 */}
          <div className="flex justify-center gap-2 mt-3">
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all ${
                  i === step ? 'w-8 bg-primary-600' :
                  i < step ? 'w-2 bg-primary-400' :
                  'w-2 bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-gray-100">
          <AnimatePresence mode="wait">
            {/* Step 1: 基本資料 */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="text-center mb-6">
                  <div className="text-5xl mb-3">📋</div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">基本資料</h2>
                  <p className="text-sm text-gray-600">我哋會根據你嘅資料計算每日營養目標</p>
                </div>

                {/* 性別 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">性別</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setGender('male')}
                      className={`py-3 rounded-xl border-2 transition-all ${
                        gender === 'male'
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      👨 男
                    </button>
                    <button
                      type="button"
                      onClick={() => setGender('female')}
                      className={`py-3 rounded-xl border-2 transition-all ${
                        gender === 'female'
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      👩 女
                    </button>
                  </div>
                </div>

                {/* 年齡 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">年齡</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      placeholder={focusedField === 'age' ? '' : '25'}
                      min="18"
                      max="100"
                      onFocus={() => setFocusedField('age')}
                      onBlur={() => setFocusedField(null)}
                      className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400 transition-colors"
                    />
                    <span className="text-gray-600">歲</span>
                  </div>
                </div>

                {/* 身高 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">身高</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder={focusedField === 'height' ? '' : '170'}
                      min="100"
                      max="250"
                      onFocus={() => setFocusedField('height')}
                      onBlur={() => setFocusedField(null)}
                      className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400 transition-colors"
                    />
                    <span className="text-gray-600">cm</span>
                  </div>
                </div>

                {/* 體重 */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">體重</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder={focusedField === 'weight' ? '' : '65'}
                      min="30"
                      max="300"
                      step="0.1"
                      onFocus={() => setFocusedField('weight')}
                      onBlur={() => setFocusedField(null)}
                      className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400 transition-colors"
                    />
                    <span className="text-gray-600">kg</span>
                  </div>
                </div>

                <button
                  onClick={handleNext}
                  className="w-full py-3 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 transition-colors"
                >
                  下一步
                </button>
              </motion.div>
            )}

            {/* Step 2: 活動水平 */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="text-center mb-6">
                  <div className="text-5xl mb-3">🏃</div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">活動水平</h2>
                  <p className="text-sm text-gray-600">選擇你嘅日常活動量</p>
                </div>

                <div className="space-y-3 mb-6">
                  {[
                    { value: 'sedentary' as ActivityLevel, label: '久坐', desc: '辦公室工作，少運動' },
                    { value: 'light' as ActivityLevel, label: '輕度活動', desc: '每週運動 1-3 次' },
                    { value: 'moderate' as ActivityLevel, label: '中度活動', desc: '每週運動 3-5 次' },
                    { value: 'active' as ActivityLevel, label: '高度活動', desc: '每週運動 6-7 次' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setActivityLevel(option.value)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                        activityLevel === option.value
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-semibold text-gray-900">{option.label}</div>
                      <div className="text-sm text-gray-600 mt-1">{option.desc}</div>
                    </button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleBack}
                    className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                  >
                    上一步
                  </button>
                  <button
                    onClick={handleNext}
                    className="flex-1 py-3 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 transition-colors"
                  >
                    下一步
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: 目標 + 確認 */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="text-center mb-6">
                  <div className="text-5xl mb-3">🎯</div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">你的目標</h2>
                  <p className="text-sm text-gray-600">選擇你想達成嘅目標</p>
                </div>

                <div className="flex justify-end mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showCustomCalories
                      setShowCustomCalories(next)
                      if (next) {
                        const base = getGoalCalories(goal)
                        setCustomCalories(base ? String(base) : '')
                      }
                    }}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    自定義卡路里
                  </button>
                </div>

                {showCustomCalories && (
                  <div className="mb-4 bg-primary-50 border-2 border-primary-200 rounded-xl p-3">
                    <label className="block text-xs font-semibold text-gray-700 mb-2">目標卡路里（每 50 為單位）</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step={50}
                        value={customCalories}
                        onChange={(e) => setCustomCalories(e.target.value)}
                        className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400 bg-white"
                        placeholder="1450"
                      />
                      <span className="text-sm text-gray-600">卡/日</span>
                    </div>
                    {manualCalories > 0 && manualCalories !== parseFloat(customCalories || '0') && (
                      <div className="mt-2 text-xs text-gray-500">
                        會自動四捨五入到：<span className="font-semibold">{manualCalories}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3 mb-6">
                  {[
                    { value: 'lose' as Goal, label: '減肥', icon: '📉', desc: '-500 卡/日' },
                    { value: 'maintain' as Goal, label: '維持', icon: '⚖️', desc: '保持現狀' },
                    { value: 'gain' as Goal, label: '增肌', icon: '💪', desc: '+300 卡/日' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setGoal(option.value)
                        hydrateMacroPctForGoal(option.value)
                        if (showCustomCalories) {
                          const cals = getGoalCalories(option.value)
                          setCustomCalories(cals ? String(cals) : '')
                        }
                      }}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                        goal === option.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-gray-900">
                            {option.icon} {option.label}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">{option.desc}</div>
                        </div>
                        {getGoalCalories(option.value) > 0 && (
                          <div className="text-right">
                            <div className="text-lg font-bold text-primary-600">
                              {getGoalCalories(option.value)}
                            </div>
                            <div className="text-xs text-gray-500">卡/日</div>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {/* 營養預覽 */}
                {previewCalories > 0 && (
                  <div className="bg-gradient-to-br from-primary-50 to-green-50 rounded-2xl p-4 mb-6 border-2 border-primary-200">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <span>📊</span>
                        <span>你嘅營養目標</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowMacroEditor((v) => !v)}
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                      >
                        自定義
                      </button>
                    </div>

                    {showMacroEditor && (
                      <div className="mb-4 bg-white/70 rounded-xl p-3 border border-primary-200">
                        <div className="text-xs font-semibold text-gray-700 mb-2">營養比例（%）</div>

                        <div className="space-y-3">
                          <div>
                            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                              <span>蛋白質</span>
                              <span className="font-semibold text-gray-900">{proteinPct}%</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={proteinPct}
                              onChange={(e) => handleProteinPctChange(parseInt(e.target.value))}
                              className="w-full"
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                              <span>碳水化合物</span>
                              <span className="font-semibold text-gray-900">{carbsPct}%</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={carbsPct}
                              onChange={(e) => handleCarbsPctChange(parseInt(e.target.value))}
                              className="w-full"
                            />
                          </div>

                          <div className="flex items-center justify-between text-xs text-gray-600">
                            <span>脂肪</span>
                            <span className="font-semibold text-gray-900">{fatPct}%</span>
                          </div>

                          <div className="text-[11px] text-gray-500">
                            會自動保持總和 = 100%
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-white rounded-lg p-3">
                        <div className="text-gray-600">蛋白質</div>
                        <div className="text-lg font-bold text-primary-600">{previewNutrition.protein}g</div>
                      </div>
                      <div className="bg-white rounded-lg p-3">
                        <div className="text-gray-600">碳水化合物</div>
                        <div className="text-lg font-bold text-primary-600">{previewNutrition.carbs}g</div>
                      </div>
                      <div className="bg-white rounded-lg p-3">
                        <div className="text-gray-600">脂肪</div>
                        <div className="text-lg font-bold text-primary-600">{previewNutrition.fat}g</div>
                      </div>
                      <div className="bg-white rounded-lg p-3">
                        <div className="text-gray-600">纖維</div>
                        <div className="text-lg font-bold text-primary-600">{previewNutrition.fiber}g</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleBack}
                    className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                  >
                    上一步
                  </button>
                  <button
                    onClick={() => setStep(4)}
                    disabled={previewCalories === 0}
                    className="flex-1 py-3 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    下一步
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 4: 飲食偏好 */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="text-center mb-6">
                  <div className="text-5xl mb-3">🍽️</div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    飲食偏好
                  </h2>
                  <p className="text-sm text-gray-600">
                    幫我哋了解你嘅飲食習慣，AI 會為你度身訂造合適嘅餐單
                  </p>
                </div>
                
                {/* 不吃的食物 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-3">
                    不吃的食物（可多選）
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {restrictionOptions.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          if (dietaryRestrictions.includes(option.value)) {
                            setDietaryRestrictions(dietaryRestrictions.filter(r => r !== option.value))
                          } else {
                            setDietaryRestrictions([...dietaryRestrictions, option.value])
                          }
                        }}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                          dietaryRestrictions.includes(option.value)
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-3xl">{option.emoji}</span>
                        <span className={`font-medium ${
                          dietaryRestrictions.includes(option.value)
                            ? 'text-primary-700'
                            : 'text-gray-700'
                        }`}>
                          {option.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    💡 選擇後，餐單會避免使用這些食材
                  </p>
                </div>
                
                {/* 飲食習慣 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-3">
                    飲食習慣
                  </label>
                  <div className="space-y-3">
                    {habitOptions.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setDietaryHabit(option.value as any)}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                          dietaryHabit === option.value
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-left">
                          <div className={`font-semibold ${
                            dietaryHabit === option.value
                              ? 'text-primary-700'
                              : 'text-gray-900'
                          }`}>
                            {option.label}
                          </div>
                          <div className="text-sm text-gray-600">
                            {option.description}
                          </div>
                        </div>
                        {dietaryHabit === option.value && (
                          <span className="text-primary-600 text-xl">●</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* 過敏食物 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-3">
                    過敏食物（選填）
                  </label>
                  <input
                    type="text"
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    placeholder="例如：花生、貝類、芒果（用逗號分隔）"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-400"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    ⚠️ 餐單會完全避免這些食材
                  </p>
                </div>
                
                {/* 預覽摘要 */}
                {(dietaryRestrictions.length > 0 || dietaryHabit !== 'none' || allergies.trim()) && (
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                    <div className="font-semibold text-blue-900 mb-2">
                      你的飲食偏好：
                    </div>
                    {dietaryRestrictions.length > 0 && (
                      <div className="text-sm text-blue-800">
                        ❌ 不吃：{restrictionOptions
                          .filter(o => dietaryRestrictions.includes(o.value))
                          .map(o => o.label)
                          .join('、')}
                      </div>
                    )}
                    {dietaryHabit !== 'none' && (
                      <div className="text-sm text-blue-800">
                        🍽️ 飲食習慣：{habitOptions.find(h => h.value === dietaryHabit)?.label}
                      </div>
                    )}
                    {allergies.trim() && (
                      <div className="text-sm text-blue-800">
                        ⚠️ 過敏：{allergies}
                      </div>
                    )}
                  </div>
                )}
                
                {/* 按鈕 */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex-1 py-3 px-6 border-2 border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    上一步
                  </button>
                  <button
                    type="button"
                    onClick={handleComplete}
                    disabled={loading}
                    className="flex-1 py-3 px-6 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? '保存中...' : '完成設定'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

