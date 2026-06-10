'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Radio, Play, Eye, RotateCcw, Copy, ExternalLink } from 'lucide-react'
import {
  EmergencyState, EmergencyScore,
  INCIDENTS, RESOURCES,
  defaultEmergencyState, getEmergencyState, saveEmergencyState,
  subscribeToEmergency, broadcastEmergency,
  calculateScore, EMRG_DURATION_MS,
} from '@/lib/fsc-emergency'
import CityMap from '@/app/final-scholars-challenge/emergency/CityMap'

const PHASES = ['idle', 'briefing', 'active', 'revealed'] as const

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function ScoreCard({ label, score, color }: { label: string; score: EmergencyScore | null; color: string }) {
  return (
    <div className={`bg-[#0a1628] border rounded-xl p-4 border-${color}-500/30`}>
      <p className={`text-xs font-bold text-${color}-400 mb-1`}>{label}</p>
      <p className={`text-4xl font-black text-${color}-400`}>{score?.total ?? '—'}</p>
      {score && (
        <div className="mt-2 space-y-1">
          {INCIDENTS.map(inc => {
            const s = score.incident_scores.find(x => x.incident_id === inc.id)
            return (
              <div key={inc.id} className="flex justify-between text-[10px]">
                <span className="text-slate-500">{inc.icon} {inc.label}</span>
                <span className={`text-${color}-400`}>{s?.total ?? 0}</span>
              </div>
            )
          })}
          {score.coverage_bonus > 0 && (
            <div className="flex justify-between text-[10px] text-green-400">
              <span>✅ Coverage bonus</span><span>+{score.coverage_bonus}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function EmergencyTab() {
  const [state, setState]     = useState<EmergencyState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [timerMs, setTimerMs] = useState(0)
  const timerRef              = useRef<NodeJS.Timeout>()

  useEffect(() => {
    const sub = subscribeToEmergency(s => { setState(s); setLoading(false) })
    return sub.unsubscribe
  }, [])

  useEffect(() => {
    clearInterval(timerRef.current)
    if (!state?.timer_start || state.phase !== 'active') { setTimerMs(0); return }
    const tick = () => setTimerMs(Math.max(0, EMRG_DURATION_MS - (Date.now() - state.timer_start!)))
    tick()
    timerRef.current = setInterval(tick, 500)
    return () => clearInterval(timerRef.current)
  }, [state?.timer_start, state?.phase])

  const apply = async (next: EmergencyState) => {
    setSaving(true)
    setState(next)
    broadcastEmergency(next)
    await saveEmergencyState(next)
    setSaving(false)
  }

  const startBriefing = async () => {
    const s = await getEmergencyState() ?? defaultEmergencyState()
    await apply({ ...s, phase: 'briefing', timer_start: null })
  }

  const startActive = async () => {
    const s = await getEmergencyState() ?? defaultEmergencyState()
    await apply({ ...s, phase: 'active', timer_start: Date.now() })
  }

  const revealResults = async () => {
    const s = await getEmergencyState()
    if (!s || !s.timer_start) return
    const score_a = calculateScore(s.team_a_deployments, s.timer_start)
    const score_b = calculateScore(s.team_b_deployments, s.timer_start)
    await apply({ ...s, phase: 'revealed', score_a, score_b })
  }

  const reset = async () => {
    await apply(defaultEmergencyState())
  }

  const copy = (url: string) => navigator.clipboard.writeText(url)
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const links = [
    { label: '📺 Audience', url: `${base}/final-scholars-challenge/emergency/audience`, color: 'gold' },
    { label: '🔵 Team A',   url: `${base}/final-scholars-challenge/emergency/team-a`,  color: 'green' },
    { label: '🟣 Team B',   url: `${base}/final-scholars-challenge/emergency/team-b`,  color: 'purple' },
  ]

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="animate-spin text-[#f5a623]" size={32}/>
    </div>
  )

  const s    = state ?? defaultEmergencyState()
  const phase = s.phase
  const phaseIdx = PHASES.indexOf(phase)
  const timerWarn = timerMs > 0 && timerMs < 30_000

  const deployCountA = s.team_a_deployments.length
  const deployCountB = s.team_b_deployments.length

  return (
    <div className="space-y-5 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            🚨 Emergency Response Simulator
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Downtown Blaze — Building fire + road crash</p>
        </div>
        {phase === 'active' && (
          <div className={`text-3xl font-black ${timerWarn ? 'text-red-400 animate-pulse' : 'text-[#f5a623]'}`}>
            {fmt(timerMs)}
          </div>
        )}
      </div>

      {/* Phase stepper */}
      <div className="flex items-center gap-0">
        {['Idle', 'Briefing', 'Active', 'Results'].map((label, i) => (
          <div key={i} className="flex items-center flex-1">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              i === phaseIdx
                ? 'bg-[#f5a623] text-[#0a1628] border-[#f5a623]'
                : i < phaseIdx
                ? 'bg-[#f5a623]/20 text-[#f5a623] border-[#f5a623]/30'
                : 'bg-white/5 text-slate-500 border-white/10'
            }`}>
              {i < phaseIdx ? '✓' : i === phaseIdx ? <Radio size={10}/> : i + 1} {label}
            </div>
            {i < 3 && <div className={`flex-1 h-0.5 ${i < phaseIdx ? 'bg-[#f5a623]/40' : 'bg-white/10'}`}/>}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap">
        {phase === 'idle' && (
          <button onClick={startBriefing} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-sm disabled:opacity-50 hover:bg-[#e0941a] transition-colors">
            <Play size={14}/> Start Briefing
          </button>
        )}
        {phase === 'briefing' && (
          <button onClick={startActive} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 text-white font-bold rounded-xl text-sm disabled:opacity-50 hover:bg-green-400 transition-colors">
            <Play size={14}/> Start Timer (3:00)
          </button>
        )}
        {phase === 'active' && (
          <button onClick={revealResults} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-sm disabled:opacity-50 hover:bg-[#e0941a] transition-colors">
            <Eye size={14}/> Reveal Results
          </button>
        )}
        {phase !== 'idle' && (
          <button onClick={reset} disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 text-slate-400 border border-white/10 font-bold rounded-xl text-sm hover:bg-white/10 transition-colors">
            <RotateCcw size={13}/> Reset
          </button>
        )}
      </div>

      {/* Live maps — side by side during active/revealed */}
      {(phase === 'active' || phase === 'revealed') && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Team A', deps: s.team_a_deployments, color: '#22c55e', submitted: s.team_a_submitted, count: deployCountA, score: s.score_a },
            { label: 'Team B', deps: s.team_b_deployments, color: '#a855f7', submitted: s.team_b_submitted, count: deployCountB, score: s.score_b },
          ].map(({ label, deps, color, submitted, count, score }) => (
            <div key={label} className="bg-[#0a1628] border border-white/10 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs font-bold" style={{ color }}>{label}</span>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-slate-500">{count} deployed</span>
                  {submitted && <span className="text-green-400 font-bold">✓ Submitted</span>}
                  {phase === 'revealed' && score && (
                    <span className="font-black" style={{ color }}>{score.total} pts</span>
                  )}
                </div>
              </div>
              <div className="aspect-[560/380]">
                <CityMap deployments={deps} phase={phase} vehicleColor={color}/>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Briefing: single map overview */}
      {phase === 'briefing' && (
        <div className="bg-[#0a1628] border border-[#f5a623]/20 rounded-xl overflow-hidden">
          <div className="px-3 py-2">
            <span className="text-xs font-bold text-[#f5a623]">📍 Incident Overview — Teams are reading the brief</span>
          </div>
          <div className="aspect-[560/380]">
            <CityMap deployments={[]} phase="briefing" vehicleColor="#f5a623"/>
          </div>
        </div>
      )}

      {/* Results */}
      {phase === 'revealed' && s.score_a && s.score_b && (
        <div className="space-y-3">
          <div className={`text-center rounded-2xl px-6 py-4 border-2 ${
            s.score_a.total > s.score_b.total ? 'bg-green-500/10 border-green-500/50' :
            s.score_b.total > s.score_a.total ? 'bg-purple-500/10 border-purple-500/50' :
            'bg-[#f5a623]/10 border-[#f5a623]/50'
          }`}>
            <p className="text-4xl mb-1">🏆</p>
            <p className="text-2xl font-black text-white">
              {s.score_a.total > s.score_b.total ? 'Team A Wins!' :
               s.score_b.total > s.score_a.total ? 'Team B Wins!' : "It's a Tie!"}
            </p>
            <p className="text-slate-400 text-sm mt-1">
              {Math.max(s.score_a.total, s.score_b.total)} vs {Math.min(s.score_a.total, s.score_b.total)} points
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ScoreCard label="Team A" score={s.score_a} color="green"/>
            <ScoreCard label="Team B" score={s.score_b} color="purple"/>
          </div>
        </div>
      )}

      {/* Deployment tracking */}
      {phase === 'active' && (
        <div className="bg-[#0a1628] border border-white/10 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Deployment Log</p>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Team A', deps: s.team_a_deployments, color: 'text-green-400' },
              { label: 'Team B', deps: s.team_b_deployments, color: 'text-purple-400' },
            ].map(({ label, deps, color }) => (
              <div key={label}>
                <p className={`text-xs font-bold ${color} mb-2`}>{label}</p>
                {deps.length === 0
                  ? <p className="text-[10px] text-slate-600 italic">No deployments yet</p>
                  : deps.map(d => {
                    const res = RESOURCES.find(r => r.id === d.resource_id)
                    const inc = INCIDENTS.find(i => i.id === d.incident_id)
                    return (
                      <div key={d.resource_id} className="flex items-center gap-1 text-[10px] text-slate-400 mb-1">
                        <span>{res?.icon}</span>
                        <span>{res?.label}</span>
                        <span className="text-slate-600">→</span>
                        <span>{inc?.icon} {inc?.label}</span>
                      </div>
                    )
                  })
                }
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Links */}
      <div className="bg-[#0a1628] border border-white/10 rounded-xl p-4">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Simulator Links</p>
        <div className="space-y-2">
          {links.map(({ label, url }) => (
            <div key={url} className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-300">{label}</span>
              <div className="flex gap-2">
                <a href={url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs border border-white/10 transition-colors">
                  <ExternalLink size={11}/> Open
                </a>
                <button onClick={() => copy(url)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg text-xs border border-white/10 transition-colors">
                  <Copy size={11}/> Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
