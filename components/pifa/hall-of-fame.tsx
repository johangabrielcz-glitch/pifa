'use client'

import { useEffect, useState } from 'react'
import { Award, Shield, ChevronLeft, ChevronRight, Star, Trophy as TrophyIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import type { Club, Trophy, ClubTrophy } from '@/lib/types'

interface ClubHallOfFame extends Club {
  trophies: (ClubTrophy & { trophies: Trophy })[]
  total_trophies: number
}



export function HallOfFame() {
  const [clubs, setClubs] = useState<ClubHallOfFame[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    async function load() {
      const [clubsRes, ctRes] = await Promise.all([
        supabase.from('clubs').select('*'),
        supabase.from('club_trophies').select('*, trophies(*)')
      ])

      if (clubsRes.data && ctRes.data) {
        const processed = clubsRes.data.map(club => {
          const clubAwards = ctRes.data.filter(ct => ct.club_id === club.id)
          const total = clubAwards.reduce((acc, curr) => acc + curr.quantity, 0)
          return { ...club, trophies: clubAwards, total_trophies: total }
        })
        processed.sort((a, b) => b.total_trophies - a.total_trophies)
        setClubs(processed as ClubHallOfFame[])
      }
      setIsLoading(false)
    }
    load()
  }, [])

  const activeClub = clubs[activeIndex] ?? null

  const next = () => setActiveIndex((prev) => (prev + 1) % clubs.length)
  const prev = () => setActiveIndex((prev) => (prev - 1 + clubs.length) % clubs.length)

  if (isLoading) return (
    <div className="w-full h-[420px] bg-[#0C0C0C] animate-pulse rounded-[2rem] border border-[#1A1A1A]" />
  )

  if (clubs.length === 0 || !activeClub) return (
    <div className="bg-[#0C0C0C] border border-dashed border-[#1A1A1A] rounded-[2rem] p-12 text-center">
      <TrophyIcon className="w-8 h-8 text-[#1A1A1A] mx-auto mb-3" />
      <p className="text-[10px] font-black text-[#333] uppercase tracking-[0.3em]">No hay palmarés registrados</p>
    </div>
  )

  return (
    <div className="relative w-full max-w-lg mx-auto pb-12">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeClub.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="relative overflow-hidden bg-[#0C0C0C] border border-[#1A1A1A] rounded-[2rem] shadow-2xl">
            
            {/* ── Ambient glow (GPU-friendly, no blur on children) ── */}
            <div 
              className="absolute -top-32 -right-32 w-80 h-80 rounded-full pointer-events-none"
              style={{
                background: activeIndex === 0 ? 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)'
                  : activeIndex === 1 ? 'radial-gradient(circle, rgba(203,213,225,0.12) 0%, transparent 70%)'
                  : activeIndex === 2 ? 'radial-gradient(circle, rgba(194,65,12,0.12) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(220,38,38,0.08) 0%, transparent 70%)'
              }}
            />

            {/* ── Top Bar ── */}
            <div className="relative z-10 px-6 pt-6 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                  activeIndex === 0 ? 'bg-amber-500/15 text-amber-400' 
                  : activeIndex === 1 ? 'bg-slate-400/15 text-slate-300'
                  : activeIndex === 2 ? 'bg-orange-500/15 text-orange-400'
                  : 'bg-white/5 text-[#555]'
                }`}>
                  #{activeIndex + 1}
                </span>
                {activeIndex === 0 && (
                  <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-500 to-yellow-400 text-black px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider">
                    <Star className="w-3 h-3" /> Leyenda
                  </span>
                )}
              </div>
              <span className="text-[10px] font-black text-[#333] tracking-wider">{activeIndex + 1}/{clubs.length}</span>
            </div>

            {/* ── Club Identity ── */}
            <div className="relative z-10 flex items-center gap-5 px-6 pb-6">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#111] border border-[#1F1F1F] p-3 sm:p-4 flex items-center justify-center shrink-0">
                {activeClub.shield_url ? (
                  <img src={activeClub.shield_url} alt="" className="w-full h-full object-contain" />
                ) : (
                  <Shield className="w-8 h-8 text-[#1F1F1F]" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight leading-none mb-1.5 truncate">
                  {activeClub.name}
                </h2>
                <div className="flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-[10px] sm:text-[11px] font-bold text-[#555] uppercase tracking-wider">
                    {activeClub.total_trophies} títulos
                  </span>
                </div>
              </div>
            </div>

            {/* ── Divider ── */}
            <div className="mx-6 h-px bg-gradient-to-r from-transparent via-[#1F1F1F] to-transparent" />

            {/* ── Trophy Shelves ── */}
            <div className="relative z-10 px-5 py-5">
              {activeClub.trophies.length === 0 ? (
                <div className="py-10 text-center">
                  <TrophyIcon className="w-8 h-8 text-[#1A1A1A] mx-auto mb-2" />
                  <p className="text-[9px] font-black text-[#333] uppercase tracking-[0.4em]">Sin títulos</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {activeClub.trophies.map((ct) => (
                    <div key={ct.id}>
                      {/* Shelf label */}
                      <div className="flex items-center gap-2 mb-0.5 px-1">
                        <span className="text-[8px] sm:text-[9px] font-black text-[#444] uppercase tracking-[0.2em] truncate">
                          {ct.trophies?.name}
                        </span>
                        <div className="flex-1 h-px bg-[#1A1A1A]" />
                        <span className="text-[10px] sm:text-[11px] font-black text-amber-500 tabular-nums">
                          ×{ct.quantity}
                        </span>
                      </div>

                      {/* Stacked trophies row — one image per trophy */}
                      <div className="flex items-end flex-wrap pl-4">
                        {Array.from({ length: ct.quantity }).map((_, i) => (
                          <div
                            key={i}
                            className="relative w-10 h-10 sm:w-12 sm:h-12 shrink-0 -ml-4"
                            style={{ zIndex: ct.quantity - i }}
                          >
                            {ct.trophies?.image_url && (
                              <img 
                                src={ct.trophies.image_url} 
                                alt=""
                                loading="lazy"
                                className="w-full h-full object-contain"
                                style={{ filter: `brightness(${1 - i * 0.04})` }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Bottom accent ── */}
            {activeIndex < 3 && (
              <div className={`h-[2px] ${
                activeIndex === 0 ? 'bg-gradient-to-r from-transparent via-amber-500/40 to-transparent'
                : activeIndex === 1 ? 'bg-gradient-to-r from-transparent via-slate-400/30 to-transparent'
                : 'bg-gradient-to-r from-transparent via-orange-600/30 to-transparent'
              }`} />
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ── Navigation ── */}
      <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-8 z-30">
        <button 
          onClick={prev}
          className="w-12 h-12 rounded-full bg-[#111] border border-[#1F1F1F] text-[#555] flex items-center justify-center hover:text-amber-500 hover:border-amber-500/40 transition-colors active:scale-90 shadow-xl"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <div className="flex gap-1.5">
          {clubs.slice(0, 8).map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIndex ? 'w-6 bg-amber-500' : 'w-1.5 bg-[#2A2A2A] hover:bg-[#444]'
              }`}
            />
          ))}
          {clubs.length > 8 && <span className="text-[8px] text-[#333] self-center ml-1">···</span>}
        </div>

        <button 
          onClick={next}
          className="w-12 h-12 rounded-full bg-[#111] border border-[#1F1F1F] text-[#555] flex items-center justify-center hover:text-amber-500 hover:border-amber-500/40 transition-colors active:scale-90 shadow-xl"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  )
}
