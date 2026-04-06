'use client'

import { Home, Trophy, BarChart3, Calendar, Users } from 'lucide-react'

export type DtTab = 'home' | 'competitions' | 'stats' | 'calendar' | 'squad'

interface DtNavigationProps {
  activeTab: DtTab
  onTabChange: (tab: DtTab) => void
  hasMatch?: boolean
}

const tabs: { id: DtTab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Inicio', icon: Home },
  { id: 'competitions', label: 'Compet.', icon: Trophy },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'calendar', label: 'Calendario', icon: Calendar },
  { id: 'squad', label: 'Plantilla', icon: Users },
]

export function DtNavigation({ activeTab, onTabChange, hasMatch }: DtNavigationProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-2xl border-t border-border/50 safe-area-bottom">
      <div className="flex items-stretch justify-around px-1 h-[68px]">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center flex-1 gap-0.5 py-2 transition-all duration-300 touch-active ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-primary animate-tab-indicator" />
              )}

              <div className={`relative p-1.5 rounded-xl transition-all duration-300 ${
                isActive ? 'bg-primary/15 scale-110' : 'scale-100'
              }`}>
                <Icon className={`w-5 h-5 transition-all duration-300 ${isActive ? 'drop-shadow-[0_0_8px_rgba(255,140,50,0.5)]' : ''}`} />
                {/* Match badge on Home tab */}
                {tab.id === 'home' && hasMatch && !isActive && (
                  <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                )}
              </div>
              <span className={`text-[10px] font-medium transition-all duration-300 ${
                isActive ? 'text-primary font-semibold' : ''
              }`}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
