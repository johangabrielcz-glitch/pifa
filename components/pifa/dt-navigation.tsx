'use client'

import { Home, Trophy, BarChart3, Calendar, Users, ShoppingCart } from 'lucide-react'

export type DtTab = 'home' | 'competitions' | 'stats' | 'calendar' | 'squad' | 'market'

interface DtNavigationProps {
  activeTab: DtTab
  onTabChange: (tab: DtTab) => void
  hasMatch?: boolean
}

const tabs: { id: DtTab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Inicio', icon: Home },
  { id: 'competitions', label: 'Compet.', icon: Trophy },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'calendar', label: 'Calen.', icon: Calendar },
  { id: 'squad', label: 'Plantilla', icon: Users },
  { id: 'market', label: 'Mercado', icon: ShoppingCart },
]

// Bottom Navigation Tab Component
const TabButton = ({ 
  id, 
  label, 
  icon: Icon, 
  isActive, 
  onClick, 
  hasMatch 
}: { 
  id: DtTab; 
  label: string; 
  icon: any; 
  isActive: boolean; 
  onClick: () => void;
  hasMatch?: boolean;
}) => (
  <button
    onClick={onClick}
    className={`relative flex flex-col items-center justify-center flex-1 gap-1 py-2 transition-all duration-300 ${
      isActive ? 'text-[#00FF85]' : 'text-[#6A6C6E] hover:text-[#A0A2A4]'
    }`}
  >
    {isActive && (
      <div className="absolute top-0 w-8 h-1 bg-[#00FF85] rounded-b-full shadow-[0_2px_10px_rgba(0,255,133,0.3)]" />
    )}
    
    <div className="relative">
      <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
      
      {id === 'home' && hasMatch && !isActive && (
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#0A0A0A] bg-[#00FF85] animate-pulse" />
      )}
    </div>

    <span className={`text-[9px] uppercase tracking-[0.1em] ${
      isActive ? 'font-black' : 'font-bold'
    }`}>
      {label}
    </span>
  </button>
)

export function DtNavigation({ activeTab, onTabChange, hasMatch }: DtNavigationProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] bg-[#0A0A0A]/95 backdrop-blur-md safe-area-bottom border-t border-[#141414] shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
      <nav className="w-full flex items-stretch justify-around px-2 h-16 max-w-screen-sm mx-auto">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            id={tab.id}
            label={tab.label}
            icon={tab.icon}
            isActive={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            hasMatch={hasMatch}
          />
        ))}
      </nav>
    </div>
  )
}
