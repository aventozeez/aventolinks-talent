'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Zap, AlertTriangle, CheckCircle, Send } from 'lucide-react'
import {
  SCENARIOS, SimState, SimScenario, SimAllocation,
  makeDefaultAllocation, calculateScore,
  subscribeToSim, saveSimState, getSimState,
  SIM_CHANNEL,
} from '@/lib/fsc-simulator'
import { supabase } from '@/lib/supabase'

const TEAM: 'a' | 'b' = 'a'
const TEAM_COLOR = 'green'

export default function SimTeamAPage() {
  const [state,     setState]     = useState<SimState | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [allocation, setAllocation] = useState<SimAllocation[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [timerMs,   setTimerMs]   = useState(0)

  const scenario: SimScenario =
    SCENARIOS.find(s => s.id === state?.scenario_id) ?? SCENARIOS[0]

  // Init allocation when scenario changes
  useEffect(() => {
    setAllocation(makeDefaultAllocation(scenario))
  }, [scenario.id])

  // Subscribe
  useEffect(() => {
    const sub = subscribeToSim(s => {
      setState(s)
      setLoading(false)
      if (s.phase === 'briefing') {
        setAllocation(makeDefaultAllocation(SCENARIOS.find(x => x.id === s.scenario_id) ?? SCENARIOS[0]))
      }
    })
    return sub.unsubscribe
  }, [])

  // Timer
  useEffect(() => {
    const id = setInterval(() => {
      if (!state?.timer_start || state.phase !== 'working') { setTimerMs(0); return }
      setTimerMs(Math.max(0, 3 * 60 * 1000 - (Date.now() - state.timer_start)))
    }, 500)
    return () => clearInterval(id)
  }, [state?.timer_start, state?.phase])

  // Broadcast allocation changes while working
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const broadcastAllocation = useCallback(async (alloc: SimAllocation[]) => {
    const s = await getSimState()
    if (!s || s.phase !== 'working') return
    const updated = { ...s, team_a_allocation: alloc }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = (supabase.channel(SIM_CHANNEL) as any)
    ch.send({ type: 'broadcast', event: 'sim_state', payload: updated })
    await saveSimState(updated)
  }, [])

  const setKw = (facilityId: string, kw: number) => {
    const next = allocation.map(a =>
      a.facility_id === facilityId ? { ...a, allocated_kw: kw } : a
    )
    setAllocation(next)
    broadcastAllocation(next)
  }

  const setTx = (facilityId: string, txId: string) => {
    setAllocation(prev => prev.map(a =>
      a.facility_id === facilityId ? { ...a, transformer_id: txId } : a
    ))
  }

  const submit = async () => {
    const s = await getSimState()
    if (!s || s.phase !== 'working') return
    setSubmitting(true)
    const score = calculateScore(scenario, allocation)
    const updated: SimState = {
      ...s,
      team_a_allocation: allocation,
      team_a_submitted: true,
      score_a: score,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = (supabase.channel(SIM_CHANNEL) as any)
    ch.send({ type: 'broadcast', event: 'sim_state', payload: updated })
    await saveSimState(updated)
    setState(updated)
    setSubmitting(false)
  }

  const totalAllocated = allocation.reduce((s, a) => s + a.allocated_kw, 0)
  const remaining      = scenario.available_kw - totalAllocated
  const overloaded     = totalAllocated > scenario.available_kw
  const timerSecs      = Math.ceil(timerMs / 1000)
  const timerWarn      = timerSecs <= 30 && timerSecs > 0
  const submitted      = state?.team_a_submitted ?? false
  const phase          = state?.phase ?? 'idle'

  if (loading) return (
    <div className="min-h-screen bg-[#060f1f] flex items-center justify-center">
      <Loader2 className="animate-spin text-[#f5a623]" size={40} />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#060f1f] text-white flex flex-col select-none">

      {/* Header */}
      <div className="bg-green-950/60 border-b border-green-500/30 px-5 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-green-500 uppercase tracking-[0.3em]">Team A</p>
            <h1 className="text-xl font-black text-white mt-0.5">Power Grid Simulator</h1>
          </div>
          {phase === 'working' && (
            <div className={`text-3xl font-black ${timerWarn ? 'text-red-400 animate-pulse' : 'text-[#f5a623]'}`}>
              {Math.floor(timerSecs / 60)}:{String(timerSecs % 60).padStart(2, '0')}
            </div>
          )}
        </div>

        {phase === 'working' && (
          <div className="mt-3">
            <div className="flex justify-between text-xs mb-1">
              <span className={overloaded ? 'text-red-400 font-bold' : 'text-slate-400'}>
                {totalAllocated} kW used
              </span>
              <span className={remaining < 0 ? 'text-red-400 font-bold' : 'text-green-400'}>
                {remaining >= 0 ? `${remaining} kW remaining` : `${Math.abs(remaining)} kW over limit!`}
              </span>
            </div>
            <div className="h-3 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${overloaded ? 'bg-red-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(100, (totalAllocated / scenario.available_kw) * 100)}%` }}
              />
            </div>
            {overloaded && (
              <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                <AlertTriangle size={11} /> Over budget — penalty applies
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 max-w-lg mx-auto w-full space-y-4">

        {/* ── Idle ── */}
        {phase === 'idle' && (
          <div className="text-center py-16 space-y-4">
            <div className="text-7xl">⚡</div>
            <h2 className="text-2xl font-black">Waiting for admin</h2>
            <p className="text-slate-400">The simulator will begin shortly…</p>
          </div>
        )}

        {/* ── Briefing ── */}
        {phase === 'briefing' && (
          <div className="space-y-4">
            <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={16} className="text-[#f5a623]" />
                <span className="font-black text-[#f5a623] text-sm">{scenario.name}</span>
              </div>
              <p className="text-white text-base leading-relaxed mb-4">{scenario.description}</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-green-500 uppercase tracking-widest">Your Budget</p>
                  <p className="text-3xl font-black text-green-400">{scenario.available_kw} kW</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-red-500 uppercase tracking-widest">Total Demand</p>
                  <p className="text-3xl font-black text-red-400">{scenario.facilities.reduce((s,f)=>s+f.demand_kw,0)} kW</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 text-center">
                You cannot power everything. Prioritise wisely.
              </p>
            </div>

            {/* Priority guide */}
            <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Scoring Guide</p>
              <div className="space-y-2">
                {[...scenario.facilities].sort((a,b) => b.priority - a.priority).map(f => (
                  <div key={f.id} className="flex items-center gap-3">
                    <span className="text-xl w-7 text-center shrink-0">{f.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{f.name}</span>
                        {f.critical && <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold">CRITICAL</span>}
                      </div>
                      <p className="text-xs text-slate-500">Needs {f.demand_kw} kW</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-black text-[#f5a623]">{f.priority} pts</span>
                      <p className="text-[10px] text-slate-600">full power</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-600 mt-3 text-center">
                Partial power = partial points · Full power = +5 bonus · ≤5 kW waste = +10 efficiency bonus
              </p>
            </div>

            <div className="bg-[#f5a623]/10 border border-[#f5a623]/30 rounded-xl p-3 text-center">
              <p className="text-[#f5a623] font-bold text-sm">⏳ Waiting for admin to start the timer…</p>
            </div>
          </div>
        )}

        {/* ── Working ── */}
        {phase === 'working' && !submitted && (
          <div className="space-y-3">
            {scenario.facilities.map(f => {
              const alloc = allocation.find(a => a.facility_id === f.id)
              const kw    = alloc?.allocated_kw ?? 0
              const ratio = Math.min(1, kw / f.demand_kw)
              const pts   = Math.round(ratio * f.priority) + (ratio >= 1 ? 5 : 0)
              return (
                <div key={f.id} className={`bg-[#0a1628] border rounded-2xl p-4 ${
                  ratio >= 1 ? 'border-green-500/40' :
                  kw > 0    ? 'border-[#f5a623]/30' : 'border-white/10'
                }`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{f.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-white text-sm">{f.name}</p>
                          {f.critical && <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold">CRITICAL</span>}
                        </div>
                        <p className="text-xs text-slate-500">Needs {f.demand_kw} kW</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-white">{kw} kW</p>
                      <p className="text-[10px] text-green-400 font-bold">+{pts} pts</p>
                    </div>
                  </div>

                  <input type="range" min={0} max={f.demand_kw} step={1} value={kw}
                    onChange={e => setKw(f.id, Number(e.target.value))}
                    className="w-full accent-green-500 cursor-pointer"
                  />

                  <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                    <span>0 kW</span>
                    <span className={ratio >= 1 ? 'text-green-400 font-bold' : ''}>
                      {f.demand_kw} kW {ratio >= 1 ? '✓ Full' : ''}
                    </span>
                  </div>

                  {/* Transformer selector */}
                  {scenario.transformers.length > 0 && kw > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">Via:</span>
                      <div className="flex gap-1.5">
                        {scenario.transformers.map(tx => (
                          <button key={tx.id}
                            onClick={() => setTx(f.id, tx.id)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                              alloc?.transformer_id === tx.id
                                ? 'bg-[#f5a623] text-[#0a1628] border-[#f5a623]'
                                : 'bg-white/5 text-slate-400 border-white/10 hover:border-white/20'
                            }`}>
                            {tx.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            <button onClick={submit} disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-4 bg-green-500 hover:bg-green-400 text-white font-black rounded-2xl text-lg disabled:opacity-50 shadow-2xl shadow-green-500/30 transition-colors">
              {submitting ? <Loader2 size={20} className="animate-spin" /> : <Send size={18} />}
              Submit Solution
            </button>
          </div>
        )}

        {/* ── Submitted waiting ── */}
        {phase === 'working' && submitted && (
          <div className="text-center py-16 space-y-5">
            <CheckCircle size={64} className="mx-auto text-green-400" />
            <h2 className="text-2xl font-black text-green-400">Solution Submitted!</h2>
            <p className="text-slate-400">Waiting for results…</p>
          </div>
        )}

        {/* ── Revealed ── */}
        {phase === 'revealed' && state?.score_a && (
          <div className="space-y-4">
            <div className="bg-green-500/15 border border-green-500/40 rounded-2xl p-5 text-center">
              <p className="text-sm font-bold text-green-400 mb-1">Team A — Final Score</p>
              <p className="text-7xl font-black text-green-400">{state.score_a.total}</p>
              {state.score_b && (
                <p className="text-slate-400 text-sm mt-2">
                  {state.score_a.total > state.score_b.total ? '🏆 You won!' :
                   state.score_a.total < state.score_b.total ? `Team B scored ${state.score_b.total}` :
                   "🤝 It's a tie!"}
                </p>
              )}
            </div>

            <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Breakdown</p>
              {scenario.facilities.map(f => {
                const fs = state.score_a!.facility_scores.find(x => x.facility_id === f.id)
                if (!fs) return null
                return (
                  <div key={f.id} className="flex items-center gap-2">
                    <span className="text-lg w-7 text-center shrink-0">{f.icon}</span>
                    <div className="flex-1">
                      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${fs.ratio * 100}%` }} />
                      </div>
                    </div>
                    <span className="text-xs font-bold text-green-400 shrink-0 w-12 text-right">+{fs.points}</span>
                  </div>
                )
              })}
              {state.score_a.efficiency_bonus > 0 && (
                <div className="flex justify-between text-xs text-green-400 border-t border-white/10 pt-2 mt-2">
                  <span>⚡ Efficiency bonus</span><span>+{state.score_a.efficiency_bonus}</span>
                </div>
              )}
              {state.score_a.overload_penalty > 0 && (
                <div className="flex justify-between text-xs text-red-400">
                  <span>⚠ Overload penalty</span><span>−{state.score_a.overload_penalty}</span>
                </div>
              )}
              {state.score_a.transformer_penalties > 0 && (
                <div className="flex justify-between text-xs text-red-400">
                  <span>⚡ Transformer penalty</span><span>−{state.score_a.transformer_penalties}</span>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
