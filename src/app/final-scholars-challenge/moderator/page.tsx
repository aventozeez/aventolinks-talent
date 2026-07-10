'use client'
import { useEffect, useState } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'
import { FSC_CHANNEL, FSCState, getMatchState } from '@/lib/fsc-live'
import ModeratorShell, { ModCard } from '@/components/moderator-shell'

const RF_MS = 60_000
const IS_MS = 60_000
const BZ_MS = 10_000

function fmtSec(ms: number) { return `${Math.max(0, Math.ceil(ms / 1000))}s` }

export default function FSCModerator() {
  const [s, setS] = useState<FSCState | null>(null)
  const [connected, setConnected] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    getMatchState().then(st => { if (st) setS(st) })
    const unsubMod = wsSubscribe(FSC_CHANNEL + ':mod', p => {
      setConnected(true)
      if (p) setS(p as FSCState)
    })
    const unsubReload = wsSubscribe(FSC_CHANNEL + ':reload', () => {
      if (typeof window !== 'undefined') window.location.reload()
    })
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => { unsubMod(); unsubReload(); clearInterval(t) }
  }, [])

  if (!s) {
    return (
      <ModeratorShell round="Preliminary" phaseLabel="Waiting for the admin…" connected={connected}
        nextUp="Admin will open a match on their control screen">
        <div className="text-center text-slate-400 py-20">Connecting…</div>
      </ModeratorShell>
    )
  }

  const roundLabel =
    s.round === 'rapid_fire' ? 'Rapid Fire'
    : s.round === 'buzzer' ? 'Buzzer'
    : s.round === 'innovation_sprint' ? 'Innovation Sprint'
    : s.round === 'mystery_chain' ? 'Mystery Chain'
    : s.round === 'audio_visual' ? 'Audio Visual'
    : s.round === 'finished' ? 'Finished'
    : 'Between rounds'

  const roundEmoji =
    s.round === 'rapid_fire' ? '⚡'
    : s.round === 'buzzer' ? '🔔'
    : s.round === 'innovation_sprint' ? '💡'
    : s.round === 'mystery_chain' ? '🔒'
    : s.round === 'audio_visual' ? '📺'
    : '📖'

  if (s.round === 'idle' || s.round === 'finished') {
    return (
      <ModeratorShell round={roundLabel} roundEmoji={roundEmoji} phaseLabel={s.round === 'finished' ? 'Match complete' : 'Waiting to start'} connected={connected}
        nextUp={s.round === 'finished' ? 'Awaiting official winner declaration' : `Match: ${s.team_a_name} vs ${s.team_b_name}`}>
        <ModCard label="Match">
          <p className="text-3xl md:text-5xl font-black">{s.team_a_name} <span className="text-slate-500">vs</span> {s.team_b_name}</p>
          <p className="text-slate-400 mt-3 text-base md:text-lg">Admin will announce the first round shortly. Sit tight and stay ready.</p>
        </ModCard>
      </ModeratorShell>
    )
  }

  // ── RAPID FIRE ────────────────────────────────────────────────────────────
  if (s.round === 'rapid_fire') {
    const isA = s.rf_phase === 'a_playing' || s.rf_phase === 'announce_a' || s.rf_phase === 'score_a'
    const teamName = isA ? s.team_a_name : s.team_b_name
    const qs = isA ? s.rf_questions : s.rf_questions_b
    const idx = s.rf_q_index
    const q = qs[idx]
    const nextQ = qs[idx + 1]
    const playing = s.rf_phase === 'a_playing' || s.rf_phase === 'b_playing'
    const timeLeft = playing && s.rf_timer_start ? Math.max(0, RF_MS - (now - s.rf_timer_start)) : RF_MS

    const phaseLabel =
      s.rf_phase === 'idle' ? 'Instructions — waiting'
      : s.rf_phase === 'announce_a' ? `${s.team_a_name} — up next`
      : s.rf_phase === 'a_playing' ? `${s.team_a_name} playing`
      : s.rf_phase === 'score_a' ? `${s.team_a_name} — score reveal`
      : s.rf_phase === 'announce_b' ? `${s.team_b_name} — up next`
      : s.rf_phase === 'b_playing' ? `${s.team_b_name} playing`
      : s.rf_phase === 'score_b' ? `${s.team_b_name} — score reveal`
      : s.rf_phase === 'compare' ? 'Head-to-head compare'
      : 'Round complete'

    const nextUp =
      s.rf_phase === 'idle' ? `Read the rules, then ${s.team_a_name} plays first`
      : s.rf_phase === 'announce_a' ? `Team A starts — 60s, ${s.rf_questions.length} questions`
      : s.rf_phase === 'a_playing' ? (nextQ ? `Next question: ${nextQ.question}` : `Team A finishes — ${s.team_b_name} up after score`)
      : s.rf_phase === 'score_a' ? `${s.team_b_name} plays next`
      : s.rf_phase === 'announce_b' ? `Team B starts — 60s, ${s.rf_questions_b.length} questions`
      : s.rf_phase === 'b_playing' ? (nextQ ? `Next question: ${nextQ.question}` : 'Score reveal after this one')
      : s.rf_phase === 'score_b' ? 'Head-to-head compare next'
      : s.rf_phase === 'compare' ? 'Round complete after this'
      : 'Buzzer round is next'

    return (
      <ModeratorShell round="Rapid Fire" roundEmoji="⚡" phaseLabel={phaseLabel}
        stepHint={playing ? `Q ${idx + 1} / ${qs.length}` : undefined} nextUp={nextUp} connected={connected}>
        <div className="grid gap-4 md:gap-6 max-w-4xl mx-auto">
          {playing && q ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-lg md:text-2xl font-black text-white/80">{teamName}</p>
                <p className={`text-4xl md:text-6xl font-black tabular-nums ${timeLeft < 10_000 ? 'text-red-400' : 'text-yellow-300'}`}>{fmtSec(timeLeft)}</p>
              </div>
              <ModCard label={`Question ${idx + 1} of ${qs.length}`} tone="question">
                <p className="text-2xl md:text-4xl font-black leading-snug">{q.question}</p>
              </ModCard>
              <ModCard label="Answer" tone="answer">
                <p className="text-3xl md:text-5xl font-black text-yellow-200 leading-tight">{q.answer}</p>
              </ModCard>
              {nextQ && (
                <ModCard label="On deck">
                  <p className="text-base md:text-lg text-white/70 leading-snug">{nextQ.question}</p>
                </ModCard>
              )}
            </>
          ) : (
            <ModCard label="Standing by">
              <p className="text-2xl md:text-3xl font-black">{phaseLabel}</p>
              <p className="text-slate-400 mt-3 text-base md:text-lg">Wait for the admin to advance. Once the timer starts you'll see each question with its answer here.</p>
            </ModCard>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-green-300">{s.team_a_name}</p>
              <p className="text-3xl md:text-4xl font-black text-white tabular-nums">{s.rf_score_a}</p>
              <p className="text-xs text-slate-400">{s.rf_correct_a} correct</p>
            </div>
            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-300">{s.team_b_name}</p>
              <p className="text-3xl md:text-4xl font-black text-white tabular-nums">{s.rf_score_b}</p>
              <p className="text-xs text-slate-400">{s.rf_correct_b} correct</p>
            </div>
          </div>
        </div>
      </ModeratorShell>
    )
  }

  // ── BUZZER ─────────────────────────────────────────────────────────────────
  if (s.round === 'buzzer') {
    const idx = s.bz_q_index
    const q = s.bz_questions[idx]
    const nextQ = s.bz_questions[idx + 1]
    const buzzed = s.bz_phase === 'buzzed_a' || s.bz_phase === 'buzzed_b'
    const buzzTeam = s.bz_phase === 'buzzed_a' ? s.team_a_name : s.bz_phase === 'buzzed_b' ? s.team_b_name : null
    const secTeam = s.bz_second_chance_team === 'a' ? s.team_a_name : s.bz_second_chance_team === 'b' ? s.team_b_name : null
    const timeLeft = buzzed && s.bz_buzz_start ? Math.max(0, BZ_MS - (now - s.bz_buzz_start)) : BZ_MS

    const phaseLabel =
      s.bz_phase === 'idle' ? 'Instructions — waiting'
      : s.bz_phase === 'showing' ? 'Question live — waiting for a buzz'
      : s.bz_phase === 'buzzed_a' ? `${s.team_a_name} buzzed — 10s to answer`
      : s.bz_phase === 'buzzed_b' ? `${s.team_b_name} buzzed — 10s to answer`
      : s.bz_phase === 'second_chance' ? `${secTeam} — second chance`
      : s.bz_phase === 'revealed' ? 'Answer revealed'
      : 'Round complete'

    const nextUp = s.bz_phase === 'done'
      ? 'Innovation Sprint is next'
      : nextQ ? `Next question: ${nextQ.question}` : 'Last question — Innovation Sprint after this'

    return (
      <ModeratorShell round="Buzzer" roundEmoji="🔔" phaseLabel={phaseLabel}
        stepHint={`Q ${idx + 1} / ${s.bz_questions.length}`} nextUp={nextUp} connected={connected}>
        <div className="grid gap-4 md:gap-6 max-w-4xl mx-auto">
          {q && s.bz_phase !== 'done' ? (
            <>
              {buzzed && (
                <div className="rounded-2xl border-2 border-amber-400/70 bg-amber-400/15 p-4 text-center">
                  <p className="text-amber-200 font-black text-lg md:text-2xl">🔔 {buzzTeam} buzzed — {fmtSec(timeLeft)} to answer</p>
                </div>
              )}
              <ModCard label={`Question ${idx + 1} of ${s.bz_questions.length}`} tone="question">
                <p className="text-2xl md:text-4xl font-black leading-snug">{q.question}</p>
              </ModCard>
              <ModCard label="Answer" tone="answer">
                <p className="text-3xl md:text-5xl font-black text-yellow-200 leading-tight">{q.answer}</p>
              </ModCard>
              {nextQ && (
                <ModCard label="On deck">
                  <p className="text-base md:text-lg text-white/70 leading-snug">{nextQ.question}</p>
                </ModCard>
              )}
            </>
          ) : (
            <ModCard label="Standing by">
              <p className="text-2xl md:text-3xl font-black">{phaseLabel}</p>
            </ModCard>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-green-300">{s.team_a_name}</p>
              <p className="text-3xl md:text-4xl font-black text-white tabular-nums">{s.bz_score_a}</p>
            </div>
            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-300">{s.team_b_name}</p>
              <p className="text-3xl md:text-4xl font-black text-white tabular-nums">{s.bz_score_b}</p>
            </div>
          </div>
        </div>
      </ModeratorShell>
    )
  }

  // ── INNOVATION SPRINT ─────────────────────────────────────────────────────
  if (s.round === 'innovation_sprint') {
    const idx = s.is_problem_index
    const p = s.is_problems[idx]
    const nextP = s.is_problems[idx + 1]
    const playing = s.is_phase === 'working'
    const timeLeft = playing && s.is_timer_start ? Math.max(0, IS_MS - (now - s.is_timer_start)) : IS_MS

    const phaseLabel =
      s.is_phase === 'idle' && idx === 0 && !s.is_intro_done ? 'Instructions — read the rules'
      : s.is_phase === 'idle' ? `Problem ${idx + 1} — read the statement`
      : s.is_phase === 'ready' ? `Problem ${idx + 1} — get set`
      : s.is_phase === 'working' ? `Problem ${idx + 1} — teams arranging`
      : s.is_phase === 'collecting' ? `Problem ${idx + 1} — collecting answers`
      : s.is_phase === 'solution' ? `Problem ${idx + 1} — correct steps`
      : s.is_phase === 'revealed' ? `Problem ${idx + 1} — score reveal`
      : s.is_phase === 'compare' ? 'Head-to-head compare'
      : 'Round complete'

    const nextUp =
      s.is_phase === 'idle' && idx === 0 && !s.is_intro_done ? 'Read the rules, admin will then reveal Problem 1'
      : s.is_phase === 'idle' ? `Read the problem statement aloud, then admin marks Ready`
      : s.is_phase === 'ready' ? `Teams get 60s to arrange 5 steps`
      : s.is_phase === 'working' ? 'Admin will stop the timer when both teams submit'
      : s.is_phase === 'collecting' ? 'Solution reveal next'
      : s.is_phase === 'solution' ? 'Score reveal next'
      : s.is_phase === 'revealed' ? (nextP ? `Problem ${idx + 2} next` : 'Head-to-head compare next')
      : s.is_phase === 'compare' ? 'Round complete after this'
      : 'Mystery Chain is next'

    return (
      <ModeratorShell round="Innovation Sprint" roundEmoji="💡" phaseLabel={phaseLabel}
        stepHint={`Problem ${idx + 1} / ${s.is_problems.length}`} nextUp={nextUp} connected={connected}>
        <div className="grid gap-4 md:gap-6 max-w-4xl mx-auto">
          {playing && (
            <p className={`text-center text-6xl md:text-8xl font-black tabular-nums ${timeLeft < 10_000 ? 'text-red-400' : 'text-yellow-300'}`}>{fmtSec(timeLeft)}</p>
          )}
          {p && (
            <>
              <ModCard label={`Problem ${idx + 1} statement`} tone="question">
                <p className="text-xl md:text-3xl font-black leading-snug whitespace-pre-wrap">{p.statement}</p>
              </ModCard>
              <ModCard label="Correct step order" tone="answer">
                <ol className="space-y-2">
                  {p.steps.map((st, i) => (
                    <li key={i} className="flex gap-3 text-lg md:text-2xl font-bold leading-snug">
                      <span className="text-yellow-300 shrink-0 w-8">{i + 1}.</span>
                      <span className="text-white">{st}</span>
                    </li>
                  ))}
                </ol>
              </ModCard>
              {nextP && (
                <ModCard label="Next problem preview">
                  <p className="text-sm md:text-base text-white/70 leading-snug whitespace-pre-wrap">{nextP.statement}</p>
                </ModCard>
              )}
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-green-300">{s.team_a_name}</p>
              <p className="text-3xl md:text-4xl font-black text-white tabular-nums">{s.is_score_a}</p>
            </div>
            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-300">{s.team_b_name}</p>
              <p className="text-3xl md:text-4xl font-black text-white tabular-nums">{s.is_score_b}</p>
            </div>
          </div>
        </div>
      </ModeratorShell>
    )
  }

  return (
    <ModeratorShell round={roundLabel} roundEmoji={roundEmoji} phaseLabel="Waiting for state" connected={connected}
      nextUp="Admin will advance shortly">
      <ModCard><p className="text-slate-400">This round is handled by a different screen. Check the room monitor.</p></ModCard>
    </ModeratorShell>
  )
}
