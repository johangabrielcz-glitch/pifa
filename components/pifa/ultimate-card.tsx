'use client'

import React from 'react'
import { PlayerRadar } from './player-radar-chart'
import { Shield } from 'lucide-react'

interface UltimateCardProps {
  player: {
    id: string
    name: string
    position: string
    number: number | null
    nationality: string | null
    photo_url: string | null
  }
  stats?: {
    goals: number
    assists: number
    matches: number
  }
  color?: string
}

export function UltimateCard({ player, stats, color = '#00FF85' }: UltimateCardProps) {
  return (
    <div className="group relative w-full aspect-[2/3] max-w-[220px] mx-auto animate-fade-in-up">
      {/* Outer Glow & Border Layer */}
      <div 
        className="absolute inset-x-0 inset-y-0 bg-[#141414] border border-white/5 transition-all duration-500 group-hover:border-[#00FF85]/50 group-hover:shadow-[0_0_30px_rgba(0,255,133,0.15)]"
        style={{ 
          clipPath: 'polygon(50% 0%, 100% 15%, 100% 85%, 50% 100%, 0% 85%, 0% 15%)',
        }}
      >
        {/* Holographic Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#00FF85]/5 via-transparent to-[#0A0A0A] opacity-50" />
        
        {/* Top Info Section: Position - Shifted Down */}
        <div className="relative pt-10 px-4 flex flex-col items-start gap-1 z-20">
          <span className="text-xl font-black text-white italic leading-none drop-shadow-lg">
            {player.number || '--'}
          </span>
          <span className="text-[10px] font-black text-[#00FF85] uppercase tracking-widest bg-[#00FF85]/10 px-1.5 py-0.5 rounded">
            {player.position}
          </span>
          {player.nationality && (
            <span className="text-[8px] font-bold text-white/40 mt-1 uppercase tracking-tighter">
              {player.nationality}
            </span>
          )}
        </div>

        {/* Player Photo Area - Shifted Down */}
        <div className="absolute top-10 right-2 w-28 h-28 flex items-center justify-center opacity-90 group-hover:opacity-100 transition-opacity z-10">
          {player.photo_url ? (
            <img 
              src={player.photo_url} 
              alt={player.name} 
              className="w-full h-full object-cover scale-110 group-hover:scale-125 transition-transform duration-700"
              style={{ maskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)' }}
            />
          ) : (
            <Shield className="w-20 h-20 text-white/5" />
          )}
        </div>

        {/* Name Plate */}
        <div className="absolute top-[62%] left-0 right-0 py-1 bg-gradient-to-r from-transparent via-white/5 to-transparent border-y border-white/5 z-20">
          <p className="text-center text-sm font-black text-white uppercase tracking-tight truncate px-2">
            {player.name}
          </p>
        </div>

        {/* Stats Grid - New Section */}
        <div className="absolute bottom-8 left-0 right-0 px-4 z-20">
          <div className="grid grid-cols-3 gap-1 bg-black/20 backdrop-blur-sm rounded-lg border border-white/5 p-1.5 transition-all group-hover:border-[#00FF85]/20">
            <div className="flex flex-col items-center">
              <span className="text-[7px] text-[#6A6C6E] font-black uppercase tracking-tighter">PJ</span>
              <span className="text-[11px] text-white font-black leading-none">{stats?.matches || 0}</span>
            </div>
            <div className="flex flex-col items-center border-x border-white/5">
              <span className="text-[7px] text-[#00FF85] font-black uppercase tracking-tighter">G</span>
              <span className="text-[11px] text-white font-black leading-none">{stats?.goals || 0}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[7px] text-blue-400 font-black uppercase tracking-tighter">A</span>
              <span className="text-[11px] text-white font-black leading-none">{stats?.assists || 0}</span>
            </div>
          </div>
        </div>

        {/* Decorative corner accent */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-8 h-1 bg-[#00FF85]/20 rounded-full blur-sm" />
      </div>

      {/* Rarity Glow Background (Hidden until hover) */}
      <div 
        className="absolute -inset-1 bg-[#00FF85]/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 -z-10"
        style={{ 
          clipPath: 'polygon(50% 0%, 100% 15%, 100% 85%, 50% 100%, 0% 85%, 0% 15%)',
        }}
      />
    </div>
  )
}
