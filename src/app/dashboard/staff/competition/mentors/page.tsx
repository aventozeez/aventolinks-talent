'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Star, Trophy, Shuffle, Monitor, User } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { DRAW_KEY, TournamentState } from '../DrawBracket'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Storage keys — live display listens to these
export const MENTORS_REVEAL_KEY      = 'sc_mentors_reveal_v1'
export const MENTORS_NAMES_KEY       = 'sc_mentor_names_v1'       // entered names
export const MENTORS_ASSIGNMENT_KEY  = 'sc_mentor_assignments_v1' // slot → mentor name

export default function MentorsPage() {
  const router = useRouter()
  const [ts,            setTs]            = useState<TournamentState | null>(null)
  const [mentorNames,   setMentorNames]   = useState<string[]>(Array(16).fill(''))
  const [assignments,   setAssignments]   = useState<string[]>(Array(16).fill('')) // per-slot
  const [revealed,      setRevealed]      = useState<boolean[]>(Array(16).fill(false))
  const [allRevealed,   setAllRevealed]   = useState(false)
  const [revealingAll,  setRevealingAll]  = useState(false)
  const [showNameInput, setShowNameInput] = useState(false)
  const [dbLoaded,      setDbLoaded]      = useState(false) // true if names came from Supabase

  // ── Load state ────────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      try {
        const draw = localStorage.getItem(DRAW_KEY)
        if (draw) setTs(JSON.parse(draw) as TournamentState)

        const assign = localStorage.getItem(MENTORS_ASSIGNMENT_KEY)
        if (assign) setAssignments(JSON.parse(assign))

        const rev = localStorage.getItem(MENTORS_REVEAL_KEY)
        if (rev) {
          const arr: boolean[] = JSON.parse(rev)
          setRevealed(arr)
          if (arr.every(Boolean)) setAllRevealed(true)
        }

        // Always reload mentor names fresh from Supabase
        const { data, error } = await supabase
          .from('sc_mentors')
          .select('name')
          .order('created_at', { ascending: true })
          .limit(16)

        if (!error && data && data.length >= 16) {
          const names = data.map((r: { name: string }) => r.name)
          setMentorNames(names)
          localStorage.setItem(MENTORS_NAMES_KEY, JSON.stringify(names))
          setDbLoaded(true)

          // Auto-assign if no existing assignment yet
          const existingAssign = localStorage.getItem(MENTORS_ASSIGNMENT_KEY)
          if (!existingAssign) {
            const shuffled = [...names].sort(() => Math.random() - 0.5)
            setAssignments(shuffled)
            localStorage.setItem(MENTORS_ASSIGNMENT_KEY, JSON.stringify(shuffled))
          }
        } else {
          // Fallback: use locally saved names
          const savedNames = localStorage.getItem(MENTORS_NAMES_KEY)
          if (savedNames) setMentorNames(JSON.parse(savedNames))
        }
      } catch {}
    })()
  }, [])

  // ── Save mentor name inputs ───────────────────────────────────────────
  const updateName = (i: number, val: string) => {
    const next = [...mentorNames]; next[i] = val
    setMentorNames(next)
    localStorage.setItem(MENTORS_NAMES_KEY, JSON.stringify(next))
  }

  // ── Randomly assign mentor names to the 16 slots ─────────────────────
  const randomizeAssignment = () => {
    const filled = mentorNames.filter(n => n.trim())
    if (filled.length < 16) {
      alert(`Please enter all 16 mentor names first (${16 - filled.length} missing).`)
      return
    }
    const shuffled = [...mentorNames].sort(() => Math.random() - 0.5)
    setAssignments(shuffled)
    localStorage.setItem(MENTORS_ASSIGNMENT_KEY, JSON.stringify(shuffled))
    // Also reset reveals when re-assigning
    const blank = Array(16).fill(false)
    setRevealed(blank)
    setAllRevealed(false)
    localStorage.setItem(MENTORS_REVEAL_KEY, JSON.stringify(blank))
  }

  // ── Persist revealed state + notify live display ──────────────────────
  const persistRevealed = useCallback((next: boolean[]) => {
    setRevealed(next)
    localStorage.setItem(MENTORS_REVEAL_KEY, JSON.stringify(next))
    if (next.every(Boolean)) setAllRevealed(true)
  }, [])

  const revealCard = (i: number) => {
    if (revealingAll || revealed[i]) return
    const next = [...revealed]; next[i] = true
    persistRevealed(next)
  }

  const revealAll = () => {
    setRevealingAll(true)
    const current = [...revealed]
    let i = 0
    const tick = () => {
      while (i < 16 && current[i]) i++
      if (i >= 16) { setRevealingAll(false); return }
      current[i] = true
      persistRevealed([...current])
      i++
      if (i < 16) setTimeout(tick, 220)
      else setRevealingAll(false)
    }
    tick()
  }

  const reset = () => {
    const blank = Array(16).fill(false)
    setRevealed(blank)
    setAllRevealed(false)
    setRevealingAll(false)
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

  const slots        = ts.slots
  const revealedCount = revealed.filter(Boolean).length
  const isAssigned   = assignments.some(a => a.trim())

  return (
    <div className="min-h-screen bg-[#060f1f] text-white">

      {/* ── Hero Header ── */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#0a1628] to-[#060f1f] border-b border-[#f5a623]/20">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-40 bg-[#f5a623]/10 blur-3xl rounded-full" />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 py-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Star className="text-[#f5a623]" size={18} />
              <span className="text-xs font-bold text-[#f5a623] uppercase tracking-widest">Scholars Challenge</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">
              Unveil Our <span className="text-[#f5a623]">Mentors</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              {!isAssigned
                ? dbLoaded
                  ? '✓ Mentor names loaded — assign randomly to teams before revealing'
                  : 'Enter mentor names and assign them to teams before revealing'
                : allRevealed
                ? 'All 16 mentors revealed!'
                : `${revealedCount} of 16 revealed — click a card to unveil`}
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button onClick={openLive}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-xl hover:bg-blue-600/30 text-sm font-semibold transition-colors">
              <Monitor size={15} /> Open Live Display
            </button>
            <button onClick={() => setShowNameInput(p => !p)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${showNameInput ? 'bg-white/10 border-white/20 text-white' : 'bg-[#f5a623]/10 border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a623]/20'}`}>
              <User size={15} /> {showNameInput ? 'Hide Names' : dbLoaded ? 'View / Edit Names' : 'Enter Mentor Names'}
            </button>
            {isAssigned && !allRevealed && (
              <>
                <button onClick={randomizeAssignment}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/10 text-slate-300 border border-white/20 rounded-xl hover:bg-white/20 text-sm font-semibold transition-colors">
                  <Shuffle size={15} /> Re-assign
                </button>
                <button onClick={revealAll} disabled={revealingAll}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] disabled:opacity-60 text-sm transition-colors">
                  <Shuffle size={15} /> {revealingAll ? 'Revealing…' : 'Reveal All'}
                </button>
              </>
            )}
            {allRevealed && (
              <button onClick={reset}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 text-sm border border-white/20 transition-colors">
                🔄 Reset
              </button>
            )}
            <button onClick={() => router.push('/dashboard/staff/competition')}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/5 text-slate-300 rounded-xl hover:bg-white/10 text-sm border border-white/10 transition-colors">
              <ArrowLeft size={14} /> Back
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {isAssigned && (
          <div className="max-w-6xl mx-auto px-6 pb-4">
            <div className="w-full bg-white/10 rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-[#f5a623] transition-all duration-500"
                style={{ width: `${(revealedCount / 16) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* ── Mentor Name Inputs (collapsible) ── */}
        {showNameInput && (
          <div className="bg-[#0a1628] border border-[#f5a623]/20 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h2 className="text-sm font-bold text-[#f5a623]">
                  {dbLoaded ? '✓ Mentor Names (loaded from database)' : 'Enter Mentor Names'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {dbLoaded
                    ? 'Names auto-loaded from the registered mentors list. Edit if needed, then click Assign Randomly.'
                    : <>Fill all 16 names, then click <strong>Assign Randomly</strong> to pair them with teams.</>}
                </p>
              </div>
              <button
                onClick={randomizeAssignment}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] text-sm transition-colors"
              >
                <Shuffle size={15} /> Assign Randomly
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {Array.from({ length: 16 }, (_, i) => (
                <div key={i}>
                  <label className="text-[10px] text-slate-500 block mb-1">Mentor {i + 1}</label>
                  <input
                    value={mentorNames[i] || ''}
                    onChange={e => updateName(i, e.target.value)}
                    placeholder={`e.g. Dr. Smith`}
                    className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623] placeholder-slate-600"
                  />
                </div>
              ))}
            </div>
            {isAssigned && (
              <p className="mt-3 text-xs text-green-400">
                ✓ Mentors assigned! Close this panel and reveal the cards below.
              </p>
            )}
          </div>
        )}

        {/* ── Not yet assigned notice (only if no db names) ── */}
        {!isAssigned && !showNameInput && !dbLoaded && (
          <div className="bg-[#f5a623]/5 border border-[#f5a623]/20 rounded-xl p-4 text-sm text-[#f5a623]/80 text-center">
            Click <strong>View / Edit Names</strong> above to add mentor names, then click <strong>Assign Randomly</strong> to pair them with teams.
          </div>
        )}

        {/* ── Mentor Cards Grid ── */}
        {isAssigned && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {slots.map((slot, i) => {
              const isRevealed   = revealed[i]
              const mentorName   = assignments[i] || `Mentor ${i + 1}`
              const matchNum     = Math.floor(i / 2) + 1
              const side         = i % 2 === 0 ? 'A' : 'B'

              return (
                <div key={i}
                  onClick={() => !isRevealed && revealCard(i)}
                  style={{ perspective: '1000px' }}
                  className={!isRevealed ? 'cursor-pointer' : 'cursor-default'}>
                  <div style={{
                    transformStyle: 'preserve-3d',
                    transform: isRevealed ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    transition: 'transform 0.65s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative', height: 170,
                  }}>
                    {/* Front — face-down */}
                    <div style={{ backfaceVisibility:'hidden', WebkitBackfaceVisibility:'hidden', position:'absolute', inset:0 }}
                      className="rounded-2xl border-2 border-[#f5a623]/30 bg-gradient-to-br from-[#0d1f3c] to-[#0a1628] flex flex-col items-center justify-center gap-2 shadow-lg hover:border-[#f5a623]/60 hover:shadow-[#f5a623]/20 hover:shadow-xl transition-all">
                      <div className="w-12 h-12 rounded-full bg-[#f5a623]/10 border-2 border-[#f5a623]/30 flex items-center justify-center">
                        <span className="text-2xl">🎓</span>
                      </div>
                      <p className="text-[10px] font-bold text-[#f5a623] uppercase tracking-widest">M{matchNum}{side}</p>
                      <p className="text-[10px] text-slate-500">Tap to reveal</p>
                    </div>

                    {/* Back — revealed */}
                    <div style={{ backfaceVisibility:'hidden', WebkitBackfaceVisibility:'hidden', transform:'rotateY(180deg)', position:'absolute', inset:0 }}
                      className="rounded-2xl border-2 border-[#f5a623]/50 bg-gradient-to-br from-[#1a2f50] to-[#0a1628] flex flex-col items-center justify-center p-4 shadow-xl shadow-[#f5a623]/10 text-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-[#f5a623] flex items-center justify-center shadow-lg shadow-[#f5a623]/40">
                        <span className="text-lg">🎓</span>
                      </div>
                      <div>
                        <p className="font-black text-[#f5a623] text-sm leading-tight">{mentorName}</p>
                        <div className="h-px bg-[#f5a623]/20 my-2" />
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Team</p>
                        <p className="font-bold text-white text-sm leading-tight mt-0.5">{slot.teamName}</p>
                      </div>
                      <p className="text-[9px] text-slate-600 font-mono">Match {matchNum}{side}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Done banner ── */}
        {allRevealed && (
          <div className="bg-gradient-to-r from-[#f5a623]/10 to-[#f5a623]/5 border border-[#f5a623]/30 rounded-2xl p-6 text-center">
            <Trophy className="text-[#f5a623] mx-auto mb-3" size={32} />
            <h2 className="text-xl font-black text-white mb-1">All Mentors Unveiled!</h2>
            <p className="text-sm text-slate-400">16 mentors assigned. May the best team win! 🏆</p>
          </div>
        )}
      </div>
    </div>
  )
}
