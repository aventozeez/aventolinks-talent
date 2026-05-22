'use client'

import { useState, useEffect } from 'react'
import { DRAW_KEY, REVEAL_KEY, type TournamentState, blankState, type DrawSlot } from '../DrawBracket'

// ── 8 distinct match colours, one per R16 fixture ──────────────────────────────
const MATCH_COLORS = [
  { solid: '#ef4444', bg: 'rgba(239,68,68,0.13)',   border: 'rgba(239,68,68,0.55)',   glow: 'rgba(239,68,68,0.45)'   }, // red
  { solid: '#f97316', bg: 'rgba(249,115,22,0.13)',  border: 'rgba(249,115,22,0.55)',  glow: 'rgba(249,115,22,0.45)'  }, // orange
  { solid: '#eab308', bg: 'rgba(234,179,8,0.13)',   border: 'rgba(234,179,8,0.55)',   glow: 'rgba(234,179,8,0.45)'   }, // yellow
  { solid: '#22c55e', bg: 'rgba(34,197,94,0.13)',   border: 'rgba(34,197,94,0.55)',   glow: 'rgba(34,197,94,0.45)'   }, // green
  { solid: '#14b8a6', bg: 'rgba(20,184,166,0.13)',  border: 'rgba(20,184,166,0.55)',  glow: 'rgba(20,184,166,0.45)'  }, // teal
  { solid: '#3b82f6', bg: 'rgba(59,130,246,0.13)',  border: 'rgba(59,130,246,0.55)',  glow: 'rgba(59,130,246,0.45)'  }, // blue
  { solid: '#a855f7', bg: 'rgba(168,85,247,0.13)',  border: 'rgba(168,85,247,0.55)',  glow: 'rgba(168,85,247,0.45)'  }, // purple
  { solid: '#ec4899', bg: 'rgba(236,72,153,0.13)',  border: 'rgba(236,72,153,0.55)',  glow: 'rgba(236,72,153,0.45)'  }, // pink
]

export default function LiveDrawPage() {
  const [ts,           setTs]          = useState<TournamentState>(blankState())
  const [revealCount,  setRevealCount] = useState(0)
  const [lastRevealed, setLastRevealed] = useState(-1)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAW_KEY)
      if (saved) setTs(JSON.parse(saved))
      const rc = localStorage.getItem(REVEAL_KEY)
      if (rc !== null) setRevealCount(parseInt(rc))
    } catch {}

    const handler = (e: StorageEvent) => {
      if (e.key === DRAW_KEY && e.newValue) {
        try { setTs(JSON.parse(e.newValue)) } catch {}
      }
      if (e.key === REVEAL_KEY) {
        const n = e.newValue ? parseInt(e.newValue) : 0
        setRevealCount(n)
        setLastRevealed(n - 1)
        setTimeout(() => setLastRevealed(-1), 750)
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const isSetup   = ts.phase === 'setup'
  const isDrawing = ts.phase === 'drawing'
  const isDone    = ts.phase === 'bracket'
  const slots     = ts.slots

  return (
    <div className="min-h-screen bg-[#040c18] text-white flex flex-col overflow-hidden" style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Multi-colour ambient glow ── */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4  w-80 h-80 rounded-full blur-[120px]" style={{ background: 'rgba(239,68,68,0.07)' }}   />
        <div className="absolute top-0 right-1/4 w-80 h-80 rounded-full blur-[120px]" style={{ background: 'rgba(59,130,246,0.07)' }}  />
        <div className="absolute bottom-0 left-0  w-80 h-80 rounded-full blur-[100px]" style={{ background: 'rgba(168,85,247,0.08)' }} />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full blur-[100px]" style={{ background: 'rgba(34,197,94,0.07)' }}  />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-60 rounded-full blur-[140px]" style={{ background: 'rgba(245,166,35,0.05)' }} />
      </div>

      {/* ── Header ── */}
      <div className="relative z-10 text-center pt-5 pb-3 px-6 shrink-0">
        <p className="text-[11px] font-bold text-[#f5a623] uppercase tracking-[0.25em] mb-1">
          ✦ Scholars Challenge ✦
        </p>
        <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
          LIVE <span className="text-[#f5a623]">DRAW</span>
        </h1>

        {/* Status pill */}
        <div className="mt-2 inline-flex items-center gap-2">
          {isSetup && (
            <span className="px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs font-semibold text-slate-300">
              ⏳ Waiting for draw to start…
            </span>
          )}
          {isDrawing && (
            <span className="px-4 py-1.5 rounded-full bg-[#f5a623]/20 border border-[#f5a623]/40 text-xs font-bold text-[#f5a623] animate-pulse">
              🎲 DRAWING — {revealCount} / 16
            </span>
          )}
          {isDone && (
            <span className="px-4 py-1.5 rounded-full bg-green-500/20 border border-green-500/40 text-xs font-bold text-green-400">
              ✓ Draw Complete — 8 Matches Set!
            </span>
          )}
        </div>

        {/* Progress bar */}
        {(isDrawing || isDone) && (
          <div className="mt-2 mx-auto max-w-md w-full px-4">
            <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-1.5 rounded-full bg-[#f5a623] transition-all duration-500 ease-out"
                style={{ width: `${(isDone ? 16 : revealCount) / 16 * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 8 Match-pair grid (shown in all phases) ── */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 pb-3">
        <div className="w-full max-w-5xl">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {Array.from({ length: 8 }, (_, matchNum) => {
              const slotAIdx = matchNum * 2
              const slotBIdx = matchNum * 2 + 1
              const slotA = slots[slotAIdx]
              const slotB = slots[slotBIdx]
              const revA = !isSetup && (isDone || slotAIdx < revealCount)
              const revB = !isSetup && (isDone || slotBIdx < revealCount)
              const isActA = slotAIdx === lastRevealed
              const isActB = slotBIdx === lastRevealed
              const mc = MATCH_COLORS[matchNum]
              const isAnyActive = isActA || isActB

              return (
                <div
                  key={matchNum}
                  style={{
                    background: mc.bg,
                    border: `1.5px solid ${isAnyActive ? mc.solid : mc.border}`,
                    borderRadius: 16,
                    boxShadow: isAnyActive
                      ? `0 0 32px ${mc.glow}, 0 0 64px ${mc.glow}`
                      : `0 0 8px ${mc.glow}`,
                    padding: '10px 14px',
                    transition: 'all 0.35s ease',
                    transform: isAnyActive ? 'scale(1.025)' : 'scale(1)',
                  }}
                >
                  {/* Match label */}
                  <p
                    className="text-[9px] font-black uppercase tracking-widest text-center mb-2"
                    style={{ color: mc.solid }}
                  >
                    ✦ MATCH {matchNum + 1}
                  </p>

                  {/* Team cards */}
                  <div className="flex items-center gap-2">
                    <MatchTeamCard slot={slotA} revealed={revA} isActive={isActA} mc={mc} />
                    <span className="text-[11px] font-black shrink-0" style={{ color: mc.solid }}>VS</span>
                    <MatchTeamCard slot={slotB} revealed={revB} isActive={isActB} mc={mc} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Completion banner */}
          {isDone && (
            <div className="mt-6 text-center">
              <p className="text-3xl font-black text-[#f5a623] tracking-wide">
                🏆 DRAW COMPLETE!
              </p>
              <p className="text-slate-400 text-sm mt-1">All 16 teams have been placed — 8 matches await</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="relative z-10 text-center py-2 shrink-0">
        <p className="text-[10px] text-slate-700 uppercase tracking-widest font-bold">
          AventoLinks Scholars Challenge
        </p>
      </div>
    </div>
  )
}

// ── Team card within a match box ───────────────────────────────────────────────
function MatchTeamCard({
  slot, revealed, isActive, mc,
}: {
  slot: DrawSlot | undefined
  revealed: boolean
  isActive: boolean
  mc: typeof MATCH_COLORS[0]
}) {
  return (
    <div
      style={{
        flex: 1,
        background: isActive ? mc.solid : revealed ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${revealed || isActive ? mc.border : 'rgba(255,255,255,0.07)'}`,
        boxShadow: isActive ? `0 0 24px ${mc.glow}` : 'none',
        borderRadius: 10,
        minHeight: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 8px',
        transform: isActive ? 'scale(1.07)' : 'scale(1)',
        transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      {revealed && slot ? (
        <p
          className="font-black text-sm sm:text-base leading-tight text-center"
          style={{ color: isActive ? '#fff' : '#fff' }}
        >
          {slot.teamName}
        </p>
      ) : (
        <p className="text-2xl font-black" style={{ color: mc.border }}>?</p>
      )}
    </div>
  )
}
