'use client'

import { useState, useRef, useEffect } from 'react'
import { 
  Home, Trophy, BarChart3, Calendar, Users, 
  ShoppingCart, Newspaper, MessageCircle, MoreHorizontal 
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export type DtTab = 'home' | 'competitions' | 'stats' | 'calendar' | 'squad' | 'market' | 'news' | 'chat'

interface DtNavigationProps {
  activeTab: DtTab
  onTabChange: (tab: DtTab) => void
  hasMatch?: boolean
}

// Los 5 principales
const mainTabs: { id: DtTab; label: string; icon: any }[] = [
  { id: 'home', label: 'Inicio', icon: Home },
  { id: 'competitions', label: 'Compet.', icon: Trophy },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'squad', label: 'Plantilla', icon: Users },
  { id: 'market', label: 'Mercado', icon: ShoppingCart },
]

// Las opciones ocultas en "Más"
const moreTabs: { id: DtTab; label: string; icon: any }[] = [
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'calendar', label: 'Calen.', icon: Calendar },
  { id: 'news', label: 'Noticias', icon: Newspaper },
]

const TabButton = ({ 
  label, 
  icon: Icon, 
  isActive, 
  onClick, 
  hasMatch,
  isSmall = false
}: { 
  label: string; 
  icon: any; 
  isActive: boolean; 
  onClick: () => void;
  hasMatch?: boolean;
  isSmall?: boolean;
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
      <Icon className={`${isSmall ? 'w-4 h-4' : 'w-5 h-5'} ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
      
      {label === 'Inicio' && hasMatch && !isActive && (
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#0A0A0A] bg-[#00FF85] animate-pulse" />
      )}
    </div>

    <span className={`${isSmall ? 'text-[8px]' : 'text-[9px]'} uppercase tracking-[0.1em] ${
      isActive ? 'font-black' : 'font-bold'
    }`}>
      {label}
    </span>
  </button>
)

export function DtNavigation({ activeTab, onTabChange, hasMatch }: DtNavigationProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false)
      }
    }
    if (isMoreOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMoreOpen])

  const isMoreActive = moreTabs.some(t => t.id === activeTab)

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] bg-[#0A0A0A]/95 backdrop-blur-md safe-area-bottom border-t border-[#141414] shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
      
      {/* "Más" Menu (Fly-out) */}
      <AnimatePresence>
        {isMoreOpen && (
          <motion.div 
            ref={menuRef}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute bottom-20 right-4 w-40 bg-[#141414]/90 backdrop-blur-xl border border-white/5 rounded-3xl p-2 shadow-2xl flex flex-col gap-1 overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-white/5 mb-1">
              <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.3em]">Opciones</span>
            </div>
            {moreTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  onTabChange(tab.id)
                  setIsMoreOpen(false)
                }}
                className={`flex items-center gap-3 px-3 py-3 rounded-2xl transition-all ${
                  activeTab === tab.id 
                    ? 'bg-[#00FF85]/10 text-[#00FF85]' 
                    : 'text-[#6A6C6E] hover:bg-white/5 hover:text-white'
                }`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                <span className={`text-[10px] uppercase tracking-widest ${activeTab === tab.id ? 'font-black' : 'font-bold'}`}>
                  {tab.label}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="w-full flex items-stretch justify-around px-2 h-16 max-w-screen-sm mx-auto">
        {mainTabs.map((tab) => (
          <TabButton
            key={tab.id}
            label={tab.label}
            icon={tab.icon}
            isActive={activeTab === tab.id}
            onClick={() => {
              onTabChange(tab.id)
              setIsMoreOpen(false)
            }}
            hasMatch={hasMatch}
          />
        ))}

        {/* Botón Más */}
        <TabButton
          label="Más"
          icon={MoreHorizontal}
          isActive={isMoreActive || isMoreOpen}
          onClick={() => setIsMoreOpen(!isMoreOpen)}
        />
      </nav>
    </div>
  )
}
