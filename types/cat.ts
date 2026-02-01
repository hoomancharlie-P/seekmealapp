// 貓角色系統類型定義

// 貓的狀態（4個階段）
export type CatState = 'initial' | 'familiar' | 'intimate' | 'partner'

// 貓的表情（10個基礎表情）
export type CatExpression = 
  | 'neutral'      // 平靜
  | 'happy'        // 開心
  | 'satisfied'    // 滿足
  | 'excited'      // 興奮
  | 'sleepy'       // 睏倦
  | 'curious'      // 好奇
  | 'indifferent'  // 無所謂
  | 'turned_away'  // 轉身
  | 'reminder'     // 提醒
  | 'missing'      // 想念

// 互動類型
export type CatInteractionType = 
  | 'open-app'     // 打開 app
  | 'record-meal'  // 記錄一餐
  | 'reach-goal'   // 達到目標
  | 'reminder'     // 提醒
  | 'edit-meal'    // 編輯餐單

// 貓的配置
export interface CatConfig {
  state: CatState
  expression: CatExpression
  activityScore: number // 0-100
  lastInteraction?: Date
}

// 表情配置
export interface ExpressionConfig {
  emoji: string
  animation: string
  duration: number // 動畫持續時間（毫秒）
  description: string
}
