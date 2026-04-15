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
          return {
            ...club,
            trophies: clubAwards,
            total_trophies: total
          }
        })
        
        // Ordenar por total de trofeos descendente
        processed.sort((a, b) => b.total_trophies - a.total_trophies)
        setClubs(processed as ClubHallOfFame[])
      }
      setIsLoading(false)
    }
    load()
  }, [])

  const next = () => setActiveIndex((prev) => (prev + 1) % clubs.length)
  const prev = () => setActiveIndex((prev) => (prev - 1 + clubs.length) % clubs.length)

  if (isLoading) return (
    <div className="w-full h-80 bg-[#141414] animate-pulse rounded-[2rem] border border-[#202020]" />
  )

  if (clubs.length === 0) return (
    <div className="bg-[#141414] border border-dashed border-[#202020] rounded-[2rem] p-12 text-center text-[#6A6C6E]">
      No hay palmarés registrados aún
    </div>
  )

  const activeClub = clubs[activeIndex]

  return (
    <div className="relative w-full max-w-lg mx-auto pb-10">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeClub.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="relative"
        >
          {/* Main Card */}
          <div className="relative overflow-hidden bg-[#0F0F0F] border border-[#202020] rounded-[2.5rem] p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            
            {/* Background Ambience */}
            <div className={`absolute -top-20 -right-20 w-64 h-64 opacity-20 rounded-full blur-[80px] pointer-events-none ${
              activeIndex === 0 ? 'bg-amber-500' : activeIndex === 1 ? 'bg-slate-300' : activeIndex === 2 ? 'bg-orange-700' : 'bg-[#FF3131]'
            }`} />

            {/* Rank Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <div className={`px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-[0.2em] ${
                  activeIndex === 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-white/5 border-white/10 text-[#6A6C6E]'
                }`}>
                  Ranking #{activeIndex + 1}
                </div>
                {activeIndex === 0 && (
                  <div className="flex items-center gap-1 bg-amber-500 text-amber-950 px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">
                    <Star className="w-2.5 h-2.5 fill-amber-950" /> Leyenda
                  </div>
                )}
              </div>
              <div className="text-[10px] font-black text-[#2D2D2D] uppercase tracking-[0.3em]">
                {activeIndex + 1} de {clubs.length} Clubes
              </div>
            </div>

            {/* Club Focus Section */}
            <div className="flex flex-col items-center text-center mb-8">
              <div className="relative mb-4">
                <div className="absolute inset-0 bg-white/5 rounded-full blur-2xl scale-150" />
                <div className="relative w-24 h-24 rounded-3xl bg-[#141414] border border-white/5 p-5 flex items-center justify-center shadow-2xl">
                  {activeClub.shield_url ? (
                    <img src={activeClub.shield_url} alt="" className="w-full h-full object-contain filter drop-shadow-xl" />
                  ) : (
                    <Shield className="w-10 h-10 text-[#1F1F1F]" />
                  )}
                </div>
              </div>
              
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none mb-2 italic">
                {activeClub.name}
              </h2>
              
              <div className="flex items-center gap-2 bg-[#1A1A1A] border border-white/5 px-4 py-2 rounded-2xl">
                <Award className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-black text-amber-500 uppercase tracking-widest">
                   {activeClub.total_trophies} Trofeos en Vitrina
                </span>
              </div>
            </div>

            {/* Vitrina (Centered Showcase) */}
            <div className="relative bg-[#050505] border border-white/[0.03] rounded-[2rem] p-6 min-h-[160px] flex flex-col items-center justify-center">
              {activeClub.trophies.length === 0 ? (
                <div className="text-center">
                  <TrophyIcon className="w-8 h-8 text-[#141414] mx-auto mb-2" />
                  <p className="text-[9px] font-black text-[#2D2D2D] uppercase tracking-[0.4em]">Sin Títulos Registrados</p>
                </div>
              ) : (
                <div className="flex flex-wrap justify-center gap-6">
                  {activeClub.trophies.map((ct) => (
                    <motion.div 
                      key={ct.id}
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      className="group/trophy relative flex flex-col items-center gap-2"
                    >
                      <div className="relative w-14 h-14">
                        <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-xl opacity-0 group-hover/trophy:opacity-100 transition-opacity" />
                        {ct.trophies?.image_url && (
                          <img 
                            src={ct.trophies.image_url} 
                            alt={ct.trophies.name} 
                            className="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(255,215,0,0.4)] group-hover/trophy:scale-110 transition-transform"
                          />
                        )}
                        <div className="absolute -top-1 -right-1 bg-amber-500 text-amber-950 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#050505] shadow-lg">
                          {ct.quantity}
                        </div>
                      </div>
                      <span className="text-[8px] font-black text-[#6A6C6E] uppercase tracking-widest text-center whitespace-nowrap">
                        {ct.trophies?.name}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
              
              {/* Shelf Reflection */}
              <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-white/[0.02] to-transparent pointer-events-none rounded-b-[2rem]" />
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation Controls */}
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-8 z-30">
        <button 
          onClick={prev}
          className="w-12 h-12 rounded-full bg-[#141414] border border-[#202020] text-white flex items-center justify-center hover:bg-[#1A1A1A] hover:border-amber-500/50 hover:text-amber-500 transition-all active:scale-90"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Progress dots */}
        <div className="flex gap-1.5">
          {clubs.map((_, i) => (
            <div 
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === activeIndex ? 'w-4 bg-amber-500' : 'w-1 bg-[#2D2D2D]'
              }`}
            />
          ))}
        </div>

        <button 
          onClick={next}
          className="w-12 h-12 rounded-full bg-[#141414] border border-[#202020] text-white flex items-center justify-center hover:bg-[#1A1A1A] hover:border-amber-500/50 hover:text-amber-500 transition-all active:scale-90"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  )
}
