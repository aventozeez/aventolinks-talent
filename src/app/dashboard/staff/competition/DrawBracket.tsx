'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Shuffle, Trophy, RotateCcw, X, Check, User, Star, Medal } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DRAW_KEY = 'sc_draw_v1'

// ─── Types ────────────────────────────────────────────────────────────────────

type TTeam = { id: string; team_name: string }

type DrawSlot = {
  position: number
  teamId: string
  teamName: string
  mentorName: string
}

type MatchResult = {
  winnerIdx: 0 | 1
  scoreA: string
  scoreB: string
}

type TournamentState = {
  phase: 'setup' | 'drawing' | 'bracket'
  mentors: string[]              // 16 mentor names
  slots: DrawSlot[]              // 16 slots after draw
  r16: (MatchResult | null)[]   // 8 R16 matches
  qf:  (MatchResult | null)[]   // 4 QF matches
  sf:  (MatchResult | null)[]   // 2 SF matches
  bestLoserSFIdx: number | null // which SF loser advances (0 or 1)
  final3ThirdIdx: number | null // which 3-team finalist gets 3rd (0, 1, or 2)
  gfWinnerIdx:   number | null  // which GF finalist wins (0 or 1)
}

function blankState(): TournamentState {
  return {
    phase: 'setup',
    mentors: Array(16).fill(''),
    slots: [],
    r16: Array(8).fill(null),
    qf:  Array(4).fill(null),
    sf:  Array(2).fill(null),
    bestLoserSFIdx: null,
    final3ThirdIdx: null,
    gfWinnerIdx:   null,
  }
}

type ModalState = {
  round: 'r16' | 'qf' | 'sf' | 'gf'
  matchIdx: number
  teamA: DrawSlot | null
  teamB: DrawSlot | null
  existing: MatchResult | null
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DrawBracket({
  toast,
}: {
  toast: (msg: string, type?: 'ok' | 'err') => void
}) {
  const [teams,        setTeams]        = useState<TTeam[]>([])
  const [ts,           setTs]           = useState<TournamentState>(blankState())
  const [revealCount,  setRevealCount]  = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [modal,        setModal]        = useState<ModalState | null>(null)
  const [mScoreA,      setMScoreA]      = useState('')
  const [mScoreB,      setMScoreB]      = useState('')
  const [mWinner,      setMWinner]      = useState<0 | 1 | null>(null)

  // ── Load teams & saved state ──────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('sc_teams')
        .select('id, team_name')
        .order('team_name')
      setTeams(data || [])
      try {
        const saved = localStorage.getItem(DRAW_KEY)
        if (saved) setTs(JSON.parse(saved))
      } catch {}
      setLoading(false)
    })()
  }, [])

  const persist = useCallback((next: TournamentState) => {
    setTs(next)
    localStorage.setItem(DRAW_KEY, JSON.stringify(next))
  }, [])

  // ── Mentor input ──────────────────────────────────────────────────────
  const setMentor = (i: number, val: string) => {
    const m = [...ts.mentors]
    m[i] = val
    persist({ ...ts, mentors: m })
  }

  // ── Run draw with animation ───────────────────────────────────────────
  const runDraw = () => {
    if (teams.length < 16) {
      toast(`Need 16 teams — currently ${teams.length} registered`, 'err')
      return
    }
    const shuffled = [...teams].sort(() => Math.random() - 0.5).slice(0, 16)
    const slots: DrawSlot[] = shuffled.map((t, i) => ({
      position: i + 1,
      teamId: t.id,
      teamName: t.team_name,
      mentorName: ts.mentors[i]?.trim() || `Mentor ${i + 1}`,
    }))
    const draft: TournamentState = { ...ts, phase: 'drawing', slots, r16: Array(8).fill(null), qf: Array(4).fill(null), sf: Array(2).fill(null), bestLoserSFIdx: null, final3ThirdIdx: null, gfWinnerIdx: null }
    persist(draft)
    setRevealCount(0)

    let count = 0
    const tick = () => {
      count++
      setRevealCount(count)
      if (count < 16) {
        setTimeout(tick, 380)
      } else {
        setTimeout(() => {
          const final: TournamentState = { ...draft, phase: 'bracket' }
          persist(final)
          setRevealCount(0)
        }, 900)
      }
    }
    setTimeout(tick, 300)
  }

  const resetDraw = () => {
    if (!confirm('Reset the entire tournament? All draw results will be cleared.')) return
    const next = blankState()
    next.mentors = ts.mentors  // preserve mentor names
    persist(next)
    setRevealCount(0)
  }

  // ── Bracket helper functions ──────────────────────────────────────────

  const slot = (i: number): DrawSlot | null => ts.slots[i] ?? null

  const r16Pair = (m: number): [DrawSlot | null, DrawSlot | null] =>
    [slot(m * 2), slot(m * 2 + 1)]

  const r16Winner = (m: number): DrawSlot | null => {
    const r = ts.r16[m]
    if (!r) return null
    const [a, b] = r16Pair(m)
    return r.winnerIdx === 0 ? a : b
  }

  const qfPair = (m: number): [DrawSlot | null, DrawSlot | null] =>
    [r16Winner(m * 2), r16Winner(m * 2 + 1)]

  const qfWinner = (m: number): DrawSlot | null => {
    const r = ts.qf[m]
    if (!r) return null
    const [a, b] = qfPair(m)
    return r.winnerIdx === 0 ? a : b
  }

  const sfPair = (m: number): [DrawSlot | null, DrawSlot | null] =>
    [qfWinner(m * 2), qfWinner(m * 2 + 1)]

  const sfWinner = (m: number): DrawSlot | null => {
    const r = ts.sf[m]
    if (!r) return null
    const [a, b] = sfPair(m)
    return r.winnerIdx === 0 ? a : b
  }

  const sfLoser = (m: number): DrawSlot | null => {
    const r = ts.sf[m]
    if (!r) return null
    const [a, b] = sfPair(m)
    return r.winnerIdx === 0 ? b : a
  }

  const final3Teams = (): (DrawSlot | null)[] => [
    sfWinner(0),
    sfWinner(1),
    ts.bestLoserSFIdx !== null ? sfLoser(ts.bestLoserSFIdx) : null,
  ]

  const gfPair = (): [DrawSlot | null, DrawSlot | null] => {
    if (ts.final3ThirdIdx === null) return [null, null]
    const f3 = final3Teams()
    const finalists = f3.filter((_, i) => i !== ts.final3ThirdIdx)
    return [finalists[0] ?? null, finalists[1] ?? null]
  }

  const champion = (): DrawSlot | null => {
    if (ts.gfWinnerIdx === null) return null
    const [a, b] = gfPair()
    return ts.gfWinnerIdx === 0 ? a : b
  }

  // ── Open result modal ─────────────────────────────────────────────────
  const openModal = (round: 'r16' | 'qf' | 'sf' | 'gf', matchIdx: number) => {
    let teamA: DrawSlot | null = null
    let teamB: DrawSlot | null = null
    let existing: MatchResult | null = null

    if (round === 'r16') {
      ;[teamA, teamB] = r16Pair(matchIdx)
      existing = ts.r16[matchIdx]
    } else if (round === 'qf') {
      ;[teamA, teamB] = qfPair(matchIdx)
      existing = ts.qf[matchIdx]
    } else if (round === 'sf') {
      ;[teamA, teamB] = sfPair(matchIdx)
      existing = ts.sf[matchIdx]
    } else {
      ;[teamA, teamB] = gfPair()
      existing = ts.gfWinnerIdx !== null
        ? { winnerIdx: ts.gfWinnerIdx as 0 | 1, scoreA: '', scoreB: '' }
        : null
    }

    if (!teamA || !teamB) {
      toast('Both teams must be determined first', 'err')
      return
    }

    setModal({ round, matchIdx, teamA, teamB, existing })
    setMScoreA(existing?.scoreA ?? '')
    setMScoreB(existing?.scoreB ?? '')
    setMWinner(existing?.winnerIdx ?? null)
  }

  // ── Save result ───────────────────────────────────────────────────────
  const saveResult = () => {
    if (mWinner === null || !modal) { toast('Select a winner', 'err'); return }
    const result: MatchResult = { winnerIdx: mWinner, scoreA: mScoreA, scoreB: mScoreB }
    const { round, matchIdx } = modal

    if (round === 'r16') {
      const r16 = ts.r16.map((r, i) => i === matchIdx ? result : r)
      // Determine which QF match is affected and reset downstream from there
      persist({ ...ts, r16, qf: Array(4).fill(null), sf: Array(2).fill(null), bestLoserSFIdx: null, final3ThirdIdx: null, gfWinnerIdx: null })
    } else if (round === 'qf') {
      const qf = ts.qf.map((r, i) => i === matchIdx ? result : r)
      persist({ ...ts, qf, sf: Array(2).fill(null), bestLoserSFIdx: null, final3ThirdIdx: null, gfWinnerIdx: null })
    } else if (round === 'sf') {
      const sf = ts.sf.map((r, i) => i === matchIdx ? result : r)
      persist({ ...ts, sf, bestLoserSFIdx: null, final3ThirdIdx: null, gfWinnerIdx: null })
    } else {
      persist({ ...ts, gfWinnerIdx: mWinner })
    }

    setModal(null)
    toast('Result saved!')
  }

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-2 border-[#f5a623] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            🎯 Tournament Draw & Bracket
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {ts.phase === 'setup'   && `${teams.length}/16 teams registered · Set mentor names, then run the draw`}
            {ts.phase === 'drawing' && 'Drawing teams to bracket positions…'}
            {ts.phase === 'bracket' && 'Click any match to enter results · Complete each round before the next'}
          </p>
        </div>
        <div className="flex gap-2">
          {ts.phase !== 'setup' && (
            <button
              onClick={resetDraw}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-sm hover:bg-red-500/20 transition-colors"
            >
              <RotateCcw size={14} /> Reset Draw
            </button>
          )}
          {ts.phase === 'setup' && (
            <button
              onClick={runDraw}
              disabled={teams.length < 16}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-lg hover:bg-[#e0941a] disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-colors"
            >
              <Shuffle size={16} /> Run Draw ({teams.length}/16 teams)
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* SETUP PHASE                                                        */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {ts.phase === 'setup' && (
        <div className="space-y-5">
          {/* Mentor name inputs */}
          <div className="bg-[#0a1628] border border-white/10 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <User size={16} className="text-[#f5a623]" />
              <h3 className="text-sm font-semibold text-[#f5a623]">Mentor Names</h3>
              <span className="text-xs text-slate-500">(optional — will be randomly assigned alongside teams)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: 16 }, (_, i) => (
                <div key={i}>
                  <label className="text-xs text-slate-500 block mb-1">Mentor {i + 1}</label>
                  <input
                    value={ts.mentors[i] || ''}
                    onChange={e => setMentor(i, e.target.value)}
                    placeholder={`Mentor ${i + 1}`}
                    className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623] placeholder-slate-600"
                  />
                </div>
              ))}
            </div>
          </div>

          {teams.length < 16 ? (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-sm text-yellow-300">
              ⚠ {16 - teams.length} more team{16 - teams.length !== 1 ? 's' : ''} needed before running the draw.
              Register them in the <strong>Teams</strong> tab.
            </div>
          ) : (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-sm text-green-300">
              ✓ All 16 teams registered. You can run the draw now.
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* DRAWING PHASE                                                      */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {ts.phase === 'drawing' && (
        <div>
          <div className="text-center mb-6">
            <p className="text-3xl font-black text-[#f5a623] tracking-wide animate-pulse">🎲 DRAWING…</p>
            <p className="text-slate-400 text-sm mt-2">{revealCount} of 16 teams placed</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 16 }, (_, i) => {
              const s = ts.slots[i]
              const revealed = i < revealCount
              const isActive = i === revealCount - 1
              return (
                <div
                  key={i}
                  className={`rounded-xl p-4 border transition-all duration-300 ${
                    isActive
                      ? 'bg-[#f5a623]/20 border-[#f5a623] shadow-lg shadow-[#f5a623]/30'
                      : revealed
                      ? 'bg-[#0a1628] border-white/20'
                      : 'bg-[#0a1628]/40 border-white/5'
                  }`}
                  style={{ transform: isActive ? 'scale(1.06)' : 'scale(1)', transition: 'all 0.3s ease' }}
                >
                  <div className="text-[10px] text-slate-500 mb-1 font-medium">
                    SLOT {i + 1} · MATCH {Math.floor(i / 2) + 1}
                    {i % 2 === 0 ? ' A' : ' B'}
                  </div>
                  {revealed && s ? (
                    <>
                      <p className={`font-bold text-sm leading-tight ${isActive ? 'text-[#f5a623]' : 'text-white'}`}>
                        {s.teamName}
                      </p>
                      {s.mentorName && (
                        <p className="text-xs text-slate-400 mt-1">🎓 {s.mentorName}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-slate-600 font-bold text-lg">?</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* BRACKET PHASE                                                      */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {ts.phase === 'bracket' && (
        <div>
          {/* Scrollable bracket */}
          <div className="overflow-x-auto pb-4">
            <div style={{ minWidth: 960 }}>

              {/* Round labels */}
              <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: '1fr 1fr 1fr 210px 200px' }}>
                {['Round of 16', 'Quarter Finals', 'Semi Finals', '3-Team Final', 'Grand Final'].map(label => (
                  <div key={label} className="text-center">
                    <span className="text-[11px] font-bold text-[#f5a623] uppercase tracking-widest">
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Bracket columns */}
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: '1fr 1fr 1fr 210px 200px', height: 720 }}
              >
                {/* ── R16: 8 matches ── */}
                <div className="flex flex-col justify-around gap-1">
                  {Array.from({ length: 8 }, (_, m) => {
                    const [a, b] = r16Pair(m)
                    return (
                      <MatchCard
                        key={m}
                        label={`M${m + 1}`}
                        teamA={a}
                        teamB={b}
                        result={ts.r16[m]}
                        onClick={() => openModal('r16', m)}
                        canClick={!!a && !!b}
                      />
                    )
                  })}
                </div>

                {/* ── QF: 4 matches ── */}
                <div className="flex flex-col justify-around gap-2">
                  {Array.from({ length: 4 }, (_, m) => {
                    const [a, b] = qfPair(m)
                    return (
                      <MatchCard
                        key={m}
                        label={`QF${m + 1}`}
                        teamA={a}
                        teamB={b}
                        result={ts.qf[m]}
                        onClick={() => openModal('qf', m)}
                        canClick={!!a && !!b}
                      />
                    )
                  })}
                </div>

                {/* ── SF: 2 matches ── */}
                <div className="flex flex-col justify-around gap-4">
                  {[0, 1].map(m => {
                    const [a, b] = sfPair(m)
                    return (
                      <MatchCard
                        key={m}
                        label={`SF${m + 1}`}
                        teamA={a}
                        teamB={b}
                        result={ts.sf[m]}
                        onClick={() => openModal('sf', m)}
                        canClick={!!a && !!b}
                      />
                    )
                  })}
                </div>

                {/* ── 3-Team Final ── */}
                <div className="flex items-center">
                  <div className="w-full bg-[#0a1628] border-2 border-purple-500/40 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-purple-400 text-center uppercase tracking-widest mb-3">
                      3-Team Final
                    </p>

                    {/* The 3 competing teams */}
                    <div className="space-y-2 mb-3">
                      {final3Teams().map((team, i) => {
                        const isThird = ts.final3ThirdIdx === i
                        const isFinalist = ts.final3ThirdIdx !== null && ts.final3ThirdIdx !== i
                        return (
                          <div
                            key={i}
                            className={`p-2 rounded-lg border text-xs transition-all ${
                              isThird
                                ? 'border-orange-500/40 bg-orange-500/10'
                                : isFinalist
                                ? 'border-[#f5a623]/40 bg-[#f5a623]/10'
                                : 'border-white/10 bg-[#0d1f3c]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0">
                                {i === 2 && (
                                  <span className="text-[9px] text-blue-400 font-bold block mb-0.5">
                                    ★ BEST LOSER
                                  </span>
                                )}
                                <p className={`font-semibold truncate ${
                                  team
                                    ? isThird ? 'text-orange-300' : isFinalist ? 'text-[#f5a623]' : 'text-white'
                                    : 'text-slate-600 italic'
                                }`}>
                                  {team ? team.teamName : (i === 2 ? 'Best Loser TBD' : 'TBD')}
                                </p>
                                {team?.mentorName && (
                                  <p className="text-[10px] text-slate-500 truncate">🎓 {team.mentorName}</p>
                                )}
                              </div>
                              <div className="shrink-0">
                                {isThird && <span className="text-orange-400 text-sm">🥉</span>}
                                {isFinalist && <span className="text-[#f5a623] text-sm">🏅</span>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Step 1: Choose best SF loser */}
                    {ts.sf[0] && ts.sf[1] && ts.bestLoserSFIdx === null && (
                      <div className="border-t border-white/10 pt-3">
                        <p className="text-[10px] text-slate-400 mb-2 text-center">
                          Select the best SF loser:
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {[0, 1].map(sfIdx => {
                            const loser = sfLoser(sfIdx)
                            return loser ? (
                              <button
                                key={sfIdx}
                                onClick={() => persist({ ...ts, bestLoserSFIdx: sfIdx })}
                                className="text-[11px] px-2 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-colors text-center font-medium"
                              >
                                ★ {loser.teamName}
                              </button>
                            ) : null
                          })}
                        </div>
                      </div>
                    )}

                    {/* Step 2: Choose 3rd place */}
                    {ts.bestLoserSFIdx !== null && ts.final3ThirdIdx === null && (
                      <div className="border-t border-white/10 pt-3">
                        <p className="text-[10px] text-slate-400 mb-2 text-center">
                          Who finishes 3rd?
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {final3Teams().map((team, i) => team ? (
                            <button
                              key={i}
                              onClick={() => persist({ ...ts, final3ThirdIdx: i })}
                              className="text-[11px] px-2 py-1.5 bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded-lg hover:bg-orange-500/30 transition-colors text-center font-medium"
                            >
                              🥉 {team.teamName}
                            </button>
                          ) : null)}
                        </div>
                      </div>
                    )}

                    {/* Change 3rd place button */}
                    {ts.final3ThirdIdx !== null && (
                      <button
                        onClick={() => persist({ ...ts, final3ThirdIdx: null, gfWinnerIdx: null })}
                        className="mt-2 w-full text-[10px] text-slate-600 hover:text-slate-400 py-1 transition-colors"
                      >
                        ↩ Change 3rd place
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Grand Final ── */}
                <div className="flex items-center">
                  {(() => {
                    const [a, b] = gfPair()
                    const champ = champion()
                    return (
                      <div className="w-full">
                        <div className="bg-[#0a1628] border-2 border-[#f5a623]/60 rounded-xl p-4 shadow-lg shadow-[#f5a623]/10">
                          <p className="text-[10px] font-bold text-[#f5a623] text-center uppercase tracking-widest mb-3 flex items-center justify-center gap-1">
                            <Trophy size={11} /> Grand Final
                          </p>
                          {champ ? (
                            <div className="text-center">
                              <div className="text-4xl mb-2">🏆</div>
                              <p className="font-black text-[#f5a623] text-base leading-tight">
                                {champ.teamName}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">
                                Champion
                              </p>
                              {champ.mentorName && (
                                <p className="text-[10px] text-slate-500 mt-1">
                                  🎓 {champ.mentorName}
                                </p>
                              )}
                              <button
                                onClick={() => { if (a && b) openModal('gf', 0) }}
                                className="mt-3 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                              >
                                ↩ Change result
                              </button>
                            </div>
                          ) : (
                            <MatchCard
                              label="Final"
                              teamA={a}
                              teamB={b}
                              result={null}
                              onClick={() => openModal('gf', 0)}
                              canClick={!!a && !!b}
                            />
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* ── Tournament Progress Summary ── */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'R16', done: ts.r16.filter(Boolean).length, total: 8, color: 'text-slate-300' },
              { label: 'QF',  done: ts.qf.filter(Boolean).length,  total: 4, color: 'text-blue-400' },
              { label: 'SF',  done: ts.sf.filter(Boolean).length,  total: 2, color: 'text-purple-400' },
              { label: '3-Team', done: ts.final3ThirdIdx !== null ? 1 : 0, total: 1, color: 'text-orange-400' },
              { label: 'GF',  done: ts.gfWinnerIdx !== null ? 1 : 0, total: 1, color: 'text-[#f5a623]' },
            ].map(({ label, done, total, color }) => (
              <div key={label} className="bg-[#0a1628] border border-white/10 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
                <p className={`text-2xl font-black mt-1 ${color}`}>{done}/{total}</p>
                <div className="w-full bg-white/10 rounded-full h-1 mt-2">
                  <div
                    className={`h-1 rounded-full transition-all duration-500 ${done === total ? 'bg-[#f5a623]' : 'bg-white/40'}`}
                    style={{ width: `${(done / total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* ── Draw Slots Reference ── */}
          <div className="mt-6 bg-[#0a1628] border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#f5a623] mb-4">Draw Results — All 16 Slots</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ts.slots.map((s, i) => {
                const mIdx = Math.floor(i / 2)
                const posInMatch = i % 2
                const r = ts.r16[mIdx]
                const isWinner = r && r.winnerIdx === posInMatch
                const isLoser  = r && r.winnerIdx !== posInMatch
                return (
                  <div
                    key={i}
                    className={`p-2.5 rounded-lg border text-xs ${
                      isWinner
                        ? 'bg-[#f5a623]/10 border-[#f5a623]/30'
                        : isLoser
                        ? 'bg-white/3 border-white/5 opacity-40'
                        : 'bg-[#0d1f3c] border-white/10'
                    }`}
                  >
                    <div className="text-slate-600 mb-0.5 font-mono">
                      #{i + 1} · M{mIdx + 1}{posInMatch === 0 ? 'A' : 'B'}
                    </div>
                    <div className="font-semibold text-white truncate">{s.teamName}</div>
                    {s.mentorName && (
                      <div className="text-slate-400 truncate mt-0.5">🎓 {s.mentorName}</div>
                    )}
                    {isWinner && (
                      <div className="text-[#f5a623] text-[10px] font-bold mt-0.5">✓ Advanced</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* RESULT MODAL                                                        */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {modal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-white text-lg">Enter Match Result</h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              {([modal.teamA, modal.teamB] as const).map((team, i) => (
                <button
                  key={i}
                  onClick={() => setMWinner(i as 0 | 1)}
                  className={`w-full p-3.5 rounded-xl border-2 text-left transition-all ${
                    mWinner === i
                      ? 'border-[#f5a623] bg-[#f5a623]/10'
                      : 'border-white/10 bg-[#0d1f3c] hover:border-white/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white text-sm">{team?.teamName ?? '—'}</p>
                      {team?.mentorName && (
                        <p className="text-xs text-slate-400 mt-0.5">🎓 {team.mentorName}</p>
                      )}
                    </div>
                    {mWinner === i && (
                      <span className="text-xs font-bold text-[#f5a623] flex items-center gap-1 shrink-0">
                        <Check size={12} /> WINNER
                      </span>
                    )}
                  </div>
                  <input
                    placeholder="Score (e.g. 15)"
                    value={i === 0 ? mScoreA : mScoreB}
                    onChange={e => i === 0 ? setMScoreA(e.target.value) : setMScoreB(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    className="mt-2 w-full bg-[#0a1628] border border-white/20 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f5a623] placeholder-slate-600"
                  />
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={saveResult}
                disabled={mWinner === null}
                className="flex-1 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-colors hover:bg-[#e0941a]"
              >
                Save Result
              </button>
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2.5 bg-white/10 rounded-lg text-sm hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MatchCard ────────────────────────────────────────────────────────────────

function MatchCard({
  label,
  teamA,
  teamB,
  result,
  onClick,
  canClick,
}: {
  label: string
  teamA: DrawSlot | null
  teamB: DrawSlot | null
  result: MatchResult | null
  onClick: () => void
  canClick: boolean
}) {
  const winA = result?.winnerIdx === 0
  const winB = result?.winnerIdx === 1

  return (
    <button
      onClick={canClick ? onClick : undefined}
      disabled={!canClick}
      title={canClick ? 'Click to enter result' : undefined}
      className={`w-full text-left rounded-xl border p-2 transition-all ${
        result
          ? 'border-[#f5a623]/30 bg-[#f5a623]/5 hover:bg-[#f5a623]/10 cursor-pointer'
          : canClick
          ? 'border-white/15 bg-[#0a1628] hover:border-[#f5a623]/40 hover:bg-[#f5a623]/5 cursor-pointer'
          : 'border-white/5 bg-[#0a1628]/50 cursor-default'
      }`}
    >
      <p className="text-[9px] text-slate-600 mb-1 font-mono font-bold tracking-wider">{label}</p>

      <TeamLine team={teamA} isWinner={winA} isLoser={winB} score={result?.scoreA} />
      <div className="h-px bg-white/5 my-0.5" />
      <TeamLine team={teamB} isWinner={winB} isLoser={winA} score={result?.scoreB} />

      {canClick && !result && (
        <p className="text-[9px] text-slate-700 text-center mt-1">tap to enter result</p>
      )}
      {!canClick && !result && (
        <p className="text-[9px] text-slate-700 text-center mt-1">awaiting…</p>
      )}
    </button>
  )
}

function TeamLine({
  team,
  isWinner,
  isLoser,
  score,
}: {
  team: DrawSlot | null
  isWinner: boolean
  isLoser: boolean
  score?: string
}) {
  return (
    <div className={`flex items-center justify-between rounded px-1 py-0.5 ${isWinner ? 'bg-[#f5a623]/15' : ''}`}>
      <p className={`text-[11px] font-semibold truncate max-w-[90px] ${
        isWinner ? 'text-[#f5a623]'
        : isLoser ? 'text-slate-600 line-through'
        : team ? 'text-slate-200'
        : 'text-slate-700 italic'
      }`}>
        {team?.teamName ?? '—'}
      </p>
      <div className="flex items-center gap-1 shrink-0 ml-1">
        {score && <span className="text-[10px] text-slate-400">{score}</span>}
        {isWinner && <Trophy size={9} className="text-[#f5a623]" />}
      </div>
    </div>
  )
}
