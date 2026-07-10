'use client'
import { useEffect, useState } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'
import { FSC_CHANNEL, FSCState, getMatchState } from '@/lib/fsc-live'
import ModeratorOverlay from '@/components/moderator-overlay'

export default function FSCModerator() {
  const [s, setS] = useState<FSCState | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    getMatchState().then(st => { if (st) setS(st) })
    const unsubMod = wsSubscribe(FSC_CHANNEL + ':mod', p => {
      setConnected(true)
      if (p) setS(p as FSCState)
    })
    const unsubReload = wsSubscribe(FSC_CHANNEL + ':reload', () => {
      if (typeof window !== 'undefined') window.location.reload()
    })
    return () => { unsubMod(); unsubReload() }
  }, [])

  // Derive overlay props from state
  let round = 'Preliminary', roundEmoji = '📖', phaseLabel = 'Waiting for admin…'
  let currentQuestion: string | null = null, currentAnswer: string | null = null
  let nextQuestion: string | null = null, nextAnswer: string | null = null
  let extra: React.ReactNode = null

  if (s) {
    if (s.round === 'rapid_fire') {
      round = 'Rapid Fire'; roundEmoji = '⚡'
      const isA = s.rf_phase === 'a_playing' || s.rf_phase === 'announce_a' || s.rf_phase === 'score_a'
      const qs = isA ? s.rf_questions : s.rf_questions_b
      const idx = s.rf_q_index
      const q = qs[idx], nq = qs[idx + 1]
      phaseLabel =
        s.rf_phase === 'a_playing' ? `${s.team_a_name} playing`
        : s.rf_phase === 'b_playing' ? `${s.team_b_name} playing`
        : s.rf_phase === 'announce_a' ? `${s.team_a_name} — up next`
        : s.rf_phase === 'announce_b' ? `${s.team_b_name} — up next`
        : s.rf_phase === 'score_a' ? `${s.team_a_name} score`
        : s.rf_phase === 'score_b' ? `${s.team_b_name} score`
        : s.rf_phase === 'compare' ? 'Head-to-head'
        : s.rf_phase === 'idle' ? 'Instructions'
        : 'Round done'
      if (s.rf_phase === 'a_playing' || s.rf_phase === 'b_playing') {
        currentQuestion = q ? `Q${idx + 1}: ${q.question}` : null
        currentAnswer = q?.answer ?? null
        nextQuestion = nq?.question ?? null
        nextAnswer = nq?.answer ?? null
      }
    } else if (s.round === 'buzzer') {
      round = 'Buzzer'; roundEmoji = '🔔'
      const idx = s.bz_q_index
      const q = s.bz_questions[idx], nq = s.bz_questions[idx + 1]
      phaseLabel =
        s.bz_phase === 'showing' ? 'Waiting for buzz'
        : s.bz_phase === 'buzzed_a' ? `${s.team_a_name} buzzed`
        : s.bz_phase === 'buzzed_b' ? `${s.team_b_name} buzzed`
        : s.bz_phase === 'second_chance' ? 'Second chance'
        : s.bz_phase === 'revealed' ? 'Answer revealed'
        : s.bz_phase === 'idle' ? 'Instructions'
        : 'Round done'
      if (q && s.bz_phase !== 'idle' && s.bz_phase !== 'done') {
        currentQuestion = `Q${idx + 1}: ${q.question}`
        currentAnswer = q.answer
        nextQuestion = nq?.question ?? null
        nextAnswer = nq?.answer ?? null
      }
    } else if (s.round === 'innovation_sprint') {
      round = 'Innovation Sprint'; roundEmoji = '💡'
      const idx = s.is_problem_index
      const p = s.is_problems[idx], np = s.is_problems[idx + 1]
      phaseLabel =
        s.is_phase === 'idle' && idx === 0 && !s.is_intro_done ? 'Instructions'
        : s.is_phase === 'idle' ? `Problem ${idx + 1} statement`
        : s.is_phase === 'ready' ? `Problem ${idx + 1} — get set`
        : s.is_phase === 'working' ? `Problem ${idx + 1} — arranging`
        : s.is_phase === 'collecting' ? `Problem ${idx + 1} — collecting`
        : s.is_phase === 'solution' ? `Problem ${idx + 1} — solution`
        : s.is_phase === 'revealed' ? `Problem ${idx + 1} — score`
        : s.is_phase === 'compare' ? 'Head-to-head'
        : 'Round done'
      if (p) {
        currentQuestion = `Problem ${idx + 1}: ${p.statement}`
        currentAnswer = null
        nextQuestion = np?.statement ?? null
        extra = (
          <div className="rounded-xl border-2 border-yellow-400/60 bg-yellow-400/15 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-yellow-200 mb-1">Correct step order</p>
            <ol className="space-y-1">
              {p.steps.map((st, i) => (
                <li key={i} className="flex gap-2 text-sm leading-snug">
                  <span className="text-yellow-300 shrink-0 w-5 font-black">{i + 1}.</span>
                  <span className="text-yellow-50">{st}</span>
                </li>
              ))}
            </ol>
          </div>
        )
      }
    } else if (s.round === 'idle') {
      round = 'Preliminary'; phaseLabel = `${s.team_a_name} vs ${s.team_b_name}`
    } else if (s.round === 'finished') {
      round = 'Preliminary'; phaseLabel = 'Match complete'
    }
  }

  return (
    <div className="fixed inset-0 bg-black">
      <iframe
        src="/final-scholars-challenge/audience"
        className="absolute inset-0 w-full h-full border-0"
        title="Audience view (moderator mirror)"
      />
      <ModeratorOverlay
        round={round} roundEmoji={roundEmoji} phaseLabel={phaseLabel}
        currentQuestion={currentQuestion} currentAnswer={currentAnswer}
        nextQuestion={nextQuestion} nextAnswer={nextAnswer}
        connected={connected} extra={extra}
      />
    </div>
  )
}
