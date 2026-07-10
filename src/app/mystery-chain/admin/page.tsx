'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { wsBroadcast } from '@/lib/ws-sync'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import PointAdjuster from '@/components/point-adjuster'
import AdminRoundIntro from '@/components/round-instructions-admin'
import { ROUND_INFO } from '@/lib/round-info'

type RegisteredTeam = { id: string; name: string; school: string }

const CHANNEL = 'mc:state'
const MC_TIME_MS = 60_000
const MC_PTS = 10

type MCPhase =
  | 'setup' | 'intro'
  | 'pick_A' | 'story_A' | 'a_playing' | 'summary_A'
  | 'pick_B' | 'story_B' | 'b_playing' | 'summary_B'
  | 'pick_C' | 'story_C' | 'c_playing' | 'summary_C'
  | 'compare_mc'              // Head-to-head on the Mystery Chain scores only
  | 'compare_total'           // Head-to-head on the full cumulative totals
  | 'done'                    // Regular rankings screen
  | 'declare_second_runnerup' // Dedicated Second Runner Up declaration

type MCPuzzle = {
  id: string
  picture: string
  clue: string
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

// AV Round question type (simpler — just text + answer, no scrambled)
type AVQSetup = {
  id: string
  text: string
  answer: string
}

// A pool is a themed set of 10 questions that the students can pick from
// during the AV Round. Three pools are pre-configured; each team picks one.
type AVPool = {
  id: string
  title: string
  questions: AVQSetup[]
}

type MCState = {
  phase: MCPhase
  teamA: string; teamB: string; teamC: string
  // Semi-final scores carried in from the semi-final round; add to MC score
  // for the cumulative total that decides Second Runner Up + advancement.
  // semi* is always kept as (rf + bz + is) — kept as its own field so all the
  // existing sort / total logic keeps working unchanged.
  semiA: number; semiB: number; semiC: number
  // Breakdown of the semi-final total by round — filled in during setup.
  rfA: number; rfB: number; rfC: number
  bzA: number; bzB: number; bzC: number
  isA: number; isB: number; isC: number
  packs: MCPack[]
  chosenA: string | null; chosenB: string | null; chosenC: string | null
  queueA: MCPuzzle[]; queueB: MCPuzzle[]; queueC: MCPuzzle[]
  revealedA: string[]; revealedB: string[]; revealedC: string[]
  scoreA: number; scoreB: number; scoreC: number
  timerStart: number | null
  // Wall-clock timestamp when the current story phase started, so every
  // screen advances the subtitle to the same sentence at the same moment.
  storyStartAt: number | null
  revealed: boolean
  // AV Round pre-configuration (set during setup before game starts)
  avVideoUrl: string
  avPools: AVPool[]   // 3 pools of 10; each finalist team picks one to play
}

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Remove the answer word (and simple variants) from a clue sentence so the
// audience can't just read the answer off the hint. Case-insensitive; falls
// back to underscore-blanks of matching length.
function maskAnswerInClue(clue: string, answer: string): string {
  if (!clue || !answer) return clue
  const trimmed = answer.trim()
  if (!trimmed) return clue
  // Escape regex specials in the answer, then require a word boundary so
  // shorter answers don't chew up unrelated substrings.
  const esc = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    const re = new RegExp(`\\b${esc}\\b`, 'gi')
    const blank = '_'.repeat(Math.max(3, trimmed.length))
    return clue.replace(re, blank)
  } catch {
    return clue
  }
}

// For summary screens we send [{ snippet, answer }] so the audience can
// highlight the answer word inside each unlocked sentence.
function snippetsWithAnswers(pack: MCPack | undefined) {
  return (pack?.puzzles ?? []).map(p => ({ snippet: p.storySnippet, answer: p.answer }))
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
  const packA = s.chosenA ? s.packs.find(p => p.id === s.chosenA) : undefined
  const packB = s.chosenB ? s.packs.find(p => p.id === s.chosenB) : undefined
  const packC = s.chosenC ? s.packs.find(p => p.id === s.chosenC) : undefined
  return {
    phase: s.phase,
    teamA: s.teamA, teamB: s.teamB, teamC: s.teamC,
    semiA: s.semiA, semiB: s.semiB, semiC: s.semiC,
    rfA: s.rfA, rfB: s.rfB, rfC: s.rfC,
    bzA: s.bzA, bzB: s.bzB, bzC: s.bzC,
    isA: s.isA, isB: s.isB, isC: s.isC,
    packs: s.packs.map(p => ({ id: p.id, title: p.title, emoji: p.emoji, teaser: p.teaser })),
    chosenA: s.chosenA, chosenB: s.chosenB, chosenC: s.chosenC,
    // Story snippets of each chosen pack — needed by summary phases so
    // audience/team screens can render the green/red review.
    chosenSnippetsA: (packA?.puzzles ?? []).map(p => p.storySnippet),
    chosenSnippetsB: (packB?.puzzles ?? []).map(p => p.storySnippet),
    chosenSnippetsC: (packC?.puzzles ?? []).map(p => p.storySnippet),
    // Parallel arrays of the answer word for each snippet — used to highlight
    // the unlocked word in a distinct colour on the summary screens.
    chosenSnippetAnswersA: snippetsWithAnswers(packA).map(x => x.answer),
    chosenSnippetAnswersB: snippetsWithAnswers(packB).map(x => x.answer),
    chosenSnippetAnswersC: snippetsWithAnswers(packC).map(x => x.answer),
    activePackTitle: activePack?.title ?? '',
    activePackEmoji: activePack?.emoji ?? '',
    activeOpeningStory: activePack?.openingStory ?? '',
    activeRevealedStory: activeRevealed,
    revealedA: s.revealedA, revealedB: s.revealedB, revealedC: s.revealedC,
    scoreA: s.scoreA, scoreB: s.scoreB, scoreC: s.scoreC,
    timerStart: s.timerStart,
    storyStartAt: s.storyStartAt,
    revealed: s.revealed,
    currentPuzzle: puzzle ? {
      picture: puzzle.picture,
      // Answer word masked out of the clue so students only get a genuine hint.
      clue: maskAnswerInClue(puzzle.clue, puzzle.answer),
      scrambled: puzzle.scrambled,
      answer: s.revealed ? puzzle.answer : undefined,
    } : null,
  }
}

// Converts watch/short URLs to embeddable format
function toEmbedUrl(url: string): string {
  try {
    const m = url.match(/(?:v=|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    if (m) return `https://www.youtube.com/embed/${m[1]}?enablejsapi=1`
    return url.includes('youtube.com/embed') ? url : url
  } catch { return url }
}

// ── 4 Mystery Packs ──────────────────────────────────────────────────────────

const mk = (p: Omit<MCPuzzle,'id'>) => ({ ...p, id: crypto.randomUUID() })

const RAW_PACKS: Omit<MCPack,'id'>[] = [
  {
    title: 'The Silent Warning (Demo)',
    emoji: '🔒',
    teaser: 'Uncover the threat. Protect the school.',
    openingStory: 'At 8:15 AM, students arrived at Crescent Academy for the annual Scholars Challenge. The morning felt ordinary — buses pulled up at the gates, teachers greeted their classes, and the assembly hall began to fill with excited voices. But by 10:30 AM, something shifted. A senior teacher noticed a stranger loitering near the west corridor. Cameras had gone offline for four minutes overnight. A locker that should have been empty was warm to the touch. Nothing had happened yet — but every silent sign pointed to a plan already in motion. Someone was watching the school. Someone was waiting for the right moment. And that moment was coming fast. Students of Crescent Academy — the safety of this school now rests in your hands. Unscramble every clue, unlock the mystery, and reveal the threat before it strikes. Your time starts now.',
    puzzles: [
      mk({ picture: '🔗', clue: 'The weakest part of any system.', scrambled: 'KNLI', answer: 'LINK', storySnippet: 'Investigators discovered a weak link in the school\'s safety system.' }),
      mk({ picture: '👤', clue: 'A person present where they are not authorized to be.', scrambled: 'RTUINRDE', answer: 'INTRUDER', storySnippet: 'Security footage showed a possible intruder.' }),
      mk({ picture: '🎯', clue: 'A place selected for special attention.', scrambled: 'RAGTTE', answer: 'TARGET', storySnippet: 'The intruder appeared interested in a specific target.' }),
      mk({ picture: '⏰', clue: 'Choosing the perfect moment.', scrambled: 'GMNITI', answer: 'TIMING', storySnippet: 'Whoever planned this understood timing perfectly.' }),
      mk({ picture: '📱', clue: 'Information passed secretly.', scrambled: 'SGAESME', answer: 'MESSAGE', storySnippet: 'A coded message was discovered.' }),
      mk({ picture: '🔍', clue: 'Careful examination to discover the truth.', scrambled: 'YAANLSIS', answer: 'ANALYSIS', storySnippet: 'The analysis revealed a disturbing pattern.' }),
      mk({ picture: '📹', clue: 'Continuous observation.', scrambled: 'NIMTOROING', answer: 'MONITORING', storySnippet: 'Monitoring showed unusual movement around the campus.' }),
      mk({ picture: '🚨', clue: 'A signal that demands immediate action.', scrambled: 'TREAL', answer: 'ALERT', storySnippet: 'The school issued an alert.' }),
      mk({ picture: '🚪', clue: 'Organised movement away from danger.', scrambled: 'AUEVTCAIOON', answer: 'EVACUATION', storySnippet: 'A precautionary evacuation began.' }),
      mk({ picture: '🛡️', clue: 'The final objective of every safety plan.', scrambled: 'NTEITCOPRO', answer: 'PROTECTION', storySnippet: 'The school and its students were finally safe under full protection.' }),
    ],
  },
  {
    title: 'The Missing Trophy',
    emoji: '🏆',
    teaser: 'The trophy vanished. The ceremony cannot wait.',
    openingStory: 'The morning of the Awards Ceremony, Crescent Academy\'s championship trophy was gone. The great glass cabinet in the main hall — polished the night before — now stood empty, the felt still bearing the faint outline of where the trophy had rested for twenty years. The hall had been locked from the outside all night. The security log listed only three names with keys: the principal, the janitor, and the head prefect. And yet, at 6:47 AM, a fresh scratch marked the frame of the cabinet, a single glove lay under a chair, and the CCTV feed had gone dark for exactly nine minutes. The ceremony begins in one hour. The parents are already arriving. The press is on their way. Students of Crescent Academy — the honour of this school is now in your hands. Unscramble every clue, unlock the mystery, and expose the truth before the ceremony begins. Your time starts now.',
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
    openingStory: 'Three days before the most important national examination in Crescent Academy\'s history, a whisper turned into a scandal. A quiet junior, scrolling through a class group at midnight, saw a familiar page of text on her screen — a section from the sealed exam paper that would not be opened for another 72 hours. She screenshot it. She showed her parents. By sunrise, the head of the examination board had been called. By 8 AM, teachers were in emergency meeting. Nine students had already seen the leak. The vault had not been broken. The papers had not been moved. And yet, somehow, the questions had escaped — passed from phone to phone in silence. Every reputation is on the line. The examination itself is at risk of being cancelled. Students of Crescent Academy — the integrity of this school is now in your hands. Unscramble every clue, unlock the mystery, and expose the person behind the leak. Your time starts now.',
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
    openingStory: 'Two hours before Crescent Academy\'s biggest inter-school competition in a decade, the head coach was gone. His office door was locked from the inside — but he was not inside. His phone sat on the desk, still buzzing with unread messages. His notebook lay open, mid-sentence. A half-empty cup of tea was still warm. No one saw him arrive. No one saw him leave. The security guard swore the corridor had been empty all morning. The whistle he never took off was hanging by the window. And on the chair, folded neatly, was his tracksuit — as if he had simply stepped out of it. The team he trained for years now waits on the pitch, unsure whether the competition can even begin. Students of Crescent Academy — the fate of your school\'s biggest match is now in your hands. Unscramble every clue, unlock the mystery, and piece together what really happened to the coach. Your time starts now.',
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

// ── Default AV Pools — Soyuz spacecraft video ────────────────────────────────
// Three themed pools of 10 questions each; students pick one pool per team.
// Admin can edit anything in the setup screen before the game starts.

const POOL_1: Omit<AVQSetup,'id'>[] = [
  { text: "What is the crew's preparation time before undocking?", answer: '3 hours' },
  { text: 'At what time (Moscow time) did the Soyuz undock?', answer: '4:03' },
  { text: "What is the spacecraft's name?", answer: 'Soyuz' },
  { text: 'What location are they departing from?', answer: 'International Space Station (ISS)' },
  { text: 'Who is specifically bid farewell during the undocking process?', answer: 'Yuri Ivanovich' },
  { text: 'How much time passes between undocking and the de-orbiting burn?', answer: '2 hours' },
  { text: 'How long before landing do the helicopters depart for the landing region?', answer: '1 hour' },
  { text: 'How long after the burn do the modules disconnect?', answer: '30 minutes' },
  { text: 'What action does the space propulsion system take at 1:14?', answer: 'Produces a retrograde burn' },
  { text: 'What is the purpose of the retrograde burn?', answer: 'De-orbiting the Soyuz' },
]

const POOL_2: Omit<AVQSetup,'id'>[] = [
  { text: 'What is described as the most dangerous stage of the mission?', answer: 'Landing / re-entry' },
  { text: 'What is the visual appearance of the re-entry capsule?', answer: 'Passive re-entry capsule' },
  { text: 'What is the maximum acceleration felt by the crew in Gs?', answer: '4G' },
  { text: 'What forms around the capsule during re-entry?', answer: 'A plasma sheet' },
  { text: 'What is the temperature of the plasma sheet?', answer: 'Up to 2,000° C' },
  { text: 'What happens to radio communications during re-entry?', answer: 'The radio link breaks' },
  { text: 'How do astronauts see outside during the intense re-entry?', answer: 'Through a window' },
  { text: 'What makes the re-entry phase "grueling"?', answer: 'High-G forces and plasma temperatures' },
  { text: 'How are the astronauts positioned inside the capsule?', answer: 'In prone beds' },
  { text: 'What happens to the radio link when the plasma sheet forms?', answer: 'It breaks' },
]

const POOL_3: Omit<AVQSetup,'id'>[] = [
  { text: 'What triggers the parachute deployment?', answer: 'Re-entry deceleration' },
  { text: 'Which parachute deploys first?', answer: 'Auxiliary parachute' },
  { text: 'Which parachute deploys second?', answer: 'Main parachute' },
  { text: 'What factor caused the capsule to drift from the original aim point?', answer: 'A strong wind' },
  { text: 'How far did the wind blow the capsule off-course?', answer: 'Several kilometers' },
  { text: 'How quickly do rescue teams reach the capsule after landing?', answer: 'A couple of minutes' },
  { text: 'Who is the first crew member helped out of the capsule?', answer: 'Sergey Volkov' },
  { text: 'Who is the second crew member to exit?', answer: 'Scott Kelly' },
  { text: 'Who is the final crew member to exit?', answer: 'Mikhail Kornienko' },
  { text: 'What phrase is used to welcome Mikhail Kornienko home?', answer: '"Welcome home"' },
]

// Demo pool — 10 additional questions on the same Soyuz video so admin can
// run a practice AV round using the "Demo Pool" instead of the real 3 pools.
const POOL_DEMO: Omit<AVQSetup,'id'>[] = [
  { text: 'Which nation designed and operates the Soyuz spacecraft?', answer: 'Russia' },
  { text: 'What is the international space facility the Soyuz is departing from?', answer: 'International Space Station (ISS)' },
  { text: 'What is the main task the propulsion system performs about an hour after undocking?', answer: 'A retrograde burn to leave orbit' },
  { text: 'What glowing envelope surrounds the descent capsule during re-entry?', answer: 'A plasma sheet' },
  { text: 'What limits communication between the capsule and ground during peak re-entry?', answer: 'The plasma sheet blocks the radio link' },
  { text: 'What device slows the capsule after the parachutes deploy and before landing?', answer: 'Retro rockets fired just before touchdown' },
  { text: 'How is the exact landing spot located and reached quickly?', answer: 'Helicopters pre-positioned in the landing zone track and reach the capsule' },
  { text: 'Which of the three crew members steps out of the capsule first at landing?', answer: 'Sergey Volkov' },
  { text: 'What condition are astronauts typically in immediately after landing that requires the recovery team\'s help?', answer: 'Weakened by microgravity — they cannot stand on their own' },
  { text: 'What is the phrase used to welcome the astronauts back to Earth?', answer: '"Welcome home"' },
]

const DEFAULT_AV_POOLS: Omit<AVPool,'id'>[] = [
  { title: 'Undocking & Departure from the ISS',   questions: POOL_1.map(q => ({ ...q, id: crypto.randomUUID() })) },
  { title: "Re-entry Through Earth's Atmosphere",   questions: POOL_2.map(q => ({ ...q, id: crypto.randomUUID() })) },
  { title: 'Landing & Recovery',                     questions: POOL_3.map(q => ({ ...q, id: crypto.randomUUID() })) },
  { title: 'Demo — Soyuz Practice',                  questions: POOL_DEMO.map(q => ({ ...q, id: crypto.randomUUID() })) },
]

// ── Default State ─────────────────────────────────────────────────────────────

const defaultState = (): MCState => ({
  phase: 'setup',
  teamA: '', teamB: '', teamC: '',
  semiA: 0, semiB: 0, semiC: 0,
  rfA: 0, rfB: 0, rfC: 0,
  bzA: 0, bzB: 0, bzC: 0,
  isA: 0, isB: 0, isC: 0,
  packs: PACKS,
  chosenA: null, chosenB: null, chosenC: null,
  queueA: [], queueB: [], queueC: [],
  revealedA: [], revealedB: [], revealedC: [],
  scoreA: 0, scoreB: 0, scoreC: 0,
  timerStart: null, storyStartAt: null, revealed: false,
  // Soyuz spacecraft re-entry documentary; capped at 120s (2 min) via end=
  avVideoUrl: 'https://www.youtube.com/embed/REc5oJUt81E?enablejsapi=1',
  avPools: DEFAULT_AV_POOLS.map(p => ({ ...p, id: crypto.randomUUID() })),
})

// ── Component ─────────────────────────────────────────────────────────────────

export default function MCAdminPage() {
  const router = useRouter()
  const [s, setS] = useState<MCState>(defaultState())
  const [timeLeft, setTimeLeft] = useState(MC_TIME_MS)
  const [avSent, setAvSent] = useState(false)
  const [avOpen, setAvOpen] = useState(false)
  const [avTab, setAvTab] = useState<number>(0)   // 0 / 1 / 2 → which of the 3 pools is being edited
  const [newQ, setNewQ] = useState({ text: '', answer: '' })
  const [editingQ, setEditingQ] = useState<string | null>(null)
  // Registered teams pulled from Supabase for the dropdown selectors
  const [registeredTeams, setRegisteredTeams] = useState<RegisteredTeam[]>([])
  const [teamsLoading, setTeamsLoading] = useState(true)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const stateRef = useRef(s)
  stateRef.current = s

  // Grace window for MC: when the 60s timer hits 0 admin still gets 10 extra
  // seconds to award a last-second correct answer before the phase flips to
  // the team's summary screen.
  const MC_GRACE_MS = 5_000
  const [mcGraceStart, setMcGraceStart] = useState<number | null>(null)
  const mcGraceStartRef = useRef<number | null>(null)
  mcGraceStartRef.current = mcGraceStart
  const [mcGraceMs, setMcGraceMs] = useState(0)

  const broadcast = useCallback((st: MCState) => wsBroadcast(CHANNEL, safeForAudience(st)), [])
  const update = useCallback((st: MCState) => { setS(st); broadcast(st) }, [broadcast])

  // Load registered teams from Supabase on mount so setup can pick from a
  // dropdown. Fails silently to text input if the DB is unreachable.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Use the service-role client (matches how the FSC admin loads teams)
        // so RLS on fsc_teams doesn't wipe out the list, and drop the status
        // filter so newly added teams appear even if their status isn't set.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabaseAdmin as any)
          .from('fsc_teams')
          .select('*')
          .order('created_at')
        if (!cancelled && data) setRegisteredTeams(data as RegisteredTeam[])
      } catch { /* offline / DB unreachable — dropdown just stays empty */ }
      finally { if (!cancelled) setTeamsLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  // Timer — 60s per team, then a 10s grace window before we flip to summary.
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    const playing = ['a_playing','b_playing','c_playing'].includes(s.phase)
    if (!playing || !s.timerStart) { setTimeLeft(MC_TIME_MS); return }
    // Fresh turn → clear any stale grace from the previous team's expiry.
    setMcGraceStart(null); setMcGraceMs(0)
    mcGraceStartRef.current = null

    const tick = () => {
      const left = Math.max(0, MC_TIME_MS - (Date.now() - (stateRef.current.timerStart ?? 0)))
      setTimeLeft(left)
      // Open the grace window the moment the 60s runs out — do NOT flip yet.
      if (left === 0 && mcGraceStartRef.current === null) {
        const now = Date.now()
        setMcGraceStart(now); mcGraceStartRef.current = now
      }
      // Count the grace window down separately.
      if (mcGraceStartRef.current !== null) {
        const graceLeft = Math.max(0, MC_GRACE_MS - (Date.now() - mcGraceStartRef.current))
        setMcGraceMs(graceLeft)
        if (graceLeft === 0) {
          const cur = stateRef.current
          if (!['a_playing','b_playing','c_playing'].includes(cur.phase)) return
          const next: MCState = {
            ...cur,
            phase: cur.phase === 'a_playing' ? 'summary_A' : cur.phase === 'b_playing' ? 'summary_B' : 'summary_C',
            timerStart: null, revealed: false,
          }
          setS(next); broadcast(next); clearInterval(timerRef.current!)
          setMcGraceStart(null); mcGraceStartRef.current = null; setMcGraceMs(0)
        }
      }
    }
    tick(); timerRef.current = setInterval(tick, 200)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [s.phase, s.timerStart, broadcast])

  const pickMystery = (packId: string) => {
    const cur = stateRef.current
    const pack = cur.packs.find(p => p.id === packId)!
    const queue = [...pack.puzzles]
    // storyStartAt = now so every screen advances the subtitle in lockstep
    const now = Date.now()
    if (cur.phase === 'pick_A') update({ ...cur, chosenA: packId, phase: 'story_A', queueA: queue, storyStartAt: now })
    else if (cur.phase === 'pick_B') update({ ...cur, chosenB: packId, phase: 'story_B', queueB: queue, storyStartAt: now })
    else if (cur.phase === 'pick_C') update({ ...cur, chosenC: packId, phase: 'story_C', queueC: queue, storyStartAt: now })
  }

  const startRiddles = () => {
    const cur = stateRef.current
    update({
      ...cur,
      phase: cur.phase === 'story_A' ? 'a_playing' : cur.phase === 'story_B' ? 'b_playing' : 'c_playing',
      timerStart: Date.now(),
      // Answer is always visible for every riddle — host doesn't have to click reveal.
      revealed: true,
    })
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
    // If this correct answer emptied the queue (all 10 unlocked), auto-transition
    // to that team's summary screen and stop the timer.
    const nextPhase: MCPhase = queue.length === 0
      ? (cur.phase === 'a_playing' ? 'summary_A' : cur.phase === 'b_playing' ? 'summary_B' : 'summary_C')
      : cur.phase
    const nextTimerStart = queue.length === 0 ? null : cur.timerStart
    update({
      ...cur,
      phase: nextPhase,
      timerStart: nextTimerStart,
      [qKey]: queue,
      [scoreKey]: result === 'correct' ? cur[scoreKey] + MC_PTS : cur[scoreKey],
      [revKey]: nextRevealed,
      // Keep answer visible for the next puzzle too — no click needed.
      revealed: true,
    })
  }

  const reveal = () => update({ ...s, revealed: !s.revealed })

  // Skip to the current team's summary immediately (host cuts the round short)
  const endRound = () => {
    const cur = stateRef.current
    const next: MCPhase =
      cur.phase === 'a_playing' ? 'summary_A' :
      cur.phase === 'b_playing' ? 'summary_B' :
      cur.phase === 'c_playing' ? 'summary_C' :
      cur.phase
    // Explicit end clears the grace window too.
    setMcGraceStart(null); mcGraceStartRef.current = null; setMcGraceMs(0)
    update({ ...cur, phase: next, timerStart: null, revealed: false })
  }

  // From a team's summary → next team's pick, or the MC-only compare screen
  // after team C. compare_mc → compare_total → done → declare_second_runnerup.
  const continueFromSummary = () => {
    update({
      ...s,
      phase: s.phase === 'summary_A' ? 'pick_B'
        : s.phase === 'summary_B' ? 'pick_C'
        : 'compare_mc',
      timerStart: null, revealed: false,
    })
  }
  const goToCompareTotal = () => update({ ...s, phase: 'compare_total' })
  const goToDoneFromCompare = () => update({ ...s, phase: 'done' })

  const nextTeam = () => {
    update({
      ...s,
      phase: s.phase === 'a_playing' ? 'summary_A' : s.phase === 'b_playing' ? 'summary_B' : 'summary_C',
      timerStart: null, revealed: false,
    })
  }

  const reset = () => update(defaultState())
  // Full reset: clears both mc:state and av:state so every audience projector
  // falls back to the Welcome page, and the admin lands on a fresh setup form
  // ready to enter the next match's teams.
  const resetMatch = () => {
    if (!confirm('Reset the entire match? This clears Mystery Chain and Audio Visual state. Every projector will show the Welcome page.')) return
    wsBroadcast('av:state', { phase: 'idle' })
    update(defaultState())
  }

  // AV pool helpers (local state only — broadcast happens on Advance)
  const updateAVQ = (id: string, field: 'text' | 'answer', val: string) => {
    setS(p => ({
      ...p,
      avPools: p.avPools.map((pl, i) =>
        i === avTab ? { ...pl, questions: pl.questions.map(q => q.id === id ? { ...q, [field]: val } : q) } : pl
      ),
    }))
  }
  const deleteAVQ = (id: string) => {
    setS(p => ({
      ...p,
      avPools: p.avPools.map((pl, i) =>
        i === avTab ? { ...pl, questions: pl.questions.filter(q => q.id !== id) } : pl
      ),
    }))
  }
  const addAVQ = () => {
    if (!newQ.text.trim()) return
    const q: AVQSetup = { id: crypto.randomUUID(), text: newQ.text.trim(), answer: newQ.answer.trim() }
    setS(p => ({
      ...p,
      avPools: p.avPools.map((pl, i) =>
        i === avTab ? { ...pl, questions: [...pl.questions, q] } : pl
      ),
    }))
    setNewQ({ text: '', answer: '' })
  }
  const updatePoolTitle = (val: string) => {
    setS(p => ({
      ...p,
      avPools: p.avPools.map((pl, i) => i === avTab ? { ...pl, title: val } : pl),
    }))
  }
  const currentPool = s.avPools[avTab]
  const currentAVQs = currentPool?.questions ?? []

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
  const poolReady = (i: number) => (s.avPools[i]?.questions.length ?? 0) >= 10 && (s.avPools[i]?.questions ?? []).every(q => q.answer.trim())
  // Ready when at least the 3 real pools are filled — the optional 4th "Demo"
  // pool doesn't have to be complete for admin to advance.
  const avPoolsReady = s.avPools.length >= 3 && [0,1,2].every(i => poolReady(i))
  const canBegin = s.teamA && s.teamB && s.teamC && avPoolsReady

  return (
    <div className="h-screen bg-[#0a1628] text-white p-3 overflow-hidden">
      <div className="max-w-3xl mx-auto space-y-2 h-full overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#f5a623] text-[10px] font-bold uppercase tracking-widest">Admin Control</p>
            <h1 className="text-white text-lg font-black">🔮 Mystery Chain</h1>
          </div>
          <div className="flex gap-2">
            <a href="/mystery-chain/audience" target="_blank"
              className="text-xs bg-purple-600/30 border border-purple-500/40 text-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-600/50">
              Audience ↗
            </a>
            {s.phase !== 'setup' && (
              <button onClick={reset} className="text-xs bg-red-600/20 border border-red-500/30 text-red-400 px-3 py-1.5 rounded-lg">
                Reset Phase
              </button>
            )}
            <button onClick={resetMatch}
              title="Clear all state and return to a fresh setup — projectors show Welcome"
              className="text-xs bg-gradient-to-r from-[#006B3F] to-[#00854E] hover:brightness-110 border border-[#FFD700]/60 text-white px-3 py-1.5 rounded-lg font-black">
              ↺ Reset Match
            </button>
          </div>
        </div>

        {/* ─── SETUP ───────────────────────────────────────────────────────── */}
        {s.phase === 'setup' && (
          <div className="space-y-2">

            <AdminRoundIntro info={ROUND_INFO.mystery_chain} defaultOpen={false} />

            {/* Team names + mysteries in one row for compactness */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-3 space-y-2">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-white font-bold text-sm">Teams &amp; Semi-Final Scores</h2>
                  <span className="text-[10px] text-slate-500">
                    {teamsLoading ? 'loading teams…' : `${registeredTeams.length} registered`}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2 text-[9px] font-bold uppercase tracking-widest text-slate-500 items-center pt-1">
                  <span>Team</span>
                  <span className="grid grid-cols-4 gap-1 text-center">
                    <span className="text-[#f5a623]">RF</span>
                    <span className="text-blue-400">BZ</span>
                    <span className="text-cyan-400">IS</span>
                    <span className="text-white">Semi</span>
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {(['A','B','C'] as const).map((letter) => {
                    const nameKey = `team${letter}` as const
                    const rfKey = `rf${letter}` as const
                    const bzKey = `bz${letter}` as const
                    const isKey = `is${letter}` as const
                    const semi = (s[rfKey] || 0) + (s[bzKey] || 0) + (s[isKey] || 0)
                    const setBreakdown = (key: typeof rfKey | typeof bzKey | typeof isKey, val: number) => {
                      setS(p => {
                        const next = { ...p, [key]: val }
                        next.semiA = (next.rfA || 0) + (next.bzA || 0) + (next.isA || 0)
                        next.semiB = (next.rfB || 0) + (next.bzB || 0) + (next.isB || 0)
                        next.semiC = (next.rfC || 0) + (next.bzC || 0) + (next.isC || 0)
                        return next
                      })
                    }
                    return (
                      <div key={letter} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                        <div className="flex gap-1.5 items-center min-w-0">
                          <span className="text-[10px] font-bold text-slate-500 w-3 shrink-0">{letter}</span>
                          {registeredTeams.length > 0 ? (
                            <select
                              value={s[nameKey]}
                              onChange={e => setS(p => ({ ...p, [nameKey]: e.target.value }))}
                              className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded-lg px-1.5 py-1.5 text-white text-xs"
                            >
                              <option value="">— select team —</option>
                              {registeredTeams.map(t => (
                                <option key={t.id} value={t.name}>{t.name}{t.school ? ` (${t.school})` : ''}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={s[nameKey]}
                              onChange={e => setS(p => ({ ...p, [nameKey]: e.target.value }))}
                              placeholder={`Team ${letter}`}
                              className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-xs"
                            />
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          <input type="number" min="0"
                            value={s[rfKey] || ''}
                            onChange={e => setBreakdown(rfKey, Number(e.target.value) || 0)}
                            title="Rapid Fire score"
                            placeholder="0"
                            className="w-12 bg-slate-800 border border-[#f5a623]/40 rounded-lg px-1 py-1.5 text-[#f5a623] text-xs text-center font-bold" />
                          <input type="number" min="0"
                            value={s[bzKey] || ''}
                            onChange={e => setBreakdown(bzKey, Number(e.target.value) || 0)}
                            title="Buzzer score"
                            placeholder="0"
                            className="w-12 bg-slate-800 border border-blue-500/40 rounded-lg px-1 py-1.5 text-blue-300 text-xs text-center font-bold" />
                          <input type="number" min="0"
                            value={s[isKey] || ''}
                            onChange={e => setBreakdown(isKey, Number(e.target.value) || 0)}
                            title="Innovation Sprint score"
                            placeholder="0"
                            className="w-12 bg-slate-800 border border-cyan-500/40 rounded-lg px-1 py-1.5 text-cyan-300 text-xs text-center font-bold" />
                          <div className="w-12 bg-white/10 border border-white/20 rounded-lg px-1 py-1.5 text-white text-xs text-center font-black tabular-nums">
                            {semi}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-slate-500">Enter each team&apos;s RF, Buzzer, and Innovation Sprint scores. Semi is auto-summed and carries into every Mystery Chain total.</p>
              </div>

              <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-3 space-y-2">
                <h2 className="text-white font-bold text-sm">4 Mysteries</h2>
                <div className="grid grid-cols-2 gap-1.5">
                  {s.packs.map(p => (
                    <div key={p.id} className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-1.5">
                      <p className="text-base leading-none">{p.emoji}</p>
                      <p className="text-white font-bold text-[11px] mt-1 leading-tight">{p.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── AV Round Setup ──────────────────────────────────────────── */}
            <div className="bg-[#0d1f3c] border border-purple-700/50 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-purple-900/20 transition-colors"
                onClick={() => setAvOpen(o => !o)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-purple-400 font-bold text-sm">📺 Audio Visual Round Setup</span>
                  {avPoolsReady
                    ? <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">✓ Ready · 3 pools of {s.avPools[0]?.questions.length ?? 0}</span>
                    : <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full">Fill 10 answers in each of the 3 pools</span>
                  }
                </div>
                <span className="text-slate-500 text-xs">{avOpen ? '▲' : '▼'}</span>
              </button>

              {avOpen && (
                <div className="px-4 pb-4 space-y-4 border-t border-purple-700/30">
                  <p className="text-slate-400 text-xs pt-3">
                    2-minute video, then each team picks one of the <b className="text-white">3 themed pools</b> and has
                    <b className="text-white"> 60 seconds</b> to answer up to 10 questions from that pool.
                    Correct = <b className="text-white">10 pts</b>. Wrong or skipped questions cycle to the back so teams can retry within the 60s.
                    Scores carry forward from Mystery Chain automatically.
                  </p>

                  {/* Video URL */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 font-semibold block">YouTube Video URL</label>
                    <input
                      value={s.avVideoUrl}
                      onChange={e => {
                        const url = e.target.value
                        const embed = toEmbedUrl(url)
                        setS(p => ({ ...p, avVideoUrl: embed || url }))
                      }}
                      placeholder="https://youtube.com/watch?v=... or embed URL"
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                    />
                    <p className="text-xs text-slate-500">Paste any YouTube URL — it will be converted to embed format automatically.</p>
                  </div>

                  {/* Questions — 3 pools */}
                  <div className="space-y-2">
                    <div className="flex gap-2 border-b border-slate-700 pb-1 flex-wrap">
                      {s.avPools.map((pl, i) => (
                        <button key={pl.id} onClick={() => { setAvTab(i); setEditingQ(null) }}
                          className={`text-xs font-bold px-3 py-1.5 rounded-t-lg transition-colors ${
                            avTab === i
                              ? 'bg-purple-700/40 text-white border border-purple-500/40'
                              : 'text-slate-400 hover:text-white'
                          }`}>
                          Pool {i + 1} ({pl.questions.length})
                          {poolReady(i) && <span className="text-green-400 ml-1">✓</span>}
                        </button>
                      ))}
                    </div>

                    {/* Pool title editor */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Pool title</label>
                      <input value={currentPool?.title ?? ''} onChange={e => updatePoolTitle(e.target.value)}
                        placeholder="Themed title, e.g. Undocking & Departure"
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-sm" />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-xs text-gray-400 font-semibold">
                        Pool {avTab + 1} questions ({currentAVQs.length}/10) — fill in ALL answers
                      </label>
                    </div>

                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {currentAVQs.map((q, i) => (
                        <div key={q.id} className="bg-slate-800/60 rounded-xl p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-slate-500 font-bold w-5 shrink-0 mt-2">{i + 1}</span>
                            <div className="flex-1 space-y-1.5">
                              {editingQ === q.id ? (<>
                                <input
                                  value={q.text}
                                  onChange={e => updateAVQ(q.id, 'text', e.target.value)}
                                  className="w-full bg-slate-700 border border-slate-500 rounded-lg px-2 py-1.5 text-white text-sm"
                                  placeholder="Question text"
                                  autoFocus
                                />
                                <input
                                  value={q.answer}
                                  onChange={e => updateAVQ(q.id, 'answer', e.target.value)}
                                  className="w-full bg-slate-700 border border-green-500/40 rounded-lg px-2 py-1.5 text-green-300 text-sm"
                                  placeholder="Answer"
                                />
                                <button onClick={() => setEditingQ(null)} className="text-xs text-purple-400 hover:text-purple-300">Done editing</button>
                              </>) : (<>
                                <p className="text-white text-sm leading-snug">{q.text}</p>
                                <p className={`text-xs ${q.answer ? 'text-green-400' : 'text-red-400/70 italic'}`}>
                                  {q.answer ? `Answer: ${q.answer}` : '⚠ Answer not set — click Edit'}
                                </p>
                              </>)}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {editingQ !== q.id && (
                                <button onClick={() => setEditingQ(q.id)} className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-700">Edit</button>
                              )}
                              <button onClick={() => deleteAVQ(q.id)} className="text-xs text-slate-600 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-slate-700">✕</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add question */}
                    <div className="bg-slate-800/40 rounded-xl p-3 space-y-2 border border-dashed border-slate-600">
                      <p className="text-xs text-slate-500 font-semibold">Add a question</p>
                      <input
                        value={newQ.text}
                        onChange={e => setNewQ(p => ({ ...p, text: e.target.value }))}
                        placeholder="Question text…"
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-sm"
                      />
                      <input
                        value={newQ.answer}
                        onChange={e => setNewQ(p => ({ ...p, answer: e.target.value }))}
                        placeholder="Answer…"
                        className="w-full bg-slate-700 border border-green-500/30 rounded-lg px-2 py-1.5 text-green-300 text-sm"
                        onKeyDown={e => e.key === 'Enter' && addAVQ()}
                      />
                      <button onClick={addAVQ} disabled={!newQ.text.trim()}
                        className="text-xs bg-purple-600/40 hover:bg-purple-600/70 disabled:opacity-40 text-purple-300 px-3 py-1.5 rounded-lg font-semibold">
                        + Add Question
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Begin button */}
            {!canBegin && (
              <p className="text-center text-xs text-slate-500">
                {!s.teamA || !s.teamB || !s.teamC ? 'Enter all 3 team names · ' : ''}
                {!avPoolsReady ? 'Open AV Round Setup and fill in all question answers for all 3 pools' : ''}
              </p>
            )}
            <button onClick={() => update({ ...s, phase: 'intro' })}
              disabled={!canBegin}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-4 rounded-xl text-lg">
              Begin Mystery Chain →
            </button>
          </div>
        )}

        {/* ─── INTRO ───────────────────────────────────────────────────────── */}
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

        {/* ─── PICK PHASE ──────────────────────────────────────────────────── */}
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

        {/* ─── STORY PHASE ─────────────────────────────────────────────────── */}
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

        {/* ─── PLAYING ─────────────────────────────────────────────────────── */}
        {isPlaying && (
          <div className="space-y-4">
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

            {mcGraceStart !== null && (
              <div className="rounded-2xl border-2 border-amber-400/60 bg-amber-500/15 p-3 text-center animate-pulse">
                <p className="text-amber-300 text-[10px] font-black uppercase tracking-[0.3em]">⏰ Grace Window — Grade Last Answer</p>
                <p className="text-white text-2xl font-black mt-0.5 tabular-nums">{(mcGraceMs / 1000).toFixed(1)}s</p>
                <p className="text-amber-200/70 text-[10px] mt-0.5">Correct still counts before we move on.</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {[
                {name:s.teamA, semi:s.semiA, mc:s.scoreA, k:'A'},
                {name:s.teamB, semi:s.semiB, mc:s.scoreB, k:'B'},
                {name:s.teamC, semi:s.semiC, mc:s.scoreC, k:'C'},
              ].map(t => {
                const active = (s.phase==='a_playing'&&t.k==='A')||(s.phase==='b_playing'&&t.k==='B')||(s.phase==='c_playing'&&t.k==='C')
                return (
                  <div key={t.k} className={`rounded-xl p-3 text-center border ${active ? 'bg-purple-600/20 border-purple-500' : 'bg-white/5 border-white/10'}`}>
                    <p className="text-slate-300 text-xs font-semibold truncate">{t.name}</p>
                    <p className="text-white text-2xl font-black">{t.semi + t.mc}</p>
                    <p className="text-slate-500 text-[10px]">Semi {t.semi} + MC {t.mc}</p>
                  </div>
                )
              })}
            </div>

            {currentPuzzle ? (
              <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-5 space-y-3">
                <div className="flex justify-center">
                  <div className="bg-slate-800/60 rounded-2xl px-8 py-4 text-center">
                    <p className="text-7xl">{currentPuzzle.picture}</p>
                  </div>
                </div>
                <p className="text-slate-400 text-sm text-center">
                  Clue: <span className="text-white font-semibold">{currentPuzzle.clue}</span>
                </p>
                <p className="text-[#f5a623] text-4xl font-black tracking-[0.25em] text-center">{currentPuzzle.scrambled}</p>
                {/* Answer is always visible on the admin — the host needs it to
                    judge answers instantly without an extra click. */}
                <div className="bg-green-500/15 border border-green-500/40 rounded-xl px-4 py-2 text-center">
                  <span className="text-green-400 text-[10px] font-bold uppercase tracking-widest mr-2">Answer</span>
                  <span className="text-green-300 text-2xl font-black tracking-[0.15em]">{currentPuzzle.answer}</span>
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center text-slate-500">No more puzzles</div>
            )}

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

            <button onClick={endRound} className="w-full border border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 py-3 rounded-xl text-sm font-semibold">
              End Round Early → Review
            </button>
          </div>
        )}

        {/* ─── SUMMARY (per-team review after playing) ───────────────────── */}
        {(s.phase === 'summary_A' || s.phase === 'summary_B' || s.phase === 'summary_C') && (() => {
          const teamName = s.phase === 'summary_A' ? s.teamA : s.phase === 'summary_B' ? s.teamB : s.teamC
          const packId = s.phase === 'summary_A' ? s.chosenA : s.phase === 'summary_B' ? s.chosenB : s.chosenC
          const revealed = s.phase === 'summary_A' ? s.revealedA : s.phase === 'summary_B' ? s.revealedB : s.revealedC
          const mcScore = s.phase === 'summary_A' ? s.scoreA : s.phase === 'summary_B' ? s.scoreB : s.scoreC
          const pack = s.packs.find(p => p.id === packId)
          const puzzles = pack?.puzzles ?? []
          const unlockedSet = new Set(revealed)
          const correctCount = puzzles.filter(p => unlockedSet.has(p.storySnippet)).length
          const isLastTeam = s.phase === 'summary_C'
          const nextTeamName = s.phase === 'summary_A' ? s.teamB : s.phase === 'summary_B' ? s.teamC : ''
          return (
            <div className="space-y-3">
              {/* Header — team + score for this round */}
              <div className="bg-[#0d1f3c] border border-purple-500/40 rounded-2xl p-4 text-center space-y-1">
                <p className="text-purple-300 text-[10px] font-bold uppercase tracking-widest">Round Complete</p>
                <p className="text-white font-black text-lg">{pack?.emoji} {teamName}</p>
                <div className="flex items-center justify-center gap-4 mt-2">
                  <span className="text-slate-400 text-xs">Unlocked: <b className="text-green-400">{correctCount}</b> / {puzzles.length}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-400 text-xs">This round: <b className="text-[#f5a623]">{mcScore} pts</b></span>
                </div>
              </div>

              {/* All 10 story snippets — green if unlocked, red if not */}
              <div className="bg-[#0d1f3c] border border-slate-700 rounded-2xl p-4 space-y-2">
                <p className="text-[#f5a623] text-[10px] font-bold uppercase tracking-widest mb-2">Story review</p>
                <div className="space-y-1.5">
                  {puzzles.map((p, i) => {
                    const unlocked = unlockedSet.has(p.storySnippet)
                    return (
                      <div key={p.id} className={`rounded-lg px-3 py-2 flex items-start gap-2 border ${
                        unlocked ? 'bg-green-500/15 border-green-500/40' : 'bg-red-500/10 border-red-500/30'
                      }`}>
                        <span className={`text-xs font-black w-5 shrink-0 mt-0.5 ${unlocked ? 'text-green-400' : 'text-red-400'}`}>{i + 1}.</span>
                        <p className={`text-sm leading-snug ${unlocked ? 'text-green-100' : 'text-red-200/70 line-through'}`}>{p.storySnippet}</p>
                        <span className="ml-auto text-xs font-bold shrink-0">{unlocked ? '✓' : '✗'}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <button onClick={continueFromSummary}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl">
                {isLastTeam ? 'Show Mystery Chain Scores →' : `Continue to ${nextTeamName} →`}
              </button>
            </div>
          )
        })()}

        {/* ─── COMPARE MC scores only (audience: dedicated page) ─────────── */}
        {s.phase === 'compare_mc' && (
          <div className="space-y-3">
            <div className="bg-[#0d1f3c] border border-purple-500/40 rounded-2xl p-4 space-y-3">
              <p className="text-purple-300 text-[10px] font-bold uppercase tracking-widest text-center">Mystery Chain · Scores</p>
              <div className="grid grid-cols-3 gap-2">
                {([['A', s.teamA, s.scoreA, '#22c55e'], ['B', s.teamB, s.scoreB, '#3b82f6'], ['C', s.teamC, s.scoreC, '#a855f7']] as const).map(([k, name, score, colour]) => (
                  <div key={k} className="rounded-xl p-3 text-center border border-white/10 bg-white/5">
                    <p className="text-[10px] font-bold uppercase tracking-widest truncate" style={{ color: colour }}>{name}</p>
                    <p className="text-white text-3xl font-black mt-1">{score}</p>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={goToCompareTotal}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl">
              Show Cumulative Scores →
            </button>
          </div>
        )}

        {/* ─── COMPARE cumulative totals (audience: dedicated page) ──────── */}
        {s.phase === 'compare_total' && (() => {
          const teams = [
            { key: 'A', name: s.teamA, semi: s.semiA, mc: s.scoreA, rf: s.rfA, bz: s.bzA, is: s.isA, colour: '#22c55e' },
            { key: 'B', name: s.teamB, semi: s.semiB, mc: s.scoreB, rf: s.rfB, bz: s.bzB, is: s.isB, colour: '#3b82f6' },
            { key: 'C', name: s.teamC, semi: s.semiC, mc: s.scoreC, rf: s.rfC, bz: s.bzC, is: s.isC, colour: '#a855f7' },
          ].map(t => ({ ...t, total: t.semi + t.mc })).sort((a, b) => b.total - a.total)
          return (
            <div className="space-y-3">
              <div className="bg-[#0d1f3c] border border-[#f5a623]/40 rounded-2xl p-4 space-y-3">
                <p className="text-[#f5a623] text-[10px] font-bold uppercase tracking-widest text-center">Cumulative Scores</p>
                <div className="space-y-2">
                  {teams.map((t, i) => (
                    <div key={t.key} className="rounded-xl border border-white/10 bg-white/5 p-2 flex items-center gap-2">
                      <span className="text-lg">{['🥇','🥈','🥉'][i]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest truncate" style={{ color: t.colour }}>{t.name}</p>
                        <p className="text-[9px] text-slate-500 truncate">RF {t.rf} · BZ {t.bz} · IS {t.is} · MC {t.mc}</p>
                      </div>
                      <span className="text-white text-2xl font-black shrink-0">{t.total}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={goToDoneFromCompare}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl">
                Show Ranking &amp; Declare Second Runner Up →
              </button>
            </div>
          )
        })()}

        {/* ─── DONE (Regular results screen) ─────────────────────────────── */}
        {(s.phase === 'done' || s.phase === 'declare_second_runnerup') && (() => {
          // Sort by CUMULATIVE score (semi-final + Mystery Chain).
          // The lowest cumulative is the Second Runner Up of Oyo State Scholars Challenge 2026.
          const ranked = [
            { name: s.teamA, semi: s.semiA, mc: s.scoreA, rf: s.rfA, bz: s.bzA, is: s.isA, packId: s.chosenA, rev: s.revealedA },
            { name: s.teamB, semi: s.semiB, mc: s.scoreB, rf: s.rfB, bz: s.bzB, is: s.isB, packId: s.chosenB, rev: s.revealedB },
            { name: s.teamC, semi: s.semiC, mc: s.scoreC, rf: s.rfC, bz: s.bzC, is: s.isC, packId: s.chosenC, rev: s.revealedC },
          ].map(t => ({ ...t, total: t.semi + t.mc }))
            .sort((a, b) => b.total - a.total)

          const secondRunnerUp = ranked[2]
          const winners = ranked.slice(0, 2)

          // ── Dedicated Second Runner Up declaration page ──
          if (s.phase === 'declare_second_runnerup') {
            return (
              <div className="min-h-[75vh] flex flex-col items-center justify-center gap-6 text-center px-4">
                <p className="text-[#f5a623] text-xs font-bold uppercase tracking-[0.3em]">Oyo State Scholars Challenge 2026</p>
                <div className="text-7xl animate-bounce">🥉</div>
                <p className="text-purple-300 text-sm font-bold uppercase tracking-widest">And the</p>
                <h1 className="text-5xl md:text-6xl font-black text-white leading-tight">Second Runner Up</h1>
                <p className="text-slate-400 text-sm">is</p>
                <div className="bg-gradient-to-br from-orange-900/40 to-purple-900/40 border-2 border-[#f5a623]/60 rounded-3xl px-10 py-8 shadow-2xl">
                  <p className="text-4xl md:text-5xl font-black text-[#f5a623] leading-tight">{secondRunnerUp.name}</p>
                  <p className="text-slate-300 text-sm mt-3">
                    Semi: <span className="font-bold text-white">{secondRunnerUp.semi}</span>
                    <span className="mx-2 text-slate-600">+</span>
                    Mystery Chain: <span className="font-bold text-white">{secondRunnerUp.mc}</span>
                    <span className="mx-2 text-slate-600">=</span>
                    <span className="font-black text-2xl text-white ml-1">{secondRunnerUp.total}</span>
                  </p>
                </div>
                <p className="text-slate-500 text-xs italic max-w-md">
                  Congratulations. The competition continues with {winners[0].name} and {winners[1].name} advancing to the Grand Final Audio Visual Round.
                </p>
                <button
                  onClick={() => update({ ...s, phase: 'done' })}
                  className="mt-4 text-xs bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-2 rounded-lg">
                  ← Back to results
                </button>
              </div>
            )
          }

          // ── Regular results screen ──
          return (
            <div className="space-y-4">
              <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-6">
                <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest text-center mb-4">
                  Cumulative Results (Semi + Mystery Chain)
                </p>
                <div className="space-y-3">
                  {ranked.map((t, i) => {
                    const pack = s.packs.find(p => p.id === t.packId)
                    const isLast = i === 2
                    const hasBreakdown = (t.rf + t.bz + t.is) > 0
                    return (
                      <div key={t.name}
                        className={`rounded-xl p-4 flex flex-col gap-2 ${
                          isLast ? 'bg-[#f5a623]/10 border border-[#f5a623]/30' : 'bg-white/5'
                        }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-2xl">{['🥇','🥈','🥉'][i]}</span>
                            <div className="min-w-0">
                              <p className="text-white font-bold truncate">{t.name}</p>
                              <p className="text-slate-500 text-xs truncate">
                                {pack?.emoji} {pack?.title}
                                {isLast && <span className="text-[#f5a623] font-bold ml-1">· Second Runner Up</span>}
                              </p>
                            </div>
                          </div>
                          <span className="text-white text-2xl font-black shrink-0">{t.total}</span>
                        </div>
                        {/* Score breakdown chips */}
                        <div className="grid grid-cols-5 gap-1 text-center">
                          {hasBreakdown ? (
                            <>
                              <div className="rounded-md bg-[#f5a623]/10 border border-[#f5a623]/30 px-1.5 py-1"><p className="text-[#f5a623] text-[8px] font-black uppercase tracking-wider">RF</p><p className="text-white text-xs font-black tabular-nums">{t.rf}</p></div>
                              <div className="rounded-md bg-blue-500/10 border border-blue-500/30 px-1.5 py-1"><p className="text-blue-300 text-[8px] font-black uppercase tracking-wider">BZ</p><p className="text-white text-xs font-black tabular-nums">{t.bz}</p></div>
                              <div className="rounded-md bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-1"><p className="text-cyan-300 text-[8px] font-black uppercase tracking-wider">IS</p><p className="text-white text-xs font-black tabular-nums">{t.is}</p></div>
                            </>
                          ) : (
                            <div className="col-span-3 rounded-md bg-white/5 border border-white/10 px-1.5 py-1"><p className="text-slate-400 text-[8px] font-black uppercase tracking-wider">Semi</p><p className="text-white text-xs font-black tabular-nums">{t.semi}</p></div>
                          )}
                          <div className="rounded-md bg-purple-500/10 border border-purple-500/30 px-1.5 py-1"><p className="text-purple-300 text-[8px] font-black uppercase tracking-wider">MC</p><p className="text-white text-xs font-black tabular-nums">{t.mc}</p></div>
                          <div className="rounded-md bg-yellow-500/15 border border-yellow-500/40 px-1.5 py-1"><p className="text-yellow-300 text-[8px] font-black uppercase tracking-wider">Total</p><p className="text-white text-xs font-black tabular-nums">{t.total}</p></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <PointAdjuster
                teams={[
                  { label: s.teamA || 'Team A', score: s.scoreA, colour: '#22c55e', onAdjust: d => update({ ...s, scoreA: Math.max(0, s.scoreA + d) }) },
                  { label: s.teamB || 'Team B', score: s.scoreB, colour: '#3b82f6', onAdjust: d => update({ ...s, scoreB: Math.max(0, s.scoreB + d) }) },
                  { label: s.teamC || 'Team C', score: s.scoreC, colour: '#a855f7', onAdjust: d => update({ ...s, scoreC: Math.max(0, s.scoreC + d) }) },
                ]}
                note="Adjusts the Mystery Chain score (semi-final scores stay untouched). Ranking updates instantly."
              />

              {/* Declare Second Runner Up */}
              <button
                onClick={() => update({ ...s, phase: 'declare_second_runnerup' })}
                className="w-full bg-[#f5a623]/20 hover:bg-[#f5a623]/30 border border-[#f5a623]/50 text-[#f5a623] font-bold py-3 rounded-xl">
                🥉 Declare Second Runner Up — {secondRunnerUp.name}
              </button>

              {/* Advance to AV Round */}
              <div className="bg-purple-900/20 border border-purple-500/40 rounded-2xl p-4 space-y-3">
                <div>
                  <p className="text-purple-300 text-xs font-bold uppercase tracking-widest">Grand Final — Audio Visual Round</p>
                  <p className="text-white font-bold mt-1">
                    <span className="text-green-400">{winners[0].name}</span>
                    <span className="text-slate-400 text-sm font-normal"> ({winners[0].total} pts) </span>
                    <span className="text-slate-500">vs</span>
                    <span className="text-blue-400"> {winners[1].name}</span>
                    <span className="text-slate-400 text-sm font-normal"> ({winners[1].total} pts)</span>
                  </p>
                  <p className="text-slate-500 text-xs mt-1">
                    Cumulative scores carry forward · {s.avPools.length} pools of {s.avPools[0]?.questions.length ?? 0} · video pre-configured
                  </p>
                </div>
                <button
                  onClick={() => {
                    const buildQs = (arr: AVQSetup[]) =>
                      arr.map(q => ({ id: q.id, text: q.text, answer: q.answer, revealed: false, answeredBy: null as 'A' | 'B' | null }))
                    const pools = s.avPools.map(pl => ({
                      id: pl.id,
                      title: pl.title,
                      questions: buildQs(pl.questions),
                    }))
                    // Field name kept as mcScoreA/B for schema stability — it now
                    // holds the cumulative (semi + MC) carried forward into AV.
                    wsBroadcast('av:state', {
                      _from_mc: true,
                      phase: 'idle',
                      videoUrl: s.avVideoUrl,
                      videoPlay: false,
                      teamA: winners[0].name,
                      teamB: winners[1].name,
                      mcScoreA: winners[0].total,
                      mcScoreB: winners[1].total,
                      // Per-round breakdown of the prior total, so AV's
                      // compare_total screen can show RF/BZ/IS/MC chips.
                      rfA: winners[0].rf, rfB: winners[1].rf,
                      bzA: winners[0].bz, bzB: winners[1].bz,
                      isA: winners[0].is, isB: winners[1].is,
                      mcOnlyA: winners[0].mc, mcOnlyB: winners[1].mc,
                      pools,
                      chosenPoolA: null,
                      chosenPoolB: null,
                      queueA: [],
                      queueB: [],
                      timerStart: null,
                      scoreA: winners[0].total,
                      scoreB: winners[1].total,
                      correctA: 0,
                      correctB: 0,
                    })
                    wsBroadcast('mc:goto_av', { at: Date.now() })
                    setAvSent(true)
                    setTimeout(() => router.push('/audio-visual/admin'), 800)
                  }}
                  className={`w-full font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors ${
                    avSent ? 'bg-green-700 text-white cursor-default' : 'bg-purple-600 hover:bg-purple-500 text-white'
                  }`}
                >
                  {avSent ? '✓ Teams sent — navigating to AV admin…' : '📺 Advance Top 2 → Audio Visual Round'}
                </button>
              </div>

              <button onClick={reset} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl">
                Start New Game
              </button>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
