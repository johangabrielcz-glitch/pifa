'use client'

import { Shield } from 'lucide-react'
import type { Standing, Club } from '@/lib/types'

interface StandingsTableProps {
  standings: (Standing & { club?: Club })[]
  highlightClubId?: string
  compact?: boolean
}

export function StandingsTable({ standings, highlightClubId, compact = false }: StandingsTableProps) {
  // Sort by points, then goal difference, then goals for
  const sortedStandings = [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference
    return b.goals_for - a.goals_for
  })

  if (compact) {
    return (
      <div className="rounded-xl border border-[#202020] bg-[#0A0A0A] overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#141414] text-[#6A6C6E]">
              <th className="text-left py-2 px-2 font-black uppercase tracking-wider">#</th>
              <th className="text-left py-2 px-1 font-black uppercase tracking-wider">Club</th>
              <th className="text-center py-2 px-1 font-black uppercase tracking-wider">PJ</th>
              <th className="text-center py-2 px-1 font-black uppercase tracking-wider">DG</th>
              <th className="text-center py-2 px-1 font-black uppercase tracking-wider">Pts</th>
            </tr>
          </thead>
          <tbody>
            {sortedStandings.map((standing, index) => {
              const isHighlighted = standing.club_id === highlightClubId
              return (
                <tr 
                  key={standing.id} 
                  className={`border-t border-[#202020] ${isHighlighted ? 'bg-[#00FF85]/10' : ''}`}
                >
                  <td className={`py-2 px-2 font-bold ${isHighlighted ? 'text-[#00FF85]' : 'text-[#6A6C6E]'}`}>
                    {index + 1}
                  </td>
                  <td className="py-2 px-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded bg-[#141414] border border-[#202020] flex items-center justify-center overflow-hidden shrink-0">
                        {standing.club?.shield_url ? (
                          <img src={standing.club.shield_url} alt="" className="w-4 h-4 object-contain" />
                        ) : (
                          <Shield className="w-3 h-3 text-[#6A6C6E]" />
                        )}
                      </div>
                      <span className={`font-bold truncate max-w-[70px] uppercase ${isHighlighted ? 'text-[#00FF85]' : 'text-white'}`}>
                        {standing.club?.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-1 text-center font-bold text-[#6A6C6E]">{standing.played}</td>
                  <td className={`py-2 px-1 text-center font-bold ${standing.goal_difference > 0 ? 'text-[#00FF85]' : standing.goal_difference < 0 ? 'text-[#FF3333]' : 'text-[#6A6C6E]'}`}>
                    {standing.goal_difference > 0 ? '+' : ''}{standing.goal_difference}
                  </td>
                  <td className={`py-2 px-1 text-center font-black ${isHighlighted ? 'text-[#00FF85]' : 'text-white'}`}>
                    {standing.points}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[#202020] bg-[#0A0A0A] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#141414] text-[#6A6C6E]">
              <th className="text-left py-2.5 px-2 font-black uppercase tracking-wider w-6">#</th>
              <th className="text-left py-2.5 px-1 font-black uppercase tracking-wider">Club</th>
              <th className="text-center py-2.5 px-1 font-black uppercase tracking-wider w-7">PJ</th>
              <th className="text-center py-2.5 px-1 font-black uppercase tracking-wider w-7">PG</th>
              <th className="text-center py-2.5 px-1 font-black uppercase tracking-wider w-7">PE</th>
              <th className="text-center py-2.5 px-1 font-black uppercase tracking-wider w-7">PP</th>
              <th className="text-center py-2.5 px-1 font-black uppercase tracking-wider w-8">GF</th>
              <th className="text-center py-2.5 px-1 font-black uppercase tracking-wider w-8">GC</th>
              <th className="text-center py-2.5 px-1 font-black uppercase tracking-wider w-8">DG</th>
              <th className="text-center py-2.5 px-2 font-black uppercase tracking-wider w-8">Pts</th>
            </tr>
          </thead>
          <tbody>
            {sortedStandings.map((standing, index) => {
              const isHighlighted = standing.club_id === highlightClubId
              return (
                <tr 
                  key={standing.id} 
                  className={`border-t border-[#202020] ${isHighlighted ? 'bg-[#00FF85]/10' : ''}`}
                >
                  <td className={`py-2.5 px-2 font-bold ${isHighlighted ? 'text-[#00FF85]' : 'text-[#6A6C6E]'}`}>
                    {index + 1}
                  </td>
                  <td className="py-2.5 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-[#141414] border border-[#202020] flex items-center justify-center overflow-hidden shrink-0">
                        {standing.club?.shield_url ? (
                          <img src={standing.club.shield_url} alt="" className="w-5 h-5 object-contain" />
                        ) : (
                          <Shield className="w-3.5 h-3.5 text-[#6A6C6E]" />
                        )}
                      </div>
                      <span className={`font-bold truncate max-w-[90px] uppercase ${isHighlighted ? 'text-[#00FF85]' : 'text-white'}`}>
                        {standing.club?.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-1 text-center font-bold text-[#6A6C6E]">{standing.played}</td>
                  <td className="py-2.5 px-1 text-center font-bold text-[#00FF85]">{standing.won}</td>
                  <td className="py-2.5 px-1 text-center font-bold text-yellow-400">{standing.drawn}</td>
                  <td className="py-2.5 px-1 text-center font-bold text-[#FF3333]">{standing.lost}</td>
                  <td className="py-2.5 px-1 text-center font-bold text-[#6A6C6E]">{standing.goals_for}</td>
                  <td className="py-2.5 px-1 text-center font-bold text-[#6A6C6E]">{standing.goals_against}</td>
                  <td className={`py-2.5 px-1 text-center font-bold ${standing.goal_difference > 0 ? 'text-[#00FF85]' : standing.goal_difference < 0 ? 'text-[#FF3333]' : 'text-[#6A6C6E]'}`}>
                    {standing.goal_difference > 0 ? '+' : ''}{standing.goal_difference}
                  </td>
                  <td className={`py-2.5 px-2 text-center font-black ${isHighlighted ? 'text-[#00FF85]' : 'text-white'}`}>
                    {standing.points}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
