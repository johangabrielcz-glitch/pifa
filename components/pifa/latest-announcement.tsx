'use client'

import { useEffect, useState } from 'react'
import { Megaphone, ChevronRight, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Diffusion } from '@/lib/types'

interface LatestAnnouncementProps {
  onSeeAll: () => void
}

export function LatestAnnouncement({ onSeeAll }: LatestAnnouncementProps) {
  const [announcement, setAnnouncement] = useState<Diffusion | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadLatest() {
      const { data, error } = await supabase
        .from('diffusions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (!error && data) setAnnouncement(data)
      setLoading(false)
    }
    loadLatest()
  }, [])

  if (loading) return (
    <div className="w-full h-24 bg-[#141414] animate-pulse rounded-[2rem] border border-[#202020]" />
  )

  if (!announcement) return null

  return (
    <div className="relative group overflow-hidden bg-[#141414] border border-[#202020] rounded-2xl flex flex-col shadow-xl animate-fade-in-up">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFD700]/5 rounded-full blur-[40px] pointer-events-none group-hover:bg-[#FFD700]/10 transition-colors" />
      
      {/* Header */}
      <div className="px-5 pt-4 pb-2 flex items-center justify-between z-10 border-b border-white/[0.03]">
        <div className="flex items-center gap-2">
           <Megaphone className="w-4 h-4 text-[#FFD700]" />
           <h3 className="text-[10px] font-black text-[#FFD700] uppercase tracking-[0.2em]">Comunicado Oficial</h3>
        </div>
        <span className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-widest">{new Date(announcement.created_at).toLocaleDateString()}</span>
      </div>
      
      {/* Body */}
      <div className="p-4 z-10">
        <h4 className="text-sm font-black text-white italic uppercase tracking-tighter leading-tight mb-2 group-hover:text-[#FFD700] transition-colors">
          {announcement.title}
        </h4>
        <p className="text-[10px] text-white/50 leading-relaxed font-medium line-clamp-2 mb-4">
          {announcement.content}
        </p>

        <div className="flex items-center justify-between">
          <button 
            onClick={onSeeAll}
            className="text-[9px] font-black text-[#FFD700] hover:text-white uppercase transition-all tracking-widest flex items-center gap-1 group/btn"
          >
            Ver Circular <ChevronRight className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
          </button>
          
          {announcement.image_url && (
            <div className="flex items-center gap-1 opacity-50">
              <ExternalLink className="w-2.5 h-2.5 text-[#6A6C6E]" />
              <span className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-widest">Adjunto</span>
            </div>
          )}
        </div>
      </div>

      {/* Subtle gold line at bottom */}
      <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#FFD700]/20 to-transparent" />
    </div>
  )
}
