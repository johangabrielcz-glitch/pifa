'use client'

import { useEffect, useState } from 'react'
import { Megaphone, Calendar, ChevronRight, X, ImageIcon, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Diffusion } from '@/lib/types'

export function AnnouncementsList() {
  const [announcements, setAnnouncements] = useState<Diffusion[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Diffusion | null>(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('diffusions')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (!error && data) setAnnouncements(data)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex flex-col gap-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="w-full h-24 bg-[#141414] animate-pulse rounded-2xl border border-[#202020]" />
      ))}
    </div>
  )

  if (announcements.length === 0) return (
    <div className="bg-[#141414] border border-dashed border-[#202020] rounded-[2rem] p-12 text-center">
      <Megaphone className="w-8 h-8 text-[#2D2D2D] mx-auto mb-4" />
      <p className="text-sm text-[#6A6C6E] font-medium uppercase tracking-widest">No hay comunicados oficiales aún</p>
    </div>
  )

  return (
    <div className="space-y-4 pb-20">
      {announcements.map((item) => (
        <button
          key={item.id}
          onClick={() => setSelected(item)}
          className="w-full text-left bg-[#141414] border border-[#202020] rounded-2xl p-4 flex items-center justify-between group hover:border-[#FFD700]/30 transition-all hover:bg-[#141414]/80 active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${
              item.image_url ? 'bg-[#FFD700]/10 border-[#FFD700]/20 text-[#FFD700]' : 'bg-[#1A1A1A] border-[#252525] text-[#6A6C6E]'
            }`}>
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-tight group-hover:text-[#FFD700] transition-colors line-clamp-1">
                {item.title}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <Calendar className="w-3 h-3 text-[#6A6C6E]" />
                <span className="text-[9px] font-black text-[#6A6C6E] uppercase tracking-widest">
                  {new Date(item.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#2D2D2D] group-hover:text-[#FFD700] transition-colors" />
        </button>
      ))}

      {/* Detail Modal/Popup */}
      {selected && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-sm bg-[#0A0A0A] border border-[#202020] rounded-[2rem] p-6 shadow-[0_0_50px_rgba(255,215,0,0.1)] max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-300 scrollbar-hide">
            {/* Close */}
            <button 
              onClick={() => setSelected(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-[#FFD700] transition-colors z-20"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="mb-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#FFD700]/10 border border-[#FFD700]/20 flex items-center justify-center">
                  <Megaphone className="w-5 h-5 text-[#FFD700]" />
                </div>
                <div>
                  <span className="text-[8px] font-black text-[#FFD700] uppercase tracking-[0.2em] block mb-0.5">Comunicado Oficial</span>
                  <span className="text-[9px] font-black text-[#6A6C6E] uppercase tracking-widest text-[10px]">
                    {new Date(selected.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight leading-tight italic">
                {selected.title}
              </h2>
            </div>

            {/* Content */}
            <div className="space-y-4">
              {selected.image_url && (
                <div className="relative rounded-2xl overflow-hidden bg-[#141414] border border-[#202020] max-h-48">
                  <img 
                    src={selected.image_url} 
                    alt={selected.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                </div>
              )}

              <div className="bg-[#141414] rounded-2xl border border-[#202020] p-5">
                <p className="text-[11px] text-[#A0A2A4] font-medium leading-relaxed whitespace-pre-wrap">
                  {selected.content}
                </p>
              </div>
            </div>

            {/* Footer decoration */}
            <div className="mt-6 pt-6 border-t border-white/[0.03] flex flex-col items-center">
              <div className="w-12 h-0.5 bg-[#FFD700] rounded-full opacity-30 mb-1.5" />
              <span className="text-[7px] font-black text-[#6A6C6E] uppercase tracking-[0.4em]">PIFA OFFICIAL</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
