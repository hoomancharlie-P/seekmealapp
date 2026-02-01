// 貓狀態計算邏輯

import type { CatState } from '@/types/cat'

interface UserActivity {
  recordFrequency: number // 記錄頻率分數 (0-100)
  goalAchievement: number // 達標情況分數 (0-100)
  usageFrequency: number  // 使用頻率分數 (0-100)
  usageDuration: number   // 使用時長分數 (0-100)
}

/**
 * 計算貓的活躍度分數
 * @param activity 用戶活動數據
 * @returns 活躍度分數 (0-100)
 */
export function calculateCatActivityScore(activity: UserActivity): number {
  const {
    recordFrequency,
    goalAchievement,
    usageFrequency,
    usageDuration
  } = activity

  // 權重分配
  const recordWeight = 0.4  // 記錄頻率 40%
  const goalWeight = 0.3     // 達標情況 30%
  const usageWeight = 0.2    // 使用頻率 20%
  const durationWeight = 0.1 // 使用時長 10%

  const totalScore = 
    recordFrequency * recordWeight +
    goalAchievement * goalWeight +
    usageFrequency * usageWeight +
    usageDuration * durationWeight

  return Math.min(100, Math.max(0, Math.round(totalScore)))
}

/**
 * 根據活躍度分數判定貓的狀態
 * @param activityScore 活躍度分數 (0-100)
 * @returns 貓的狀態
 */
export function getCatStateByActivityScore(activityScore: number): CatState {
  if (activityScore >= 91) return 'partner'
  if (activityScore >= 61) return 'intimate'
  if (activityScore >= 31) return 'familiar'
  return 'initial'
}

/**
 * 計算記錄頻率分數
 * @param records 記錄數據
 * @param days 總天數
 * @returns 記錄頻率分數 (0-100)
 */
export function calculateRecordFrequencyScore(
  records: { date: string }[],
  days: number
): number {
  if (days === 0) return 0

  const recentRecords = records.filter(record => {
    const recordDate = new Date(record.date)
    const daysAgo = Math.floor((Date.now() - recordDate.getTime()) / (1000 * 60 * 60 * 24))
    return daysAgo <= 14 // 最近14天
  })

  const recordsPerDay = recentRecords.length / Math.min(days, 14)
  
  // 每天記錄 ≥2 餐 = 100分
  // 每天記錄 1 餐 = 50分
  // 每天記錄 <1 餐 = 按比例計算
  if (recordsPerDay >= 2) return 100
  if (recordsPerDay >= 1) return 50
  return Math.round(recordsPerDay * 50)
}

/**
 * 計算達標情況分數
 * @param consecutiveDays 連續達標天數
 * @returns 達標情況分數 (0-100)
 */
export function calculateGoalAchievementScore(consecutiveDays: number): number {
  if (consecutiveDays >= 14) return 100
  if (consecutiveDays >= 7) return 80
  if (consecutiveDays >= 3) return 60
  if (consecutiveDays >= 1) return 40
  return 0
}

/**
 * 計算使用頻率分數
 * @param lastLoginAt 最後登錄時間
 * @param days 總天數
 * @returns 使用頻率分數 (0-100)
 */
export function calculateUsageFrequencyScore(
  lastLoginAt: Date | null,
  days: number
): number {
  if (!lastLoginAt || days === 0) return 0

  const daysSinceLastLogin = Math.floor(
    (Date.now() - lastLoginAt.getTime()) / (1000 * 60 * 60 * 24)
  )

  // 每天打開 ≥2 次 = 100分
  // 每天打開 1 次 = 50分
  // 根據最後登錄時間計算
  if (daysSinceLastLogin === 0) return 100
  if (daysSinceLastLogin <= 1) return 80
  if (daysSinceLastLogin <= 3) return 50
  if (daysSinceLastLogin <= 7) return 30
  return 10
}

/**
 * 計算使用時長分數
 * @param averageSessionDuration 平均會話時長（分鐘）
 * @returns 使用時長分數 (0-100)
 */
export function calculateUsageDurationScore(
  averageSessionDuration: number
): number {
  if (averageSessionDuration >= 5) return 100
  if (averageSessionDuration >= 3) return 70
  if (averageSessionDuration >= 1) return 40
  return 20
}
