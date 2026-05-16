'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Star, Trophy, Shuffle, Monitor } from 'lucide-react'
import { DRAW_KEY, TournamentState } from '../DrawBracket'

// Storage key for revealed state — live display listens to this
export const MENTORS_REVEAL_KEY = 'sc_mentors_reveal_v1'

export default function MentorsPage() {
  const router = useRouter()
  const [ts,           setTs]           = useState<TournamentState | null>(null)
  const [revealed,     setRevealed]     = useState<boolean[]>(Array(16).fill(false))
  const [allRevealed,  setAllRevealed]  = useState(false)
  const [revealingAll, setRevealingAll] = useState(false)
  const [lastFlipped,  setLastFlipped]  = useState(-1)

  // ── Load draw data ────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAW_KEY)
      if (saved) setTs(JSON.parse(saved) as TournamentState)
      // Restore any previously revealed cards
      const prev = localStorage.getItem(MENTORS_REVEAL_KEY)
      if (prev) {
        const arr: boolean[] = JSON.parse(prev)
        setRevealed(arr)
        if (arr.every(Boolean)) setAllRevealed(true)
      }
    } catch {}
  }, [])

  // ── Persist revealed state + notify live display ──────────────────────
  const persist = useCallback((next: boolean[]) => {
    setRevealed(next)
    localStorage.setItem(MENTORS_REVEAL_KEY, JSON.stringify(next))
    if (next.every(Boolean)) setAllRevealed(true)
  }, [])

  // ── Reveal single card ────────────────────────────────────────────────
  const revealCard = (i: number) => {
    if (revealingAll || revealed[i]) return
    setLastFlipped(i)
    setTimeout(() => setLastFlipped(-1), 800)
    const next = [...revealed]; next[i] = true
    persist(next)
  }

  // ── Reveal all sequentially ───────────────────────────────────────────
  const revealAll = () => {
    setRevealingAll(true)
    let i = 0
    const current = [...revealed]
    const tick = () => {
      // Skip already-revealed
      while (i < 16 && current[i]) i++
      if (i >= 16) { setRevealingAll(false); return }
      current[i] = true
      setLastFlipped(i)
      setTimeout(() => setLastFlipped(-1), 700)
      persist([...current])
      i++
      if (i < 16) setTimeout(tick, 220)
      else setRevealingAll(false)
    }
    tick()
  }

  // ── Reset ─────────────────────────────────────────────────────────────
  const reset = () => {
    const blank = Array(16).fill(false)
    setRevealed(blank)
    setAllRevealed(false)
    setRevealingAll(false)
    setLastFlipped(-1)
    localStorage.setItem(MENTORS_REVEAL_KEY, JSON.stringify(blank))
  }

  const openLive = () => {
    window.open('/dashboard/staff/competition/mentors/live', '_blank', 'noopener')
  }

  // ── No draw data ──────────────────────────────────────────────────────
  if (!ts || ts.phase !== 'bracket' || ts.slots.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex flex-col items-center justify-center text-center px-6">
        <div className="text-5xl mb-4">🎓</div>
        <h1 className="text-2xl font-bold text-white mb-2">No Draw Data Found</h1>
        <p className="text-slate-400 text-sm mb-6">Run the tournament draw first to see mentor assignments.</p>
        <button onClick={() => router.push('/dashboard/staff/competition')}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] text-sm">
          <ArrowLeft size={16} /> Back to Competition Manager
        </button>
      </div>
    )
  }

  const slots = ts.slots
  const revealedCount = revealed.filter(Boolean).length

  return (
    <div className="min-h-screen bg-[#060f1f] text-white">

      {/* ── Hero Header ── */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#0a1628] to-[#060f1f] border-b border-[#f5a623]/20">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-40 bg-[#f5a623]/10 blur-3xl rounded-full" />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 py-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Star className="text-[#f5a623]" size={20} />
              <span className="text-xs font-bold text-[#f5a623] uppercase tracking-widest">Scholars Challenge</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">
              Meet Our <span className="text-[#f5a623]">Mentors</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              {allRevealed
                ? 'All 16 mentor assignments revealed!'
                : `${revealedCount} of 16 revealed — click a card to unveil`}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {/* Live display button — always visible */}
            <button onClick={openLive}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-xl hover:bg-blue-600/30 text-sm font-semibold transition-colors">
              <Monitor size={15} /> Open Live Display
            </button>

            {!allRevealed && (
              <button onClick={revealAll} disabled={revealingAll}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] disabled:opacity-60 text-sm transition-colors">
                <Shuffle size={15} />
                {revealingAll ? 'Revealing…' : 'Reveal All'}
              </button>
            )}
            {allRevealed && (
              <button onClick={reset}
                className="flex items-center gap-2 px-5 py-2.5 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 text-sm border border-white/20 transition-colors">
                🔄 Reset Cards
              </button>
            )}
            <button onClick={() => router.push('/dashboard/staff/competition')}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/5 text-slate-300 rounded-xl hover:bg-white/10 text-sm border border-white/10 transition-colors">
              <ArrowLeft size={14} /> Back
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="max-w-6xl mx-auto px-6 pb-4">
          <div className="w-full bg-white/10 rounded-full h-1.5">
            <div className="h-1.5 rounded-full bg-[#f5a623] transition-all duration-500"
              style={{ width: `${(revealedCount / 16) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* ── Mentor Cards Grid ── */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {slots.map((slot, i) => {
            const isRevealed = revealed[i]
            const isJustFlipped = lastFlipped === i
            const matchNum = Math.floor(i / 2) + 1
            const side = i % 2 === 0 ? 'A' : 'B'

            return (
              <div key={i} onClick={() => !isRevealed && revealCard(i)}
                style={{ perspective: '1000px' }}
                className={!isRevealed ? 'cursor-pointer' : 'cursor-default'}>
                <div style={{
                  transformStyle: 'preserve-3d',
                  transform: isRevealed ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  transition: 'transform 0.65s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative', height: 160,
                }}>
                  {/* Front (face-down) */}
                  <div style={{ backfaceVisibility:'hidden', WebkitBackfaceVisibility:'hidden', position:'absolute', inset:0 }}
                    className="rounded-2xl border-2 border-[#f5a623]/30 bg-gradient-to-br from-[#0d1f3c] to-[#0a1628] flex flex-col items-center justify-center gap-2 shadow-lg hover:border-[#f5a623]/60 hover:shadow-[#f5a623]/20 hover:shadow-xl transition-all">
                    <div className="w-12 h-12 rounded-full bg-[#f5a623]/10 border-2 border-[#f5a623]/30 flex items-center justify-center">
                      <span className="text-xl">🎓</span>
                    </div>
                    <p className="text-[10px] font-bold text-[#f5a623] uppercase tracking-widest">M{matchNum}{side}</p>
                    <p className="text-[10px] text-slate-500">Tap to reveal</p>
                  </div>

                  {/* Back (revealed) */}
                  <div style={{ backfaceVisibility:'hidden', WebkitBackfaceVisibility:'hidden', transform:'rotateY(180deg)', position:'absolute', inset:0 }}
                    className={`rounded-2xl border-2 bg-gradient-to-br from-[#1a2f50] to-[#0a1628] flex flex-col items-center justify-center p-4 text-center gap-2 transition-all ${
                      isJustFlipped ? 'border-[#f5a623] shadow-2xl shadow-[#f5a623]/30' : 'border-[#f5a623]/50 shadow-xl shadow-[#f5a623]/10'
                    }`}>
                    <div className="w-10 h-10 rounded-full bg-[#f5a623] flex items-center justify-center shadow-lg shadow-[#f5a623]/40">
                      <span className="text-base">🎓</span>
                    </div>
                    <div>
                      <p className="font-black text-[#f5a623] text-sm leading-tight">{slot.mentorName}</p>
                      <div className="h-px bg-[#f5a623]/20 my-1.5" />
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Team</p>
                      <p className="font-bold text-white text-xs leading-tight mt-0.5">{slot.teamName}</p>
                    </div>
                    <p className="text-[9px] text-slate-600 font-mono">Match {matchNum}{side}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {allRevealed && (
          <div className="mt-10 bg-gradient-to-r from-[#f5a623]/10 to-[#f5a623]/5 border border-[#f5a623]/30 rounded-2xl p-6 text-center">
            <Trophy className="text-[#f5a623] mx-auto mb-3" size={32} />
            <h2 className="text-xl font-black text-white mb-1">All Mentors Unveiled!</h2>
            <p className="text-sm text-slate-400">16 mentors assigned. May the best team win! 🏆</p>
          </div>
        )}
      </div>
    </div>
  )
}
