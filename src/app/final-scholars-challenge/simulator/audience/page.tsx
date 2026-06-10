'use client'

import { useEffect, useState } from 'react'
import { Loader2, Zap } from 'lucide-react'
import {
  SCENARIOS, SimState, SimScenario,
  subscribeToSim, calculateScore, makeDefaultAllocation,
} from '@/lib/fsc-simulator'

export default function SimAudiencePage() {
  const [state,   setState]   = useState<SimState | null>(null)
  const [loading, setLoading] = useState(true)
  const [timerMs, setTimerMs] = useState(0)

  useEffect(() => {
    const sub = subscribeToSim(s => { setState(s); setLoading(false) })
    return sub.unsubscribe
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      if (!state?.timer_start || state.phase !== 'working') { setTimerMs(0); return }
      setTimerMs(Math.max(0, 3 * 60 * 1000 - (Date.now() - state.timer_start)))
    }, 500)
    return () => clearInterval(id)
  }, [state?.timer_start, state?.phase])

  if (loading) return (
    <div className="min-h-screen bg-[#060f1f] flex items-center justify-center">
      <Loader2 className="animate-spin text-[#f5a623]" size={48} />
    </div>
  )

  const scenario: SimScenario = SCENARIOS.find(s => s.id === state?.scenario_id) ?? SCENARIOS[0]
  const phase     = state?.phase ?? 'idle'
  const timerSecs = Math.ceil(timerMs / 1000)
  const timerWarn = timerSecs <= 30 && timerSecs > 0

  const liveScoreA = state?.team_a_allocation ? calculateScore(scenario, state.team_a_allocation) : null
  const liveScoreB = state?.team_b_allocation ? calculateScore(scenario, state.team_b_allocation) : null
  const totalDemand = scenario.facilities.reduce((s, f) => s + f.demand_kw, 0)

  return (
    <div className="min-h-screen bg-[#060f1f] text-white flex flex-col select-none">

      {/* Top bar */}
      <div className="bg-[#0a1628] border-b border-[#f5a623]/30 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-[#f5a623]" />
          <span className="text-sm font-black text-[#f5a623] uppercase tracking-[0.25em]">
            Power Grid Simulator
          </span>
        </div>
        {phase === 'working' && (
          <div className={`text-4xl font-black ${timerWarn ? 'text-red-400 animate-pulse' : 'text-white'}`}>
            {Math.floor(timerSecs / 60)}:{String(timerSecs % 60).padStart(2, '0')}
          </div>
        )}
      </div>

      {/* ── Idle ── */}
      {phase === 'idle' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 space-y-6">
          <div className="text-[120px] leading-none">⚡</div>
          <h1 className="text-5xl md:text-7xl font-black text-white">Power Grid Challenge</h1>
          <p className="text-xl text-slate-400 max-w-lg">Teams will compete to restore power to a community — with limited resources and critical decisions</p>
        </div>
      )}

      {/* ── Briefing ── */}
      {phase === 'briefing' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 space-y-8 max-w-4xl mx-auto w-full">
          <div className="text-center">
            <span className="text-sm font-bold text-[#f5a623]/70 uppercase tracking-widest">Scenario</span>
            <h2 className="text-5xl font-black text-white mt-2">{scenario.name}</h2>
            <p className="text-slate-400 text-lg mt-3 max-w-2xl">{scenario.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-6 w-full max-w-lg">
            <div className="bg-[#f5a623]/10 border border-[#f5a623]/30 rounded-2xl p-5 text-center">
              <p className="text-xs text-[#f5a623]/70 uppercase tracking-widest">Available Power</p>
              <p className="text-5xl font-black text-[#f5a623] mt-1">{scenario.available_kw} kW</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 text-center">
              <p className="text-xs text-red-400/70 uppercase tracking-widest">Total Demand</p>
              <p className="text-5xl font-black text-red-400 mt-1">{totalDemand} kW</p>
            </div>
          </div>

          <div className="w-full max-w-2xl">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[...scenario.facilities].sort((a,b) => b.priority - a.priority).map(f => (
                <div key={f.id} className={`rounded-2xl p-4 border text-center ${
                  f.critical ? 'border-red-500/30 bg-red-500/5' : 'border-white/10 bg-white/5'
                }`}>
                  <div className="text-4xl mb-2">{f.icon}</div>
                  <p className="font-black text-white text-sm">{f.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{f.demand_kw} kW</p>
                  <p className="text-lg font-black text-[#f5a623] mt-1">{f.priority} pts</p>
                  {f.critical && <span className="text-[9px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold">CRITICAL</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="text-center text-slate-500 animate-pulse">
            Teams are reading the brief…
          </div>
        </div>
      )}

      {/* ── Working ── */}
      {phase === 'working' && (
        <div className="flex-1 flex flex-col px-4 py-6 max-w-5xl mx-auto w-full">

          {/* Scenario reminder */}
          <div className="text-center mb-6">
            <h2 className="text-3xl font-black text-white">{scenario.name}</h2>
            <p className="text-slate-500 text-sm mt-1">{scenario.available_kw} kW available · {totalDemand} kW total demand</p>
          </div>

          {/* Live team panels */}
          <div className="grid grid-cols-2 gap-4 flex-1">
            {[
              { label: 'Team A', alloc: state?.team_a_allocation, score: liveScoreA, submitted: state?.team_a_submitted, color: 'green' },
              { label: 'Team B', alloc: state?.team_b_allocation, score: liveScoreB, submitted: state?.team_b_submitted, color: 'purple' },
            ].map(({ label, alloc, score, submitted, color }) => {
              const totalAlloc = alloc?.reduce((s, a) => s + a.allocated_kw, 0) ?? 0
              const overloaded = totalAlloc > scenario.available_kw
              return (
                <div key={label} className={`bg-[#0a1628] border rounded-2xl p-5 flex flex-col ${
                  submitted ? `border-${color}-500/50` : 'border-white/10'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-2xl font-black text-${color}-400`}>{label}</h3>
                    {submitted
                      ? <span className="text-sm font-bold text-green-400">✓ Submitted</span>
                      : alloc
                      ? <span className="text-sm text-slate-500 animate-pulse">Working…</span>
                      : <span className="text-sm text-slate-600">Not started</span>
                    }
                  </div>

                  {/* Power bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">{totalAlloc} kW</span>
                      <span className={overloaded ? 'text-red-400 font-bold' : `text-${color}-400`}>
                        {overloaded ? '⚠ OVERLOAD' : `${scenario.available_kw - totalAlloc} kW left`}
                      </span>
                    </div>
                    <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${overloaded ? 'bg-red-500' : color === 'green' ? 'bg-green-500' : 'bg-purple-500'}`}
                        style={{ width: `${Math.min(100, (totalAlloc / scenario.available_kw) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Facility allocation bars */}
                  <div className="space-y-2 flex-1">
                    {scenario.facilities.map(f => {
                      const kw    = alloc?.find(a => a.facility_id === f.id)?.allocated_kw ?? 0
                      const ratio = Math.min(1, kw / f.demand_kw)
                      return (
                        <div key={f.id} className="flex items-center gap-2">
                          <span className="text-lg shrink-0 w-6 text-center">{f.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  ratio >= 1 ? (color === 'green' ? 'bg-green-500' : 'bg-purple-500') :
                                  ratio > 0  ? 'bg-[#f5a623]' : 'bg-transparent'
                                }`}
                                style={{ width: `${ratio * 100}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-xs text-slate-500 shrink-0 w-14 text-right">{kw}/{f.demand_kw} kW</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Live score preview */}
                  {score && (
                    <div className="mt-4 pt-3 border-t border-white/10 text-center">
                      <p className="text-xs text-slate-500">Live Score Preview</p>
                      <p className={`text-4xl font-black text-${color}-400`}>{score.total}</p>
                      {score.overload_penalty > 0 && (
                        <p className="text-xs text-red-400">−{score.overload_penalty} overload penalty</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Revealed ── */}
      {phase === 'revealed' && state?.score_a && state?.score_b && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-5xl mx-auto w-full space-y-8">

          {/* Winner */}
          {state.score_a.total !== state.score_b.total ? (
            <div className={`text-center rounded-3xl px-10 py-6 border-2 w-full max-w-lg ${
              state.score_a.total > state.score_b.total
                ? 'bg-green-500/20 border-green-400 text-green-300'
                : 'bg-purple-500/20 border-purple-400 text-purple-300'
            }`}>
              <p className="text-6xl mb-2">🏆</p>
              <p className="text-5xl font-black">
                {state.score_a.total > state.score_b.total ? 'Team A Wins!' : 'Team B Wins!'}
              </p>
              <p className="text-xl opacity-70 mt-2">
                {Math.max(state.score_a.total, state.score_b.total)} vs {Math.min(state.score_a.total, state.score_b.total)} points
              </p>
            </div>
          ) : (
            <div className="text-center rounded-3xl px-10 py-6 border-2 border-[#f5a623]/60 bg-[#f5a623]/10 w-full max-w-lg">
              <p className="text-6xl mb-2">🤝</p>
              <p className="text-5xl font-black text-[#f5a623]">It&apos;s a Tie!</p>
              <p className="text-xl text-[#f5a623]/70 mt-2">{state.score_a.total} points each</p>
            </div>
          )}

          {/* Side-by-side breakdown */}
          <div className="grid grid-cols-2 gap-6 w-full">
            {[
              { label: 'Team A', score: state.score_a, color: 'green' },
              { label: 'Team B', score: state.score_b, color: 'purple' },
            ].map(({ label, score, color }) => (
              <div key={label} className={`bg-[#0a1628] border border-${color}-500/30 rounded-2xl p-6`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-2xl font-black text-${color}-400`}>{label}</h3>
                  <p className={`text-5xl font-black text-${color}-400`}>{score.total}</p>
                </div>
                <div className="space-y-3">
                  {scenario.facilities.map(f => {
                    const fs = score.facility_scores.find(x => x.facility_id === f.id)
                    if (!fs) return null
                    return (
                      <div key={f.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{f.icon}</span>
                            <span className="font-semibold text-white">{f.name}</span>
                          </div>
                          <span className={`font-black ${
                            fs.ratio >= 1 ? `text-${color}-400` :
                            fs.ratio > 0  ? 'text-yellow-400' : 'text-slate-600'
                          }`}>
                            +{fs.points}
                          </span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              fs.ratio >= 1
                                ? (color === 'green' ? 'bg-green-500' : 'bg-purple-500')
                                : fs.ratio > 0 ? 'bg-[#f5a623]' : 'bg-transparent'
                            }`}
                            style={{ width: `${fs.ratio * 100}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                  <div className="border-t border-white/10 pt-2 space-y-1">
                    {score.efficiency_bonus > 0 && (
                      <div className="flex justify-between text-sm text-green-400">
                        <span>⚡ Efficiency bonus</span><span>+{score.efficiency_bonus}</span>
                      </div>
                    )}
                    {score.overload_penalty > 0 && (
                      <div className="flex justify-between text-sm text-red-400">
                        <span>⚠ Overload penalty</span><span>−{score.overload_penalty}</span>
                      </div>
                    )}
                    {score.transformer_penalties > 0 && (
                      <div className="flex justify-between text-sm text-red-400">
                        <span>⚡ Transformer penalty</span><span>−{score.transformer_penalties}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
