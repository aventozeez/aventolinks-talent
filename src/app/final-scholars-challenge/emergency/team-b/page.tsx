'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Send, CheckCircle, AlertTriangle } from 'lucide-react'
import {
  EmergencyState, Deployment,
  INCIDENTS, RESOURCES,
  defaultEmergencyState, getEmergencyState, saveEmergencyState,
  subscribeToEmergency, broadcastEmergency,
  EMRG_DURATION_MS,
} from '@/lib/fsc-emergency'
import CityMap from '../CityMap'

const TEAM  = 'b' as const
const COLOR = '#a855f7'
const LABEL = 'Team B'

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function EmergencyTeamBPage() {
  const [state,       setState]      = useState<EmergencyState>(defaultEmergencyState())
  const [loading,     setLoading]    = useState(true)
  const [selected,    setSelected]   = useState<string | null>(null)
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [submitting,  setSubmitting] = useState(false)
  const [timerMs,     setTimerMs]    = useState(0)
  const timerRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    const sub = subscribeToEmergency(s => {
      setState(s); setLoading(false)
      if (s.phase === 'briefing') setDeployments([])
    })
    return sub.unsubscribe
  }, [])

  useEffect(() => {
    clearInterval(timerRef.current)
    if (!state.timer_start || state.phase !== 'active') { setTimerMs(0); return }
    const tick = () => setTimerMs(Math.max(0, EMRG_DURATION_MS - (Date.now() - state.timer_start!)))
    tick(); timerRef.current = setInterval(tick, 300)
    return () => clearInterval(timerRef.current)
  }, [state.timer_start, state.phase])

  const broadcastDeployments = useCallback(async (deps: Deployment[]) => {
    const latest = await getEmergencyState()
    if (!latest) return
    const updated: EmergencyState = { ...latest, team_b_deployments: deps }
    broadcastEmergency(updated); await saveEmergencyState(updated)
  }, [])

  const deploy = async (incidentId: string) => {
    if (!selected || state.phase !== 'active' || state.team_b_submitted) return
    const next = [
      ...deployments.filter(d => d.resource_id !== selected),
      { resource_id: selected, incident_id: incidentId, deployed_at: Date.now() },
    ]
    setDeployments(next); setSelected(null)
    await broadcastDeployments(next)
  }

  const submit = async () => {
    if (state.team_b_submitted) return
    setSubmitting(true)
    const latest = await getEmergencyState()
    if (!latest) { setSubmitting(false); return }
    const updated: EmergencyState = { ...latest, team_b_deployments: deployments, team_b_submitted: true }
    broadcastEmergency(updated); await saveEmergencyState(updated)
    setState(updated); setSubmitting(false)
  }

  const submitted = state.team_b_submitted
  const phase     = state.phase
  const timerWarn = timerMs > 0 && timerMs < 30_000

  if (loading) return (
    <div className="min-h-screen bg-[#060f1f] flex items-center justify-center">
      <Loader2 className="animate-spin" size={40} style={{ color: COLOR }}/>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#060f1f] text-white flex flex-col select-none">

      <div className="border-b px-4 py-3 shrink-0" style={{ borderColor: `${COLOR}33`, background: '#0a1628' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: COLOR }}>{LABEL}</p>
            <h1 className="text-base font-black text-white">🚨 Emergency Response</h1>
          </div>
          {phase === 'active' && (
            <div className={`text-2xl font-black ${timerWarn ? 'text-red-400 animate-pulse' : 'text-[#f5a623]'}`}>
              {fmt(timerMs)}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 bg-[#060f1f]" style={{ height: '42vw', maxHeight: 240, minHeight: 160 }}>
        <CityMap deployments={deployments} phase={phase} vehicleColor={COLOR}/>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 max-w-lg mx-auto w-full">

        {phase === 'idle' && (
          <div className="text-center py-12 space-y-3">
            <div className="text-6xl">🚨</div>
            <h2 className="text-xl font-black text-white">Standby</h2>
            <p className="text-slate-400 text-sm">Waiting for admin to begin…</p>
          </div>
        )}

        {phase === 'briefing' && (
          <div className="space-y-4">
            <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-2xl p-4">
              <p className="text-[#f5a623] font-black text-sm mb-2">📋 Situation Report</p>
              <p className="text-white text-sm leading-relaxed">
                A <strong>5-storey office block</strong> is ablaze in the city centre with workers trapped inside.
                Simultaneously, a <strong>multi-vehicle road crash</strong> has occurred nearby with multiple casualties.
              </p>
              <p className="text-slate-400 text-xs mt-3">You have <strong className="text-white">3 minutes</strong> to deploy your emergency resources to the right incidents.</p>
            </div>
            <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Incidents & What's Needed</p>
              {INCIDENTS.map(inc => (
                <div key={inc.id} className="flex items-start gap-3 mb-3 last:mb-0">
                  <span className="text-2xl mt-0.5">{inc.icon}</span>
                  <div>
                    <p className="font-bold text-white text-sm">{inc.label}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {inc.required.map(r => {
                        const res = RESOURCES.find(x => x.type === r)
                        return <span key={r} className="text-[10px] bg-white/10 text-slate-300 px-2 py-0.5 rounded-full">{res?.icon} {r.replace('_', ' ')}</span>
                      })}
                    </div>
                    <p className="text-[10px] text-[#f5a623] mt-1">Up to {inc.points} pts + time bonus</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-[#f5a623]/10 border border-[#f5a623]/30 rounded-xl p-3 text-center">
              <p className="text-[#f5a623] font-bold text-sm">⏳ Timer starts when admin gives the signal…</p>
            </div>
          </div>
        )}

        {phase === 'active' && !submitted && (
          <div className="space-y-4">
            <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Your Resources — tap to select</p>
              <div className="grid grid-cols-3 gap-2">
                {RESOURCES.map(res => {
                  const dep      = deployments.find(d => d.resource_id === res.id)
                  const incLabel = dep ? INCIDENTS.find(i => i.id === dep.incident_id)?.icon ?? '' : ''
                  const isSel    = selected === res.id
                  return (
                    <button key={res.id}
                      onClick={() => setSelected(isSel ? null : res.id)}
                      className={`relative flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-bold transition-all ${
                        isSel ? 'border-[#f5a623] bg-[#f5a623]/15 scale-105' :
                        dep   ? 'border-purple-500/40 bg-purple-500/10 text-purple-300' :
                                'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}>
                      <span className="text-xl">{res.icon}</span>
                      <span className="text-[9px] leading-tight text-center">{res.label}</span>
                      {dep && <span className="text-[9px] text-purple-400">→ {incLabel}</span>}
                      {isSel && <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#f5a623] rounded-full text-[8px] text-[#0a1628] flex items-center justify-center font-black">✓</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                {selected ? 'Deploy selected resource → tap an incident' : 'Select a resource first'}
              </p>
              <div className="space-y-3">
                {INCIDENTS.map(inc => {
                  const assignedHere = deployments.filter(d => d.incident_id === inc.id)
                  return (
                    <button key={inc.id}
                      onClick={() => deploy(inc.id)}
                      disabled={!selected}
                      className={`w-full text-left rounded-xl border p-4 transition-all ${
                        selected
                          ? 'border-[#f5a623]/50 bg-[#f5a623]/5 hover:bg-[#f5a623]/10 active:scale-95'
                          : 'border-white/10 bg-white/5'
                      }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{inc.icon}</span>
                          <div>
                            <p className="font-bold text-white text-sm">{inc.label}</p>
                            <p className="text-[10px] text-slate-500">Needs: {inc.required.map(r => RESOURCES.find(x=>x.type===r)?.icon).join(' ')}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-[#f5a623] font-bold">{inc.points} pts</p>
                          {assignedHere.length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap justify-end">
                              {assignedHere.map(d => (
                                <span key={d.resource_id} className="text-xs">{RESOURCES.find(r=>r.id===d.resource_id)?.icon}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <button onClick={submit} disabled={submitting || deployments.length === 0}
              className="w-full flex items-center justify-center gap-2 py-4 font-black rounded-2xl text-lg disabled:opacity-40 shadow-lg transition-colors"
              style={{ background: COLOR, color: 'white' }}>
              {submitting ? <Loader2 size={20} className="animate-spin"/> : <Send size={18}/>}
              Submit Response Plan
            </button>
          </div>
        )}

        {phase === 'active' && submitted && (
          <div className="text-center py-14 space-y-4">
            <CheckCircle size={56} className="mx-auto" style={{ color: COLOR }}/>
            <h2 className="text-xl font-black" style={{ color: COLOR }}>Response Plan Submitted!</h2>
            <p className="text-slate-400 text-sm">Your vehicles are en route. Waiting for results…</p>
            {timerWarn && <p className="text-red-400 text-xs animate-pulse flex items-center justify-center gap-1"><AlertTriangle size={12}/> {fmt(timerMs)} remaining</p>}
          </div>
        )}

        {phase === 'revealed' && state.score_b && (
          <div className="space-y-4">
            <div className="rounded-2xl p-5 text-center border-2" style={{ borderColor: `${COLOR}80`, background: `${COLOR}15` }}>
              <p className="text-sm font-bold mb-1" style={{ color: COLOR }}>{LABEL} — Final Score</p>
              <p className="text-7xl font-black" style={{ color: COLOR }}>{state.score_b.total}</p>
              {state.score_a && (
                <p className="text-slate-400 text-sm mt-2">
                  {state.score_b.total > state.score_a.total ? '🏆 You won!' :
                   state.score_b.total < state.score_a.total ? `Team A scored ${state.score_a.total}` :
                   "🤝 It's a tie!"}
                </p>
              )}
            </div>
            <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Breakdown</p>
              {INCIDENTS.map(inc => {
                const s = state.score_b!.incident_scores.find(x => x.incident_id === inc.id)
                return (
                  <div key={inc.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{inc.icon} {inc.label}</span>
                    <div className="text-right">
                      <span className="font-bold" style={{ color: COLOR }}>+{s?.base_pts ?? 0}</span>
                      {(s?.time_bonus ?? 0) > 0 && <span className="text-[10px] text-[#f5a623] ml-1">+{s!.time_bonus} speed</span>}
                    </div>
                  </div>
                )
              })}
              {state.score_b.coverage_bonus > 0 && (
                <div className="flex justify-between text-sm text-green-400 border-t border-white/10 pt-2 mt-1">
                  <span>✅ All incidents covered</span><span>+{state.score_b.coverage_bonus}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
