'use client'

import { useMemo } from 'react'

interface ProgressRingProps {
  current: number
  target: number
  emoji: string
  size?: number
}

export default function ProgressRing({
  current,
  target,
  emoji,
  size = 128,
}: ProgressRingProps) {
  const progress = useMemo(() => {
    if (target === 0) return 0
    const percentage = Math.round((current / target) * 100)
    return Math.min(100, Math.max(0, percentage))
  }, [current, target])

  const radius = useMemo(() => (size - 16) / 2, [size])
  const circumference = useMemo(() => 2 * Math.PI * radius, [radius])
  const strokeDashoffset = useMemo(
    () => circumference * (1 - progress / 100),
    [circumference, progress]
  )

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        className="transform -rotate-90"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* 背景圓環（未完成部分） */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth="8"
        />
        {/* 進度圓環（已完成部分） */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#9CCC65"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500"
        />
      </svg>
      {/* 中間內容 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl mb-1">{emoji}</span>
        <span className="text-xs text-text-secondary font-medium">{progress}%</span>
      </div>
    </div>
  )
}

