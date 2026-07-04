'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'
import AVAudienceView from '@/components/av-audience-view'

const CHANNEL = 'mc:state'
const MC_TIME_MS = 60_000

type MCPhase =
  | 'setup' | 'intro'
  | 'pick_A' | 'story_A' | 'a_playing'
  | 'pick_B' | 'story_B' | 'b_playing'
  | 'pick_C' | 'story_C' | 'c_playing'
  | 'done'

type PackCard = { id: string; title: string; emoji: string; teaser: string }

type MCAudienceState = {
  phase: MCPhase
  teamA: string; teamB: string; teamC: string
  packs: PackCard[]
  chosenA: string | null; chosenB: string | null; chosenC: string | null
  activePackTitle: string
  activePackEmoji: string
  activeOpeningStory: string
  activeRevealedStory: string[]
  revealedA: string[]; revealedB: string[]; revealedC: string[]
  scoreA: number; scoreB: number; scoreC: number
  timerStart: number | null
  revealed: boolean
  currentPuzzle: { picture: string; clue: string; scrambled: string; answer?: string } | null
}

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function StoryPhase({ s, storyTeam }: { s: MCAudienceState; storyTeam: string }) {
  const fullText = s.activeOpeningStory
  // Sentence-level subtitle synced to speech
  const [currentSentence, setCurrentSentence] = useState('')
  const [done, setDone] = useState(false)
  const [ttsState, setTtsState] = useState<'idle' | 'speaking' | 'blocked'>('idle')
  // Bumped every time the narration effect re-runs; stale callbacks
  // from a previous mount check against this to avoid the strict-mode
  // "both instances speak the story at once" bug.
  const sessionRef = useRef(0)

  // Split story into sentences (keep the terminator so pacing feels natural)
  const sentences = useMemo(() => {
    if (!fullText) return []
    // Split on sentence terminators while keeping them attached
    return fullText.match(/[^.!?]+[.!?]+(?:\s+|$)/g)?.map(s => s.trim()).filter(Boolean) ?? [fullText]
  }, [fullText])

  // Narrate one sentence at a time; show that sentence as subtitle while it plays.
  // When speech ends, clear the subtitle and speak the next one.
  useEffect(() => {
    if (!fullText || typeof window === 'undefined' || !window.speechSynthesis) return

    // Own this session so any stale callback from a prior effect run bails out
    const mySession = ++sessionRef.current
    const isCurrent = () => sessionRef.current === mySession

    // Kill anything already speaking or queued and let the browser settle
    window.speechSynthesis.cancel()
    setCurrentSentence('')
    setDone(false)

    let idx = 0
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v => /male|david|google uk|daniel/i.test(v.name))

    // Time-based fallback for when speech synthesis is blocked (autoplay policy)
    // Roughly matches natural reading pace: 55ms per character + min 2s per sentence.
    const readingDurationMs = (text: string) => Math.max(2000, text.length * 55)

    function advanceAfter(ms: number) {
      setTimeout(() => {
        if (!isCurrent()) return
        idx++
        setCurrentSentence('')
        setTimeout(speakNext, 220)
      }, ms)
    }

    function speakNext() {
      if (!isCurrent()) return
      if (idx >= sentences.length) {
        setCurrentSentence('')
        setDone(true)
        return
      }
      const sentence = sentences[idx]
      setCurrentSentence(sentence)

      // If TTS is available, try speaking; otherwise fall through to timer.
      if (!window.speechSynthesis) {
        advanceAfter(readingDurationMs(sentence))
        return
      }

      const utter = new SpeechSynthesisUtterance(sentence)
      utter.rate = 0.88
      utter.pitch = 0.95
      utter.volume = 1
      if (preferred) utter.voice = preferred

      let advanced = false
      const doAdvance = (delay: number) => {
        if (advanced) return
        advanced = true
        setTimeout(() => {
          if (!isCurrent()) return
          idx++
          setCurrentSentence('')
          setTimeout(speakNext, 220)
        }, delay)
      }

      utter.onstart = () => { if (isCurrent()) setTtsState('speaking') }
      utter.onend = () => doAdvance(0)
      utter.onerror = (e) => {
        if (!isCurrent()) return
        if (e.error === 'not-allowed' || e.error === 'audio-busy') setTtsState('blocked')
        // Even on error, keep the story moving using the reading-time fallback
        doAdvance(readingDurationMs(sentence))
      }

      window.speechSynthesis.speak(utter)

      // Safety net: if speech never started AND never ended after the expected
      // reading time + a grace window, force-advance so the story is not stuck.
      setTimeout(() => {
        if (!isCurrent() || advanced) return
        // If TTS never started, mark blocked and use the fallback duration
        if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
          setTtsState('blocked')
          doAdvance(0) // advance immediately since we've already been sitting here
        }
      }, readingDurationMs(sentence) + 1500)
    }

    // Small delay after cancel so the browser has drained the previous queue,
    // and to give voices a moment to load if they weren't ready yet.
    const delay = voices.length === 0 ? 350 : 120
    const t = setTimeout(speakNext, delay)

    return () => {
      // Invalidate this session — any callback firing later will noop
      sessionRef.current++
      clearTimeout(t)
      window.speechSynthesis.cancel()
    }
  }, [fullText, sentences])

  return (
    <div className="min-h-screen bg-[#06080f] text-white flex flex-col overflow-hidden relative">

      {/* ── TTS indicator (top-right) ── */}
      <div className="absolute top-3 right-3 z-30 pointer-events-auto">
        {ttsState === 'speaking' && (
          <div className="flex items-center gap-2 bg-green-900/70 border border-green-500/40 text-green-300 text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-sm shadow-lg">
            <span className="text-sm animate-pulse">🔊</span>
            <span>Narrating…</span>
            {/* animated soundwave bars */}
            <span className="inline-flex gap-0.5 items-end">
              {[0, 0.15, 0.3].map((delay, i) => (
                <span key={i} className="w-0.5 bg-green-300 inline-block rounded-full"
                  style={{ height: '10px', animation: `mcBar 0.8s ${delay}s ease-in-out infinite` }} />
              ))}
            </span>
          </div>
        )}
        {ttsState === 'blocked' && (
          <button
            onClick={() => {
              // Manual retry — kicks the sound off after user interaction
              setTtsState('idle')
              if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel()
                const nudge = new SpeechSynthesisUtterance(' ')
                nudge.volume = 1
                window.speechSynthesis.speak(nudge)
              }
              window.location.reload()
            }}
            className="flex items-center gap-2 bg-yellow-900/70 border border-yellow-500/50 text-yellow-200 text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-sm shadow-lg hover:bg-yellow-800/80">
            <span className="text-sm">🔇</span>
            <span>Sound blocked — click to enable</span>
          </button>
        )}
      </div>

      {/* ── FULL-SCREEN CARTOON SCENE ── */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        <svg viewBox="0 0 1000 560" xmlns="http://www.w3.org/2000/svg"
          style={{width:'100%', height:'100%', display:'block'}}>
          {s.activePackEmoji === '🏆' && <SceneMissingTrophy />}
          {s.activePackEmoji === '📋' && <SceneExamLeak />}
          {s.activePackEmoji === '👁️' && <SceneVanishingCoach />}
          {(s.activePackEmoji === '🔒' || !['🏆','📋','👁️'].includes(s.activePackEmoji)) && <SceneSilentWarning />}
        </svg>
      </div>

      {/* ── SCOREBOARD – top strip, above scene ── */}
      <div className="relative z-20 p-3">
        <Scoreboard s={s} activeKey={null} />
      </div>

      {/* ── TITLE – just below scoreboard ── */}
      <div className="relative z-20 text-center pt-1 pb-2">
        <p className="text-purple-300 text-xs font-bold uppercase tracking-[0.3em]">{storyTeam} selected</p>
        <p className="text-white text-2xl font-black tracking-tight drop-shadow-lg">
          {s.activePackEmoji} {s.activePackTitle}
        </p>
      </div>

      {/* ── SUBTITLE BAR – shows the sentence currently being spoken ── */}
      {currentSentence && (
        <div key={currentSentence} className="absolute bottom-0 inset-x-0 z-20 px-4 pb-4 pt-2"
          style={{
            background:'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.7) 70%, transparent 100%)',
            animation: 'mcSubIn 220ms ease-out',
          }}>
          <p className="text-white font-semibold text-center text-lg leading-7 min-h-[3.5rem] drop-shadow"
            style={{textShadow:'0 2px 8px rgba(0,0,0,0.9), 0 0 2px #000'}}>
            {currentSentence}
          </p>
        </div>
      )}
      {/* keyframes for the subtitle fade-in and the TTS soundwave bars */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes mcSubIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes mcBar {
          0%, 100% { transform: scaleY(0.4); }
          50%      { transform: scaleY(1); }
        }
      `}} />

      {/* Small waiting hint — stays visible even after subtitle fades */}
      {done && (
        <div className="absolute bottom-3 inset-x-0 z-30 text-center pointer-events-none">
          <p className="text-[#f5a623] text-xs font-bold tracking-widest animate-pulse drop-shadow-lg"
            style={{textShadow:'0 2px 8px rgba(0,0,0,0.9)'}}>
            ● WAITING FOR RIDDLES TO BEGIN…
          </p>
        </div>
      )}
    </div>
  )
}

// ── Shared walking student ──────────────────────────────────────────────────
function WalkingStudent({ x0, x1, t0, t1, dur, shirt, skin, hair, bag, delay = '0s' }:
  { x0:number; x1:number; t0:number; t1:number; dur:string; shirt:string; skin:string; hair:string; bag:string; delay?:string }) {
  const kv = `${x0},0; ${x0},0; ${x1},0; ${x1},0`
  const kt = `0; ${t0}; ${t1}; 1`
  return (
    <g>
      <animateTransform attributeName="transform" type="translate" values={kv} keyTimes={kt} dur={dur} repeatCount="indefinite"/>
      <circle cx="0" cy="350" r="17" fill={skin}/>
      <rect x="-13" y="333" width="26" height="11" rx="5" fill={hair}/>
      <rect x="-13" y="367" width="26" height="36" rx="5" fill={shirt}/>
      <rect x="13"  y="369" width="16" height="22" rx="4" fill={bag}/>
      <rect x="-11" y="403" width="10" height="26" rx="4" fill="#333">
        <animateTransform attributeName="transform" type="rotate" values="20,-6,403;-20,-6,403;20,-6,403" dur="0.5s" repeatCount="indefinite" begin={delay}/>
      </rect>
      <rect x="1"   y="403" width="10" height="26" rx="4" fill="#333">
        <animateTransform attributeName="transform" type="rotate" values="-20,6,403;20,6,403;-20,6,403" dur="0.5s" repeatCount="indefinite" begin={delay}/>
      </rect>
      <ellipse cx="-5" cy="429" rx="9" ry="4" fill="#111"/>
      <ellipse cx="5"  cy="429" rx="9" ry="4" fill="#111"/>
    </g>
  )
}

// ── Shared sky + ground ──────────────────────────────────────────────────────
function SceneSky({ fromColor, toColor, dur='35s' }: { fromColor:string; toColor:string; dur?:string }) {
  return (
    <>
      <rect width="1000" height="390" fill={fromColor}>
        <animate attributeName="fill" values={`${fromColor};${fromColor};#4a3a60;${toColor}`} keyTimes="0;0.45;0.65;1" dur={dur} repeatCount="indefinite"/>
      </rect>
      {/* sun */}
      <circle r="36" fill="#FFD700">
        <animate attributeName="cx" values="90;420;860;1100" keyTimes="0;0.3;0.55;0.72" dur={dur} repeatCount="indefinite"/>
        <animate attributeName="cy" values="200;80;140;360" keyTimes="0;0.3;0.55;0.72" dur={dur} repeatCount="indefinite"/>
        <animate attributeName="opacity" values="1;1;0.5;0" keyTimes="0;0.5;0.65;0.75" dur={dur} repeatCount="indefinite"/>
      </circle>
      {/* day cloud */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="-200,0;600,0;1200,0" keyTimes="0;0.5;1" dur={dur} repeatCount="indefinite"/>
        <ellipse cx="0" cy="100" rx="80" ry="36" fill="white" opacity="0.9"/>
        <ellipse cx="60" cy="90" rx="55" ry="30" fill="white" opacity="0.9"/>
        <ellipse cx="-55" cy="106" rx="50" ry="28" fill="white" opacity="0.9"/>
      </g>
      {/* dark storm clouds */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="1000,-20;1000,-20;350,-20;-150,-20" keyTimes="0;0.52;0.72;1" dur={dur} repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;0;0.85;1" keyTimes="0;0.52;0.72;1" dur={dur} repeatCount="indefinite"/>
        <ellipse cx="0"   cy="80" rx="160" ry="65" fill="#1e1e30"/>
        <ellipse cx="130" cy="65" rx="120" ry="55" fill="#252535"/>
        <ellipse cx="-110" cy="90" rx="110" ry="50" fill="#1e1e30"/>
        <ellipse cx="260"  cy="75" rx="130" ry="58" fill="#2a2a3a"/>
      </g>
    </>
  )
}

// ── Ambient life — birds, drifting clouds, subtle background motion ─────────
// Used inside every scene to keep the world feeling alive.
function SceneAmbient({ dur = '35s' }: { dur?: string }) {
  return (
    <>
      {/* extra puffy cloud drifting the other way */}
      <g opacity="0.7">
        <animateTransform attributeName="transform" type="translate" values="1200,60;600,60;-200,60" keyTimes="0;0.5;1" dur={dur} repeatCount="indefinite"/>
        <ellipse cx="0" cy="0" rx="55" ry="24" fill="white"/>
        <ellipse cx="40" cy="-8" rx="38" ry="20" fill="white"/>
      </g>
      {/* bird flock 1 — flies left to right, wings flap */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="-100,140;500,110;1100,150" keyTimes="0;0.5;1" dur="18s" repeatCount="indefinite"/>
        {[0, 30, 60].map((dx, i) => (
          <g key={i} transform={`translate(${dx},${i * 4})`}>
            <path d="M0,0 Q-6,-5 -12,0" stroke="#222" strokeWidth="2" fill="none">
              <animate attributeName="d" values="M0,0 Q-6,-5 -12,0;M0,0 Q-6,3 -12,0;M0,0 Q-6,-5 -12,0" dur="0.35s" repeatCount="indefinite"/>
            </path>
            <path d="M0,0 Q6,-5 12,0" stroke="#222" strokeWidth="2" fill="none">
              <animate attributeName="d" values="M0,0 Q6,-5 12,0;M0,0 Q6,3 12,0;M0,0 Q6,-5 12,0" dur="0.35s" repeatCount="indefinite"/>
            </path>
          </g>
        ))}
      </g>
      {/* bird flock 2 — offset timing, goes right to left */}
      <g opacity="0.85">
        <animateTransform attributeName="transform" type="translate" values="1100,220;500,180;-100,210" keyTimes="0;0.5;1" dur="24s" repeatCount="indefinite" begin="6s"/>
        {[0, 25].map((dx, i) => (
          <g key={i} transform={`translate(${dx},${i * 3})`}>
            <path d="M0,0 Q-5,-4 -10,0" stroke="#333" strokeWidth="1.8" fill="none">
              <animate attributeName="d" values="M0,0 Q-5,-4 -10,0;M0,0 Q-5,2 -10,0;M0,0 Q-5,-4 -10,0" dur="0.4s" repeatCount="indefinite"/>
            </path>
            <path d="M0,0 Q5,-4 10,0" stroke="#333" strokeWidth="1.8" fill="none">
              <animate attributeName="d" values="M0,0 Q5,-4 10,0;M0,0 Q5,2 10,0;M0,0 Q5,-4 10,0" dur="0.4s" repeatCount="indefinite"/>
            </path>
          </g>
        ))}
      </g>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 1 — 🔒 The Silent Warning  (school, students arriving, threat figure)
// ═══════════════════════════════════════════════════════════════════════════
function SceneSilentWarning() {
  return (
    <>
      <SceneSky fromColor="#5bb8f5" toColor="#12122a"/>
      <rect y="390" width="1000" height="170" fill="#4caf50"/>
      <rect y="386" width="1000" height="8" fill="#66bb6a"/>
      {/* path */}
      <rect x="395" y="390" width="75" height="170" fill="#9e9e9e"/>
      <rect x="410" y="390" width="4" height="170" fill="#bdbdbd"/>
      <rect x="455" y="390" width="4" height="170" fill="#bdbdbd"/>
      {/* school */}
      <rect x="250" y="175" width="400" height="225" fill="#f5e6c8" stroke="#c4a46b" strokeWidth="2"/>
      <polygon points="225,178 675,178 638,115 262,115" fill="#c0392b" stroke="#96281b" strokeWidth="2"/>
      {[275,355,435,515,595].map((x,i) => (
        <g key={i}>
          <rect x={x} y="200" width="56" height="50" rx="3" fill="#87ceeb" stroke="#c4a46b" strokeWidth="1.5"/>
          <line x1={x+28} y1="200" x2={x+28} y2="250" stroke="#c4a46b" strokeWidth="1"/>
          <line x1={x} y1="225" x2={x+56} y2="225" stroke="#c4a46b" strokeWidth="1"/>
          <rect x={x} y="200" width="56" height="50" rx="3" fill="#FFD700" opacity="0">
            <animate attributeName="opacity" values="0;0;0;0.5;0;0.5;0;0.4;0" keyTimes="0;0.6;0.65;0.7;0.74;0.8;0.84;0.92;1" dur="35s" repeatCount="indefinite"/>
          </rect>
        </g>
      ))}
      <rect x="415" y="330" width="65" height="70" rx="5" fill="#795548" stroke="#5d4037" strokeWidth="2"/>
      <circle cx="472" cy="366" r="5" fill="#ffd54f"/>
      <rect x="265" y="122" width="370" height="26" rx="3" fill="white" stroke="#c4a46b" strokeWidth="1"/>
      <text x="450" y="140" textAnchor="middle" fontSize="14" fill="#333" fontFamily="Arial,sans-serif" fontWeight="bold">CRESCENT ACADEMY</text>
      <line x1="660" y1="30" x2="660" y2="178" stroke="#9e9e9e" strokeWidth="4"/>
      <rect x="660" y="30" width="48" height="10" fill="#006600"/>
      <rect x="660" y="40" width="48" height="10" fill="white"/>
      <rect x="660" y="50" width="48" height="10" fill="#006600"/>
      {/* clock */}
      <g transform="translate(80,90)">
        <circle r="38" fill="white" stroke="#444" strokeWidth="4"/>
        <circle r="4" fill="#222"/>
        <line x1="0" y1="0" x2="0" y2="-22" stroke="#222" strokeWidth="5" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" values="240,0,0;240,0,0;300,0,0;300,0,0" keyTimes="0;0.42;0.5;1" dur="35s" repeatCount="indefinite"/>
        </line>
        <line x1="0" y1="0" x2="0" y2="-30" stroke="#555" strokeWidth="3.5" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" values="90,0,0;90,0,0;180,0,0;180,0,0" keyTimes="0;0.42;0.5;1" dur="35s" repeatCount="indefinite"/>
        </line>
        <circle r="38" fill="none" stroke="#e53935" strokeWidth="4" opacity="0">
          <animate attributeName="opacity" values="0;0;0;1;0;1;0;0" keyTimes="0;0.44;0.47;0.51;0.55;0.59;0.63;1" dur="35s" repeatCount="indefinite"/>
        </circle>
        <text x="0" y="18" textAnchor="middle" fontSize="11" fill="#666" fontFamily="Arial,sans-serif">AM</text>
      </g>
      <SceneAmbient/>
      {/* students arriving */}
      <WalkingStudent x0={1050} x1={420} t0={0.03} t1={0.36} dur="35s" shirt="#1565c0" skin="#ffcc80" hair="#5d4037" bag="#e53935"/>
      <WalkingStudent x0={1150} x1={450} t0={0.05} t1={0.39} dur="35s" shirt="#e91e8c" skin="#ffe0b2" hair="#4a148c" bag="#7b1fa2" delay="0.15s"/>
      <WalkingStudent x0={1250} x1={478} t0={0.07} t1={0.42} dur="35s" shirt="#2e7d32" skin="#ffb74d" hair="#111" bag="#1976d2" delay="0.28s"/>
      {/* additional students — different rhythm */}
      <WalkingStudent x0={-80} x1={340} t0={0.10} t1={0.44} dur="35s" shirt="#f57c00" skin="#ffe0b2" hair="#3e2723" bag="#00695c" delay="0.4s"/>
      <WalkingStudent x0={-160} x1={310} t0={0.14} t1={0.48} dur="35s" shirt="#c2185b" skin="#ffcc80" hair="#212121" bag="#f9a825" delay="0.22s"/>
      {/* teacher */}
      <g transform="translate(390,0)">
        <circle cx="0" cy="350" r="17" fill="#ffe0b2"/>
        <rect x="-13" y="333" width="26" height="11" rx="5" fill="#5d4037"/>
        <rect x="-13" y="367" width="26" height="35" rx="5" fill="#6a1b9a"/>
        <rect x="-11" y="402" width="10" height="24" rx="4" fill="#4a148c"/>
        <rect x="1"   y="402" width="10" height="24" rx="4" fill="#4a148c"/>
        <ellipse cx="-5" cy="426" rx="9" ry="4" fill="#111"/>
        <ellipse cx="5"  cy="426" rx="9" ry="4" fill="#111"/>
        <line x1="-13" y1="375" x2="-38" y2="352" stroke="#ffe0b2" strokeWidth="7" strokeLinecap="round" opacity="0">
          <animate attributeName="opacity" values="0;0;0;1;1" keyTimes="0;0.44;0.5;0.56;1" dur="35s" repeatCount="indefinite"/>
        </line>
        <g opacity="0">
          <animate attributeName="opacity" values="0;0;0;0;1;1" keyTimes="0;0.44;0.51;0.55;0.6;1" dur="35s" repeatCount="indefinite"/>
          <circle cx="-56" cy="336" r="18" fill="white" stroke="#e53935" strokeWidth="2.5"/>
          <text x="-56" y="343" textAnchor="middle" fontSize="20" fill="#e53935" fontWeight="900">!</text>
        </g>
      </g>
      {/* threat figure */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="1100,0;1100,0;1100,0;820,0;700,0" keyTimes="0;0.55;0.65;0.82;1" dur="35s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;0;0;0.9;1" keyTimes="0;0.55;0.65;0.82;1" dur="35s" repeatCount="indefinite"/>
        <circle cx="0" cy="348" r="22" fill="#090912"/>
        <rect x="-18" y="370" width="36" height="50" rx="7" fill="#090912"/>
        <rect x="-15" y="420" width="13" height="34" rx="5" fill="#090912">
          <animateTransform attributeName="transform" type="rotate" values="16,-8,420;-16,-8,420;16,-8,420" dur="0.58s" repeatCount="indefinite"/>
        </rect>
        <rect x="2" y="420" width="13" height="34" rx="5" fill="#090912">
          <animateTransform attributeName="transform" type="rotate" values="-16,8,420;16,8,420;-16,8,420" dur="0.58s" repeatCount="indefinite"/>
        </rect>
        <circle cx="-8" cy="344" r="6.5" fill="#e53935"/>
        <circle cx="8"  cy="344" r="6.5" fill="#e53935"/>
        <circle cx="-8" cy="344" r="3" fill="#ffcdd2"/>
        <circle cx="8"  cy="344" r="3" fill="#ffcdd2"/>
        <ellipse cx="0" cy="458" rx="36" ry="11" fill="rgba(0,0,0,0.35)"/>
      </g>
      {/* warning triangle */}
      <g transform="translate(820,50)">
        <animate attributeName="opacity" values="0;0;0;0;1;0;1;0;1" keyTimes="0;0.6;0.65;0.68;0.73;0.77;0.82;0.87;1" dur="35s" repeatCount="indefinite"/>
        <polygon points="0,-42 36,24 -36,24" fill="#ffd600" stroke="#f57f17" strokeWidth="3.5"/>
        <text x="0" y="20" textAnchor="middle" fontSize="32" fill="#e53935" fontWeight="900">!</text>
      </g>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 2 — 🏆 The Missing Trophy  (hall, trophy cabinet, thief at night)
// ═══════════════════════════════════════════════════════════════════════════
function SceneMissingTrophy() {
  return (
    <>
      <SceneSky fromColor="#5bb8f5" toColor="#0a0a1e"/>
      {/* hall floor */}
      <rect y="390" width="1000" height="170" fill="#8d6e63"/>
      <rect y="386" width="1000" height="8" fill="#a1887f"/>
      {/* floor tiles */}
      {Array.from({length:12}).map((_,i) => (
        <rect key={i} x={i*84} y="390" width="80" height="80" fill={i%2===0?'#8d6e63':'#795548'} opacity="0.6"/>
      ))}
      {/* back wall */}
      <rect x="0" y="150" width="1000" height="240" fill="#efebe9"/>
      {/* banner */}
      <rect x="300" y="160" width="400" height="40" fill="#c0392b"/>
      <text x="500" y="187" textAnchor="middle" fontSize="18" fill="white" fontFamily="Arial,sans-serif" fontWeight="bold">AWARDS CEREMONY 2025</text>
      {/* trophy cabinet */}
      <rect x="370" y="260" width="260" height="180" rx="6" fill="#5d4037" stroke="#4e342e" strokeWidth="3"/>
      <rect x="378" y="268" width="244" height="164" rx="4" fill="#b0bec5" opacity="0.35"/>
      {/* shelves */}
      <rect x="370" y="340" width="260" height="6" fill="#4e342e"/>
      <rect x="370" y="390" width="260" height="6" fill="#4e342e"/>
      {/* TROPHY on shelf – disappears */}
      <g>
        <animate attributeName="opacity" values="1;1;1;1;0;0" keyTimes="0;0.45;0.55;0.6;0.65;1" dur="35s" repeatCount="indefinite"/>
        {/* cup */}
        <ellipse cx="500" cy="310" rx="22" ry="10" fill="#FFD700"/>
        <rect x="488" y="280" width="24" height="32" rx="3" fill="#FFD700"/>
        <ellipse cx="500" cy="278" rx="18" ry="8" fill="#FFC107"/>
        <line x1="475" y1="295" x2="486" y2="295" stroke="#FFD700" strokeWidth="4" strokeLinecap="round"/>
        <line x1="514" y1="295" x2="525" y2="295" stroke="#FFD700" strokeWidth="4" strokeLinecap="round"/>
        <rect x="494" y="310" width="12" height="10" fill="#FF8F00"/>
        <ellipse cx="500" cy="322" rx="18" ry="5" fill="#FF8F00"/>
        {/* glint */}
        <circle cx="492" cy="284" r="4" fill="white" opacity="0.6"/>
      </g>
      {/* EMPTY cabinet glow after theft */}
      <g opacity="0">
        <animate attributeName="opacity" values="0;0;0;0;0.6;0.8" keyTimes="0;0.55;0.6;0.64;0.7;1" dur="35s" repeatCount="indefinite"/>
        <ellipse cx="500" cy="310" rx="30" ry="12" fill="#e53935" opacity="0.5"/>
        <text x="500" y="316" textAnchor="middle" fontSize="12" fill="#e53935" fontFamily="Arial,sans-serif">MISSING</text>
      </g>
      {/* small trophies on lower shelf – stay */}
      <ellipse cx="420" cy="375" rx="10" ry="5" fill="#C0C0C0"/>
      <rect x="415" y="355" width="10" height="22" rx="2" fill="#C0C0C0"/>
      <ellipse cx="420" cy="353" rx="8" ry="4" fill="#aaa"/>
      <ellipse cx="580" cy="375" rx="10" ry="5" fill="#CD7F32"/>
      <rect x="575" y="355" width="10" height="22" rx="2" fill="#CD7F32"/>
      <ellipse cx="580" cy="353" rx="8" ry="4" fill="#b87333"/>
      <SceneAmbient/>
      {/* students admiring, then reacting */}
      <WalkingStudent x0={1050} x1={330} t0={0.03} t1={0.3} dur="35s" shirt="#1565c0" skin="#ffcc80" hair="#5d4037" bag="#e53935"/>
      <WalkingStudent x0={1150} x1={660} t0={0.05} t1={0.33} dur="35s" shirt="#880e4f" skin="#ffe0b2" hair="#4a148c" bag="#7b1fa2" delay="0.15s"/>
      {/* extra crowd — teachers strolling in from left */}
      <WalkingStudent x0={-100} x1={280} t0={0.06} t1={0.31} dur="35s" shirt="#00695c" skin="#ffe0b2" hair="#37474f" bag="#8d6e63" delay="0.3s"/>
      <WalkingStudent x0={-180} x1={220} t0={0.09} t1={0.35} dur="35s" shirt="#ef6c00" skin="#ffcc80" hair="#212121" bag="#455a64" delay="0.5s"/>
      {/* thief sneaks in from side at night */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="1050,0;1050,0;1050,0;700,0;520,0" keyTimes="0;0.5;0.6;0.75;0.88" dur="35s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;0;0;0.85;0.85" keyTimes="0;0.5;0.6;0.75;1" dur="35s" repeatCount="indefinite"/>
        <circle cx="0" cy="348" r="20" fill="#0d0d1a"/>
        <rect x="-16" y="368" width="32" height="45" rx="6" fill="#0d0d1a"/>
        <rect x="-13" y="413" width="11" height="30" rx="4" fill="#0d0d1a">
          <animateTransform attributeName="transform" type="rotate" values="16,-7,413;-16,-7,413;16,-7,413" dur="0.6s" repeatCount="indefinite"/>
        </rect>
        <rect x="2" y="413" width="11" height="30" rx="4" fill="#0d0d1a">
          <animateTransform attributeName="transform" type="rotate" values="-16,7,413;16,7,413;-16,7,413" dur="0.6s" repeatCount="indefinite"/>
        </rect>
        <circle cx="-7" cy="344" r="6" fill="#e53935"/>
        <circle cx="7"  cy="344" r="6" fill="#e53935"/>
      </g>
      {/* alarm flash */}
      <rect width="1000" height="560" fill="#e53935" opacity="0">
        <animate attributeName="opacity" values="0;0;0;0;0;0.12;0;0.12;0" keyTimes="0;0.6;0.63;0.65;0.67;0.7;0.73;0.76;1" dur="35s" repeatCount="indefinite"/>
      </rect>
      {/* ? marks over cabinet */}
      {[450,500,550].map((x,i) => (
        <text key={i} x={x} y="250" textAnchor="middle" fontSize="28" fill="#e53935" fontWeight="900" opacity="0">
          ?
          <animate attributeName="opacity" values="0;0;0;0;0;1;0;1;0" keyTimes="0;0.6;0.65;0.68;0.7;0.75;0.8;0.85;1" dur="35s" repeatCount="indefinite" begin={`${i*0.4}s`}/>
          <animate attributeName="y" values="260;250;240" keyTimes="0;0.5;1" dur={`${3+i}s`} repeatCount="indefinite"/>
        </text>
      ))}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 3 — 📋 The Exam Leak  (classroom, papers, shadowy photographer)
// ═══════════════════════════════════════════════════════════════════════════
function SceneExamLeak() {
  return (
    <>
      <SceneSky fromColor="#87ceeb" toColor="#0a0a1e"/>
      <SceneAmbient/>
      {/* classroom floor */}
      <rect y="390" width="1000" height="170" fill="#795548"/>
      <rect y="386" width="1000" height="8" fill="#8d6e63"/>
      {/* classroom back wall */}
      <rect x="0" y="100" width="1000" height="290" fill="#fff9f0"/>
      {/* blackboard */}
      <rect x="250" y="120" width="500" height="180" rx="6" fill="#1b3a2d" stroke="#5d4037" strokeWidth="4"/>
      <text x="500" y="175" textAnchor="middle" fontSize="15" fill="#a5d6a7" fontFamily="'Courier New',monospace">ANNUAL SCHOLARS CHALLENGE</text>
      <text x="500" y="205" textAnchor="middle" fontSize="13" fill="#80cbc4" fontFamily="'Courier New',monospace">EXAMINATION — STRICTLY CONFIDENTIAL</text>
      <text x="500" y="235" textAnchor="middle" fontSize="12" fill="#ef9a9a" fontFamily="'Courier New',monospace" opacity="0">
        ⚠ QUESTIONS LEAKED
        <animate attributeName="opacity" values="0;0;0;0;0;1;0;1;0.8" keyTimes="0;0.5;0.55;0.6;0.64;0.7;0.76;0.82;1" dur="35s" repeatCount="indefinite"/>
      </text>
      {/* teacher desk */}
      <rect x="380" y="330" width="240" height="80" rx="6" fill="#5d4037" stroke="#4e342e" strokeWidth="2"/>
      {/* exam papers stack */}
      <g>
        <animate attributeName="opacity" values="1;1;1;1;0.3;0.3" keyTimes="0;0.55;0.6;0.64;0.68;1" dur="35s" repeatCount="indefinite"/>
        <rect x="440" y="305" width="120" height="28" rx="3" fill="white" stroke="#ccc" strokeWidth="1"/>
        <rect x="444" y="309" width="120" height="28" rx="3" fill="white" stroke="#ccc" strokeWidth="1"/>
        <rect x="448" y="313" width="120" height="28" rx="3" fill="white" stroke="#ccc" strokeWidth="1"/>
        <text x="508" y="330" textAnchor="middle" fontSize="9" fill="#555" fontFamily="Arial,sans-serif">EXAM PAPER</text>
      </g>
      {/* student desks */}
      {[150,300,650,800].map((x,i) => (
        <g key={i}>
          <rect x={x} y="370" width="100" height="50" rx="4" fill="#8d6e63" stroke="#795548" strokeWidth="1.5"/>
          <rect x={x+10} y="355" width="80" height="18" rx="2" fill="white" stroke="#ddd" strokeWidth="1"/>
        </g>
      ))}
      {/* students sitting — heads gently bob */}
      {[175,325,675,825].map((x,i) => (
        <g key={i}>
          <g>
            <animateTransform attributeName="transform" type="translate"
              values="0,0;0,-3;0,0" dur={`${2 + i*0.3}s`} repeatCount="indefinite" begin={`${i*0.4}s`}/>
            <circle cx={x} cy="342" r="14" fill={['#ffcc80','#ffe0b2','#ffb74d','#ffd180'][i]}/>
            <rect x={x-11} y="356" width="22" height="20" rx="4" fill={['#1565c0','#c2185b','#2e7d32','#6a1b9a'][i]}/>
          </g>
        </g>
      ))}
      {/* phone camera flash */}
      <rect width="1000" height="560" fill="white" opacity="0">
        <animate attributeName="opacity" values="0;0;0;0;0;0.6;0;0.6;0" keyTimes="0;0.58;0.62;0.65;0.67;0.7;0.73;0.77;1" dur="35s" repeatCount="indefinite"/>
      </rect>
      {/* shadowy figure at teacher desk */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="1050,0;1050,0;1050,0;510,0;510,0" keyTimes="0;0.5;0.6;0.75;1" dur="35s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;0;0;0.9;0.9" keyTimes="0;0.5;0.6;0.75;1" dur="35s" repeatCount="indefinite"/>
        <circle cx="0" cy="318" r="20" fill="#0d0d1a"/>
        <rect x="-16" y="338" width="32" height="40" rx="6" fill="#0d0d1a"/>
        {/* phone held up */}
        <rect x="16" y="320" width="14" height="22" rx="3" fill="#263238">
          <animate attributeName="opacity" values="0;0;0;0.9;0.9" keyTimes="0;0.5;0.6;0.75;1" dur="35s" repeatCount="indefinite"/>
        </rect>
        <circle cx="-7" cy="314" r="5.5" fill="#e53935"/>
        <circle cx="7"  cy="314" r="5.5" fill="#e53935"/>
        <circle cx="-7" cy="314" r="2.5" fill="#ffcdd2"/>
        <circle cx="7"  cy="314" r="2.5" fill="#ffcdd2"/>
      </g>
      {/* papers scattering */}
      {[350,430,550,650].map((x,i) => (
        <g key={i} opacity="0">
          <animate attributeName="opacity" values="0;0;0;0;0;0;0.9;0.7;0" keyTimes="0;0.5;0.55;0.6;0.65;0.7;0.78;0.88;1" dur="35s" repeatCount="indefinite" begin={`${i*0.5}s`}/>
          <animateTransform attributeName="transform" type="translate" values={`${x},320; ${x-30+i*20},200`} keyTimes="0;1" dur="35s" repeatCount="indefinite" begin={`${i*0.5}s`}/>
          <rect x="0" y="0" width="50" height="65" rx="3" fill="white" stroke="#ddd" strokeWidth="1" transform={`rotate(${-20+i*15})`}/>
          <line x1="6" y1="14" x2="44" y2="14" stroke="#bbb" strokeWidth="2"/>
          <line x1="6" y1="22" x2="44" y2="22" stroke="#bbb" strokeWidth="2"/>
          <line x1="6" y1="30" x2="36" y2="30" stroke="#bbb" strokeWidth="2"/>
        </g>
      ))}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 4 — 👁️ The Vanishing Coach  (sports field, coach disappears)
// ═══════════════════════════════════════════════════════════════════════════
function SceneVanishingCoach() {
  return (
    <>
      <SceneSky fromColor="#5bb8f5" toColor="#0d0d1e"/>
      <SceneAmbient/>
      {/* sports field */}
      <rect y="390" width="1000" height="170" fill="#388e3c"/>
      <rect y="386" width="1000" height="8" fill="#43a047"/>
      {/* field lines */}
      <rect x="200" y="390" width="4" height="170" fill="white" opacity="0.5"/>
      <rect x="800" y="390" width="4" height="170" fill="white" opacity="0.5"/>
      <rect x="200" y="470" width="600" height="4" fill="white" opacity="0.5"/>
      <ellipse cx="500" cy="472" rx="80" ry="50" fill="none" stroke="white" strokeWidth="3" opacity="0.4"/>
      {/* goal posts left */}
      <line x1="100" y1="390" x2="100" y2="280" stroke="white" strokeWidth="5"/>
      <line x1="180" y1="390" x2="180" y2="280" stroke="white" strokeWidth="5"/>
      <line x1="95"  y1="280" x2="185" y2="280" stroke="white" strokeWidth="5"/>
      <line x1="96"  y1="280" x2="96"  y2="320" stroke="white" strokeWidth="3" opacity="0.5"/>
      {/* goal posts right */}
      <line x1="820" y1="390" x2="820" y2="280" stroke="white" strokeWidth="5"/>
      <line x1="900" y1="390" x2="900" y2="280" stroke="white" strokeWidth="5"/>
      <line x1="815" y1="280" x2="905" y2="280" stroke="white" strokeWidth="5"/>
      {/* football */}
      <circle cx="500" cy="430" r="16" fill="white" stroke="#333" strokeWidth="2">
        <animate attributeName="cx" values="500;480;510;490;500" keyTimes="0;0.25;0.5;0.75;1" dur="4s" repeatCount="indefinite"/>
      </circle>
      {/* COACH – fades and shrinks away */}
      <g>
        <animate attributeName="opacity" values="1;1;1;0.8;0.4;0;0" keyTimes="0;0.4;0.55;0.65;0.75;0.82;1" dur="35s" repeatCount="indefinite"/>
        <animateTransform attributeName="transform" type="translate" values="480,0;480,0;480,0;510,0;550,0;600,0" keyTimes="0;0.4;0.55;0.65;0.75;0.85" dur="35s" repeatCount="indefinite"/>
        {/* coach body */}
        <circle cx="0" cy="345" r="20" fill="#ffe0b2"/>
        <rect x="-16" y="365" width="32" height="42" rx="5" fill="#212121"/>
        <rect x="-13" y="407" width="11" height="28" rx="4" fill="#1a1a1a"/>
        <rect x="2"   y="407" width="11" height="28" rx="4" fill="#1a1a1a"/>
        <ellipse cx="-7" cy="435" rx="9" ry="4" fill="#111"/>
        <ellipse cx="7"  cy="435" rx="9" ry="4" fill="#111"/>
        {/* whistle */}
        <line x1="0" y1="365" x2="20" y2="348" stroke="#ffd54f" strokeWidth="3" strokeLinecap="round"/>
        <circle cx="22" cy="346" r="5" fill="#ffd54f"/>
        {/* clipboard */}
        <rect x="-28" y="368" width="16" height="20" rx="2" fill="#f5f5f5" stroke="#ccc" strokeWidth="1"/>
      </g>
      {/* coach silhouette/ghost fading */}
      <g>
        <animate attributeName="opacity" values="0;0;0;0;0.15;0.25;0.1;0" keyTimes="0;0.55;0.65;0.7;0.76;0.82;0.9;1" dur="35s" repeatCount="indefinite"/>
        <animateTransform attributeName="transform" type="translate" values="560,0;580,0;620,0;680,0" keyTimes="0;0.25;0.6;1" dur="35s" repeatCount="indefinite"/>
        <circle cx="0" cy="345" r="20" fill="#7986cb"/>
        <rect x="-16" y="365" width="32" height="42" rx="5" fill="#5c6bc0"/>
      </g>
      {/* players training */}
      <WalkingStudent x0={250} x1={250} t0={0.5} t1={0.5} dur="35s" shirt="#e53935" skin="#ffcc80" hair="#5d4037" bag="#c62828"/>
      <WalkingStudent x0={680} x1={680} t0={0.5} t1={0.5} dur="35s" shirt="#1565c0" skin="#ffb74d" hair="#111" bag="#1976d2" delay="0.2s"/>
      {/* extra players jogging across the pitch */}
      <WalkingStudent x0={-80} x1={1080} t0={0.02} t1={0.5} dur="35s" shirt="#ff9800" skin="#ffcc80" hair="#3e2723" bag="#e65100" delay="0.1s"/>
      <WalkingStudent x0={1100} x1={-100} t0={0.02} t1={0.55} dur="35s" shirt="#7b1fa2" skin="#ffe0b2" hair="#212121" bag="#4a148c" delay="0.35s"/>
      {/* players looking confused when coach vanishes */}
      {[250, 680].map((x,i) => (
        <text key={i} x={x} y="300" textAnchor="middle" fontSize="28" fill="#ffd600" fontWeight="900" opacity="0">
          ?
          <animate attributeName="opacity" values="0;0;0;0;0;0;1;0;1" keyTimes="0;0.5;0.6;0.7;0.75;0.8;0.85;0.9;1" dur="35s" repeatCount="indefinite" begin={`${i*0.6}s`}/>
          <animate attributeName="y" values="310;295;280" keyTimes="0;0.5;1" dur={`${4+i}s`} repeatCount="indefinite"/>
        </text>
      ))}
      {/* footprints trailing off */}
      {[500,540,580,620,660].map((x,i) => (
        <g key={i} opacity="0">
          <animate attributeName="opacity" values="0;0;0;0;0;0;0.6;0.4;0" keyTimes="0;0.5;0.6;0.68;0.72;0.77;0.82;0.9;1" dur="35s" repeatCount="indefinite" begin={`${i*0.3}s`}/>
          <ellipse cx={x}   cy="460" rx="7" ry="4" fill="rgba(255,255,255,0.5)" transform="rotate(-20)"/>
          <ellipse cx={x+8} cy="474" rx="7" ry="4" fill="rgba(255,255,255,0.5)" transform="rotate(20)"/>
        </g>
      ))}
      {/* MISSING poster on goal post */}
      <g opacity="0">
        <animate attributeName="opacity" values="0;0;0;0;0;0;0;0.9;0.9" keyTimes="0;0.5;0.6;0.7;0.75;0.78;0.82;0.88;1" dur="35s" repeatCount="indefinite"/>
        <rect x="820" y="285" width="70" height="90" rx="4" fill="#fff9c4" stroke="#f57f17" strokeWidth="2"/>
        <text x="855" y="308" textAnchor="middle" fontSize="9" fill="#e53935" fontFamily="Arial,sans-serif" fontWeight="bold">MISSING</text>
        <circle cx="855" cy="330" r="20" fill="#bdbdbd"/>
        <text x="855" y="335" textAnchor="middle" fontSize="8" fill="#555" fontFamily="Arial,sans-serif">COACH</text>
        <text x="855" y="360" textAnchor="middle" fontSize="8" fill="#555" fontFamily="Arial,sans-serif">LAST SEEN TODAY</text>
      </g>
    </>
  )
}

function Scoreboard({ s, activeKey }: { s: MCAudienceState; activeKey: string | null }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[{name:s.teamA,score:s.scoreA,k:'A'},{name:s.teamB,score:s.scoreB,k:'B'},{name:s.teamC,score:s.scoreC,k:'C'}].map(t => (
        <div key={t.k} className={`rounded-xl p-3 text-center border transition-all ${
          activeKey === t.k ? 'bg-purple-600/30 border-purple-400 shadow-lg shadow-purple-500/20' : 'bg-white/5 border-white/10'
        }`}>
          {activeKey === t.k && <p className="text-purple-300 text-[10px] font-bold uppercase tracking-widest mb-1">Playing</p>}
          <p className="text-slate-300 text-sm font-semibold truncate">{t.name}</p>
          <p className="text-white text-3xl font-black">{t.score}</p>
        </div>
      ))}
    </div>
  )
}

export default function MCAudiencePage() {
  const [s, setS] = useState<MCAudienceState | null>(null)
  const [timeLeft, setTimeLeft] = useState(MC_TIME_MS)
  const [showAV, setShowAV] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, (payload: unknown) => {
      const data = payload as MCAudienceState
      setS(data)
      // Reset back to MC view when the host starts a new game
      if (data.phase === 'setup' || data.phase === 'intro') setShowAV(false)
    })
    // When MC admin advances to AV, swap this display to the AV view (same URL).
    // The relay caches this signal, so viewers who open the URL later still see AV.
    const unsubGoto = wsSubscribe('mc:goto_av', () => setShowAV(true))
    return () => { unsub(); unsubGoto() }
  }, [])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!s?.timerStart) { setTimeLeft(MC_TIME_MS); return }
    const tick = () => setTimeLeft(Math.max(0, MC_TIME_MS - (Date.now() - (s.timerStart ?? 0))))
    tick(); timerRef.current = setInterval(tick, 250)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [s?.timerStart])

  // After all hooks — safe to short-circuit into the AV view once the host advances.
  if (showAV) return <AVAudienceView />

  const pct = timeLeft / MC_TIME_MS
  const timerColor = pct > 0.4 ? '#22c55e' : pct > 0.2 ? '#f59e0b' : '#ef4444'

  const activeTeamKey = s?.phase === 'a_playing' ? 'A' : s?.phase === 'b_playing' ? 'B' : s?.phase === 'c_playing' ? 'C' : null
  const playingTeamName = s?.phase === 'a_playing' ? s.teamA : s?.phase === 'b_playing' ? s.teamB : s?.phase === 'c_playing' ? s.teamC : ''
  const pickingTeam = s?.phase === 'pick_A' ? s.teamA : s?.phase === 'pick_B' ? s.teamB : s?.phase === 'pick_C' ? s.teamC : null
  const takenIds = s ? [s.chosenA, s.chosenB, s.chosenC].filter(Boolean) as string[] : []

  // Waiting
  if (!s || s.phase === 'setup') return (
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="text-6xl">🔮</div>
        <p className="text-white text-3xl font-black">Mystery Chain</p>
        <p className="text-slate-500 text-lg">Waiting for the round to begin…</p>
      </div>
    </div>
  )

  // Intro
  if (s.phase === 'intro') return (
    <div className="min-h-screen bg-[#0a0a1a] flex flex-col items-center justify-center p-6 gap-8">
      <div className="text-center">
        <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest mb-2">Grand Finale</p>
        <h1 className="text-white text-4xl font-black">🔮 Mystery Chain</h1>
        <p className="text-slate-400 text-base mt-3 max-w-lg text-center">
          Four mysteries are waiting to be unlocked. Each team chooses one — then has{' '}
          <span className="text-[#f5a623] font-bold">60 seconds</span> to unscramble the words and reveal the full story.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
        {s.packs.map(p => (
          <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center">
            <p className="text-4xl mb-2">{p.emoji}</p>
            <p className="text-white font-black text-sm">{p.title}</p>
            <p className="text-slate-500 text-xs mt-1">{p.teaser}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 w-full max-w-lg">
        {[s.teamA, s.teamB, s.teamC].map((t, i) => (
          <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <p className="text-slate-500 text-xs">Team {['A','B','C'][i]}</p>
            <p className="text-white font-bold text-sm">{t}</p>
          </div>
        ))}
      </div>
    </div>
  )

  // Pick phase
  if (s.phase === 'pick_A' || s.phase === 'pick_B' || s.phase === 'pick_C') return (
    <div className="min-h-screen bg-[#0a0a1a] flex flex-col p-4 gap-5">
      <Scoreboard s={s} activeKey={null} />
      <div className="text-center">
        <p className="text-purple-300 text-xs font-bold uppercase tracking-widest">Now Choosing</p>
        <p className="text-white text-3xl font-black mt-1">{pickingTeam}</p>
        <p className="text-slate-400 text-sm mt-1">Select your mystery below</p>
      </div>
      <div className="grid grid-cols-2 gap-4 flex-1">
        {s.packs.map(pack => {
          const taken = takenIds.includes(pack.id)
          const takenBy = taken ? (pack.id === s.chosenA ? s.teamA : pack.id === s.chosenB ? s.teamB : s.teamC) : null
          return (
            <div key={pack.id} className={`relative rounded-2xl border p-5 flex flex-col items-center justify-center text-center ${
              taken ? 'bg-white/5 border-white/10 opacity-40' : 'bg-purple-900/20 border-purple-500/40'
            }`}>
              {taken && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/60">
                  <p className="text-white text-xs">Chosen by</p>
                  <p className="text-[#f5a623] font-black text-base">{takenBy}</p>
                </div>
              )}
              <p className="text-5xl mb-3">{pack.emoji}</p>
              <p className="text-white font-black">{pack.title}</p>
              <p className="text-slate-400 text-xs mt-1">{pack.teaser}</p>
            </div>
          )
        })}
      </div>
    </div>
  )

  // Story phase — show opening scenario before riddles
  if (s.phase === 'story_A' || s.phase === 'story_B' || s.phase === 'story_C') {
    const storyTeam = s.phase === 'story_A' ? s.teamA : s.phase === 'story_B' ? s.teamB : s.teamC
    return <StoryPhase s={s} storyTeam={storyTeam} />
  }

  // Playing phase
  if (s.phase === 'a_playing' || s.phase === 'b_playing' || s.phase === 'c_playing') return (
    <div className="min-h-screen bg-[#0a0a1a] text-white p-4 flex flex-col gap-4">

      {/* Pack title */}
      <div className="text-center">
        <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest">Mystery Chain</p>
        <h1 className="text-white text-xl font-black">{s.activePackEmoji} {s.activePackTitle}</h1>
      </div>

      <Scoreboard s={s} activeKey={activeTeamKey} />

      {/* Timer */}
      <div className="bg-white/5 rounded-2xl p-4">
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct * 100}%`, background: timerColor }} />
        </div>
        <p className="text-center font-black text-5xl mt-2" style={{ color: timerColor }}>{fmtTime(timeLeft)}</p>
        <p className="text-center text-slate-500 text-xs mt-1">{playingTeamName} is playing</p>
      </div>

      {/* Puzzle */}
      {s.currentPuzzle ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col items-center text-center gap-4">
          {/* Picture clue */}
          <div className="bg-black/30 rounded-2xl px-10 py-5">
            <p className="text-8xl">{s.currentPuzzle.picture}</p>
          </div>
          <p className="text-slate-400 text-sm">
            Clue: <span className="text-white font-semibold">{s.currentPuzzle.clue}</span>
          </p>
          <p className="text-[#f5a623] text-5xl font-black tracking-[0.3em]">{s.currentPuzzle.scrambled}</p>
          {s.revealed && s.currentPuzzle.answer && (
            <div className="bg-green-500/20 border border-green-500/40 rounded-xl px-6 py-3">
              <p className="text-green-300 text-xs font-bold uppercase tracking-widest mb-1">Answer</p>
              <p className="text-white text-2xl font-black">{s.currentPuzzle.answer}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-500">No more puzzles in queue</p>
        </div>
      )}

      {/* Story so far */}
      {s.activeRevealedStory && s.activeRevealedStory.length > 0 && (
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-2xl p-4">
          <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-3 text-center">Story Unfolding…</p>
          <div className="space-y-2">
            {s.activeRevealedStory.map((snippet, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-blue-500 font-bold text-sm shrink-0">{i + 1}.</span>
                <p className="text-blue-100 text-sm leading-relaxed">{snippet}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // Done
  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white p-4 flex flex-col gap-6 items-center justify-center">
      <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest">Mysteries Solved — Final Results</p>

      <div className="w-full max-w-sm space-y-3">
        {[
          {name:s.teamA,score:s.scoreA,rev:s.revealedA,cid:s.chosenA},
          {name:s.teamB,score:s.scoreB,rev:s.revealedB,cid:s.chosenB},
          {name:s.teamC,score:s.scoreC,rev:s.revealedC,cid:s.chosenC},
        ].sort((a,b) => b.score - a.score).map((t, i) => {
          const pack = s.packs.find(p => p.id === t.cid)
          return (
            <div key={t.name} className={`rounded-xl px-5 py-4 border ${
              i === 0 ? 'bg-yellow-500/20 border-yellow-500/40' :
              i === 1 ? 'bg-slate-500/20 border-slate-500/30' :
              'bg-orange-900/20 border-orange-900/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{['🥇','🥈','🥉'][i]}</span>
                  <div>
                    <p className="text-white font-bold">{t.name}</p>
                    <p className="text-slate-400 text-xs">{pack?.emoji} {pack?.title} · {t.rev.length} clues</p>
                  </div>
                </div>
                <span className="text-white text-2xl font-black">{t.score}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Each team's story */}
      <div className="w-full max-w-2xl space-y-4">
        {[
          {name:s.teamA,rev:s.revealedA,cid:s.chosenA},
          {name:s.teamB,rev:s.revealedB,cid:s.chosenB},
          {name:s.teamC,rev:s.revealedC,cid:s.chosenC},
        ].filter(t => t.rev.length > 0).map(t => {
          const pack = s.packs.find(p => p.id === t.cid)
          return (
            <div key={t.name} className="bg-blue-900/10 border border-blue-800/30 rounded-2xl p-4">
              <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-2">
                {t.name} — {pack?.emoji} {pack?.title}
              </p>
              <div className="space-y-1">
                {t.rev.map((snippet, i) => (
                  <p key={i} className="text-blue-100 text-sm leading-relaxed">
                    <span className="text-blue-400 font-bold mr-1">{i + 1}.</span>{snippet}
                  </p>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
