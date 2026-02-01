// 貓表情配置

import type { CatExpression, ExpressionConfig } from '@/types/cat'

export const catExpressions: Record<CatExpression, ExpressionConfig> = {
  neutral: {
    emoji: '🐱',
    animation: 'breathe',
    duration: 0, // 持續動畫
    description: '平靜狀態，偶爾眨眼'
  },
  happy: {
    emoji: '😸',
    animation: 'lick-paws',
    duration: 3000,
    description: '記錄一餐後，舔爪子，滿意'
  },
  satisfied: {
    emoji: '😌',
    animation: 'stretch',
    duration: 4000,
    description: '達到目標後，伸懶腰，舒服'
  },
  excited: {
    emoji: '😻',
    animation: 'approach',
    duration: 5000,
    description: '連續達標3天，主動靠近，搖尾巴'
  },
  sleepy: {
    emoji: '😴',
    animation: 'yawn',
    duration: 0, // 持續動畫
    description: '晚上時段，打哈欠，準備休息'
  },
  curious: {
    emoji: '🤔',
    animation: 'observe',
    duration: 3000,
    description: '用戶編輯餐單時，觀察，小幅度動'
  },
  indifferent: {
    emoji: '😑',
    animation: 'yawn',
    duration: 3000,
    description: '輕微超标（110-130%），打哈欠，無所謂'
  },
  turned_away: {
    emoji: '😾',
    animation: 'turn-away',
    duration: 4000,
    description: '嚴重超标（>130%），背對你，傲嬌'
  },
  reminder: {
    emoji: '👀',
    animation: 'look-clock',
    duration: 4000,
    description: '忘記記錄時，看時鐘，再看你'
  },
  missing: {
    emoji: '😿',
    animation: 'look-back',
    duration: 5000,
    description: '長時間不打開app，背對但回頭看'
  }
}

// 根據互動類型獲取表情
export function getExpressionByInteraction(
  interactionType: string,
  context?: {
    isOverGoal?: boolean
    overGoalPercentage?: number
    consecutiveDays?: number
  }
): CatExpression {
  switch (interactionType) {
    case 'record-meal':
      return 'happy'
    case 'reach-goal':
      if (context?.consecutiveDays && context.consecutiveDays >= 3) {
        return 'excited'
      }
      return 'satisfied'
    case 'edit-meal':
      return 'curious'
    case 'reminder':
      return 'reminder'
    case 'open-app':
      // 根據時間判斷
      const hour = new Date().getHours()
      if (hour >= 22 || hour < 6) {
        return 'sleepy'
      }
      return 'neutral'
    default:
      if (context?.isOverGoal) {
        if (context.overGoalPercentage && context.overGoalPercentage > 130) {
          return 'turned_away'
        }
        return 'indifferent'
      }
      return 'neutral'
  }
}
