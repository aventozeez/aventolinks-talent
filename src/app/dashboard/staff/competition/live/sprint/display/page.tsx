'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { SP_CHANNEL, type SpLiveState } from '../types'

const TIMER_MS = 30000

function defaultState(): SpLiveState {
  return {
    phase: 'setup',
    teamAName: 'Team A',
    teamBName: 'Team B',
    scoreA: 0,
    scoreB: 0,
    problemTitle: '',
    problemStatement: '',
    stepsDisplay: [],
    stepsCorrect: [],
    timerStartedAt: null,
    timerDuration: TIMER_MS,
    teamASubmitted: false,
    teamBSubmitted: false,
    teamAAnswer: null,
    teamBAnswer: null,
    teamAStepScore: null,
    teamBStepScore: null,
    teamASpeedBonus: null,
    teamBSpeedBonus: null,
    teamASubmittedAt: null,
    teamBSubmittedAt: null,
  }
}

export default function SprintDisplayPage() {
  const [state, setState] = useState<SpLiveState>(defaultState())
  const [countdown, setCountdown] = useState(30)
  const [dots, setDots] = useState('')
  const stateRef = useRef<SpLiveState>(defaultState())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dotsRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const applyState = (s: SpLiveState) => {
    stateRef.current = s
    setState(s)

    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (s.timerStartedAt && s.phase === 'playing') {
      const tick = () => {
        const elapsed = Date.now() - (stateRef.current.timerStartedAt ?? Date.now())
        const rem = Math.max(0, Math.ceil((TIMER_MS - elapsed) / 1000))
        setCountdown(rem)
      }
      tick()
      timerRef.current = setInterval(tick, 200)
    }
  }

  useEffect(() => {
    // Admin is source of truth — no DB read. Ping on subscribe for current state.
    const ch = supabase.channel(SP_CHANNEL)
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (payload) applyState(payload as SpLiveState)
    })
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'ping', payload: {} }).catch(() => {})
      }
    })

    pollRef.current = setInterval(() => {
      try {
        const raw = localStorage.getItem('sc_sp_state')
        if (!raw) return
        const parsed: SpLiveState = JSON.parse(raw)
        if (parsed.phase !== stateRef.current.phase || parsed.problemTitle !== stateRef.current.problemTitle) {
          applyState(parsed)
        }
      } catch { /* ignore */ }
    }, 150)

    dotsRef.current = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500)

    return () => {
      supabase.removeChannel(ch)
      if (timerRef.current) clearInterval(timerRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
      if (dotsRef.current) clearInterval(dotsRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { phase, teamAName, teamBName, scoreA, scoreB, problemTitle, problemStatement, teamASubmitted, teamBSubmitted, stepsCorrect, teamAAnswer, teamBAnswer, teamAStepScore, teamBStepScore, teamASpeedBonus, teamBSpeedBonus } = state

  // ─── SETUP ───────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="min-h-screen bg-[#040c18] flex flex-col items-center justify-center text-white">
        <div className="text-center">
          <div className="text-8xl mb-8">💡</div>
          <h1 className="text-6xl font-black tracking-tight text-purple-300 mb-4">INNOVATION SPRINT</h1>
          <p className="text-2xl text-slate-400">Get ready{dots}</p>
          <div className="mt-12 flex gap-2 justify-center">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-3 h-3 bg-purple-400 rounded-full"
                style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:0.2;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
      </div>
    )
  }

  // ─── DONE ────────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="min-h-screen bg-[#040c18] flex flex-col items-center justify-center text-white px-8">
        <div className="text-6xl mb-6">🏆</div>
        <h1 className="text-5xl font-black text-purple-300 mb-10">SPRINT COMPLETE!</h1>
        <div className="grid grid-cols-3 gap-8 items-center w-full max-w-3xl">
          <FinalPanel name={teamAName} score={scoreA} color="blue" winner={scoreA > scoreB} />
          <div className="text-center text-4xl font-black text-slate-600">VS</div>
          <FinalPanel name={teamBName} score={scoreB} color="purple" winner={scoreB > scoreA} />
        </div>
        <p className="mt-10 text-2xl font-bold text-slate-400">
          {scoreA === scoreB ? "It's a Tie!" : `${scoreA > scoreB ? teamAName : teamBName} Wins!`}
        </p>
      </div>
    )
  }

  // ─── PLAYING ─────────────────────────────────────────────────────────────────
  if (phase === 'playing') {
    const isRed = countdown <= 5
    return (
      <div className="min-h-screen bg-[#040c18] text-white flex flex-col">
        {/* Header scoreboard */}
        <div className="bg-[#07101e] border-b border-purple-500/20 px-12 py-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <TeamScore name={teamAName} score={scoreA} color="blue" />
            <div className="text-center">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">PROBLEM</p>
              <p className="text-lg font-black text-slate-300 max-w-[200px] text-center line-clamp-1">{problemTitle}</p>
            </div>
            <TeamScore name={teamBName} score={scoreB} color="purple" />
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-12 py-8 gap-8">
          {/* Problem statement */}
          <div className="w-full max-w-4xl text-center">
            <p className="text-3xl font-bold text-white leading-relaxed">{problemStatement}</p>
          </div>

          {/* Countdown circle */}
          <div className="relative w-40 h-40 flex items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" width="160" height="160" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="60" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
              <circle
                cx="80" cy="80" r="60" fill="none"
                stroke={isRed ? '#ef4444' : '#a78bfa'}
                strokeWidth="8"
                strokeDasharray={2 * Math.PI * 60}
                strokeDashoffset={2 * Math.PI * 60 - (countdown / 30) * (2 * Math.PI * 60)}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.2s linear, stroke 0.3s' }}
              />
            </svg>
            <span className={`text-6xl font-black ${isRed ? 'text-red-400' : 'text-purple-300'}`}>{countdown}</span>
          </div>

          {/* Submission status */}
          <div className="grid grid-cols-2 gap-6 w-full max-w-2xl">
            <SubmitStatus name={teamAName} submitted={teamASubmitted} color="blue" />
            <SubmitStatus name={teamBName} submitted={teamBSubmitted} color="purple" />
          </div>
        </div>
      </div>
    )
  }

  // ─── REVEAL ──────────────────────────────────────────────────────────────────
  if (phase === 'reveal') {
    return (
      <div className="min-h-screen bg-[#040c18] text-white flex flex-col">
        {/* Header */}
        <div className="bg-[#07101e] border-b border-purple-500/20 px-12 py-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <TeamScore name={teamAName} score={scoreA} color="blue" />
            <div className="text-center">
              <p className="text-2xl font-black text-purple-300">REVEAL</p>
              <p className="text-sm text-slate-400">{problemTitle}</p>
            </div>
            <TeamScore name={teamBName} score={scoreB} color="purple" />
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8 py-8 gap-6">
          <div className="grid grid-cols-2 gap-6 w-full max-w-5xl">
            {/* Team A reveal */}
            <RevealPanel
              teamName={teamAName}
              color="blue"
              answer={teamAAnswer ?? []}
              correct={stepsCorrect}
              stepScore={teamAStepScore ?? 0}
              speedBonus={teamASpeedBonus ?? 0}
            />
            {/* Team B reveal */}
            <RevealPanel
              teamName={teamBName}
              color="purple"
              answer={teamBAnswer ?? []}
              correct={stepsCorrect}
              stepScore={teamBStepScore ?? 0}
              speedBonus={teamBSpeedBonus ?? 0}
            />
          </div>

          {/* Correct order */}
          <div className="w-full max-w-5xl bg-[#070f1c] border border-white/10 rounded-2xl p-5">
            <h3 className="text-xs text-slate-400 uppercase tracking-widest mb-4 text-center">Correct Order</h3>
            <div className="grid grid-cols-5 gap-3">
              {stepsCorrect.map((step, i) => (
                <div key={i} className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-purple-400 font-bold mb-1">Step {i + 1}</p>
                  <p className="text-xs text-slate-300">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}

function TeamScore({ name, score, color }: { name: string; score: number; color: 'blue' | 'purple' }) {
  return (
    <div className="text-center px-4 py-2">
      <p className="text-sm text-slate-400 truncate max-w-[160px]">{name}</p>
      <p className={`text-5xl font-black ${color === 'blue' ? 'text-blue-300' : 'text-purple-300'}`}>{score}</p>
    </div>
  )
}

function SubmitStatus({ name, submitted, color }: { name: string; submitted: boolean; color: 'blue' | 'purple' }) {
  const c = color === 'blue' ? 'border-blue-400/40 bg-blue-500/10' : 'border-purple-400/40 bg-purple-500/10'
  const tc = color === 'blue' ? 'text-blue-300' : 'text-purple-300'
  return (
    <div className={`rounded-2xl border-2 p-6 text-center ${submitted ? c : 'border-white/10 bg-white/5'}`}>
      <p className={`text-xl font-bold ${tc} truncate`}>{name}</p>
      <p className={`text-2xl font-black mt-2 ${submitted ? 'text-green-400' : 'text-slate-400 animate-pulse'}`}>
        {submitted ? '✓ Submitted' : 'Working…'}
      </p>
    </div>
  )
}

function RevealPanel({ teamName, color, answer, correct, stepScore, speedBonus }: {
  teamName: string
  color: 'blue' | 'purple'
  answer: string[]
  correct: string[]
  stepScore: number
  speedBonus: number
}) {
  const border = color === 'blue' ? 'border-blue-500/30' : 'border-purple-500/30'
  const tc = color === 'blue' ? 'text-blue-300' : 'text-purple-300'

  return (
    <div className={`bg-[#070f1c] border-2 ${border} rounded-2xl p-5`}>
      <h3 className={`text-xl font-black ${tc} mb-4 truncate`}>{teamName}</h3>
      <div className="space-y-2 mb-5">
        {answer.map((step, i) => {
          const isCorrect = step === correct[i]
          return (
            <div key={i} className={`flex items-center gap-2 p-3 rounded-xl ${isCorrect ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
              <span className={`text-lg ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>{isCorrect ? '✓' : '✗'}</span>
              <div>
                <p className="text-xs text-slate-500">Step {i + 1}</p>
                <p className={`text-sm font-medium ${isCorrect ? 'text-green-300' : 'text-red-300'}`}>{step}</p>
              </div>
            </div>
          )
        })}
      </div>
      <div className={`pt-4 border-t border-white/10 text-center`}>
        <p className="text-sm text-slate-400">Steps <span className={`${tc} font-bold`}>+{stepScore}</span> · Speed <span className="text-yellow-400 font-bold">+{speedBonus}</span></p>
        <p className={`text-4xl font-black ${tc} mt-1`}>+{stepScore + speedBonus}</p>
      </div>
    </div>
  )
}

function FinalPanel({ name, score, color, winner }: { name: string; score: number; color: 'blue' | 'purple'; winner: boolean }) {
  const c = color === 'blue' ? 'border-blue-400 bg-blue-500/20 text-blue-300' : 'border-purple-400 bg-purple-500/20 text-purple-300'
  return (
    <div className={`text-center p-8 rounded-2xl border-2 ${winner ? c : 'border-white/10 bg-white/5'}`}>
      <p className="text-lg text-slate-400 mb-2 truncate">{name}</p>
      <p className={`text-8xl font-black ${color === 'blue' ? 'text-blue-300' : 'text-purple-300'}`}>{score}</p>
      {winner && <p className="text-3xl mt-3">🏆</p>}
    </div>
  )
}
