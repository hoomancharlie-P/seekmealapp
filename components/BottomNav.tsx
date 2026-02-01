'use client'

import { useRouter, usePathname } from 'next/navigation'

export default function BottomNav() {
  const router = useRouter()
  const pathname = usePathname()

  const navItems = [
    { path: '/', icon: '🏠', label: '主頁', inactiveHover: 'hover:text-primary-600' },
    { path: '/progress', icon: '📊', label: '進度', inactiveHover: 'hover:text-primary-600' },
    { path: '/coach', icon: '💬', label: 'AI 教練', inactiveHover: 'hover:text-primary-600' },
    { path: '/settings', icon: '⚙️', label: '設定', inactiveHover: 'hover:text-gray-600' },
  ] as const

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-16 z-50 shadow-lg">
      <div className="max-w-2xl mx-auto w-full h-16 flex justify-around items-center">
        {navItems.map((item) => {
          const isActive = pathname === item.path
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => router.push(item.path)}
              className={`flex flex-col items-center gap-1 transition-colors ${
                isActive ? 'text-primary-600 font-semibold' : `text-gray-400 ${item.inactiveHover}`
              }`}
            >
              <span className="text-2xl">{item.icon}</span>
              <span className="text-xs">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

