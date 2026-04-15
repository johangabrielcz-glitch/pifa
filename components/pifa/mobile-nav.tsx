'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Users, Shield, UserCog, Calendar, Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

interface MobileNavProps {
  variant: 'user' | 'admin'
  onLogout?: () => void
}

const userNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: <Home className="w-5 h-5" /> },
]

const adminNavItems: NavItem[] = [
  { href: '/admin', label: 'Inicio', icon: <Home className="w-5 h-5" /> },
  { href: '/admin/broadcasting', label: 'Difusión', icon: <Megaphone className="w-5 h-5" /> },
  { href: '/admin/seasons', label: 'Temporadas', icon: <Calendar className="w-5 h-5" /> },
  { href: '/admin/clubs', label: 'Clubes', icon: <Shield className="w-5 h-5" /> },
  { href: '/admin/players', label: 'Jugadores', icon: <UserCog className="w-5 h-5" /> },
  { href: '/admin/users', label: 'Usuarios', icon: <Users className="w-5 h-5" /> },
]

export function MobileNav({ variant }: MobileNavProps) {
  const pathname = usePathname()
  const navItems = variant === 'admin' ? adminNavItems : userNavItems

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      {/* Glassmorphism backdrop covering whole bottom */}
      <div className="bg-card/80 backdrop-blur-2xl border-t border-white/[0.06] shadow-[0_-4px_30px_rgba(0,0,0,0.3)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around px-1 py-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/admin' && item.href !== '/dashboard' && pathname.startsWith(item.href))
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex flex-col items-center justify-center px-3 py-1.5 rounded-xl transition-all duration-300 min-w-[56px]',
                  isActive 
                    ? 'text-primary scale-105' 
                    : 'text-muted-foreground hover:text-foreground active:scale-95'
                )}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary animate-tab-indicator" />
                )}
                
                <div className={cn(
                  'relative flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-300',
                  isActive && 'bg-primary/15'
                )}>
                  {/* Glow effect */}
                  {isActive && (
                    <div className="absolute inset-0 bg-primary/20 rounded-xl blur-md" />
                  )}
                  <div className="relative">{item.icon}</div>
                </div>
                <span className={cn(
                  'text-[10px] mt-0.5 font-medium transition-colors duration-300',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
