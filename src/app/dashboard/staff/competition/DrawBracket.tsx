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

  // ── Draw animation (uses predetermined seeded bracket) ───────────────
  const runDraw = () => {
    if (teams.length < 16) { toast(`Need 16 teams — currently ${teams.length}`, 'err'); return }
    const slots: DrawSlot[] = [
      // M1 — Seed 1 vs Seed 16
      { position:  1, teamId: 'd458897d-8bb0-4091-8999-ff48428727e1', teamName: 'Ibadan Grammar School',                          mentorName: '' },
      { position:  2, teamId: 'e557bec3-9c7f-4e2e-839d-a337b1357c49', teamName: 'His Marvelous Model College',                    mentorName: '' },
      // M2 — Seed 8 vs Seed 9
      { position:  3, teamId: 'a7045429-287b-49bc-9ebb-f7c81e2d338a', teamName: 'Sharon Rose Schools and College',                mentorName: '' },
      { position:  4, teamId: '6a6ab42b-61ff-499c-803a-9fc2f56016ea', teamName: 'Olivet Baptist Academy',                         mentorName: '' },
      // M3 — Seed 4 vs Seed 13
      { position:  5, teamId: 'ae55e8be-c7a9-4430-841f-f998a9650d81', teamName: 'Greater Love Model College',                     mentorName: '' },
      { position:  6, teamId: 'bb0f6936-d959-4bee-85e2-6848ff250681', teamName: 'The Smart School',                               mentorName: '' },
      // M4 — Seed 5 vs Seed 12
      { position:  7, teamId: '06e2acce-cd12-4e2b-82a1-aa50fc2f4c75', teamName: 'Maceland Academy',                               mentorName: '' },
      { position:  8, teamId: '26023fc8-939f-4be5-84ed-7df5a1ff5ef8', teamName: 'Learning Cloud Academy',                         mentorName: '' },
      // M5 — Seed 3 vs Seed 14
      { position:  9, teamId: 'b52d7694-2a51-4664-b153-13ad780fcfd7', teamName: 'The International School, University of Ibadan', mentorName: '' },
      { position: 10, teamId: '8de17b6b-ec26-4836-bdd4-08ad35c675d7', teamName: 'Aseda Private School of Science',               mentorName: '' },
      // M6 — Seed 6 vs Seed 11
      { position: 11, teamId: '333f7a6e-4903-44cb-b3dd-47713403e759', teamName: 'Ibadan Grammar School 2 - Molete',               mentorName: '' },
      { position: 12, teamId: '127985b7-26e3-4ec4-8bc6-cb698aea2106', teamName: 'Besley Schools',                                 mentorName: '' },
      // M7 — Seed 7 vs Seed 10
      { position: 13, teamId: '711ef929-84e1-429a-b2e9-c5c9404c4d30', teamName: 'Olivet Baptist High School',                    mentorName: '' },
      { position: 14, teamId: 'e80a4674-f410-42a9-a0fa-df3c696813a1', teamName: 'Community High School',                          mentorName: '' },
      // M8 — Seed 2 vs Seed 15
      { position: 15, teamId: '76ea1985-f7ab-49a2-abcb-aee5790a3021', teamName: 'Front Model College',                            mentorName: '' },
      { position: 16, teamId: '9fc76a97-7bbd-4cdf-840d-d81d64a82e5b', teamName: 'Ibadan Boys High School',                        mentorName: '' },
    ]
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
    persist(next)
    setRevealCount(0)
    localStorage.removeItem(REVEAL_KEY)
    localStorage.removeItem('sc_mentor_assignments_v1')
    localStorage.removeItem('sc_mentors_reveal_v1')
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
    <div className="flex flex-col" style={{ height: 'calc(100vh - 160px)', minHeight: 520 }}>

      {/* ── Compact action bar (no title) ── */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2 shrink-0">
        <p className="text-[11px] text-slate-500">
          {ts.phase==='setup'   && `${teams.length}/16 teams · Run Draw to assign bracket positions`}
          {ts.phase==='drawing' && '🎲 Drawing teams to bracket positions…'}
          {ts.phase==='bracket' && 'Click any match to enter result'}
        </p>
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
            : <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-xs text-green-300">✓ All 16 teams ready. Click <strong>Run Draw</strong> to assign teams to bracket positions.</div>
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
      {ts.phase==='bracket' && (()=>{
        // ── Layout constants ──────────────────────────────────────────────────
        const STP=68, CH=56, BH=8*STP  // step=68, card-height=56, total=544
        const R16W=175
        const QFL=R16W+22,  QFW=155
        const SFL=QFL+QFW+22, SFW=145
        const TFL=SFL+SFW+22, TFW=200
        const GFL=TFL+TFW+18, GFW=178
        const TW=GFL+GFW  // total canvas width ≈ 961

        // vertical centre of each card by column
        const r16Y=(m:number)=>m*STP+STP/2
        const qfY =(m:number)=>(2*m+1)*STP
        const sfY =(m:number)=>(4*m+2)*STP
        const tf3Y=(sfY(0)+sfY(1))/2  // 304

        return (
          <div className="flex-1 min-h-0 overflow-auto pb-2">

            {/* Column labels — absolutely aligned to card columns */}
            <div className="relative mb-2 shrink-0" style={{height:18, minWidth:TW}}>
              {([
                {txt:'Round of 16',  cx:R16W/2,        col:'#f5a623'},
                {txt:'Quarter Finals',cx:QFL+QFW/2,    col:'#94a3b8'},
                {txt:'Semi Finals',  cx:SFL+SFW/2,     col:'#94a3b8'},
                {txt:'3-Team Final', cx:TFL+TFW/2,     col:'#a78bfa'},
                {txt:'Grand Final',  cx:GFL+GFW/2,     col:'#f5a623'},
              ] as const).map(({txt,cx,col})=>(
                <span key={txt} className="absolute top-0 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
                  style={{left:cx, transform:'translateX(-50%)', color:col}}>{txt}</span>
              ))}
            </div>

            {/* ── Fixed-pixel bracket canvas ── */}
            <div className="relative" style={{width:TW, height:BH}}>

              {/* SVG connector lines */}
              <svg className="absolute inset-0 pointer-events-none" width={TW} height={BH}>
                {/* R16 → QF bracket arms (coloured by the first match of each pair) */}
                {Array.from({length:4},(_,g)=>{
                  const ty=r16Y(2*g), by=r16Y(2*g+1), my=qfY(g), bx=R16W+11
                  const {border:col}=MATCH_COLORS[2*g]
                  return <path key={g} d={`M${R16W},${ty} H${bx} V${by} H${R16W} M${bx},${my} H${QFL}`} stroke={col} strokeWidth="1.5" fill="none"/>
                })}
                {/* QF → SF bracket arms */}
                {Array.from({length:2},(_,g)=>{
                  const ty=qfY(2*g), by=qfY(2*g+1), my=sfY(g), bx=QFL+QFW+11
                  return <path key={g} d={`M${QFL+QFW},${ty} H${bx} V${by} H${QFL+QFW} M${bx},${my} H${SFL}`} stroke="rgba(100,116,139,0.55)" strokeWidth="1.5" fill="none"/>
                })}
                {/* SF → 3TF bracket arm */}
                {(()=>{
                  const ty=sfY(0), by=sfY(1), bx=SFL+SFW+11
                  return <path d={`M${SFL+SFW},${ty} H${bx} V${by} H${SFL+SFW} M${bx},${tf3Y} H${TFL}`} stroke="rgba(124,58,237,0.5)" strokeWidth="1.5" fill="none"/>
                })()}
                {/* 3TF → GF */}
                <line x1={TFL+TFW} y1={tf3Y} x2={GFL} y2={tf3Y} stroke="rgba(245,166,35,0.5)" strokeWidth="1.5"/>
              </svg>

              {/* ── R16 — 8 compact cards, each centred in its row slot ── */}
              {Array.from({length:8},(_,m)=>{
                const [a,b]=r16p(m)
                return (
                  <div key={m} className="absolute" style={{top:m*STP+Math.round((STP-CH)/2), left:0, width:R16W, height:CH}}>
                    <MCard label={`M${m+1}`} teamA={a} teamB={b} result={ts.r16[m]} onClick={()=>openModal('r16',m)} canClick={!!a&&!!b} colorIdx={m}/>
                  </div>
                )
              })}

              {/* ── QF — 4 cards, each centred at the midpoint of its R16 pair ── */}
              {Array.from({length:4},(_,m)=>{
                const [a,b]=qfp(m)
                return (
                  <div key={m} className="absolute" style={{top:qfY(m)-Math.round(CH/2), left:QFL, width:QFW, height:CH}}>
                    <MCard label={`QF${m+1}`} teamA={a} teamB={b} result={ts.qf[m]} onClick={()=>openModal('qf',m)} canClick={!!a&&!!b}/>
                  </div>
                )
              })}

              {/* ── SF — 2 cards ── */}
              {[0,1].map(m=>{
                const [a,b]=sfp(m)
                return (
                  <div key={m} className="absolute" style={{top:sfY(m)-Math.round(CH/2), left:SFL, width:SFW, height:CH}}>
                    <MCard label={`SF${m+1}`} teamA={a} teamB={b} result={ts.sf[m]} onClick={()=>openModal('sf',m)} canClick={!!a&&!!b}/>
                  </div>
                )
              })}

              {/* ── 3-Team Final ── */}
              <div className="absolute" style={{top:tf3Y-110, left:TFL, width:TFW}}>
                <div className="bg-[#0a1628] border-2 border-purple-500/40 rounded-xl p-3 flex flex-col gap-2">
                  <p className="text-[9px] font-bold text-purple-400 text-center uppercase tracking-widest">3-Team Final</p>
                  {f3().map((team,i)=>{
                    const isThird=ts.final3ThirdIdx===i
                    const isFinalist=ts.final3ThirdIdx!==null&&ts.final3ThirdIdx!==i
                    return (
                      <div key={i} className={`p-2 rounded-lg border text-[11px] ${isThird?'border-orange-500/40 bg-orange-500/10':isFinalist?'border-[#f5a623]/40 bg-[#f5a623]/10':'border-white/10 bg-[#0d1f3c]'}`}>
                        {i===2&&<span className="text-[9px] text-blue-400 font-bold block">★ BEST LOSER</span>}
                        <div className="flex items-center justify-between">
                          <p className={`font-semibold truncate ${team?isThird?'text-orange-300':isFinalist?'text-[#f5a623]':'text-white':'text-slate-500 italic'}`}>
                            {team?team.teamName:'TBD'}
                          </p>
                          {isThird&&<span className="text-xs">🥉</span>}
                          {isFinalist&&<span className="text-xs">🏅</span>}
                        </div>
                      </div>
                    )
                  })}
                  {ts.sf[0]&&ts.sf[1]&&ts.bestLoserSFIdx===null&&(
                    <div className="border-t border-white/10 pt-2">
                      <p className="text-[9px] text-slate-400 mb-1.5 text-center">Pick best SF loser:</p>
                      <div className="flex flex-col gap-1">
                        {[0,1].map(si=>{const l=sfl(si);return l?(<button key={si} onClick={()=>persist({...ts,bestLoserSFIdx:si})} className="text-[10px] px-2 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 truncate">{l.teamName}</button>):null})}
                      </div>
                    </div>
                  )}
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

              {/* ── Grand Final ── */}
              <div className="absolute" style={{top:tf3Y-85, left:GFL, width:GFW}}>
                {(()=>{
                  const [a,b]=gfPair(); const champ=champion()
                  return (
                    <div className="bg-[#0a1628] border-2 border-[#f5a623]/60 rounded-xl p-3 shadow-lg shadow-[#f5a623]/10">
                      <p className="text-[9px] font-bold text-[#f5a623] text-center uppercase tracking-widest mb-2 flex items-center justify-center gap-1">
                        <Trophy size={10}/> Grand Final
                      </p>
                      {champ ? (
                        <div className="text-center">
                          <div className="text-3xl mb-1">🏆</div>
                          <p className="font-black text-[#f5a623] text-sm leading-tight">{champ.teamName}</p>
                          <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5">Champion</p>
                          <button onClick={()=>{if(a&&b)openModal('gf',0)}} className="mt-1.5 text-[9px] text-slate-600 hover:text-slate-400">↩ Change</button>
                        </div>
                      ) : (
                        <MCard label="Final" teamA={a} teamB={b} result={null} onClick={()=>openModal('gf',0)} canClick={!!a&&!!b}/>
                      )}
                    </div>
                  )
                })()}
              </div>

            </div>{/* end canvas */}
          </div>
        )
      })()}

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
        borderColor: mc.solid,
        borderWidth: '1.5px',
        background: mc.bg,
        boxShadow: `0 0 10px ${mc.glow}, inset 0 0 12px ${mc.bg}`,
      } : {}}
      className={`w-full h-full text-left rounded-lg border px-2 py-1.5 flex flex-col justify-center transition-all ${
        mc ? (canClick ? 'cursor-pointer hover:brightness-125' : 'cursor-default')
        : result?'border-[#f5a623]/50 bg-[#131e30] hover:bg-[#1a2840] cursor-pointer'
        : canClick?'border-slate-400/50 bg-[#0d1a2e] hover:border-[#f5a623]/60 cursor-pointer'
        :'border-slate-600/35 bg-[#0b1625] cursor-default'}`}>
      <p className="text-[8px] font-bold mb-1 uppercase tracking-wider" style={{ color: mc ? mc.solid : 'rgb(148,163,184)' }}>{label}</p>
      <TRow team={teamA} isWinner={winA} isLoser={winB} score={result?.scoreA}/>
      <div className="h-px my-0.5" style={{ background: mc ? mc.solid : 'rgba(255,255,255,0.12)', opacity: mc ? 0.3 : 1 }}/>
      <TRow team={teamB} isWinner={winB} isLoser={winA} score={result?.scoreB}/>
    </button>
  )
}

function TRow({ team, isWinner, isLoser, score }: { team: DrawSlot|null; isWinner: boolean; isLoser: boolean; score?: string }) {
  return (
    <div className={`flex items-center justify-between px-0.5 rounded-sm ${isWinner?'bg-[#f5a623]/15':''}`}>
      <p className={`text-[11px] font-semibold truncate max-w-[85px] ${isWinner?'text-[#f5a623]':isLoser?'text-slate-600 line-through':team?'text-slate-200':'text-slate-500 italic'}`}>
        {team?.teamName??'TBD'}
      </p>
      <div className="flex items-center gap-0.5 shrink-0 ml-0.5">
        {score&&<span className="text-[9px] text-slate-500">{score}</span>}
        {isWinner&&<Trophy size={8} className="text-[#f5a623]"/>}
      </div>
    </div>
  )
}
