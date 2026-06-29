'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Play, RotateCcw, Eye, Loader2, Zap, Trophy,
  CheckCircle, Clock, AlertTriangle, ChevronRight,
} from 'lucide-react'
import { wsSubscribe, wsBroadcast } from '@/lib/ws-sync'
import {
  SCENARIOS, SimState, SimScenario, SimAllocation,
  makeDefaultSimState, makeDefaultAllocation,
  calculateScore, maxPossibleScore,
  getSimState, saveSimState,
  SIM_CHANNEL, SIM_TIMER_MS,
} from '@/lib/fsc-simulator'

const DIFF_COLOR: Record<string, string> = {
  Basic:  'text-green-400 border-green-500/40 bg-green-500/10',
  Medium: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
  Hard:   'text-red-400   border-red-500/40   bg-red-500/10',
}

export default function SimulatorTab() {
  const [state,   setState]   = useState<SimState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [timerMs, setTimerMs] = useState(0)

  const stateRef   = useRef<SimState | null>(null)
  useEffect(() => { stateRef.current = state }, [state])

  const scenario: SimScenario =
    SCENARIOS.find(s => s.id === state?.scenario_id) ?? SCENARIOS[0]

  // ── Broadcast + save ────────────────────────────────────────────────────────
  const apply = useCallback(async (next: SimState) => {
    setState(next)
    stateRef.current = next
    wsBroadcast(SIM_CHANNEL, next)
    setSaving(true)
    await saveSimState(next)
    setSaving(false)
  }, [])

  // ── Channel + initial load ──────────────────────────────────────────────────
  useEffect(() => {
    getSimState().then(s => {
      setState(s ?? makeDefaultSimState())
      setLoading(false)
    })

    const unsub = wsSubscribe(SIM_CHANNEL, (payload) => {
      const s = payload as SimState
      setState(s); stateRef.current = s
    })
    return unsub
  }, [])

  // ── Timer tick ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current
      if (!s || s.phase !== 'working' || !s.timer_start) { setTimerMs(0); return }
      const remaining = Math.max(0, SIM_TIMER_MS - (Date.now() - s.timer_start))
      setTimerMs(remaining)
      if (remaining === 0) {
        // Auto-collect when time runs out
        const cur = stateRef.current
        if (cur && cur.phase === 'working') apply({ ...cur, phase: 'revealed', ...scoreAll(cur) })
      }
    }, 500)
    return () => clearInterval(id)
  }, [apply])

  function scoreAll(s: SimState) {
    const sc = SCENARIOS.find(x => x.id === s.scenario_id) ?? SCENARIOS[0]
    const allocA = s.team_a_allocation ?? makeDefaultAllocation(sc)
    const allocB = s.team_b_allocation ?? makeDefaultAllocation(sc)
    return { score_a: calculateScore(sc, allocA), score_b: calculateScore(sc, allocB) }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  const selectScenario = (id: string) => {
    if (!state || state.phase !== 'idle') return
    apply({ ...state, scenario_id: id })
  }

  const startBriefing = () => {
    if (!state) return
    apply({
      ...state, phase: 'briefing',
      team_a_allocation: null, team_a_submitted: false,
      team_b_allocation: null, team_b_submitted: false,
      score_a: null, score_b: null, timer_start: null,
    })
  }

  const startTimer = () => {
    if (!state) return
    apply({ ...state, phase: 'working', timer_start: Date.now() })
  }

  const revealResults = () => {
    if (!state) return
    apply({ ...state, phase: 'revealed', ...scoreAll(state) })
  }

  const resetSim = () => {
    if (!confirm('Reset simulator to idle?')) return
    apply(makeDefaultSimState())
  }

  const timerSecs  = Math.ceil(timerMs / 1000)
  const timerWarn  = timerSecs <= 30 && timerSecs > 0
  const timerColor = timerMs === 0 ? 'text-slate-500' : timerWarn ? 'text-red-400 animate-pulse' : 'text-[#f5a623]'

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="animate-spin text-[#f5a623]" size={32} />
    </div>
  )

  const phase    = state?.phase ?? 'idle'
  const scoreA   = state?.score_a
  const scoreB   = state?.score_b
  const maxScore = maxPossibleScore(scenario)

  // Live allocation previews (during working phase)
  const liveA = state?.team_a_allocation
  const liveB = state?.team_b_allocation
  const liveScoreA = liveA ? calculateScore(scenario, liveA) : null
  const liveScoreB = liveB ? calculateScore(scenario, liveB) : null

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="space-y-5">

      {/* ── Phase bar ── */}
      <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-[#f5a623]" />
            <span className="text-sm font-black text-white">Power Grid Simulator</span>
            {saving && <Loader2 size={12} className="animate-spin text-slate-500" />}
          </div>
          <button onClick={resetSim}
            className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-slate-400 transition-colors">
            <RotateCcw size={11} /> Reset
          </button>
        </div>

        {/* Phase stepper */}
        <div className="flex items-center gap-1 text-[10px] font-bold">
          {(['idle','briefing','working','revealed'] as const).map((p, i) => {
            const idx   = ['idle','briefing','working','revealed'].indexOf(phase)
            const here  = p === phase
            const done  = i < idx
            return (
              <div key={p} className="flex items-center gap-1">
                <span className={`px-2 py-1 rounded-full border transition-all ${
                  here ? 'bg-[#f5a623] text-[#0a1628] border-[#f5a623]' :
                  done ? 'bg-white/10 text-slate-400 border-white/10' :
                         'text-slate-600 border-transparent'
                }`}>
                  {p === 'idle' ? 'Idle' : p === 'briefing' ? 'Briefing' : p === 'working' ? 'Working' : 'Results'}
                </span>
                {i < 3 && <ChevronRight size={10} className="text-slate-700 shrink-0" />}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Scenario selector (idle/briefing) ── */}
      {(phase === 'idle' || phase === 'briefing') && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select Scenario</p>
          {SCENARIOS.map(sc => {
            const selected = state?.scenario_id === sc.id
            return (
              <button key={sc.id}
                onClick={() => selectScenario(sc.id)}
                disabled={phase !== 'idle'}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${
                  selected
                    ? 'border-[#f5a623]/60 bg-[#f5a623]/10'
                    : 'border-white/10 bg-[#0a1628] hover:border-white/20'
                } disabled:opacity-60 disabled:cursor-not-allowed`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${DIFF_COLOR[sc.difficulty]}`}>
                        {sc.difficulty}
                      </span>
                      <span className="font-black text-white text-sm">{sc.name}</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{sc.description}</p>
                    <p className="text-[10px] text-slate-600 mt-1.5">{sc.context}</p>
                  </div>
                  {selected && <CheckCircle size={16} className="text-[#f5a623] shrink-0 mt-0.5" />}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Control buttons ── */}
      <div className="space-y-2">
        {phase === 'idle' && (
          <button onClick={startBriefing}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#f5a623] text-[#0a1628] font-black rounded-xl hover:bg-[#e0941a] transition-colors">
            <Play size={16} fill="currentColor" /> Start Briefing
          </button>
        )}
        {phase === 'briefing' && (
          <button onClick={startTimer}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-500 text-white font-black rounded-xl hover:bg-green-400 transition-colors">
            <Clock size={16} /> Start Timer — 3:00
          </button>
        )}
        {phase === 'working' && (
          <>
            {/* Timer */}
            <div className={`text-center text-5xl font-black py-2 ${timerColor}`}>
              {Math.floor(timerSecs / 60)}:{String(timerSecs % 60).padStart(2, '0')}
            </div>
            <button onClick={revealResults}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl transition-colors">
              <Eye size={16} /> Reveal Results Now
            </button>
          </>
        )}
      </div>

      {/* ── Scenario detail card (briefing/working) ── */}
      {(phase === 'briefing' || phase === 'working') && (
        <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black text-white">{scenario.name}</p>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${DIFF_COLOR[scenario.difficulty]}`}>
              {scenario.difficulty}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/5 rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Available</p>
              <p className="text-2xl font-black text-[#f5a623]">{scenario.available_kw} kW</p>
            </div>
            <div className="bg-white/5 rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Total Demand</p>
              <p className="text-2xl font-black text-red-400">
                {scenario.facilities.reduce((s, f) => s + f.demand_kw, 0)} kW
              </p>
            </div>
          </div>
          <div className="space-y-1">
            {scenario.facilities.map(f => (
              <div key={f.id} className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-5 text-center">{f.icon}</span>
                <span className="flex-1">{f.name}</span>
                <span className="text-slate-500">{f.demand_kw} kW</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${f.critical ? 'bg-red-500/15 text-red-400' : 'bg-white/5 text-slate-600'}`}>
                  {f.priority}pts
                </span>
              </div>
            ))}
          </div>
          {scenario.transformers.length > 0 && (
            <div className="border-t border-white/10 pt-2 space-y-1">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Transformers</p>
              {scenario.transformers.map(tx => (
                <div key={tx.id} className="flex justify-between text-xs text-slate-400">
                  <span>⚡ {tx.name}</span>
                  <span className="text-yellow-400 font-bold">{tx.capacity_kw} kW max</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Live monitoring (working phase) ── */}
      {phase === 'working' && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Team Status</p>
          {([
            { label: state?.score_a !== null ? 'Team A' : 'Team A', alloc: liveA, score: liveScoreA, submitted: state?.team_a_submitted, color: 'green' },
            { label: 'Team B', alloc: liveB, score: liveScoreB, submitted: state?.team_b_submitted, color: 'purple' },
          ] as const).map(({ label, alloc, score, submitted, color }) => {
            const totalAlloc = alloc?.reduce((s, a) => s + a.allocated_kw, 0) ?? 0
            const overloaded = totalAlloc > scenario.available_kw
            return (
              <div key={label} className={`bg-[#0a1628] border rounded-xl p-3 ${
                submitted ? `border-${color}-500/40` : 'border-white/10'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-black text-${color}-400`}>{label}</span>
                  {submitted
                    ? <span className="text-[10px] font-bold text-green-400">✓ Submitted</span>
                    : alloc
                    ? <span className="text-[10px] text-slate-500">Working…</span>
                    : <span className="text-[10px] text-slate-600">Not started</span>
                  }
                </div>
                {alloc && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${overloaded ? 'bg-red-500' : 'bg-[#f5a623]'}`}
                          style={{ width: `${Math.min(100, (totalAlloc / scenario.available_kw) * 100)}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-bold shrink-0 ${overloaded ? 'text-red-400' : 'text-slate-400'}`}>
                        {totalAlloc}/{scenario.available_kw} kW
                        {overloaded && ' ⚠'}
                      </span>
                    </div>
                    {score && (
                      <p className="text-[10px] text-slate-500 text-right">
                        Preview: <span className="text-white font-bold">{score.total}</span> pts
                        {score.overload_penalty > 0 && <span className="text-red-400"> (−{score.overload_penalty} overload)</span>}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Results ── */}
      {phase === 'revealed' && scoreA && scoreB && (
        <div className="space-y-4">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Final Results</p>

          {/* Winner banner */}
          {scoreA.total !== scoreB.total && (
            <div className={`rounded-2xl px-5 py-4 text-center border ${
              scoreA.total > scoreB.total
                ? 'bg-green-500/15 border-green-500/40 text-green-300'
                : 'bg-purple-500/15 border-purple-500/40 text-purple-300'
            }`}>
              <p className="text-2xl font-black">
                🏆 {scoreA.total > scoreB.total ? 'Team A' : 'Team B'} Wins!
              </p>
              <p className="text-sm opacity-70 mt-1">
                {Math.max(scoreA.total, scoreB.total)} vs {Math.min(scoreA.total, scoreB.total)} points
              </p>
            </div>
          )}
          {scoreA.total === scoreB.total && (
            <div className="rounded-2xl px-5 py-4 text-center border border-[#f5a623]/40 bg-[#f5a623]/10 text-[#f5a623]">
              <p className="text-2xl font-black">🤝 It's a Tie! {scoreA.total} pts each</p>
            </div>
          )}

          {/* Score breakdown */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Team A', score: scoreA, color: 'green' },
              { label: 'Team B', score: scoreB, color: 'purple' },
            ].map(({ label, score, color }) => (
              <div key={label} className={`bg-[#0a1628] border border-${color}-500/30 rounded-2xl p-3`}>
                <p className={`text-xs font-black text-${color}-400 mb-2`}>{label}</p>
                <p className={`text-4xl font-black text-${color}-400 mb-2`}>{score.total}</p>
                <div className="space-y-1">
                  {scenario.facilities.map(f => {
                    const fs = score.facility_scores.find(x => x.facility_id === f.id)
                    if (!fs) return null
                    return (
                      <div key={f.id} className="flex items-center gap-1.5 text-[10px]">
                        <span>{f.icon}</span>
                        <span className="flex-1 text-slate-400 truncate">{f.name}</span>
                        <span className={`font-bold ${fs.ratio >= 1 ? `text-${color}-400` : fs.ratio > 0 ? 'text-yellow-400' : 'text-slate-600'}`}>
                          +{fs.points}
                        </span>
                      </div>
                    )
                  })}
                  {score.efficiency_bonus > 0 && (
                    <div className="flex justify-between text-[10px] text-green-400 border-t border-white/10 pt-1 mt-1">
                      <span>⚡ Efficiency bonus</span><span>+{score.efficiency_bonus}</span>
                    </div>
                  )}
                  {score.overload_penalty > 0 && (
                    <div className="flex justify-between text-[10px] text-red-400 border-t border-white/10 pt-1 mt-1">
                      <span>⚠ Overload penalty</span><span>−{score.overload_penalty}</span>
                    </div>
                  )}
                  {score.transformer_penalties > 0 && (
                    <div className="flex justify-between text-[10px] text-red-400">
                      <span>⚡ Transformer penalty</span><span>−{score.transformer_penalties}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button onClick={resetSim}
            className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-bold rounded-xl text-sm transition-colors">
            <RotateCcw size={13} className="inline mr-2" />Run Another Round
          </button>
        </div>
      )}

      {/* ── Share links ── */}
      <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Simulator Links</p>
        <div className="space-y-2">
          {[
            { label: 'Audience', path: '/final-scholars-challenge/simulator/audience', emoji: '📺', color: 'text-blue-400' },
            { label: 'Team A',   path: '/final-scholars-challenge/simulator/team-a',   emoji: '🔵', color: 'text-green-400' },
            { label: 'Team B',   path: '/final-scholars-challenge/simulator/team-b',   emoji: '🟣', color: 'text-purple-400' },
          ].map(l => (
            <div key={l.label} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span>{l.emoji}</span>
                <span className={`text-xs font-bold ${l.color}`}>{l.label}</span>
              </div>
              <div className="flex gap-1.5">
                <a href={l.path} target="_blank" rel="noopener noreferrer"
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold text-white transition-colors">
                  Open
                </a>
                <button onClick={() => navigator.clipboard.writeText(origin + l.path)}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold text-white transition-colors">
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
