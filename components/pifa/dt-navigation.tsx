'use client'

import { useState, useRef, useEffect } from 'react'
import { 
  Home, Trophy, BarChart3, Calendar, Users, 
  ShoppingCart, Newspaper, MessageCircle, MoreHorizontal, Megaphone, Award 
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import { useUnreadChat } from '@/lib/use-unread-chat'

export type DtTab = 'home' | 'competitions' | 'stats' | 'calendar' | 'squad' | 'market' | 'news' | 'chat' | 'announcements'

interface DtNavigationProps {
  activeTab: DtTab
  onTabChange: (tab: DtTab) => void
  hasMatch?: boolean
  userId?: string
  clubId?: string
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
  { id: 'announcements', label: 'Comunicados', icon: Megaphone },
  { id: 'hall_of_fame', label: 'Palmarés', icon: Award },
]

const TabButton = ({ 
  label, 
  icon: Icon, 
  isActive, 
  onClick, 
  hasMatch,
  badgeCount = 0,
  isSmall = false
}: { 
  label: string; 
  icon: any; 
  isActive: boolean; 
  onClick: () => void;
  hasMatch?: boolean;
  badgeCount?: number;
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

      {label === 'Chat' && badgeCount > 0 && !isActive && (
        <div className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-red-500 border border-[#0A0A0A] flex items-center justify-center shadow-[0_0_10px_rgba(239,68,68,0.5)] animate-bounce">
          <span className="text-[7px] font-black text-white">{badgeCount > 9 ? '+9' : badgeCount}</span>
        </div>
      )}
    </div>

    <span className={`${isSmall ? 'text-[8px]' : 'text-[9px]'} uppercase tracking-[0.1em] ${
      isActive ? 'font-black' : 'font-bold'
    }`}>
      {label}
    </span>
  </button>
)

export function DtNavigation({ activeTab, onTabChange, hasMatch, userId, clubId }: DtNavigationProps) {
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
  const unreadCountFromHook = useUnreadChat(userId, clubId)
  const [localUnreadCount, setLocalUnreadCount] = useState(0)

  // Sincronizar el conteo del hook con el estado local, pero forzar 0 si estamos en el chat
  useEffect(() => {
    if (activeTab === 'chat') {
      setLocalUnreadCount(0)
    } else {
      setLocalUnreadCount(unreadCountFromHook)
    }
  }, [activeTab, unreadCountFromHook])

  return (
    <div className="relative z-[100] bg-[#0A0A0A]/95 backdrop-blur-md safe-area-bottom border-t border-[#141414] shadow-[0_-10px_30px_rgba(0,0,0,0.5)] shrink-0">
      
      {/* "Más" Menu (Fly-out) */}
      <AnimatePresence>
        {isMoreOpen && (
          <motion.div 
            ref={menuRef}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full right-4 mb-4 w-44 bg-[#141414]/98 backdrop-blur-2xl border border-white/5 rounded-[2rem] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col gap-1 overflow-hidden"
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
            badgeCount={tab.id === 'chat' ? localUnreadCount : 0}
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
