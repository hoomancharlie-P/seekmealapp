'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface CatProps {
  expression: 'neutral' | 'happy' | 'curious' | 'sleepy' | 'satisfied' | 'excited' | 'indifferent' | 'turned_away' | 'reminder' | 'missing'
  size?: 'small' | 'normal' // sticky bar 用 small，主頁用 normal
  className?: string
}

// 表情配置
const expressionConfig = {
  neutral: {
    emoji: '😺',
    animation: 'breathe',
    eyes: 'open',
    description: '平靜'
  },
  happy: {
    emoji: '😸',
    animation: 'bounce',
    eyes: 'smile',
    description: '開心',
    duration: 3000 // 3秒後恢復 neutral
  },
  curious: {
    emoji: '🙀',
    animation: 'tilt',
    eyes: 'wide',
    description: '好奇',
    duration: 3000
  },
  sleepy: {
    emoji: '😴',
    animation: 'nod',
    eyes: 'closed',
    description: '睏倦'
  },
  satisfied: {
    emoji: '😌',
    animation: 'stretch',
    eyes: 'closed',
    description: '滿足',
    duration: 4000
  },
  excited: {
    emoji: '🤩',
    animation: 'jump',
    eyes: 'sparkle',
    description: '興奮',
    duration: 5000
  },
  indifferent: {
    emoji: '😑',
    animation: 'yawn',
    eyes: 'half',
    description: '無所謂',
    duration: 3000
  },
  turned_away: {
    emoji: '😾',
    animation: 'turn',
    eyes: 'closed',
    description: '轉身',
    duration: 4000
  },
  reminder: {
    emoji: '😼',
    animation: 'tap',
    eyes: 'look',
    description: '提醒',
    duration: 4000
  },
  missing: {
    emoji: '😿',
    animation: 'peek',
    eyes: 'sad',
    description: '想念',
    duration: 5000
  }
}

export default function Cat({
  expression,
  size = 'normal',
  className = '',
}: CatProps) {
  const [currentExpression, setCurrentExpression] = useState(expression)
  const [showBlink, setShowBlink] = useState(false)

  // 眨眼邏輯（每 10 秒）
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setShowBlink(true)
      setTimeout(() => setShowBlink(false), 150)
    }, 10000)

    return () => clearInterval(blinkInterval)
  }, [])

  // 表情切換和自動恢復邏輯
  useEffect(() => {
      setCurrentExpression(expression)
      
    const config = expressionConfig[expression]
    if (config.duration) {
        const timer = setTimeout(() => {
            setCurrentExpression('neutral')
      }, config.duration)
        
        return () => clearTimeout(timer)
      }
  }, [expression])

  const config = expressionConfig[currentExpression]
  
  // 尺寸設定
  const sizeClass = size === 'small' 
    ? 'w-8 h-8 text-2xl' // 32×32px
    : 'w-16 h-16 text-5xl' // 64×64px

  // 動畫持續時間和循環設置
  const getAnimationStyle = () => {
    const isInfinite = config.animation === 'breathe'
    const duration = isInfinite ? '3s' : '2s'
    const iterationCount = isInfinite ? 'infinite' : '1'
    
    return {
      animation: `${config.animation} ${duration} ease-in-out ${iterationCount}`
    }
  }

  return (
    <div className={`relative ${className}`}>
      <AnimatePresence mode="wait">
        <motion.div
          key={currentExpression}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.3 }}
      className={`
            ${sizeClass}
        flex items-center justify-center
            select-none
            ${showBlink ? 'opacity-0' : 'opacity-100'}
            transition-opacity duration-150
      `}
          style={getAnimationStyle()}
          title={config.description}
    >
          {config.emoji}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
