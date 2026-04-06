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
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground">
              <th className="text-left py-2 px-2 font-medium">#</th>
              <th className="text-left py-2 px-1 font-medium">Club</th>
              <th className="text-center py-2 px-1 font-medium">PJ</th>
              <th className="text-center py-2 px-1 font-medium">DG</th>
              <th className="text-center py-2 px-1 font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            {sortedStandings.map((standing, index) => {
              const isHighlighted = standing.club_id === highlightClubId
              return (
                <tr 
                  key={standing.id} 
                  className={`border-t border-border ${isHighlighted ? 'bg-primary/10' : ''}`}
                >
                  <td className={`py-2 px-2 font-medium ${isHighlighted ? 'text-primary' : 'text-muted-foreground'}`}>
                    {index + 1}
                  </td>
                  <td className="py-2 px-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center overflow-hidden shrink-0">
                        {standing.club?.shield_url ? (
                          <img src={standing.club.shield_url} alt="" className="w-4 h-4 object-contain" />
                        ) : (
                          <Shield className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                      <span className={`font-medium truncate max-w-[70px] ${isHighlighted ? 'text-primary' : 'text-foreground'}`}>
                        {standing.club?.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-1 text-center text-muted-foreground">{standing.played}</td>
                  <td className={`py-2 px-1 text-center ${standing.goal_difference > 0 ? 'text-emerald-400' : standing.goal_difference < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {standing.goal_difference > 0 ? '+' : ''}{standing.goal_difference}
                  </td>
                  <td className={`py-2 px-1 text-center font-bold ${isHighlighted ? 'text-primary' : 'text-foreground'}`}>
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
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground">
              <th className="text-left py-2.5 px-2 font-medium w-6">#</th>
              <th className="text-left py-2.5 px-1 font-medium">Club</th>
              <th className="text-center py-2.5 px-1 font-medium w-7">PJ</th>
              <th className="text-center py-2.5 px-1 font-medium w-7">PG</th>
              <th className="text-center py-2.5 px-1 font-medium w-7">PE</th>
              <th className="text-center py-2.5 px-1 font-medium w-7">PP</th>
              <th className="text-center py-2.5 px-1 font-medium w-8">GF</th>
              <th className="text-center py-2.5 px-1 font-medium w-8">GC</th>
              <th className="text-center py-2.5 px-1 font-medium w-8">DG</th>
              <th className="text-center py-2.5 px-2 font-medium w-8">Pts</th>
            </tr>
          </thead>
          <tbody>
            {sortedStandings.map((standing, index) => {
              const isHighlighted = standing.club_id === highlightClubId
              return (
                <tr 
                  key={standing.id} 
                  className={`border-t border-border ${isHighlighted ? 'bg-primary/10' : ''}`}
                >
                  <td className={`py-2.5 px-2 font-semibold ${isHighlighted ? 'text-primary' : 'text-muted-foreground'}`}>
                    {index + 1}
                  </td>
                  <td className="py-2.5 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-muted/50 flex items-center justify-center overflow-hidden shrink-0">
                        {standing.club?.shield_url ? (
                          <img src={standing.club.shield_url} alt="" className="w-5 h-5 object-contain" />
                        ) : (
                          <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <span className={`font-medium truncate max-w-[90px] ${isHighlighted ? 'text-primary' : 'text-foreground'}`}>
                        {standing.club?.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-1 text-center text-muted-foreground">{standing.played}</td>
                  <td className="py-2.5 px-1 text-center text-emerald-400">{standing.won}</td>
                  <td className="py-2.5 px-1 text-center text-yellow-400">{standing.drawn}</td>
                  <td className="py-2.5 px-1 text-center text-red-400">{standing.lost}</td>
                  <td className="py-2.5 px-1 text-center text-muted-foreground">{standing.goals_for}</td>
                  <td className="py-2.5 px-1 text-center text-muted-foreground">{standing.goals_against}</td>
                  <td className={`py-2.5 px-1 text-center font-medium ${standing.goal_difference > 0 ? 'text-emerald-400' : standing.goal_difference < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {standing.goal_difference > 0 ? '+' : ''}{standing.goal_difference}
                  </td>
                  <td className={`py-2.5 px-2 text-center font-bold ${isHighlighted ? 'text-primary' : 'text-foreground'}`}>
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
