'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { wsBroadcast } from '@/lib/ws-sync'

const CHANNEL = 'mc:state'
const MC_TIME_MS = 60_000 // 60 seconds
const MC_PTS = 10

type MCPhase =
  | 'setup' | 'intro'
  | 'pick_A' | 'story_A' | 'a_playing'
  | 'pick_B' | 'story_B' | 'b_playing'
  | 'pick_C' | 'story_C' | 'c_playing'
  | 'done'

type MCPuzzle = {
  id: string
  picture: string   // emoji shown as the visual clue
  clue: string      // text description
  scrambled: string
  answer: string
  storySnippet: string
}

type MCPack = {
  id: string
  title: string
  emoji: string
  teaser: string
  openingStory: string
  puzzles: MCPuzzle[]
}

type MCState = {
  phase: MCPhase
  teamA: string; teamB: string; teamC: string
  packs: MCPack[]
  chosenA: string | null; chosenB: string | null; chosenC: string | null
  queueA: MCPuzzle[]; queueB: MCPuzzle[]; queueC: MCPuzzle[]
  revealedA: string[]; revealedB: string[]; revealedC: string[]
  scoreA: number; scoreB: number; scoreC: number
  timerStart: number | null
  revealed: boolean
}

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function safeForAudience(s: MCState) {
  const isPlaying = ['a_playing','b_playing','c_playing'].includes(s.phase)
  const isStory = ['story_A','story_B','story_C'].includes(s.phase)
  const activeQ = s.phase === 'a_playing' ? s.queueA : s.phase === 'b_playing' ? s.queueB : s.queueC
  const activeRevealed = s.phase === 'a_playing' ? s.revealedA : s.phase === 'b_playing' ? s.revealedB : s.revealedC
  const puzzle = activeQ[0] ?? null

  const chosenPackId = isPlaying || isStory
    ? (s.phase.endsWith('A') || s.phase === 'a_playing' || s.phase === 'story_A' ? s.chosenA
      : s.phase.endsWith('B') || s.phase === 'b_playing' || s.phase === 'story_B' ? s.chosenB
      : s.chosenC)
    : null
  const activePack = chosenPackId ? s.packs.find(p => p.id === chosenPackId) ?? null : null

  return {
    phase: s.phase,
    teamA: s.teamA, teamB: s.teamB, teamC: s.teamC,
    packs: s.packs.map(p => ({ id: p.id, title: p.title, emoji: p.emoji, teaser: p.teaser })),
    chosenA: s.chosenA, chosenB: s.chosenB, chosenC: s.chosenC,
    activePackTitle: activePack?.title ?? '',
    activePackEmoji: activePack?.emoji ?? '',
    activeOpeningStory: activePack?.openingStory ?? '',
    activeRevealedStory: activeRevealed,
    revealedA: s.revealedA, revealedB: s.revealedB, revealedC: s.revealedC,
    scoreA: s.scoreA, scoreB: s.scoreB, scoreC: s.scoreC,
    timerStart: s.timerStart,
    revealed: s.revealed,
    currentPuzzle: puzzle ? {
      picture: puzzle.picture,
      clue: puzzle.clue,
      scrambled: puzzle.scrambled,
      answer: s.revealed ? puzzle.answer : undefined,
    } : null,
  }
}

// ── 4 Mystery Packs ──────────────────────────────────────────────────────────

const mk = (p: Omit<MCPuzzle,'id'>) => ({ ...p, id: crypto.randomUUID() })

const RAW_PACKS: Omit<MCPack,'id'>[] = [
  {
    title: 'The Silent Warning',
    emoji: '🔒',
    teaser: 'Uncover the threat. Protect the school.',
    openingStory: 'At 8:15 AM, students arrived at Crescent Academy for the annual Scholars Challenge. Everything appeared normal. At 10:30 AM, a teacher noticed something unusual. The school was not under attack yet — but all the signs suggested that something dangerous was about to happen. The teams have 60 seconds to uncover the threat.',
    puzzles: [
      mk({ picture: '🔗', clue: 'The weakest part of any system.', scrambled: 'KNLI', answer: 'LINK', storySnippet: 'Investigators discovered a weak link in the school\'s safety system.' }),
      mk({ picture: '👤', clue: 'A person present where they are not authorized to be.', scrambled: 'RTUINRDE', answer: 'INTRUDER', storySnippet: 'Security footage showed a possible intruder.' }),
      mk({ picture: '🎯', clue: 'A place selected for special attention.', scrambled: 'RAGTTE', answer: 'TARGET', storySnippet: 'The intruder appeared interested in a specific target.' }),
      mk({ picture: '⏰', clue: 'Choosing the perfect moment.', scrambled: 'GMNITI', answer: 'TIMING', storySnippet: 'Whoever planned this understood timing perfectly.' }),
      mk({ picture: '📱', clue: 'Information passed secretly.', scrambled: 'SGAESME', answer: 'MESSAGE', storySnippet: 'A coded message was discovered.' }),
      mk({ picture: '🔍', clue: 'Careful examination to discover the truth.', scrambled: 'YAANLSIS', answer: 'ANALYSIS', storySnippet: 'The analysis revealed a disturbing pattern.' }),
      mk({ picture: '📹', clue: 'Continuous observation.', scrambled: 'NIMTOROING', answer: 'MONITORING', storySnippet: 'Monitoring showed unusual movement around the campus.' }),
      mk({ picture: '🚨', clue: 'A signal that demands immediate action.', scrambled: 'TREAL', answer: 'ALERT', storySnippet: 'The school issued an alert.' }),
      mk({ picture: '🚪', clue: 'Organized movement away from danger.', scrambled: 'AUEVTCAIOON', answer: 'EVACUATION', storySnippet: 'A precautionary evacuation began.' }),
      mk({ picture: '🛡️', clue: 'The final objective of every safety plan.', scrambled: 'NTEITCOPRO', answer: 'PROTECTION', storySnippet: 'The school and its students were finally safe under full protection.' }),
    ],
  },
  {
    title: 'The Missing Trophy',
    emoji: '🏆',
    teaser: 'The trophy vanished. The ceremony cannot wait.',
    openingStory: 'The morning of the Awards Ceremony, Crescent Academy\'s championship trophy was found missing from the display cabinet. The hall was locked all night. Only three people had keys. The teams have 60 seconds to track down the truth before the ceremony begins.',
    puzzles: [
      mk({ picture: '💰', clue: 'An act of taking what does not belong to you.', scrambled: 'FHETT', answer: 'THEFT', storySnippet: 'The trophy case showed clear signs of deliberate theft.' }),
      mk({ picture: '🕵️', clue: 'A person believed to be responsible.', scrambled: 'SPSUECT', answer: 'SUSPECT', storySnippet: 'One individual quickly became the main suspect.' }),
      mk({ picture: '💭', clue: 'The reason someone commits an act.', scrambled: 'OMVITE', answer: 'MOTIVE', storySnippet: 'A motive rooted in jealousy was uncovered.' }),
      mk({ picture: '📋', clue: 'A story offered to prove innocence.', scrambled: 'BIAILA', answer: 'ALIBI', storySnippet: 'The suspect\'s alibi did not match the timeline.' }),
      mk({ picture: '🧪', clue: 'Something that proves what happened.', scrambled: 'CEVEDENI', answer: 'EVIDENCE', storySnippet: 'Evidence was found hidden beneath the display cabinet.' }),
      mk({ picture: '👁️', clue: 'A person who saw the incident.', scrambled: 'SSENWIT', answer: 'WITNESS', storySnippet: 'A witness recalled seeing a shadow in the corridor.' }),
      mk({ picture: '🔎', clue: 'To look carefully through an area.', scrambled: 'RAECSH', answer: 'SEARCH', storySnippet: 'A thorough search of the school premises began.' }),
      mk({ picture: '📷', clue: 'A device that records visual activity.', scrambled: 'RAACME', answer: 'CAMERA', storySnippet: 'Camera footage confirmed the identity of the thief.' }),
      mk({ picture: '💡', clue: 'Caught in the act of wrongdoing.', scrambled: 'SEDXOPE', answer: 'EXPOSED', storySnippet: 'The thief was exposed in front of the entire school.' }),
      mk({ picture: '🏆', clue: 'The act of returning something to its rightful place.', scrambled: 'YOVECERR', answer: 'RECOVERY', storySnippet: 'The trophy\'s recovery was celebrated school-wide.' }),
    ],
  },
  {
    title: 'The Exam Leak',
    emoji: '📋',
    teaser: 'The questions are out. Time is running out.',
    openingStory: 'Three days before the most important national examination in Crescent Academy\'s history, a student discovered that the exam questions were already circulating in a private group. The school board called for an immediate investigation. The teams have 60 seconds to uncover who is behind the leak.',
    puzzles: [
      mk({ picture: '💧', clue: 'Information disclosed without permission.', scrambled: 'KALE', answer: 'LEAK', storySnippet: 'Exam questions had been secretly leaked online.' }),
      mk({ picture: '🔑', clue: 'Permission to enter a restricted area.', scrambled: 'SCACES', answer: 'ACCESS', storySnippet: 'Someone gained unauthorized access to the examination vault.' }),
      mk({ picture: '📲', clue: 'A portable electronic tool.', scrambled: 'CVDEEI', answer: 'DEVICE', storySnippet: 'A hidden device was used to photograph the papers.' }),
      mk({ picture: '📤', clue: 'Information passed to others online.', scrambled: 'ADEHRS', answer: 'SHARED', storySnippet: 'The images were shared in a private online group.' }),
      mk({ picture: '👥', clue: 'A closed community communicating secretly.', scrambled: 'OUGPR', answer: 'GROUP', storySnippet: 'A secret group of students had been coordinating the plan.' }),
      mk({ picture: '🎭', clue: 'The person ultimately responsible for a wrongdoing.', scrambled: 'TPRUCIL', answer: 'CULPRIT', storySnippet: 'The culprit was someone entrusted with securing the papers.' }),
      mk({ picture: '✏️', clue: 'Gaining advantage through dishonest means.', scrambled: 'TINCHEAG', answer: 'CHEATING', storySnippet: 'Deliberate cheating was confirmed by the examination board.' }),
      mk({ picture: '📜', clue: 'A formal investigation into a breach.', scrambled: 'YUIRNIQ', answer: 'INQUIRY', storySnippet: 'An urgent inquiry was opened by senior school officials.' }),
      mk({ picture: '📑', clue: 'A rule that was seriously broken.', scrambled: 'CYLIPOL', answer: 'POLICY', storySnippet: 'The act violated every examination integrity policy.' }),
      mk({ picture: '⚖️', clue: 'The consequence for serious misconduct.', scrambled: 'YNALEPT', answer: 'PENALTY', storySnippet: 'The student faced the ultimate academic penalty — expulsion.' }),
    ],
  },
  {
    title: 'The Vanishing Coach',
    emoji: '👁️',
    teaser: 'He was here. Now he is gone. Find out why.',
    openingStory: 'Two hours before Crescent Academy\'s biggest inter-school competition in a decade, the head coach was reported missing. His office was locked from the inside. His phone sat on his desk. No one saw him leave. The teams have 60 seconds to piece together his disappearance.',
    puzzles: [
      mk({ picture: '❓', clue: 'No longer present or able to be found.', scrambled: 'GSINIMS', answer: 'MISSING', storySnippet: 'The coach was officially reported missing at 7:45 AM.' }),
      mk({ picture: '🔍', clue: 'A sign or indication pointing to what happened.', scrambled: 'UELC', answer: 'CLUE', storySnippet: 'A single clue was found on his otherwise empty desk.' }),
      mk({ picture: '📝', clue: 'A written communication left behind.', scrambled: 'ETON', answer: 'NOTE', storySnippet: 'A hastily written note suggested he had left in a hurry.' }),
      mk({ picture: '🕵️', clue: 'A person seen near the scene.', scrambled: 'PSCUSTE', answer: 'SUSPECT', storySnippet: 'A suspect was seen near the coach\'s office at dawn.' }),
      mk({ picture: '🤫', clue: 'Something kept hidden from others.', scrambled: 'CESRTE', answer: 'SECRET', storySnippet: 'The coach had been keeping a dangerous secret.' }),
      mk({ picture: '⛓️', clue: 'Forced or pressured into doing something.', scrambled: 'DORCEF', answer: 'FORCED', storySnippet: 'Evidence showed the coach had been forced to leave.' }),
      mk({ picture: '📞', clue: 'A communication device used to track location.', scrambled: 'LOHPNE', answer: 'PHONE', storySnippet: 'His phone contained a threatening message received that morning.' }),
      mk({ picture: '🗺️', clue: 'The path or direction taken to leave.', scrambled: 'UEROT', answer: 'ROUTE', storySnippet: 'Security cameras tracked the route he was taken.' }),
      mk({ picture: '🚔', clue: 'Official action taken to locate someone.', scrambled: 'DREHACSE', answer: 'SEARCHED', storySnippet: 'Authorities searched every corner of the campus.' }),
      mk({ picture: '✅', clue: 'Brought back safe after going missing.', scrambled: 'EDRCREOV', answer: 'RECOVERED', storySnippet: 'The coach was recovered safely — and told the full story.' }),
    ],
  },
]

const PACKS: MCPack[] = RAW_PACKS.map(p => ({ ...p, id: crypto.randomUUID() }))

// ── Default State ─────────────────────────────────────────────────────────────

const defaultState = (): MCState => ({
  phase: 'setup',
  teamA: '', teamB: '', teamC: '',
  packs: PACKS,
  chosenA: null, chosenB: null, chosenC: null,
  queueA: [], queueB: [], queueC: [],
  revealedA: [], revealedB: [], revealedC: [],
  scoreA: 0, scoreB: 0, scoreC: 0,
  timerStart: null, revealed: false,
})

// ── Component ─────────────────────────────────────────────────────────────────

export default function MCAdminPage() {
  const [s, setS] = useState<MCState>(defaultState())
  const [timeLeft, setTimeLeft] = useState(MC_TIME_MS)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const stateRef = useRef(s)
  stateRef.current = s

  const broadcast = useCallback((st: MCState) => wsBroadcast(CHANNEL, safeForAudience(st)), [])
  const update = useCallback((st: MCState) => { setS(st); broadcast(st) }, [broadcast])

  // Timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    const playing = ['a_playing','b_playing','c_playing'].includes(s.phase)
    if (!playing || !s.timerStart) { setTimeLeft(MC_TIME_MS); return }
    const tick = () => {
      const left = Math.max(0, MC_TIME_MS - (Date.now() - (stateRef.current.timerStart ?? 0)))
      setTimeLeft(left)
      if (left === 0) {
        const cur = stateRef.current
        if (!['a_playing','b_playing','c_playing'].includes(cur.phase)) return
        const next: MCState = {
          ...cur,
          phase: cur.phase === 'a_playing' ? 'pick_B' : cur.phase === 'b_playing' ? 'pick_C' : 'done',
          timerStart: null, revealed: false,
        }
        setS(next); broadcast(next); clearInterval(timerRef.current!)
      }
    }
    tick(); timerRef.current = setInterval(tick, 250)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [s.phase, s.timerStart, broadcast])

  const pickMystery = (packId: string) => {
    const cur = stateRef.current
    const pack = cur.packs.find(p => p.id === packId)!
    const queue = [...pack.puzzles]
    if (cur.phase === 'pick_A') {
      update({ ...cur, chosenA: packId, phase: 'story_A', queueA: queue })
    } else if (cur.phase === 'pick_B') {
      update({ ...cur, chosenB: packId, phase: 'story_B', queueB: queue })
    } else if (cur.phase === 'pick_C') {
      update({ ...cur, chosenC: packId, phase: 'story_C', queueC: queue })
    }
  }

  const startRiddles = () => {
    const cur = stateRef.current
    const next: MCState = {
      ...cur,
      phase: cur.phase === 'story_A' ? 'a_playing' : cur.phase === 'story_B' ? 'b_playing' : 'c_playing',
      timerStart: Date.now(), revealed: false,
    }
    update(next)
  }

  const action = (result: 'correct' | 'wrong' | 'skip') => {
    const cur = stateRef.current
    const qKey = cur.phase === 'a_playing' ? 'queueA' : cur.phase === 'b_playing' ? 'queueB' : 'queueC'
    const scoreKey = cur.phase === 'a_playing' ? 'scoreA' : cur.phase === 'b_playing' ? 'scoreB' : 'scoreC'
    const revKey = cur.phase === 'a_playing' ? 'revealedA' : cur.phase === 'b_playing' ? 'revealedB' : 'revealedC'
    const queue = [...cur[qKey]]
    if (queue.length === 0) return
    const puzzle = queue.shift()!
    if (result !== 'correct') queue.push(puzzle)
    const nextRevealed = result === 'correct' && puzzle.storySnippet
      ? [...cur[revKey], puzzle.storySnippet]
      : [...cur[revKey]]
    update({ ...cur, [qKey]: queue, [scoreKey]: result === 'correct' ? cur[scoreKey] + MC_PTS : cur[scoreKey], [revKey]: nextRevealed, revealed: false })
  }

  const reveal = () => update({ ...s, revealed: !s.revealed })

  const nextTeam = () => {
    update({
      ...s,
      phase: s.phase === 'a_playing' ? 'pick_B' : s.phase === 'b_playing' ? 'pick_C' : 'done',
      timerStart: null, revealed: false,
    })
  }

  const reset = () => setS(defaultState())

  // Derived
  const currentQueue = s.phase === 'a_playing' ? s.queueA : s.phase === 'b_playing' ? s.queueB : s.queueC
  const currentPuzzle = currentQueue[0] ?? null
  const currentTeamName = s.phase === 'a_playing' || s.phase === 'story_A' ? s.teamA
    : s.phase === 'b_playing' || s.phase === 'story_B' ? s.teamB : s.teamC
  const currentRevealed = s.phase === 'a_playing' ? s.revealedA : s.phase === 'b_playing' ? s.revealedB : s.revealedC
  const chosenPackId = s.phase === 'a_playing' || s.phase === 'story_A' ? s.chosenA
    : s.phase === 'b_playing' || s.phase === 'story_B' ? s.chosenB : s.chosenC
  const currentPack = s.packs.find(p => p.id === chosenPackId)
  const pickingTeam = s.phase === 'pick_A' ? s.teamA : s.phase === 'pick_B' ? s.teamB : s.phase === 'pick_C' ? s.teamC : ''
  const takenIds = [s.chosenA, s.chosenB, s.chosenC].filter(Boolean) as string[]
  const pct = timeLeft / MC_TIME_MS
  const timerColor = pct > 0.4 ? '#22c55e' : pct > 0.2 ? '#f59e0b' : '#ef4444'
  const isPlaying = ['a_playing','b_playing','c_playing'].includes(s.phase)
  const isPicking = ['pick_A','pick_B','pick_C'].includes(s.phase)
  const isStory = ['story_A','story_B','story_C'].includes(s.phase)

  return (
    <div className="min-h-screen bg-[#0a1628] text-white p-4">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest">Admin Control</p>
            <h1 className="text-white text-2xl font-black">🔮 Mystery Chain</h1>
          </div>
          <div className="flex gap-2">
            <a href="/mystery-chain/audience" target="_blank"
              className="text-xs bg-purple-600/30 border border-purple-500/40 text-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-600/50">
              Audience ↗
            </a>
            {s.phase !== 'setup' && (
              <button onClick={reset} className="text-xs bg-red-600/20 border border-red-500/30 text-red-400 px-3 py-1.5 rounded-lg">
                Reset
              </button>
            )}
          </div>
        </div>

        {/* SETUP */}
        {s.phase === 'setup' && (
          <div className="space-y-4">
            <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-4 space-y-3">
              <h2 className="text-white font-bold">Team Names</h2>
              <div className="grid grid-cols-3 gap-3">
                {(['teamA','teamB','teamC'] as const).map((k, i) => (
                  <input key={k} value={s[k]} onChange={e => setS(p => ({ ...p, [k]: e.target.value }))}
                    placeholder={`Team ${['A','B','C'][i]}`}
                    className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                ))}
              </div>
            </div>
            <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-4 space-y-3">
              <h2 className="text-white font-bold">4 Mysteries Available</h2>
              <div className="grid grid-cols-2 gap-3">
                {s.packs.map(p => (
                  <div key={p.id} className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-3">
                    <p className="text-2xl mb-1">{p.emoji}</p>
                    <p className="text-white font-bold text-sm">{p.title}</p>
                    <p className="text-slate-400 text-xs">{p.teaser}</p>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => update({ ...s, phase: 'intro' })}
              disabled={!s.teamA || !s.teamB || !s.teamC}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-black py-4 rounded-xl text-lg">
              Begin Mystery Chain →
            </button>
          </div>
        )}

        {/* INTRO */}
        {s.phase === 'intro' && (
          <div className="space-y-4">
            <div className="bg-purple-900/20 border border-purple-500/30 rounded-2xl p-6 text-center space-y-3">
              <p className="text-purple-300 text-xs font-bold uppercase tracking-widest">Welcome to the Mystery Chain</p>
              <p className="text-white text-base leading-relaxed">
                Four mysteries are waiting to be unlocked. Each team will choose one mystery and have{' '}
                <span className="text-[#f5a623] font-bold">60 seconds</span> to unscramble the words and reveal the full story.
                Every correct answer earns <span className="text-[#f5a623] font-bold">10 points</span> and unlocks the next chapter.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[s.teamA, s.teamB, s.teamC].map((t,i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                  <p className="text-slate-400 text-xs">Team {['A','B','C'][i]}</p>
                  <p className="text-white font-bold">{t}</p>
                </div>
              ))}
            </div>
            <button onClick={() => update({ ...s, phase: 'pick_A' })}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-black py-4 rounded-xl text-lg">
              {s.teamA} — Choose Your Mystery →
            </button>
          </div>
        )}

        {/* PICK PHASE */}
        {isPicking && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-slate-400 text-sm">It is now</p>
              <p className="text-white text-3xl font-black">{pickingTeam}&apos;s turn to choose</p>
              <p className="text-slate-400 text-sm mt-1">Select a mystery to unlock</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {s.packs.map(pack => {
                const taken = takenIds.includes(pack.id)
                const takenBy = taken
                  ? pack.id === s.chosenA ? s.teamA : pack.id === s.chosenB ? s.teamB : s.teamC
                  : null
                return (
                  <button key={pack.id} onClick={() => !taken && pickMystery(pack.id)} disabled={taken}
                    className={`relative rounded-2xl p-5 border text-left transition-all ${
                      taken ? 'bg-white/5 border-white/10 opacity-50 cursor-not-allowed'
                        : 'bg-[#0d1f3c] border-slate-600 hover:border-purple-400 hover:bg-purple-900/20'
                    }`}>
                    {taken && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50">
                        <div className="text-center">
                          <p className="text-white text-xs font-bold">Chosen by</p>
                          <p className="text-[#f5a623] text-sm font-black">{takenBy}</p>
                        </div>
                      </div>
                    )}
                    <p className="text-4xl mb-2">{pack.emoji}</p>
                    <p className="text-white font-black text-base">{pack.title}</p>
                    <p className="text-slate-400 text-xs mt-1">{pack.teaser}</p>
                    {!taken && <p className="text-purple-400 text-xs font-bold mt-3 uppercase tracking-wider">Tap to choose →</p>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* STORY PHASE */}
        {isStory && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-purple-300 text-xs font-bold uppercase tracking-widest">{currentTeamName} chose</p>
              <p className="text-white text-2xl font-black">{currentPack?.emoji} {currentPack?.title}</p>
            </div>
            <div className="bg-purple-900/20 border border-purple-500/30 rounded-2xl p-6">
              <p className="text-purple-300 text-xs font-bold uppercase tracking-widest mb-3">Opening Scenario</p>
              <p className="text-white text-base leading-relaxed">{currentPack?.openingStory}</p>
            </div>
            <button onClick={startRiddles}
              className="w-full bg-[#f5a623] hover:bg-[#e09510] text-black font-black py-4 rounded-xl text-lg">
              ▶ Start the Riddles — Timer Begins Now
            </button>
          </div>
        )}

        {/* PLAYING */}
        {isPlaying && (
          <div className="space-y-4">
            {/* Timer */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-purple-300 text-xs font-bold uppercase tracking-widest">{currentTeamName}</p>
                  <p className="text-white font-bold">{currentPack?.emoji} {currentPack?.title}</p>
                </div>
                <span className="text-slate-400 text-sm">{currentQueue.length} left</span>
              </div>
              <div className="h-3 bg-white/10 rounded-full overflow-hidden mt-3">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct * 100}%`, background: timerColor }} />
              </div>
              <p className="text-center font-black text-5xl mt-2" style={{ color: timerColor }}>{fmtTime(timeLeft)}</p>
            </div>

            {/* Scores */}
            <div className="grid grid-cols-3 gap-2">
              {[{name:s.teamA,score:s.scoreA,k:'A'},{name:s.teamB,score:s.scoreB,k:'B'},{name:s.teamC,score:s.scoreC,k:'C'}].map(t => {
                const active = (s.phase==='a_playing'&&t.k==='A')||(s.phase==='b_playing'&&t.k==='B')||(s.phase==='c_playing'&&t.k==='C')
                return (
                  <div key={t.k} className={`rounded-xl p-3 text-center border ${active ? 'bg-purple-600/20 border-purple-500' : 'bg-white/5 border-white/10'}`}>
                    <p className="text-slate-300 text-xs font-semibold truncate">{t.name}</p>
                    <p className="text-white text-2xl font-black">{t.score}</p>
                  </div>
                )
              })}
            </div>

            {/* Story so far */}
            {currentRevealed.length > 0 && (
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
                <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-2">Story Unlocked</p>
                <div className="space-y-1">
                  {currentRevealed.map((snippet, i) => (
                    <p key={i} className="text-blue-100 text-sm leading-relaxed">
                      <span className="text-blue-400 font-bold mr-1">{i + 1}.</span>{snippet}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Current Puzzle */}
            {currentPuzzle ? (
              <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-5 space-y-3">
                {/* Picture clue */}
                <div className="flex justify-center">
                  <div className="bg-slate-800/60 rounded-2xl px-8 py-4 text-center">
                    <p className="text-7xl">{currentPuzzle.picture}</p>
                  </div>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-slate-400 text-sm flex-1">Clue: <span className="text-white font-semibold">{currentPuzzle.clue}</span></p>
                  <button onClick={reveal}
                    className={`text-xs px-3 py-1 rounded-lg border font-semibold shrink-0 ${s.revealed ? 'bg-green-600/30 border-green-500 text-green-300' : 'bg-white/5 border-white/20 text-slate-400'}`}>
                    {s.revealed ? 'Hide' : 'Reveal'}
                  </button>
                </div>
                <p className="text-[#f5a623] text-4xl font-black tracking-[0.25em] text-center">{currentPuzzle.scrambled}</p>
                {s.revealed && <p className="text-green-400 text-xl font-bold text-center">{currentPuzzle.answer}</p>}
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center text-slate-500">No more puzzles</div>
            )}

            {/* Actions */}
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => action('correct')} className="py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-sm">
                ✓ Correct<br/><span className="text-xs opacity-75">+{MC_PTS} pts · story revealed</span>
              </button>
              <button onClick={() => action('wrong')} className="py-4 bg-red-600/60 hover:bg-red-600/80 text-white font-bold rounded-xl text-sm border border-red-500/30">
                ✗ Wrong<br/><span className="text-xs opacity-75">Recycle to back</span>
              </button>
              <button onClick={() => action('skip')} className="py-4 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm border border-white/10">
                ↷ Skip<br/><span className="text-xs opacity-75">Recycle to back</span>
              </button>
            </div>

            <button onClick={nextTeam} className="w-full border border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 py-3 rounded-xl text-sm font-semibold">
              {s.phase === 'c_playing' ? 'End Round →' : `Time Up — ${s.phase === 'a_playing' ? s.teamB : s.teamC} chooses next →`}
            </button>
          </div>
        )}

        {/* DONE */}
        {s.phase === 'done' && (
          <div className="space-y-4">
            <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-6">
              <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest text-center mb-4">Final Results</p>
              <div className="space-y-3">
                {[
                  {name:s.teamA,score:s.scoreA,rev:s.revealedA,packId:s.chosenA},
                  {name:s.teamB,score:s.scoreB,rev:s.revealedB,packId:s.chosenB},
                  {name:s.teamC,score:s.scoreC,rev:s.revealedC,packId:s.chosenC},
                ].sort((a,b) => b.score - a.score).map((t, i) => {
                  const pack = s.packs.find(p => p.id === t.packId)
                  return (
                    <div key={t.name} className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{['🥇','🥈','🥉'][i]}</span>
                        <div>
                          <p className="text-white font-bold">{t.name}</p>
                          <p className="text-slate-500 text-xs">{pack?.emoji} {pack?.title} · {t.rev.length} clues unlocked</p>
                        </div>
                      </div>
                      <span className="text-white text-2xl font-black">{t.score} pts</span>
                    </div>
                  )
                })}
              </div>
            </div>
            {/* Advance top 2 to Audio Visual */}
            {(() => {
              const ranked = [
                { name: s.teamA, score: s.scoreA },
                { name: s.teamB, score: s.scoreB },
                { name: s.teamC, score: s.scoreC },
              ].sort((a, b) => b.score - a.score)
              return (
                <button
                  onClick={() => wsBroadcast('av:state', {
                    phase: 'idle',
                    videoUrl: 'https://www.youtube.com/embed/YE7VzlLtp-4?enablejsapi=1',
                    videoPlay: false,
                    teamA: ranked[0].name,
                    teamB: ranked[1].name,
                    questions: [],
                    currentQ: 0,
                    timerStart: null,
                    scoreA: 0,
                    scoreB: 0,
                    correctA: 0,
                    correctB: 0,
                  })}
                  className="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"
                >
                  📺 Advance Top 2 to Audio Visual Round
                  <span className="text-purple-300 font-normal text-sm">({ranked[0].name} &amp; {ranked[1].name})</span>
                </button>
              )
            })()}
            <button onClick={reset} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl">
              Start New Game
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
