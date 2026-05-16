'use client'

import { useState, useEffect } from 'react'
import { DRAW_KEY, TournamentState, blankState } from '../../DrawBracket'
import { MENTORS_REVEAL_KEY, MENTORS_ASSIGNMENT_KEY } from '../page'

export default function LiveMentorsPage() {
  const [ts,          setTs]          = useState<TournamentState>(blankState())
  const [revealed,    setRevealed]    = useState<boolean[]>(Array(16).fill(false))
  const [assignments, setAssignments] = useState<string[]>(Array(16).fill(''))
  const [lastFlipped, setLastFlipped] = useState(-1)
  const [spotlight,   setSpotlight]   = useState<{ name: string; team: string } | null>(null)

  // ── Sync with admin tab ───────────────────────────────────────────────
  useEffect(() => {
    // Initial read
    try {
      const draw = localStorage.getItem(DRAW_KEY)
      if (draw) setTs(JSON.parse(draw))
      const rev = localStorage.getItem(MENTORS_REVEAL_KEY)
      if (rev) setRevealed(JSON.parse(rev))
      const assign = localStorage.getItem(MENTORS_ASSIGNMENT_KEY)
      if (assign) setAssignments(JSON.parse(assign))
    } catch {}

    // Real-time sync
    const handler = (e: StorageEvent) => {
      if (e.key === DRAW_KEY && e.newValue) {
        try { setTs(JSON.parse(e.newValue)) } catch {}
      }
      if (e.key === MENTORS_ASSIGNMENT_KEY && e.newValue) {
        try { setAssignments(JSON.parse(e.newValue)) } catch {}
      }
      if (e.key === MENTORS_REVEAL_KEY && e.newValue) {
        try {
          const next: boolean[] = JSON.parse(e.newValue)
          setRevealed(prev => {
            const newIdx = next.findIndex((v, i) => v && !prev[i])
            if (newIdx >= 0) {
              setLastFlipped(newIdx)
              setTimeout(() => setLastFlipped(-1), 1000)
            }
            return next
          })
        } catch {}
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  // ── Spotlight: show big name when a card flips ────────────────────────
  useEffect(() => {
    if (lastFlipped >= 0 && ts.slots[lastFlipped]) {
      const s = ts.slots[lastFlipped]
      const mentor = assignments[lastFlipped] || `Mentor ${lastFlipped + 1}`
      setSpotlight({ name: mentor, team: s.teamName })
      const t = setTimeout(() => setSpotlight(null), 2800)
      return () => clearTimeout(t)
    }
  }, [lastFlipped, ts.slots, assignments])

  const slots        = ts.slots
  const revealedCount = revealed.filter(Boolean).length
  const allDone       = revealedCount === 16 && slots.length === 16
  const hasData       = ts.phase === 'bracket' && slots.length === 16

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#040c18] text-white flex flex-col overflow-hidden select-none"
      style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Ambient glow ── */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-[#f5a623]/8 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-900/20 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-900/15 blur-[100px] rounded-full" />
      </div>

      {/* ── Spotlight overlay — shows when a card flips ── */}
      {spotlight && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          {/* Radial glow behind spotlight */}
          <div className="absolute inset-0 bg-black/60" style={{ backdropFilter: 'blur(2px)' }} />
          <div className="relative z-10 text-center px-8 py-10 rounded-3xl border-2 border-[#f5a623]/60 bg-[#0a1628]/90 shadow-2xl shadow-[#f5a623]/20"
            style={{ animation: 'spotlightIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <div className="w-20 h-20 rounded-full bg-[#f5a623] flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-[#f5a623]/50">
              <span className="text-4xl">🎓</span>
            </div>
            <p className="text-4xl sm:text-5xl font-black text-[#f5a623] leading-tight">{spotlight.name}</p>
            <div className="h-px bg-[#f5a623]/30 my-4 mx-8" />
            <p className="text-sm text-slate-400 uppercase tracking-widest font-semibold mb-1">Mentoring</p>
            <p className="text-2xl sm:text-3xl font-black text-white">{spotlight.team}</p>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="relative z-10 text-center pt-6 pb-3 px-6 shrink-0">
        <p className="text-[11px] font-bold text-[#f5a623] uppercase tracking-[0.25em] mb-1">
          ✦ Scholars Challenge ✦
        </p>
        <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
          MENTOR <span className="text-[#f5a623]">REVEAL</span>
        </h1>

        <div className="mt-3 inline-flex items-center gap-2">
          {!hasData && (
            <span className="px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs font-semibold text-slate-300">
              ⏳ Waiting for mentor data…
            </span>
          )}
          {hasData && !allDone && (
            <span className="px-4 py-1.5 rounded-full bg-[#f5a623]/20 border border-[#f5a623]/40 text-xs font-bold text-[#f5a623]">
              🎓 {revealedCount} / 16 Revealed
            </span>
          )}
          {allDone && (
            <span className="px-4 py-1.5 rounded-full bg-green-500/20 border border-green-500/40 text-xs font-bold text-green-400">
              ✓ All Mentors Unveiled!
            </span>
          )}
        </div>

        {hasData && (
          <div className="mt-3 mx-auto max-w-md w-full px-4">
            <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
              <div className="h-1.5 rounded-full bg-[#f5a623] transition-all duration-500 ease-out"
                style={{ width: `${(revealedCount / 16) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Waiting state ── */}
      {!hasData && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <div className="text-8xl animate-pulse">🎓</div>
          <div className="text-center">
            <p className="text-2xl font-bold text-white mb-2">Mentor Assignments Loading…</p>
            <p className="text-slate-400">Waiting for the draw to complete. Stay tuned!</p>
          </div>
          <div className="grid grid-cols-4 gap-3 max-w-lg w-full mt-4">
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} className="aspect-square rounded-xl border border-white/10 bg-white/3 flex items-center justify-center">
                <span className="text-3xl">🎓</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Cards grid ── */}
      {hasData && (
        <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-4">
          <div className="w-full max-w-5xl">
            <div className="grid grid-cols-4 gap-3 sm:gap-4" style={{ perspective: '1200px' }}>
              {slots.map((slot, i) => {
                const isRevealed   = revealed[i]
                const isJustFlipped = lastFlipped === i
                const matchNum     = Math.floor(i / 2) + 1
                const side         = i % 2 === 0 ? 'A' : 'B'

                return (
                  <div key={i} style={{ perspective: '1000px' }}>
                    <div style={{
                      transformStyle: 'preserve-3d',
                      transform: isRevealed ? 'rotateY(180deg)' : 'rotateY(0deg)',
                      transition: 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                      position: 'relative',
                      height: 140,
                      ...(isJustFlipped ? { transform: 'rotateY(180deg) scale(1.06)' } : {}),
                    }}>

                      {/* Front — face down */}
                      <div style={{ backfaceVisibility:'hidden', WebkitBackfaceVisibility:'hidden', position:'absolute', inset:0 }}
                        className="rounded-2xl border-2 border-[#f5a623]/20 bg-gradient-to-br from-[#0d1f3c] to-[#060f1f] flex flex-col items-center justify-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-[#f5a623]/10 border border-[#f5a623]/20 flex items-center justify-center">
                          <span className="text-lg">🎓</span>
                        </div>
                        <p className="text-[10px] font-bold text-[#f5a623]/60 uppercase tracking-widest">M{matchNum}{side}</p>
                      </div>

                      {/* Back — revealed */}
                      <div style={{
                          backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                          transform: 'rotateY(180deg)', position: 'absolute', inset: 0,
                          boxShadow: isJustFlipped ? '0 0 40px rgba(245,166,35,0.5), 0 0 80px rgba(245,166,35,0.2)' : '0 4px 12px rgba(245,166,35,0.1)',
                        }}
                        className={`rounded-2xl border-2 bg-gradient-to-br from-[#1a2f50] to-[#0a1628] flex flex-col items-center justify-center p-3 text-center gap-1.5 transition-all duration-300 ${
                          isJustFlipped ? 'border-[#f5a623]' : 'border-[#f5a623]/40'
                        }`}>
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shadow-lg ${isJustFlipped ? 'bg-[#f5a623] shadow-[#f5a623]/60' : 'bg-[#f5a623]/80 shadow-[#f5a623]/30'}`}>
                          <span className="text-sm">🎓</span>
                        </div>
                        <p className={`font-black text-sm leading-tight ${isJustFlipped ? 'text-[#f5a623]' : 'text-[#f5a623]/90'}`}>
                          {assignments[i] || `Mentor ${i + 1}`}
                        </p>
                        <div className="h-px bg-[#f5a623]/20 w-full" />
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Team</p>
                        <p className="font-bold text-white text-xs leading-tight">{slot.teamName}</p>
                        <p className="text-[9px] text-slate-600 font-mono">M{matchNum}{side}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* All done banner */}
            {allDone && (
              <div className="mt-8 text-center">
                <p className="text-3xl font-black text-[#f5a623]">🏆 ALL MENTORS REVEALED!</p>
                <p className="text-slate-400 text-sm mt-1">May the best team win!</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="relative z-10 text-center py-3 shrink-0">
        <p className="text-[10px] text-slate-700 uppercase tracking-widest font-bold">
          AventoLinks Scholars Challenge
        </p>
      </div>

      {/* ── Spotlight animation keyframes ── */}
      <style>{`
        @keyframes spotlightIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
