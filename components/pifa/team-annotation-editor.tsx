'use client'

import { useState } from 'react'
import { ChevronDown, Plus, Minus, Star } from 'lucide-react'
import type { Player, GoalEntry, AssistEntry } from '@/lib/types'

export interface AnnotationEdit {
  goals: GoalEntry[]
  assists: AssistEntry[]
  mvp_player_id: string | null
  starting_xi: string[]
  substitutes_in: any[]
}

export function TeamAnnotationEditor({
  label,
  players,
  annotation,
  onChange,
  accentColor,
}: {
  label: string
  players: Player[]
  annotation: AnnotationEdit
  onChange: (a: AnnotationEdit) => void
  accentColor: string
}) {
  const [isExpanded, setIsExpanded] = useState(true)

  function addGoal(playerId: string) {
    const existing = annotation.goals.find(g => g.player_id === playerId)
    if (existing) {
      onChange({
        ...annotation,
        goals: annotation.goals.map(g =>
          g.player_id === playerId ? { ...g, count: g.count + 1 } : g
        ),
      })
    } else {
      onChange({ ...annotation, goals: [...annotation.goals, { player_id: playerId, count: 1 }] })
    }
  }

  function removeGoal(playerId: string) {
    const existing = annotation.goals.find(g => g.player_id === playerId)
    if (!existing) return
    if (existing.count <= 1) {
      onChange({ ...annotation, goals: annotation.goals.filter(g => g.player_id !== playerId) })
    } else {
      onChange({
        ...annotation,
        goals: annotation.goals.map(g =>
          g.player_id === playerId ? { ...g, count: g.count - 1 } : g
        ),
      })
    }
  }

  function addAssist(playerId: string) {
    const existing = annotation.assists.find(a => a.player_id === playerId)
    if (existing) {
      onChange({
        ...annotation,
        assists: annotation.assists.map(a =>
          a.player_id === playerId ? { ...a, count: a.count + 1 } : a
        ),
      })
    } else {
      onChange({ ...annotation, assists: [...annotation.assists, { player_id: playerId, count: 1 }] })
    }
  }

  function removeAssist(playerId: string) {
    const existing = annotation.assists.find(a => a.player_id === playerId)
    if (!existing) return
    if (existing.count <= 1) {
      onChange({ ...annotation, assists: annotation.assists.filter(a => a.player_id !== playerId) })
    } else {
      onChange({
        ...annotation,
        assists: annotation.assists.map(a =>
          a.player_id === playerId ? { ...a, count: a.count - 1 } : a
        ),
      })
    }
  }

  function toggleMvp(playerId: string) {
    onChange({
      ...annotation,
      mvp_player_id: annotation.mvp_player_id === playerId ? null : playerId,
    })
  }

  const goalTotal = annotation.goals.reduce((s, g) => s + g.count, 0)
  const assistTotal = annotation.assists.reduce((s, a) => s + a.count, 0)

  return (
    <div className="bg-[#141414] rounded-2xl border border-white/[0.04] overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
          <span className="text-[10px] font-black text-white uppercase tracking-widest">{label}</span>
          <div className="flex gap-2">
            <span className="text-[8px] font-black text-[#6A6C6E] bg-white/5 px-2 py-0.5 rounded">⚽ {goalTotal}</span>
            <span className="text-[8px] font-black text-[#6A6C6E] bg-white/5 px-2 py-0.5 rounded">🅰️ {assistTotal}</span>
            {annotation.mvp_player_id && <span className="text-[8px] font-black text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">⭐ MVP</span>}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-[#6A6C6E] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-1.5 max-h-[280px] overflow-y-auto custom-scrollbar">
          {players.length === 0 ? (
            <p className="text-[9px] text-[#6A6C6E] text-center py-6 font-bold">No hay jugadores en la plantilla</p>
          ) : (
            players.map(player => {
              const playerGoals = annotation.goals.find(g => g.player_id === player.id)?.count || 0
              const playerAssists = annotation.assists.find(a => a.player_id === player.id)?.count || 0
              const isMvp = annotation.mvp_player_id === player.id

              return (
                <div
                  key={player.id}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-[#0A0A0A]/60 border border-white/[0.02] hover:border-white/[0.06] transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-white truncate">{player.name}</p>
                    <p className="text-[7px] font-bold text-[#6A6C6E] uppercase tracking-widest">{player.position} · #{player.number || '-'}</p>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => removeGoal(player.id)}
                      disabled={playerGoals === 0}
                      className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center disabled:opacity-10 hover:bg-red-500/20 transition-all"
                    >
                      <Minus className="w-2.5 h-2.5 text-white" />
                    </button>
                    <div className="w-7 h-6 flex items-center justify-center">
                      <span className={`text-[10px] font-black tabular-nums ${playerGoals > 0 ? 'text-white' : 'text-[#2D2D2D]'}`}>
                        ⚽{playerGoals}
                      </span>
                    </div>
                    <button
                      onClick={() => addGoal(player.id)}
                      className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center hover:bg-green-500/20 transition-all"
                    >
                      <Plus className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => removeAssist(player.id)}
                      disabled={playerAssists === 0}
                      className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center disabled:opacity-10 hover:bg-red-500/20 transition-all"
                    >
                      <Minus className="w-2.5 h-2.5 text-white" />
                    </button>
                    <div className="w-7 h-6 flex items-center justify-center">
                      <span className={`text-[10px] font-black tabular-nums ${playerAssists > 0 ? 'text-white' : 'text-[#2D2D2D]'}`}>
                        🅰️{playerAssists}
                      </span>
                    </div>
                    <button
                      onClick={() => addAssist(player.id)}
                      className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center hover:bg-green-500/20 transition-all"
                    >
                      <Plus className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>

                  <button
                    onClick={() => toggleMvp(player.id)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                      isMvp
                        ? 'bg-amber-400/20 border border-amber-400/40 text-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.3)]'
                        : 'bg-white/5 border border-white/[0.04] text-[#2D2D2D] hover:text-amber-400'
                    }`}
                  >
                    <Star className="w-3 h-3" />
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
