'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Users, Shield, UserCog, Calendar } from 'lucide-react'
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
  { href: '/admin/seasons', label: 'Temporadas', icon: <Calendar className="w-5 h-5" /> },
  { href: '/admin/clubs', label: 'Clubes', icon: <Shield className="w-5 h-5" /> },
  { href: '/admin/players', label: 'Jugadores', icon: <UserCog className="w-5 h-5" /> },
  { href: '/admin/users', label: 'Usuarios', icon: <Users className="w-5 h-5" /> },
]

export function MobileNav({ variant, onLogout }: MobileNavProps) {
  const pathname = usePathname()
  const navItems = variant === 'admin' ? adminNavItems : userNavItems

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/admin' && item.href !== '/dashboard' && pathname.startsWith(item.href))
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center px-3 py-2 rounded-xl transition-all duration-200 touch-active min-w-[60px]',
                isActive 
                  ? 'text-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className={cn(
                'flex items-center justify-center w-10 h-10 rounded-xl transition-colors',
                isActive && 'bg-primary/15'
              )}>
                {item.icon}
              </div>
              <span className={cn(
                'text-[10px] mt-0.5 font-medium',
                isActive && 'text-primary'
              )}>
                {item.label}
              </span>
            </Link>
          )
        })}
        

      </div>
    </nav>
  )
}
