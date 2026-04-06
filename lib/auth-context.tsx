'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { User, Club, AuthSession } from './types'

interface AuthContextType {
  user: User | null
  club: Club | null
  isLoading: boolean
  login: (user: User, club: Club | null) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const AUTH_STORAGE_KEY = 'pifa_auth_session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [club, setClub] = useState<Club | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Check for existing session on mount
    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    if (stored) {
      try {
        const session: AuthSession = JSON.parse(stored)
        setUser(session.user)
        setClub(session.club)
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY)
      }
    }
    setIsLoading(false)
  }, [])

  const login = (userData: User, clubData: Club | null) => {
    const session: AuthSession = { user: userData, club: clubData }
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
    setUser(userData)
    setClub(clubData)
  }

  const logout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    setUser(null)
    setClub(null)
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ user, club, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
