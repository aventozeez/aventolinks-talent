'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Shuffle, Trophy, RotateCcw, X, Check, Users, Monitor } from 'lucide-react'
import { useRouter } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const DRAW_KEY   = 'sc_draw_v1'
export const REVEAL_KEY = 'sc_draw_reveal_v1'

// ─── Types ────────────────────────────────────────────────────────────────────

type TTeam = { id: string; team_name: string }

export type DrawSlot = {
  position: number
  teamId: string
  teamName: string
  mentorName: string
}

export type MatchResult = {
  winnerIdx: 0 | 1
  scoreA: string
  scoreB: string
}

export type TournamentState = {
  phase: 'setup' | 'drawing' | 'bracket'
  mentors: string[]
  slots: DrawSlot[]
  r16: (MatchResult | null)[]
  qf:  (MatchResult | null)[]
  sf:  (MatchResult | null)[]
  bestLoserSFIdx: number | null
  final3ThirdIdx: number | null
  gfWinnerIdx:   number | null
}

// ── 8 distinct match colours (same palette as live-draw display) ──────────────
const MATCH_COLORS = [
  { solid: '#ef4444', bg: 'rgba(239,68,68,0.13)',   border: 'rgba(239,68,68,0.45)',   glow: 'rgba(239,68,68,0.35)'   },
  { solid: '#f97316', bg: 'rgba(249,115,22,0.13)',  border: 'rgba(249,115,22,0.45)',  glow: 'rgba(249,115,22,0.35)'  },
  { solid: '#eab308', bg: 'rgba(234,179,8,0.13)',   border: 'rgba(234,179,8,0.45)',   glow: 'rgba(234,179,8,0.35)'   },
  { solid: '#22c55e', bg: 'rgba(34,197,94,0.13)',   border: 'rgba(34,197,94,0.45)',   glow: 'rgba(34,197,94,0.35)'   },
  { solid: '#14b8a6', bg: 'rgba(20,184,166,0.13)',  border: 'rgba(20,184,166,0.45)',  glow: 'rgba(20,184,166,0.35)'  },
  { solid: '#3b82f6', bg: 'rgba(59,130,246,0.13)',  border: 'rgba(59,130,246,0.45)',  glow: 'rgba(59,130,246,0.35)'  },
  { solid: '#a855f7', bg: 'rgba(168,85,247,0.13)',  border: 'rgba(168,85,247,0.45)',  glow: 'rgba(168,85,247,0.35)'  },
  { solid: '#ec4899', bg: 'rgba(236,72,153,0.13)',  border: 'rgba(236,72,153,0.45)',  glow: 'rgba(236,72,153,0.35)'  },
]

export function blankState(): TournamentState {
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
  const router = useRouter()
  const [teams,       setTeams]       = useState<TTeam[]>([])
  const [ts,          setTs]          = useState<TournamentState>(blankState())
  const [revealCount, setRevealCount] = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState<ModalState | null>(null)
  const [mScoreA,     setMScoreA]     = useState('')
  const [mScoreB,     setMScoreB]     = useState('')
  const [mWinner,     setMWinner]     = useState<0 | 1 | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('sc_teams').select('id, team_name').order('team_name')
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

  // ── Draw animation ────────────────────────────────────────────────────
  const runDraw = () => {
    if (teams.length < 16) { toast(`Need 16 teams — currently ${teams.length}`, 'err'); return }
    const shuffled = [...teams].sort(() => Math.random() - 0.5).slice(0, 16)
    const slots: DrawSlot[] = shuffled.map((t, i) => ({
      position: i + 1, teamId: t.id, teamName: t.team_name,
      mentorName: '', // assigned separately on the Unveil Mentors page
    }))
    const draft: TournamentState = { ...ts, phase: 'drawing', slots, r16: Array(8).fill(null), qf: Array(4).fill(null), sf: Array(2).fill(null), bestLoserSFIdx: null, final3ThirdIdx: null, gfWinnerIdx: null }
    persist(draft)
    setRevealCount(0)
    localStorage.setItem(REVEAL_KEY, '0')
    let count = 0
    const tick = () => {
      count++
      setRevealCount(count)
      localStorage.setItem(REVEAL_KEY, String(count))
      if (count < 16) setTimeout(tick, 380)
      else setTimeout(() => {
        persist({ ...draft, phase: 'bracket' })
        setRevealCount(0)
        localStorage.removeItem(REVEAL_KEY)
      }, 900)
    }
    setTimeout(tick, 300)
  }

  const resetDraw = () => {
    if (!confirm('Reset the entire tournament? All results will be cleared.')) return
    const next = blankState(); next.mentors = ts.mentors
    persist(next); setRevealCount(0)
    localStorage.removeItem(REVEAL_KEY)
  }

  const openLiveDisplay = () => {
    window.open('/dashboard/staff/competition/live-draw', '_blank', 'noopener')
  }

  // ── Bracket helpers ───────────────────────────────────────────────────
  const sl   = (i: number) => ts.slots[i] ?? null
  const r16p = (m: number): [DrawSlot | null, DrawSlot | null] => [sl(m*2), sl(m*2+1)]
  const r16w = (m: number): DrawSlot | null => { const r=ts.r16[m]; if(!r) return null; const [a,b]=r16p(m); return r.winnerIdx===0?a:b }
  const qfp  = (m: number): [DrawSlot | null, DrawSlot | null] => [r16w(m*2), r16w(m*2+1)]
  const qfw  = (m: number): DrawSlot | null => { const r=ts.qf[m];  if(!r) return null; const [a,b]=qfp(m);  return r.winnerIdx===0?a:b }
  const sfp  = (m: number): [DrawSlot | null, DrawSlot | null] => [qfw(m*2), qfw(m*2+1)]
  const sfw  = (m: number): DrawSlot | null => { const r=ts.sf[m];  if(!r) return null; const [a,b]=sfp(m);  return r.winnerIdx===0?a:b }
  const sfl  = (m: number): DrawSlot | null => { const r=ts.sf[m];  if(!r) return null; const [a,b]=sfp(m);  return r.winnerIdx===0?b:a }

  const f3 = (): (DrawSlot | null)[] => [sfw(0), sfw(1), ts.bestLoserSFIdx !== null ? sfl(ts.bestLoserSFIdx) : null]

  const gfPair = (): [DrawSlot | null, DrawSlot | null] => {
    if (ts.final3ThirdIdx === null) return [null, null]
    const teams3 = f3(); const finalists = teams3.filter((_, i) => i !== ts.final3ThirdIdx)
    return [finalists[0] ?? null, finalists[1] ?? null]
  }

  const champion = (): DrawSlot | null => {
    if (ts.gfWinnerIdx === null) return null
    const [a, b] = gfPair(); return ts.gfWinnerIdx === 0 ? a : b
  }

  // ── Result modal ──────────────────────────────────────────────────────
  const openModal = (round: 'r16'|'qf'|'sf'|'gf', matchIdx: number) => {
    let teamA: DrawSlot|null=null, teamB: DrawSlot|null=null, existing: MatchResult|null=null
    if      (round==='r16') { [teamA,teamB]=r16p(matchIdx); existing=ts.r16[matchIdx] }
    else if (round==='qf')  { [teamA,teamB]=qfp(matchIdx);  existing=ts.qf[matchIdx]  }
    else if (round==='sf')  { [teamA,teamB]=sfp(matchIdx);  existing=ts.sf[matchIdx]  }
    else                    { [teamA,teamB]=gfPair(); existing=ts.gfWinnerIdx!==null?{winnerIdx:ts.gfWinnerIdx as 0|1,scoreA:'',scoreB:''}:null }
    if (!teamA||!teamB) { toast('Teams not yet determined','err'); return }
    setModal({round,matchIdx,teamA,teamB,existing})
    setMScoreA(existing?.scoreA??''); setMScoreB(existing?.scoreB??''); setMWinner(existing?.winnerIdx??null)
  }

  const saveResult = () => {
    if (mWinner===null||!modal) { toast('Select a winner','err'); return }
    const result: MatchResult = { winnerIdx: mWinner, scoreA: mScoreA, scoreB: mScoreB }
    const {round,matchIdx} = modal
    if      (round==='r16') persist({...ts, r16:ts.r16.map((r,i)=>i===matchIdx?result:r), qf:Array(4).fill(null), sf:Array(2).fill(null), bestLoserSFIdx:null, final3ThirdIdx:null, gfWinnerIdx:null})
    else if (round==='qf')  persist({...ts, qf:ts.qf.map((r,i)=>i===matchIdx?result:r),  sf:Array(2).fill(null), bestLoserSFIdx:null, final3ThirdIdx:null, gfWinnerIdx:null})
    else if (round==='sf')  persist({...ts, sf:ts.sf.map((r,i)=>i===matchIdx?result:r),  bestLoserSFIdx:null, final3ThirdIdx:null, gfWinnerIdx:null})
    else                    persist({...ts, gfWinnerIdx:mWinner})
    setModal(null); toast('Result saved!')
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-7 h-7 border-2 border-[#f5a623] border-t-transparent rounded-full animate-spin" /></div>

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 220px)', minHeight: 560 }}>

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white">🎯 Tournament Draw & Bracket</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {ts.phase==='setup'   && `${teams.length}/16 teams registered · Click Run Draw to assign teams to bracket positions`}
            {ts.phase==='drawing' && 'Drawing teams to bracket positions…'}
            {ts.phase==='bracket' && 'Click any match to enter result'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Live display — always available */}
          <button
            onClick={openLiveDisplay}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-lg text-sm hover:bg-blue-600/30 transition-colors font-semibold"
          >
            <Monitor size={14} /> Open Live Display
          </button>

          {ts.phase==='bracket' && (
            <button
              onClick={() => router.push('/dashboard/staff/competition/mentors')}
              className="flex items-center gap-2 px-4 py-2 bg-[#f5a623] text-[#0a1628] font-bold rounded-lg hover:bg-[#e0941a] text-sm transition-colors"
            >
              <Users size={14} /> Unveil our Mentors
            </button>
          )}
          {ts.phase!=='setup' && (
            <button onClick={resetDraw} className="flex items-center gap-2 px-3 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-sm hover:bg-red-500/20 transition-colors">
              <RotateCcw size={13} /> Reset
            </button>
          )}
          {ts.phase==='setup' && (
            <button onClick={runDraw} disabled={teams.length<16} className="flex items-center gap-2 px-4 py-2 bg-[#f5a623] text-[#0a1628] font-bold rounded-lg hover:bg-[#e0941a] disabled:opacity-40 text-sm">
              <Shuffle size={14} /> Run Draw ({teams.length}/16)
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════ SETUP ══════════════════ */}
      {ts.phase==='setup' && (
        <div className="overflow-y-auto flex-1">
          <div className="bg-[#0a1628] border border-white/10 rounded-xl p-4 mb-4">
            <p className="text-xs font-semibold text-[#f5a623] mb-3 flex items-center gap-2">
              <Users size={13}/> Registered Teams
              <span className="text-slate-500 font-normal">({teams.length}/16)</span>
            </p>
            {teams.length === 0 ? (
              <p className="text-xs text-slate-500">No teams registered yet. Go to the Teams tab to add them.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {teams.slice(0, 16).map((team, i) => (
                  <div key={team.id} className="bg-[#0d1f3c] border border-white/10 rounded-lg px-3 py-2.5 flex items-center gap-2">
                    <span className="text-[10px] text-slate-600 font-mono shrink-0">#{i+1}</span>
                    <span className="text-sm text-white font-semibold truncate">{team.team_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {teams.length < 16
            ? <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-xs text-yellow-300">⚠ {16-teams.length} more team{16-teams.length!==1?'s':''} needed. Register them in the Teams tab.</div>
            : <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-xs text-green-300">✓ All 16 teams ready. Click <strong>Run Draw</strong> to randomly assign them to bracket positions.</div>
          }
        </div>
      )}

      {/* ══════════════════ DRAWING ══════════════════ */}
      {ts.phase==='drawing' && (
        <div className="flex-1 overflow-y-auto">
          <div className="text-center mb-4">
            <p className="text-2xl font-black text-[#f5a623] animate-pulse">🎲 DRAWING…</p>
            <p className="text-slate-400 text-xs mt-1">{revealCount} of 16 placed</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from({length:16},(_,i)=>{
              const s=ts.slots[i]; const revealed=i<revealCount; const isActive=i===revealCount-1
              const dmc = MATCH_COLORS[Math.floor(i/2)]
              return (
                <div key={i} className="rounded-xl p-3 border transition-all duration-300"
                  style={{
                    transform: isActive ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 0.3s ease',
                    background: isActive ? dmc.bg : revealed ? 'rgba(10,22,40,0.9)' : 'rgba(10,22,40,0.4)',
                    borderColor: isActive ? dmc.solid : revealed ? dmc.border : 'rgba(255,255,255,0.05)',
                    boxShadow: isActive ? `0 0 20px ${dmc.glow}` : revealed ? `0 0 4px ${dmc.glow}` : 'none',
                  }}>
                  <div className="text-[10px] font-bold mb-0.5" style={{ color: dmc.solid }}>
                    #{i+1} · M{Math.floor(i/2)+1}{i%2===0?'A':'B'}
                  </div>
                  {revealed&&s ? (
                    <p className="font-bold text-sm leading-tight text-white">{s.teamName}</p>
                  ) : <p className="text-lg font-black" style={{ color: dmc.border }}>?</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════════ BRACKET ══════════════════ */}
      {ts.phase==='bracket' && (
        <div className="flex-1 min-h-0">
          {/* Column labels */}
          <div className="grid gap-1.5 mb-1.5 shrink-0" style={{gridTemplateColumns:'1fr 1fr 1fr 175px 170px'}}>
            {['Round of 16','Quarter Finals','Semi Finals','3-Team Final','Grand Final'].map(l=>(
              <div key={l} className="text-center"><span className="text-[10px] font-bold text-[#f5a623] uppercase tracking-widest">{l}</span></div>
            ))}
          </div>

          {/* The bracket grid — all columns share the same height so rows align */}
          <div className="grid gap-1.5 h-full" style={{gridTemplateColumns:'1fr 1fr 1fr 175px 170px'}}>

            {/* R16 — 8 equal rows */}
            <div className="grid gap-1" style={{gridTemplateRows:'repeat(8,1fr)'}}>
              {Array.from({length:8},(_,m)=>{
                const [a,b]=r16p(m)
                return <MCard key={m} label={`M${m+1}`} teamA={a} teamB={b} result={ts.r16[m]} onClick={()=>openModal('r16',m)} canClick={!!a&&!!b} colorIdx={m}/>
              })}
            </div>

            {/* QF — 4 equal rows */}
            <div className="grid gap-1" style={{gridTemplateRows:'repeat(4,1fr)'}}>
              {Array.from({length:4},(_,m)=>{
                const [a,b]=qfp(m)
                return <MCard key={m} label={`QF${m+1}`} teamA={a} teamB={b} result={ts.qf[m]} onClick={()=>openModal('qf',m)} canClick={!!a&&!!b}/>
              })}
            </div>

            {/* SF — 2 equal rows */}
            <div className="grid gap-1" style={{gridTemplateRows:'repeat(2,1fr)'}}>
              {[0,1].map(m=>{
                const [a,b]=sfp(m)
                return <MCard key={m} label={`SF${m+1}`} teamA={a} teamB={b} result={ts.sf[m]} onClick={()=>openModal('sf',m)} canClick={!!a&&!!b}/>
              })}
            </div>

            {/* 3-Team Final */}
            <div className="flex items-center">
              <div className="w-full bg-[#0a1628] border-2 border-purple-500/40 rounded-xl p-3 flex flex-col gap-2">
                <p className="text-[9px] font-bold text-purple-400 text-center uppercase tracking-widest">3-Team Final</p>

                {f3().map((team,i)=>{
                  const isThird=ts.final3ThirdIdx===i
                  const isFinalist=ts.final3ThirdIdx!==null&&ts.final3ThirdIdx!==i
                  return (
                    <div key={i} className={`p-2 rounded-lg border text-[11px] ${isThird?'border-orange-500/40 bg-orange-500/10':isFinalist?'border-[#f5a623]/40 bg-[#f5a623]/10':'border-white/10 bg-[#0d1f3c]'}`}>
                      {i===2&&<span className="text-[9px] text-blue-400 font-bold block">★ BEST LOSER</span>}
                      <div className="flex items-center justify-between">
                        <p className={`font-semibold truncate ${team?isThird?'text-orange-300':isFinalist?'text-[#f5a623]':'text-white':'text-slate-600 italic'}`}>
                          {team?team.teamName:i===2?'TBD':'TBD'}
                        </p>
                        {isThird&&<span className="text-xs">🥉</span>}
                        {isFinalist&&<span className="text-xs">🏅</span>}
                      </div>
                    </div>
                  )
                })}

                {/* Best loser picker */}
                {ts.sf[0]&&ts.sf[1]&&ts.bestLoserSFIdx===null&&(
                  <div className="border-t border-white/10 pt-2">
                    <p className="text-[9px] text-slate-400 mb-1.5 text-center">Pick best SF loser:</p>
                    <div className="flex flex-col gap-1">
                      {[0,1].map(si=>{const l=sfl(si);return l?(<button key={si} onClick={()=>persist({...ts,bestLoserSFIdx:si})} className="text-[10px] px-2 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 truncate">{l.teamName}</button>):null})}
                    </div>
                  </div>
                )}

                {/* 3rd place picker */}
                {ts.bestLoserSFIdx!==null&&ts.final3ThirdIdx===null&&(
                  <div className="border-t border-white/10 pt-2">
                    <p className="text-[9px] text-slate-400 mb-1.5 text-center">Who finishes 3rd?</p>
                    <div className="flex flex-col gap-1">
                      {f3().map((team,i)=>team?(<button key={i} onClick={()=>persist({...ts,final3ThirdIdx:i})} className="text-[10px] px-2 py-1 bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded-lg hover:bg-orange-500/30 truncate">🥉 {team.teamName}</button>):null)}
                    </div>
                  </div>
                )}

                {ts.final3ThirdIdx!==null&&(
                  <button onClick={()=>persist({...ts,final3ThirdIdx:null,gfWinnerIdx:null})} className="text-[9px] text-slate-600 hover:text-slate-400 text-center py-0.5">↩ Change 3rd</button>
                )}
              </div>
            </div>

            {/* Grand Final */}
            <div className="flex items-center">
              {(()=>{
                const [a,b]=gfPair(); const champ=champion()
                return (
                  <div className="w-full bg-[#0a1628] border-2 border-[#f5a623]/60 rounded-xl p-3 shadow-lg shadow-[#f5a623]/10">
                    <p className="text-[9px] font-bold text-[#f5a623] text-center uppercase tracking-widest mb-2 flex items-center justify-center gap-1">
                      <Trophy size={10}/> Grand Final
                    </p>
                    {champ ? (
                      <div className="text-center">
                        <div className="text-3xl mb-1">🏆</div>
                        <p className="font-black text-[#f5a623] text-sm leading-tight">{champ.teamName}</p>
                        <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5">Champion</p>
                        {/* mentor name intentionally hidden until Unveil Mentors */}
                        <button onClick={()=>{if(a&&b)openModal('gf',0)}} className="mt-1.5 text-[9px] text-slate-600 hover:text-slate-400">↩ Change</button>
                      </div>
                    ) : (
                      <MCard label="Final" teamA={a} teamB={b} result={null} onClick={()=>openModal('gf',0)} canClick={!!a&&!!b}/>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ RESULT MODAL ══════════════════ */}
      {modal&&(
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Match Result</h3>
              <button onClick={()=>setModal(null)} className="text-slate-400 hover:text-white"><X size={18}/></button>
            </div>
            <div className="space-y-2.5 mb-4">
              {([modal.teamA,modal.teamB] as const).map((team,i)=>(
                <button key={i} onClick={()=>setMWinner(i as 0|1)}
                  className={`w-full p-3 rounded-xl border-2 text-left transition-all ${mWinner===i?'border-[#f5a623] bg-[#f5a623]/10':'border-white/10 bg-[#0d1f3c] hover:border-white/30'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white text-sm">{team?.teamName??'—'}</p>
                      {team?.mentorName&&<p className="text-xs text-slate-400">🎓 {team.mentorName}</p>}
                    </div>
                    {mWinner===i&&<span className="text-xs font-bold text-[#f5a623] flex items-center gap-1"><Check size={11}/> WIN</span>}
                  </div>
                  <input placeholder="Score (optional)" value={i===0?mScoreA:mScoreB}
                    onChange={e=>i===0?setMScoreA(e.target.value):setMScoreB(e.target.value)}
                    onClick={e=>e.stopPropagation()}
                    className="mt-2 w-full bg-[#0a1628] border border-white/20 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#f5a623] placeholder-slate-600"/>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={saveResult} disabled={mWinner===null} className="flex-1 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-lg disabled:opacity-40 text-sm hover:bg-[#e0941a]">Save Result</button>
              <button onClick={()=>setModal(null)} className="px-4 py-2.5 bg-white/10 rounded-lg text-sm hover:bg-white/20">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Compact Match Card ───────────────────────────────────────────────────────

function MCard({ label, teamA, teamB, result, onClick, canClick, colorIdx }: {
  label: string; teamA: DrawSlot|null; teamB: DrawSlot|null
  result: MatchResult|null; onClick: ()=>void; canClick: boolean
  colorIdx?: number
}) {
  const mc = colorIdx !== undefined ? MATCH_COLORS[colorIdx] : null
  const winA=result?.winnerIdx===0, winB=result?.winnerIdx===1
  return (
    <button onClick={canClick?onClick:undefined} disabled={!canClick}
      style={mc ? {
        borderColor: mc.border,
        background: result ? mc.bg : 'rgba(10,22,40,0.85)',
        boxShadow: `0 0 6px ${mc.glow}`,
      } : {}}
      className={`w-full h-full text-left rounded-lg border px-2 py-1.5 flex flex-col justify-center transition-all ${
        mc ? (canClick ? 'cursor-pointer hover:brightness-110' : 'cursor-default')
        : result?'border-[#f5a623]/30 bg-[#f5a623]/5 hover:bg-[#f5a623]/10 cursor-pointer'
        : canClick?'border-white/15 bg-[#0a1628] hover:border-[#f5a623]/40 cursor-pointer'
        :'border-white/5 bg-[#0a1628]/50 cursor-default'}`}>
      <p className="text-[8px] font-mono font-bold mb-1" style={{ color: mc ? mc.solid : 'rgb(71,85,105)' }}>{label}</p>
      <TRow team={teamA} isWinner={winA} isLoser={winB} score={result?.scoreA}/>
      <div className="h-px my-0.5" style={{ background: mc ? mc.border : 'rgba(255,255,255,0.05)' }}/>
      <TRow team={teamB} isWinner={winB} isLoser={winA} score={result?.scoreB}/>
    </button>
  )
}

function TRow({ team, isWinner, isLoser, score }: { team: DrawSlot|null; isWinner: boolean; isLoser: boolean; score?: string }) {
  return (
    <div className={`flex items-center justify-between px-0.5 rounded-sm ${isWinner?'bg-[#f5a623]/15':''}`}>
      <p className={`text-[11px] font-semibold truncate max-w-[85px] ${isWinner?'text-[#f5a623]':isLoser?'text-slate-600 line-through':team?'text-slate-200':'text-slate-700 italic'}`}>
        {team?.teamName??'—'}
      </p>
      <div className="flex items-center gap-0.5 shrink-0 ml-0.5">
        {score&&<span className="text-[9px] text-slate-500">{score}</span>}
        {isWinner&&<Trophy size={8} className="text-[#f5a623]"/>}
      </div>
    </div>
  )
}
