'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'

interface GlowingProgressBarProps {
  emoji: string
  name: string
  current: number
  target: number
  unit: string
}

export default function GlowingProgressBar({
  emoji,
  name,
  current,
  target,
  unit,
}: GlowingProgressBarProps) {
  const percentage = useMemo(() => {
    if (target === 0) return 0
    return Math.round((current / target) * 100)
  }, [current, target])

  const progressWidth = useMemo(() => {
    return Math.min((current / target) * 100, 100)
  }, [current, target])

  const progressColor = useMemo(() => {
    if (percentage <= 70) {
      return 'bg-gradient-to-r from-primary-400 to-primary-500'
    } else if (percentage <= 90) {
      return 'bg-gradient-to-r from-primary-400 to-warning-DEFAULT'
    } else if (percentage <= 100) {
      return 'bg-gradient-to-r from-warning-DEFAULT to-warning-dark'
    } else {
      return 'bg-gradient-to-r from-warning-DEFAULT to-red-500'
    }
  }, [percentage])

  const textColor = useMemo(() => {
    if (percentage <= 70) {
      return 'text-gray-600'
    } else if (percentage <= 90) {
      return 'text-warning-DEFAULT'
    } else if (percentage <= 100) {
      return 'text-warning-dark'
    } else {
      return 'text-red-500'
    }
  }, [percentage])

  const shouldPulse = percentage > 100

  return (
    <motion.div
      className="flex items-center gap-3 w-full py-2 hover:scale-105 transition-transform duration-200"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {/* 左側：emoji + 名稱 */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xl">{emoji}</span>
        <span className="text-sm font-medium w-16 text-text-primary">{name}</span>
      </div>

      {/* 中間：進度條 */}
      <div className="flex-1 h-2.5 rounded-full bg-white/10 overflow-hidden relative">
        <motion.div
          className={`h-full ${progressColor} shadow-glow-sm rounded-full transition-all duration-500 relative ${
            shouldPulse ? 'animate-pulse' : ''
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${progressWidth}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          {/* 動態光點效果 */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer pointer-events-none" />
        </motion.div>
      </div>

      {/* 右側：數據顯示 */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="font-mono text-sm font-semibold text-gray-700">
          {current}/{target}{unit}
        </span>
        <span className={`font-mono text-sm font-bold ${textColor}`}>
          ({percentage}%)
        </span>
      </div>
    </motion.div>
  )
}

