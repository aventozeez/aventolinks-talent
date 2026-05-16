'use client'

import { useState, useEffect } from 'react'
import { DRAW_KEY, REVEAL_KEY, TournamentState, blankState } from '../DrawBracket'

export default function LiveDrawPage() {
  const [ts,          setTs]          = useState<TournamentState>(blankState())
  const [revealCount, setRevealCount] = useState(0)
  const [lastRevealed, setLastRevealed] = useState(-1) // tracks the slot that just lit up

  // ── Sync with admin tab via localStorage ─────────────────────────────
  useEffect(() => {
    // Read initial state
    try {
      const saved = localStorage.getItem(DRAW_KEY)
      if (saved) setTs(JSON.parse(saved))
      const rc = localStorage.getItem(REVEAL_KEY)
      if (rc !== null) setRevealCount(parseInt(rc))
    } catch {}

    // Listen for real-time changes from the admin tab
    const handler = (e: StorageEvent) => {
      if (e.key === DRAW_KEY && e.newValue) {
        try { setTs(JSON.parse(e.newValue)) } catch {}
      }
      if (e.key === REVEAL_KEY) {
        const n = e.newValue ? parseInt(e.newValue) : 0
        setRevealCount(n)
        setLastRevealed(n - 1)   // highlight the slot that just got placed
        // clear highlight after animation
        setTimeout(() => setLastRevealed(-1), 700)
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const isDrawing = ts.phase === 'drawing'
  const isDone    = ts.phase === 'bracket'
  const isSetup   = ts.phase === 'setup'
  const slots     = ts.slots

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#040c18] text-white flex flex-col overflow-hidden" style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Ambient glow layer ── */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#f5a623]/8 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-900/20 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-900/20 blur-[100px] rounded-full" />
      </div>

      {/* ── Header ── */}
      <div className="relative z-10 text-center pt-6 pb-4 px-6 shrink-0">
        <p className="text-[11px] font-bold text-[#f5a623] uppercase tracking-[0.25em] mb-1">
          ✦ Scholars Challenge ✦
        </p>
        <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
          LIVE <span className="text-[#f5a623]">DRAW</span>
        </h1>

        {/* Status pill */}
        <div className="mt-3 inline-flex items-center gap-2">
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
              ✓ Draw Complete!
            </span>
          )}
        </div>

        {/* Progress bar */}
        {(isDrawing || isDone) && (
          <div className="mt-3 mx-auto max-w-md w-full px-4">
            <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-1.5 rounded-full bg-[#f5a623] transition-all duration-500 ease-out"
                style={{ width: `${(isDone ? 16 : revealCount) / 16 * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Waiting State ── */}
      {isSetup && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <div className="text-8xl animate-pulse">🎯</div>
          <div className="text-center">
            <p className="text-2xl font-bold text-white mb-2">Ready for the Draw</p>
            <p className="text-slate-400">The draw will begin shortly. Stay tuned!</p>
          </div>
          {/* Empty slot grid preview */}
          <div className="grid grid-cols-4 gap-3 max-w-lg w-full mt-4">
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} className="aspect-square rounded-xl border border-white/10 bg-white/3 flex items-center justify-center">
                <span className="text-slate-700 text-xl font-black">?</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Drawing / Done State ── */}
      {(isDrawing || isDone) && slots.length > 0 && (
        <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-4">
          <div className="w-full max-w-4xl">
            <div className="grid grid-cols-4 gap-3 sm:gap-4">
              {Array.from({ length: 16 }, (_, i) => {
                const s          = slots[i]
                const revealed   = isDone || i < revealCount
                const isActive   = i === lastRevealed

                return (
                  <div
                    key={i}
                    style={{
                      transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      transform: isActive ? 'scale(1.12)' : 'scale(1)',
                    }}
                  >
                    <div
                      className={`relative rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-all duration-500 ${
                        isActive
                          ? 'bg-[#f5a623] border-2 border-[#f5a623] shadow-2xl'
                          : revealed
                          ? 'bg-[#0d1f3c] border border-[#f5a623]/30'
                          : 'bg-white/5 border border-white/10'
                      }`}
                      style={{
                        minHeight: 110,
                        boxShadow: isActive
                          ? '0 0 40px rgba(245,166,35,0.6), 0 0 80px rgba(245,166,35,0.3)'
                          : revealed
                          ? '0 0 10px rgba(245,166,35,0.1)'
                          : 'none',
                      }}
                    >
                      {/* Slot label */}
                      <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${
                        isActive ? 'text-[#0a1628]' : 'text-slate-600'
                      }`}>
                        M{Math.floor(i / 2) + 1}{i % 2 === 0 ? 'A' : 'B'}
                      </p>

                      {revealed && s ? (
                        <>
                          <p className={`font-black text-base sm:text-lg leading-tight ${
                            isActive ? 'text-[#0a1628]' : 'text-white'
                          }`}>
                            {s.teamName}
                          </p>
                          {s.mentorName && (
                            <p className={`text-[11px] mt-1.5 font-medium ${
                              isActive ? 'text-[#0a1628]/70' : 'text-[#f5a623]/80'
                            }`}>
                              🎓 {s.mentorName}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-3xl font-black text-white/10">?</p>
                      )}

                      {/* Sparkle on active */}
                      {isActive && (
                        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                          <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/20 animate-pulse" />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Done message */}
            {isDone && (
              <div className="mt-8 text-center animate-bounce-once">
                <p className="text-3xl font-black text-[#f5a623] tracking-wide">
                  🏆 DRAW COMPLETE!
                </p>
                <p className="text-slate-400 text-sm mt-1">All 16 teams have been placed in the bracket</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Footer branding ── */}
      <div className="relative z-10 text-center py-3 shrink-0">
        <p className="text-[10px] text-slate-700 uppercase tracking-widest font-bold">
          AventoLinks Scholars Challenge
        </p>
      </div>
    </div>
  )
}
