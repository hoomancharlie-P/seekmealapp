'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  maxHeight?: string
}

export default function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  maxHeight = '90vh',
}: BottomSheetProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100]" aria-hidden={!isOpen}>
      {/* 背景遮罩 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      {/* 從底部滑出的面板 */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 z-10 bg-white rounded-t-3xl shadow-2xl overflow-hidden"
        style={{ maxHeight }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>
        {title != null && title !== '' && (
          <div className="px-6 pb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                aria-label="關閉"
              >
                ×
              </button>
            </div>
          </div>
        )}
        <div
          className="overflow-y-auto px-6 pb-6"
          style={{ maxHeight: 'calc(90vh - 80px)' }}
        >
          {children}
        </div>
      </motion.div>
    </div>
  )
}
