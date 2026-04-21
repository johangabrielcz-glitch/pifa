'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Home, Pencil, Shield, UserCog,
  Users, Megaphone, Calendar, Award, MoreHorizontal 
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export type AdminTab = string

// Los 4 principales
const mainTabs = [
  { id: '/admin', label: 'Inicio', icon: Home },
  { id: '/admin/matches', label: 'Partidos', icon: Pencil },
  { id: '/admin/clubs', label: 'Clubes', icon: Shield },
  { id: '/admin/players', label: 'Jugadores', icon: UserCog },
]

// Las opciones ocultas en "Más"
const moreTabs = [
  { id: '/admin/broadcasting', label: 'Difusión', icon: Megaphone },
  { id: '/admin/seasons', label: 'Temporadas', icon: Calendar },
  { id: '/admin/trophies', label: 'Palmarés', icon: Award },
  { id: '/admin/users', label: 'Usuarios', icon: Users },
]

const TabButton = ({ 
  label, 
  icon: Icon, 
  href,
  isActive, 
  onClick, 
  isSmall = false
}: { 
  label: string; 
  icon: any; 
  href?: string;
  isActive: boolean; 
  onClick?: () => void;
  isSmall?: boolean;
}) => {
  const content = (
    <>
      {isActive && (
        <div className="absolute top-0 w-8 h-1 bg-[#FF3131] rounded-b-full shadow-[0_2px_10px_rgba(255,49,49,0.3)]" />
      )}
      
      <div className="relative">
        <Icon className={`${isSmall ? 'w-4 h-4' : 'w-5 h-5'} ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
      </div>

      <span className={`${isSmall ? 'text-[8px]' : 'text-[9px]'} uppercase tracking-[0.1em] ${
        isActive ? 'font-black' : 'font-bold'
      } transition-all`}>
        {label}
      </span>
    </>
  );

  const className = `relative flex flex-col items-center justify-center flex-1 gap-1 py-2 transition-all duration-300 w-full ${
    isActive ? 'text-[#FF3131]' : 'text-[#6A6C6E] hover:text-[#A0A2A4]'
  }`;

  if (href) {
    return (
      <Link href={href} className={className} onClick={onClick}>
        {content}
      </Link>
    )
  }

  return (
    <button onClick={onClick} className={className}>
      {content}
    </button>
  )
}

export function AdminNavigation() {
  const pathname = usePathname()
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

  // Determinar si alguna opción oculta está activa
  const isMoreActive = moreTabs.some(t => pathname.startsWith(t.id))

  const isRouteActive = (routeId: string) => {
    if (routeId === '/admin') {
      return pathname === '/admin'
    }
    return pathname.startsWith(routeId)
  }

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
              <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.3em]">Opciones Administrativas</span>
            </div>
            {moreTabs.map((tab) => {
              const active = isRouteActive(tab.id)
              return (
                <Link
                  key={tab.id}
                  href={tab.id}
                  onClick={() => setIsMoreOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-2xl transition-all ${
                    active 
                      ? 'bg-[#FF3131]/10 text-[#FF3131]' 
                      : 'text-[#6A6C6E] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <tab.icon className={`w-4 h-4 ${active ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                  <span className={`text-[10px] uppercase tracking-widest ${active ? 'font-black' : 'font-bold'}`}>
                    {tab.label}
                  </span>
                </Link>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="w-full flex items-stretch justify-around px-2 h-16 max-w-screen-sm mx-auto">
        {mainTabs.map((tab) => (
          <TabButton
            key={tab.id}
            label={tab.label}
            icon={tab.icon}
            href={tab.id}
            isActive={isRouteActive(tab.id)}
            onClick={() => setIsMoreOpen(false)}
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
