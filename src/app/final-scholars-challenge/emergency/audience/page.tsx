'use client'

import { useEffect, useRef, useState } from 'react'
import {
  EmergencyState, EmergencyScore, INCIDENTS,
  defaultEmergencyState, subscribeToEmergency,
  EMRG_DURATION_MS,
} from '@/lib/fsc-emergency'
import CityMap from '../CityMap'

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function ScorePanel({ label, color, score, submitted, deployCount }:
  { label: string; color: string; score: EmergencyScore | null; submitted: boolean; deployCount: number }) {
  return (
    <div className="flex flex-col items-center" style={{ color }}>
      <p className="text-xs font-black uppercase tracking-[0.3em] opacity-70">{label}</p>
      <p className="text-5xl font-black mt-1">{score?.total ?? deployCount * 5}</p>
      <p className="text-[10px] opacity-50 mt-0.5">{score ? 'final' : 'est.'}</p>
      {submitted && <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full mt-1 font-bold">✓ SUBMITTED</span>}
    </div>
  )
}

export default function EmergencyAudiencePage() {
  const [state,   setState]   = useState<EmergencyState>(defaultEmergencyState())
  const [timerMs, setTimerMs] = useState(0)
  const timerRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    const sub = subscribeToEmergency(s => { setState(s) })
    return sub.unsubscribe
  }, [])

  useEffect(() => {
    clearInterval(timerRef.current)
    if (!state.timer_start || state.phase !== 'active') { setTimerMs(0); return }
    const tick = () => setTimerMs(Math.max(0, EMRG_DURATION_MS - (Date.now() - state.timer_start!)))
    tick(); timerRef.current = setInterval(tick, 200)
    return () => clearInterval(timerRef.current)
  }, [state.timer_start, state.phase])

  const { phase, score_a, score_b } = state
  const timerWarn = timerMs > 0 && timerMs < 30_000

  return (
    <div className="min-h-screen bg-[#060f1f] text-white flex flex-col overflow-hidden">

      {/* Top bar */}
      <div className="bg-[#0a1628] border-b border-[#f5a623]/20 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🚨</span>
          <div>
            <p className="text-xs font-black text-[#f5a623] uppercase tracking-[0.25em]">Emergency Response Simulator</p>
            <p className="text-[10px] text-slate-500">Downtown Blaze — Live Command</p>
          </div>
        </div>
        {phase === 'active' && (
          <div className={`text-5xl font-black ${timerWarn ? 'text-red-400 animate-pulse' : 'text-white'}`}>
            {fmt(timerMs)}
          </div>
        )}
      </div>

      {/* ── Idle ── */}
      {phase === 'idle' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 space-y-8">
          <div className="text-[100px] leading-none animate-pulse">🚨</div>
          <div>
            <h1 className="text-6xl font-black text-white">Emergency Response</h1>
            <p className="text-xl text-slate-400 mt-4 max-w-xl mx-auto">Teams will race to coordinate emergency services across a live simulated city disaster</p>
          </div>
        </div>
      )}

      {/* ── Briefing ── */}
      {phase === 'briefing' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 space-y-6 max-w-3xl mx-auto w-full">
          <div className="text-center">
            <p className="text-xs font-black text-[#f5a623] uppercase tracking-widest mb-2">Scenario</p>
            <h2 className="text-5xl font-black text-white">Downtown Blaze</h2>
            <p className="text-slate-400 text-lg mt-3">A 5-storey office block is ablaze. A road crash with multiple casualties has occurred nearby. Teams must deploy the right resources — fast.</p>
          </div>

          <div className="w-full rounded-2xl overflow-hidden border border-[#f5a623]/20" style={{ height: 320 }}>
            <CityMap deployments={[]} phase="briefing" vehicleColor="#f5a623" showFire={false}/>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full">
            {INCIDENTS.map(inc => (
              <div key={inc.id} className="bg-[#0a1628] border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{inc.icon}</span>
                  <p className="font-black text-white">{inc.label}</p>
                </div>
                <p className="text-xs text-slate-400">Required resources:</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {inc.required.map(r => (
                    <span key={r} className="text-sm bg-white/10 px-2 py-1 rounded-lg">{r.replace('_', ' ')}</span>
                  ))}
                </div>
                <p className="text-[#f5a623] font-bold text-xs mt-2">Up to {inc.points} pts</p>
              </div>
            ))}
          </div>

          <p className="text-slate-500 animate-pulse text-sm">Teams are reading the brief…</p>
        </div>
      )}

      {/* ── Active ── */}
      {phase === 'active' && (
        <div className="flex-1 flex flex-col px-4 py-4 min-h-0">
          {/* Team scores row */}
          <div className="flex items-center justify-around mb-4 shrink-0">
            <ScorePanel label="Team A" color="#22c55e" score={null}
              submitted={state.team_a_submitted} deployCount={state.team_a_deployments.length}/>
            <div className="text-slate-600 text-lg font-black">VS</div>
            <ScorePanel label="Team B" color="#a855f7" score={null}
              submitted={state.team_b_submitted} deployCount={state.team_b_deployments.length}/>
          </div>

          {/* Dual maps */}
          <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
            {[
              { label: 'Team A', deps: state.team_a_deployments, color: '#22c55e' },
              { label: 'Team B', deps: state.team_b_deployments, color: '#a855f7' },
            ].map(({ label, deps, color }) => (
              <div key={label} className="bg-[#0a1628] rounded-xl overflow-hidden border border-white/10 flex flex-col">
                <div className="px-3 py-1.5 border-b border-white/5 shrink-0">
                  <span className="text-xs font-bold" style={{ color }}>{label} — {deps.length} deployed</span>
                </div>
                <div className="flex-1 min-h-0">
                  <CityMap deployments={deps} phase="active" vehicleColor={color}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Revealed ── */}
      {phase === 'revealed' && score_a && score_b && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 space-y-6 max-w-4xl mx-auto w-full">

          {/* Winner banner */}
          <div className={`w-full text-center rounded-3xl px-8 py-6 border-2 ${
            score_a.total > score_b.total ? 'bg-green-500/15 border-green-400/60' :
            score_b.total > score_a.total ? 'bg-purple-500/15 border-purple-400/60' :
            'bg-[#f5a623]/15 border-[#f5a623]/60'
          }`}>
            <p className="text-6xl mb-2">🏆</p>
            <p className="text-5xl font-black text-white">
              {score_a.total > score_b.total ? 'Team A Wins!' :
               score_b.total > score_a.total ? 'Team B Wins!' : "It's a Tie!"}
            </p>
            <p className="text-slate-400 text-xl mt-2">
              {Math.max(score_a.total, score_b.total)} vs {Math.min(score_a.total, score_b.total)} points
            </p>
          </div>

          {/* Side-by-side breakdown */}
          <div className="grid grid-cols-2 gap-5 w-full">
            {[
              { label: 'Team A', score: score_a, color: '#22c55e' },
              { label: 'Team B', score: score_b, color: '#a855f7' },
            ].map(({ label, score, color }) => (
              <div key={label} className="bg-[#0a1628] border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-black" style={{ color }}>{label}</h3>
                  <p className="text-5xl font-black" style={{ color }}>{score.total}</p>
                </div>
                <div className="space-y-3">
                  {INCIDENTS.map(inc => {
                    const s = score.incident_scores.find(x => x.incident_id === inc.id)
                    return (
                      <div key={inc.id}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-300">{inc.icon} {inc.label}</span>
                          <span className="font-bold" style={{ color }}>+{s?.total ?? 0}</span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.min(100, ((s?.total ?? 0) / (inc.points + 15)) * 100)}%`, background: color }}/>
                        </div>
                        {(s?.time_bonus ?? 0) > 0 && (
                          <p className="text-[10px] text-[#f5a623] mt-0.5">⚡ +{s!.time_bonus} speed bonus</p>
                        )}
                      </div>
                    )
                  })}
                  {score.coverage_bonus > 0 && (
                    <div className="flex justify-between text-sm text-green-400 border-t border-white/10 pt-2">
                      <span>✅ All covered</span><span>+{score.coverage_bonus}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
