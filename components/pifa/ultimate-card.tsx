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
    is_on_sale?: boolean
    sale_price?: number | null
    stamina?: number
    injury_matches_left?: number
    injury_reason?: string | null
    red_card_matches_left?: number
    red_card_reason?: string | null
    // Contract fields
    contract_seasons_left?: number
    salary?: number
    squad_role?: string | null
    morale?: number
    salary_paid_this_season?: boolean
    wants_to_leave?: boolean
    contract_status?: string
  }
  stats?: {
    goals: number
    assists: number
    matches: number
  }
  showPrice?: boolean
  onClick?: () => void
  color?: string
  hideStats?: boolean
  showContractInfo?: boolean
  isPreseason?: boolean
}

export function UltimateCard({ player, stats, showPrice = false, onClick, color = '#00FF85', hideStats = false, showContractInfo = false, isPreseason = false }: UltimateCardProps) {
  const isInjured = (player.injury_matches_left ?? 0) > 0
  const isSuspended = (player.red_card_matches_left ?? 0) > 0
  const wantsToLeave = player.wants_to_leave ?? false
  const isFreeAgent = player.contract_status === 'free_agent'
  const isUnavailable = isInjured || isSuspended || wantsToLeave || isFreeAgent
  const stamina = player.stamina ?? 100
  const staminaColor = stamina > 60 ? '#00FF85' : stamina > 30 ? '#FFB800' : '#FF3333'
  const morale = player.morale ?? 75
  const moraleColor = morale > 70 ? '#00FF85' : morale > 55 ? '#FFB800' : morale > 30 ? '#FF8C00' : '#FF3333'
  const salaryPaid = player.salary_paid_this_season ?? false
  const contractSeasons = player.contract_seasons_left ?? 0
  const roleLabel = player.squad_role === 'essential' ? 'ESE' : player.squad_role === 'important' ? 'IMP' : player.squad_role === 'rotation' ? 'ROT' : null

  return (
    <div 
      className={`group relative w-full aspect-[2/3] max-w-[220px] mx-auto animate-fade-in-up ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {/* Outer Glow & Border Layer */}
      <div 
        className={`absolute inset-x-0 inset-y-0 bg-[#141414] border transition-all duration-500 ${
          player.is_on_sale 
            ? 'border-[#00FF85]/30 shadow-[0_0_20px_rgba(0,255,133,0.1)]' 
            : 'border-white/5'
        } group-hover:border-[#00FF85]/50 group-hover:shadow-[0_0_30px_rgba(0,255,133,0.15)]`}
        style={{ 
          clipPath: 'polygon(50% 0%, 100% 15%, 100% 85%, 50% 100%, 0% 85%, 0% 15%)',
        }}
      >
        {/* Holographic Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#00FF85]/5 via-transparent to-[#0A0A0A] opacity-50" />
        
        {/* Price Tag (if on sale) */}
        {(showPrice || player.is_on_sale) && player.sale_price && (
          <div className="absolute top-[12%] right-[5%] z-30 bg-[#00FF85] text-[#0A0A0A] px-2 py-0.5 rounded font-black text-[9px] shadow-[0_0_10px_rgba(0,255,133,0.5)] transform rotate-12">
            ${player.sale_price.toLocaleString()}
          </div>
        )}

        {/* Top Info Section: Position - Shifted Down */}
        <div className="relative pt-10 px-4 flex flex-col items-start gap-1 z-20">
          <span className="text-xl font-black text-white italic leading-none drop-shadow-lg">
            {player.number || '--'}
          </span>
          <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
            player.is_on_sale ? 'bg-[#00FF85] text-[#0A0A0A]' : 'bg-[#00FF85]/10 text-[#00FF85]'
          }`}>
            {player.position}
          </span>
          {player.nationality && (
            <span className="text-[8px] font-bold text-white/40 uppercase tracking-tighter">
              {player.nationality}
            </span>
          )}
          {/* Morale indicator (below position) */}
          {showContractInfo && !isUnavailable && (
            <div className="flex items-center gap-1 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: moraleColor }} />
              <span className="text-[7px] font-black" style={{ color: moraleColor }}>{morale}%</span>
              {roleLabel && (
                <span className={`text-[6px] font-black uppercase tracking-wider px-1 py-0.5 rounded ml-0.5 ${
                  player.squad_role === 'essential' ? 'bg-amber-500/20 text-amber-400' :
                  player.squad_role === 'important' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-white/10 text-white/40'
                }`}>
                  {roleLabel}
                </span>
              )}
            </div>
          )}
          {/* Salary status (below morale) */}
          {showContractInfo && isPreseason && !wantsToLeave && !isFreeAgent && !isUnavailable && (
            <div className={`mt-0.5 px-1.5 py-0.5 rounded text-[6px] font-black uppercase tracking-wider ${
              salaryPaid 
                ? 'bg-emerald-500/20 text-emerald-400' 
                : 'bg-red-500/20 text-red-400 animate-pulse'
            }`}>
              {salaryPaid ? '✓ PAGO' : '$ IMPAGO'}
            </div>
          )}
          {/* Contract duration (below salary) */}
          {showContractInfo && !isUnavailable && (
            <div className={`mt-0.5 px-1.5 py-0.5 rounded text-[6px] font-black uppercase tracking-wider ${
              contractSeasons <= 1 ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/50'
            }`}>
              {contractSeasons}T restantes
            </div>
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
        {!hideStats && (
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
        )}

        {/* Decorative corner accent */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-8 h-1 bg-[#00FF85]/20 rounded-full blur-sm" />

        {/* Stamina Bar */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[60%] z-20">
          <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
            <div className="h-full rounded-full transition-all" style={{ width: `${stamina}%`, backgroundColor: staminaColor }} />
          </div>
        </div>

        {/* Injury/Suspension/Contract Overlay */}
        {isUnavailable && (
          <div className="absolute inset-0 bg-black/60 z-30 flex flex-col items-center justify-center" style={{ clipPath: 'polygon(50% 0%, 100% 15%, 100% 85%, 50% 100%, 0% 85%, 0% 15%)' }}>
            <span className="text-2xl mb-1">{wantsToLeave ? '🚪' : isFreeAgent ? '📋' : isInjured ? '🏥' : '🟥'}</span>
            <span className="text-[9px] font-black text-red-400 uppercase tracking-wider">
              {wantsToLeave ? 'En busca de equipo' : isFreeAgent ? 'Agente Libre' : isInjured ? 'Lesionado' : 'Suspendido'}
            </span>
            <span className="text-[8px] font-bold text-red-400/70 uppercase">
              {wantsToLeave ? 'No disponible' : isFreeAgent ? 'Sin contrato' : isInjured ? `${player.injury_matches_left}P restantes` : `${player.red_card_matches_left}P restantes`}
            </span>
          </div>
        )}


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
