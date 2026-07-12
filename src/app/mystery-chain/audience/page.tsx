'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'
import AVAudienceView from '@/components/av-audience-view'
import RoundInstructionsInline from '@/components/round-instructions-inline'
import { ROUND_INFO } from '@/lib/round-info'
import WelcomeScreen from '@/components/welcome-screen'

const CHANNEL = 'mc:state'
const MC_TIME_MS = 60_000

type MCPhase =
  | 'setup' | 'intro'
  | 'pick_A' | 'story_A' | 'a_playing' | 'summary_A'
  | 'pick_B' | 'story_B' | 'b_playing' | 'summary_B'
  | 'pick_C' | 'story_C' | 'c_playing' | 'summary_C'
  | 'compare_mc'
  | 'compare_total'
  | 'done'
  | 'declare_second_runnerup'

type PackCard = { id: string; title: string; emoji: string; teaser: string }

type MCAudienceState = {
  phase: MCPhase
  teamA: string; teamB: string; teamC: string
  semiA?: number; semiB?: number; semiC?: number
  // Per-round breakdown of the semi total (may be missing on older payloads)
  rfA?: number; rfB?: number; rfC?: number
  bzA?: number; bzB?: number; bzC?: number
  isA?: number; isB?: number; isC?: number
  packs: PackCard[]
  chosenA: string | null; chosenB: string | null; chosenC: string | null
  chosenSnippetsA?: string[]; chosenSnippetsB?: string[]; chosenSnippetsC?: string[]
  // Parallel arrays of answer words for each snippet (used to highlight
  // the unlocked word inside its sentence on the summary screens).
  chosenSnippetAnswersA?: string[]
  chosenSnippetAnswersB?: string[]
  chosenSnippetAnswersC?: string[]
  activePackTitle: string
  activePackEmoji: string
  activeOpeningStory: string
  activeRevealedStory: string[]
  revealedA: string[]; revealedB: string[]; revealedC: string[]
  scoreA: number; scoreB: number; scoreC: number
  timerStart: number | null
  storyStartAt?: number | null   // wall-clock ms; drives synced subtitle progression
  revealed: boolean
  currentPuzzle: { picture: string; clue: string; scrambled: string; answer?: string } | null
}

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function StoryPhase({ s, storyTeam }: { s: MCAudienceState; storyTeam: string }) {
  const fullText = s.activeOpeningStory
  const storyStartAt = s.storyStartAt ?? 0

  // The /mystery-chain/audience URL is the "projector" — it speaks audio.
  // Team screens stay silent. Two audience projectors on the same LAN will
  // both speak because they use identical wall-clock timing, so they stay
  // reasonably in sync (may sound slightly reverby but not off).
  const isProjector = typeof window !== 'undefined' && window.location.pathname.includes('/mystery-chain/audience')

  // Autoplay: browsers block speechSynthesis until the user gestures on THIS
  // page load. sessionStorage would let us skip the overlay on repeat visits,
  // but the browser still blocks speak() because the gesture doesn't survive a
  // page reload — the audience would silently get no sound. So we always
  // require a fresh tap on every page load.
  const [audioUnlocked, setAudioUnlocked] = useState(false)

  const unlockAudio = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setAudioUnlocked(true)
      return
    }
    try {
      // Chrome tabs occasionally leave synthesis in a paused state after the
      // first user interaction — resume() flips it back on.
      window.speechSynthesis.resume()
      // Speak an inaudible warmup utterance. Empty text is a no-op on some
      // browsers, so we use a short real word at ~volume 0 which is enough
      // to satisfy the gesture requirement.
      const warmup = new SpeechSynthesisUtterance('start')
      warmup.volume = 0.01
      warmup.rate = 3
      window.speechSynthesis.speak(warmup)
    } catch { /* noop */ }
    setAudioUnlocked(true)
  }

  // Auto-unlock narration on the FIRST user interaction anywhere on the page
  // (click, key, touch) so admin never has to explicitly enable it. Browsers
  // still require a gesture per page load, but this way it happens silently
  // on whatever the operator clicks first — usually the fullscreen button.
  useEffect(() => {
    if (!isProjector) return
    if (audioUnlocked) return
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true, capture: true })
    window.addEventListener('keydown', unlock, { once: true, capture: true })
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true })
      window.removeEventListener('keydown', unlock, { capture: true })
    }
  }, [isProjector, audioUnlocked])

  // Sentence split — identical on every screen given identical fullText.
  const sentences = useMemo(() => {
    if (!fullText) return []
    return fullText.match(/[^.!?]+[.!?]+(?:\s+|$)/g)?.map(s => s.trim()).filter(Boolean) ?? [fullText]
  }, [fullText])

  // Wall-clock timeline. 110ms/char (generous margin over TTS rate 0.88 which
  // is ~68ms/char) plus 3s minimum per sentence plus a 500ms breather. Speech
  // finishes well within its window on virtually every device, so the next
  // sentence never cuts the previous one off.
  const { cumulative, totalMs } = useMemo(() => {
    const cum: number[] = []
    let sum = 0
    for (const sn of sentences) {
      // Natural pace: matches TTS rate ~1.0 (~62ms/char) with a small margin.
      // 75ms/char + 1500ms floor + 150ms breather → snappy but never cuts off.
      sum += Math.max(1500, sn.length * 75) + 150
      cum.push(sum)
    }
    return { cumulative: cum, totalMs: sum }
  }, [sentences])

  // Tick every 100ms; derives currentIdx purely from (Date.now() - storyStartAt).
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const iv = setInterval(() => setTick(Date.now()), 100)
    return () => clearInterval(iv)
  }, [])

  const elapsed = storyStartAt > 0 ? Math.max(0, tick - storyStartAt) : 0
  let currentIdx = -1
  if (storyStartAt > 0 && sentences.length > 0 && elapsed < totalMs) {
    currentIdx = cumulative.findIndex(c => elapsed < c)
  }
  const currentSentence = currentIdx >= 0 ? sentences[currentIdx] : ''
  const done = storyStartAt > 0 && elapsed >= totalMs

  // Speak whichever sentence is currently showing. Every projector speaks,
  // driven by wall-clock so multiple projectors stay in sync.
  const spokenIdxRef = useRef(-2)
  useEffect(() => {
    if (!isProjector) return
    if (!audioUnlocked) return
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (currentIdx < 0 || currentIdx >= sentences.length) return
    if (spokenIdxRef.current === currentIdx) return
    spokenIdxRef.current = currentIdx

    const sentence = sentences[currentIdx]
    if (!sentence) return
    window.speechSynthesis.cancel()

    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v => /male|david|google uk|daniel/i.test(v.name))
    const utter = new SpeechSynthesisUtterance(sentence)
    utter.rate = 1.0
    utter.pitch = 0.95
    utter.volume = 1
    if (preferred) utter.voice = preferred
    window.speechSynthesis.speak(utter)
  }, [currentIdx, sentences, isProjector, audioUnlocked])

  // Cancel any in-flight speech on unmount so the next phase starts clean
  useEffect(() => {
    return () => { try { window.speechSynthesis?.cancel() } catch { /* noop */ } }
  }, [])

  return (
    <div className="min-h-screen bg-[#06080f] text-white flex flex-col overflow-hidden relative">

      {/* Sound-unlock overlay — projector only, shown from the moment the
          audience page loads (not just during story phase) so narration is
          armed before the first animation. Any click dismisses it. */}
      {isProjector && !audioUnlocked && (
        <button
          onClick={unlockAudio}
          title="Only the projected screen needs sound — other audience screens can ignore this."
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 bg-[#f5a623] hover:bg-[#e0951b] text-black text-sm font-black rounded-full shadow-[0_6px_20px_rgba(245,166,35,0.45)] ring-2 ring-black/20 animate-pulse">
          <span className="text-base">🔊</span>
          <span>Tap to enable sound</span>
        </button>
      )}
      {/* ── Small speaker indicator top-right (projector only, after unlock) ── */}
      {isProjector && audioUnlocked && currentSentence && (
        <div className="absolute top-3 right-3 z-30 pointer-events-none">
          <div className="flex items-center gap-2 bg-green-900/70 border border-green-500/40 text-green-300 text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-sm shadow-lg">
            <span className="text-sm animate-pulse">🔊</span>
            <span>Narrating…</span>
            <span className="inline-flex gap-0.5 items-end">
              {[0, 0.15, 0.3].map((delay, i) => (
                <span key={i} className="w-0.5 bg-green-300 inline-block rounded-full"
                  style={{ height: '10px', animation: `mcBar 0.8s ${delay}s ease-in-out infinite` }} />
              ))}
            </span>
          </div>
        </div>
      )}

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

      {/* ── TITLE ── */}
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
        @keyframes mcReveal {
          0%   { transform: scale(0.9); opacity: 0; }
          60%  { transform: scale(1.04); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
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
  // Display cumulative (semi + MC) — semi carries forward from the semi-final
  const rows = [
    { name: s.teamA, semi: s.semiA ?? 0, mc: s.scoreA, k: 'A' },
    { name: s.teamB, semi: s.semiB ?? 0, mc: s.scoreB, k: 'B' },
    { name: s.teamC, semi: s.semiC ?? 0, mc: s.scoreC, k: 'C' },
  ]
  return (
    <div className="grid grid-cols-3 gap-3">
      {rows.map(t => (
        <div key={t.k} className={`rounded-xl p-3 text-center border transition-all ${
          activeKey === t.k ? 'bg-purple-600/30 border-purple-400 shadow-lg shadow-purple-500/20' : 'bg-white/5 border-white/10'
        }`}>
          {activeKey === t.k && <p className="text-purple-300 text-[10px] font-bold uppercase tracking-widest mb-1">Playing</p>}
          <p className="text-slate-300 text-sm font-semibold truncate">{t.name}</p>
          <p className="text-white text-3xl font-black">{t.semi + t.mc}</p>
          {(t.semi > 0 || t.mc > 0) && (
            <p className="text-slate-500 text-[10px] font-medium mt-0.5">
              Semi {t.semi} + MC {t.mc}
            </p>
          )}
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

  // Before any match starts (fresh state or post-reset) show the branded
  // Welcome splash. Only once the host advances beyond setup do we surface
  // the Mystery Chain instructions.
  if (!s || s.phase === 'setup') return (
    <WelcomeScreen subtitle="Team names and semi-final scores are being entered. Sit tight — the mystery begins soon." />
  )

  // Intro — full-page room-facing rules using the shared instructions layout
  // so it matches every other round (RF/BZ/IS/AV/TB).
  if (s.phase === 'intro') return (
    <div className={`min-h-screen w-full text-white flex items-center justify-center px-6 py-12 bg-gradient-to-br ${ROUND_INFO.mystery_chain.gradient}`}>
      <RoundInstructionsInline
        info={ROUND_INFO.mystery_chain}
        footerHint={`${s.teamA} · ${s.teamB} · ${s.teamC} — waiting for the host to start…`}
      />
    </div>
  )

  // Pick phase
  if (s.phase === 'pick_A' || s.phase === 'pick_B' || s.phase === 'pick_C') return (
    <div className="min-h-screen bg-[#0a0a1a] flex flex-col p-4 gap-5">
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

  // Playing phase — full-screen dedicated view so the room's attention is on
  // the clue and the timer, not a competing scoreboard bar.
  if (s.phase === 'a_playing' || s.phase === 'b_playing' || s.phase === 'c_playing') return (
    <div className="min-h-screen w-full bg-[#0a0a1a] text-white flex flex-col">
      {/* Slim header */}
      <div className="px-6 py-3 flex items-center justify-between border-b border-white/5 shrink-0">
        <div className="min-w-0">
          <p className="text-[#f5a623] text-[10px] md:text-xs font-black uppercase tracking-[0.35em]">Mystery Chain</p>
          <p className="text-white text-sm md:text-base font-black truncate">{s.activePackEmoji} {s.activePackTitle}</p>
        </div>
        <div className="text-right flex items-center gap-4">
          <div>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest">Playing</p>
            <p className="text-white text-sm md:text-base font-black truncate">{playingTeamName}</p>
          </div>
          {/* Big MC-round score card for the currently-playing team only.
              Waiting teams' scores are hidden — semi + cumulative are only
              revealed on the compare screens. Also shows how many puzzles
              have been unlocked so far so the team knows their progress. */}
          <div className="h-10 w-px bg-white/10" />
          <div className="text-center">
            <p className="text-slate-500 text-[9px] uppercase tracking-widest">Score</p>
            <p className="text-[#f5a623] text-3xl md:text-4xl font-black tabular-nums leading-none">
              {s.phase === 'a_playing' ? s.scoreA : s.phase === 'b_playing' ? s.scoreB : s.scoreC}
            </p>
            <p className="text-slate-400 text-[9px] mt-1 tabular-nums">
              {s.phase === 'a_playing' ? (s.revealedA?.length ?? 0) : s.phase === 'b_playing' ? (s.revealedB?.length ?? 0) : (s.revealedC?.length ?? 0)} of 10
            </p>
          </div>
        </div>
      </div>

      {/* Timer bar */}
      <div className="px-6 py-3 shrink-0">
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct * 100}%`, background: timerColor }} />
        </div>
        <p className="text-center font-black text-4xl md:text-5xl mt-2" style={{ color: timerColor }}>{fmtTime(timeLeft)}</p>
      </div>

      {/* Puzzle — fills the remaining viewport height */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        {s.currentPuzzle ? (
          <div className="w-full max-w-4xl mx-auto flex flex-col items-center text-center gap-6 md:gap-8">
            <div className="bg-black/30 rounded-3xl px-12 py-8 md:px-16 md:py-10">
              <p className="text-[9rem] md:text-[13rem] leading-none">{s.currentPuzzle.picture}</p>
            </div>
            <p className="text-slate-300 text-lg md:text-2xl leading-snug max-w-3xl">
              <span className="text-slate-500 uppercase tracking-widest text-xs md:text-sm font-black block mb-2">Clue</span>
              <span className="text-white font-semibold">{s.currentPuzzle.clue}</span>
            </p>
            <p className="text-[#f5a623] text-6xl md:text-8xl font-black tracking-[0.35em] leading-none">{s.currentPuzzle.scrambled}</p>
          </div>
        ) : (
          <p className="text-slate-500 text-xl">No more puzzles in queue</p>
        )}
      </div>

    </div>
  )

  // ── Per-team round summary — green (unlocked) / red (missed) ──
  if (s.phase === 'summary_A' || s.phase === 'summary_B' || s.phase === 'summary_C') {
    const teamName = s.phase === 'summary_A' ? s.teamA : s.phase === 'summary_B' ? s.teamB : s.teamC
    const packId = s.phase === 'summary_A' ? s.chosenA : s.phase === 'summary_B' ? s.chosenB : s.chosenC
    const revealed = s.phase === 'summary_A' ? s.revealedA : s.phase === 'summary_B' ? s.revealedB : s.revealedC
    const mcScore = s.phase === 'summary_A' ? s.scoreA : s.phase === 'summary_B' ? s.scoreB : s.scoreC
    const snippets = s.phase === 'summary_A' ? (s.chosenSnippetsA ?? [])
      : s.phase === 'summary_B' ? (s.chosenSnippetsB ?? [])
      : (s.chosenSnippetsC ?? [])
    const answers = s.phase === 'summary_A' ? (s.chosenSnippetAnswersA ?? [])
      : s.phase === 'summary_B' ? (s.chosenSnippetAnswersB ?? [])
      : (s.chosenSnippetAnswersC ?? [])
    const pack = s.packs.find(p => p.id === packId)
    const unlockedSet = new Set(revealed)
    const correctCount = snippets.filter(sn => unlockedSet.has(sn)).length
    // Splits a sentence around the first case-insensitive whole-word match of
    // `answer`, so the caller can render the answer in a distinct colour.
    const splitOnAnswer = (sentence: string, answer: string): { before: string; word: string; after: string } | null => {
      const trimmed = (answer ?? '').trim()
      if (!trimmed) return null
      const esc = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      try {
        const re = new RegExp(`\\b${esc}\\b`, 'i')
        const m = sentence.match(re)
        if (!m || m.index === undefined) return null
        return {
          before: sentence.slice(0, m.index),
          word: sentence.slice(m.index, m.index + m[0].length),
          after: sentence.slice(m.index + m[0].length),
        }
      } catch { return null }
    }
    return (
      <div className="min-h-screen bg-[#06080f] text-white p-6 flex flex-col gap-4 items-center">
        <p className="text-[#f5a623] text-xs font-bold uppercase tracking-[0.3em]">Round Complete</p>
        <p className="text-3xl md:text-4xl font-black text-white text-center">{pack?.emoji} {teamName}</p>
        <div className="flex items-center justify-center gap-6 text-base">
          <span className="text-slate-400">Unlocked: <b className="text-green-400 text-xl">{correctCount}</b> <span className="text-slate-600">/ {snippets.length}</span></span>
          <span className="text-slate-700">·</span>
          <span className="text-slate-400">This round: <b className="text-[#f5a623] text-xl">{mcScore}</b> pts</span>
        </div>
        <div className="w-full max-w-2xl space-y-1.5 mt-2">
          {snippets.map((sn, i) => {
            const unlocked = unlockedSet.has(sn)
            const parts = unlocked ? splitOnAnswer(sn, answers[i] ?? '') : null
            return (
              <div key={i} className={`rounded-xl px-4 py-2.5 flex items-start gap-3 border ${
                unlocked ? 'bg-green-500/15 border-green-500/40' : 'bg-red-500/10 border-red-500/30'
              }`}>
                <span className={`text-sm font-black w-6 shrink-0 mt-0.5 ${unlocked ? 'text-green-400' : 'text-red-400'}`}>{i + 1}.</span>
                <p className={`text-sm md:text-base leading-snug ${unlocked ? 'text-green-100' : 'text-red-200/70 line-through'}`}>
                  {parts ? (
                    <>
                      {parts.before}
                      <span className="text-[#f5a623] font-black underline decoration-[#f5a623]/60 underline-offset-4">
                        {parts.word}
                      </span>
                      {parts.after}
                    </>
                  ) : sn}
                </p>
                <span className={`ml-auto text-lg font-bold shrink-0 ${unlocked ? 'text-green-400' : 'text-red-400'}`}>{unlocked ? '✓' : '✗'}</span>
              </div>
            )
          })}
        </div>
        <p className="text-slate-500 text-xs italic mt-4">Waiting for the host to continue…</p>
      </div>
    )
  }

  // ── Compare Mystery-Chain scores only (dedicated page) ──
  if (s.phase === 'compare_mc') {
    const teams = [
      { name: s.teamA, mc: s.scoreA, colour: '#22c55e' },
      { name: s.teamB, mc: s.scoreB, colour: '#3b82f6' },
      { name: s.teamC, mc: s.scoreC, colour: '#a855f7' },
    ].sort((a, b) => b.mc - a.mc)
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-[#0a0a1a] via-[#1a0a2a] to-[#0a0a1a] text-white flex flex-col items-center justify-center gap-10 px-6 py-12">
        <div className="text-center space-y-2">
          <p className="text-[#f5a623] text-xs md:text-sm font-black uppercase tracking-[0.4em]">Mystery Chain · Scores</p>
          <h2 className="text-4xl md:text-6xl font-black text-white leading-tight">Head-to-Head</h2>
        </div>
        <div className="grid grid-cols-3 gap-6 md:gap-8 w-full max-w-5xl">
          {teams.map((t, i) => (
            <div key={t.name}
              className={`rounded-3xl p-6 md:p-8 text-center border-4 ${i === 0 ? 'shadow-[0_20px_60px_-15px_rgba(245,166,35,0.5)]' : ''}`}
              style={{
                borderColor: `${t.colour}${i === 0 ? 'ff' : '55'}`,
                background: i === 0 ? `${t.colour}25` : `${t.colour}10`,
              }}>
              {i === 0 && <div className="text-4xl md:text-5xl mb-2">🏆</div>}
              <p className="text-sm md:text-base font-black uppercase tracking-widest truncate" style={{ color: t.colour }}>{t.name}</p>
              <p className="text-white text-6xl md:text-8xl font-black mt-2 md:mt-3 tabular-nums leading-none">{t.mc}</p>
              <p className="text-slate-400 text-xs md:text-sm mt-2">Mystery Chain</p>
            </div>
          ))}
        </div>
        <p className="text-slate-500 text-sm md:text-base italic">Cumulative totals coming next…</p>
      </div>
    )
  }

  // ── Compare cumulative totals (dedicated page) ──
  if (s.phase === 'compare_total') {
    const teams = [
      { name: s.teamA, semi: s.semiA ?? 0, mc: s.scoreA, rf: s.rfA ?? 0, bz: s.bzA ?? 0, is: s.isA ?? 0, colour: '#22c55e' },
      { name: s.teamB, semi: s.semiB ?? 0, mc: s.scoreB, rf: s.rfB ?? 0, bz: s.bzB ?? 0, is: s.isB ?? 0, colour: '#3b82f6' },
      { name: s.teamC, semi: s.semiC ?? 0, mc: s.scoreC, rf: s.rfC ?? 0, bz: s.bzC ?? 0, is: s.isC ?? 0, colour: '#a855f7' },
    ].map(t => ({ ...t, total: t.semi + t.mc })).sort((a, b) => b.total - a.total)
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-[#1a0f00] via-[#2a1500] to-[#0a0a1f] text-white flex flex-col items-center justify-center gap-8 px-6 py-12">
        <div className="text-center space-y-2">
          <p className="text-[#f5a623] text-xs md:text-sm font-black uppercase tracking-[0.4em]">Cumulative · All Rounds</p>
          <h2 className="text-4xl md:text-6xl font-black text-white leading-tight">Total Scores</h2>
        </div>
        <div className="grid grid-cols-3 gap-6 md:gap-8 w-full max-w-5xl">
          {teams.map((t, i) => (
            <div key={t.name}
              className={`rounded-3xl p-6 md:p-8 text-center border-4 ${i === 0 ? 'shadow-[0_20px_60px_-15px_rgba(245,166,35,0.5)]' : ''}`}
              style={{
                borderColor: `${t.colour}${i === 0 ? 'ff' : '55'}`,
                background: i === 0 ? `${t.colour}25` : `${t.colour}10`,
              }}>
              {i === 0 && <div className="text-4xl md:text-5xl mb-2">🏆</div>}
              <p className="text-sm md:text-base font-black uppercase tracking-widest truncate" style={{ color: t.colour }}>{t.name}</p>
              <p className="text-white text-6xl md:text-8xl font-black mt-2 md:mt-3 tabular-nums leading-none">{t.total}</p>
              <div className="grid grid-cols-4 gap-1.5 mt-4">
                <div className="rounded-lg bg-[#f5a623]/15 border border-[#f5a623]/40 py-1.5">
                  <p className="text-[#f5a623] text-[9px] font-black uppercase tracking-widest">RF</p>
                  <p className="text-white text-sm md:text-base font-black tabular-nums">{t.rf}</p>
                </div>
                <div className="rounded-lg bg-blue-500/15 border border-blue-500/40 py-1.5">
                  <p className="text-blue-300 text-[9px] font-black uppercase tracking-widest">BZ</p>
                  <p className="text-white text-sm md:text-base font-black tabular-nums">{t.bz}</p>
                </div>
                <div className="rounded-lg bg-cyan-500/15 border border-cyan-500/40 py-1.5">
                  <p className="text-cyan-300 text-[9px] font-black uppercase tracking-widest">IS</p>
                  <p className="text-white text-sm md:text-base font-black tabular-nums">{t.is}</p>
                </div>
                <div className="rounded-lg bg-purple-500/15 border border-purple-500/40 py-1.5">
                  <p className="text-purple-300 text-[9px] font-black uppercase tracking-widest">MC</p>
                  <p className="text-white text-sm md:text-base font-black tabular-nums">{t.mc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Dedicated Second Runner Up declaration ──
  if (s.phase === 'declare_second_runnerup') {
    const raw = [
      { key: 'A' as const, name: s.teamA, semi: s.semiA ?? 0, mc: s.scoreA, rf: s.rfA ?? 0, bz: s.bzA ?? 0, is: s.isA ?? 0 },
      { key: 'B' as const, name: s.teamB, semi: s.semiB ?? 0, mc: s.scoreB, rf: s.rfB ?? 0, bz: s.bzB ?? 0, is: s.isB ?? 0 },
      { key: 'C' as const, name: s.teamC, semi: s.semiC ?? 0, mc: s.scoreC, rf: s.rfC ?? 0, bz: s.bzC ?? 0, is: s.isC ?? 0 },
    ].map(t => ({ ...t, total: t.semi + t.mc })).sort((a, b) => b.total - a.total)
    // Apply the tie-breaker override the admin picked, if any.
    const override = (s as unknown as { secondRunnerUpOverride?: 'A' | 'B' | 'C' | null }).secondRunnerUpOverride
    const teams = override
      ? [...raw.filter(t => t.key !== override), raw.find(t => t.key === override)!]
      : raw
    const secondRunnerUp = teams[2]
    const hasBreakdown = true
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#1a0a2a] to-[#0a0a1a] text-white flex flex-col items-center justify-center gap-8 px-6">
        <p className="text-[#f5a623] text-sm font-bold uppercase tracking-[0.4em]">Oyo State Scholars Challenge 2026</p>
        <div className="text-9xl animate-bounce">🥉</div>
        <p className="text-purple-300 text-lg font-bold uppercase tracking-widest">And the</p>
        <h1 className="text-6xl md:text-8xl font-black text-white leading-tight text-center">Second Runner Up</h1>
        <p className="text-slate-400 text-lg">is</p>
        <div className="bg-gradient-to-br from-orange-900/40 to-purple-900/40 border-2 border-[#f5a623]/60 rounded-3xl px-16 py-12 shadow-2xl backdrop-blur-sm">
          <p className="text-6xl md:text-7xl font-black text-[#f5a623] leading-tight text-center">{secondRunnerUp.name}</p>
          {hasBreakdown && (
            <div className="mt-6 grid grid-cols-4 gap-2 text-center max-w-lg mx-auto">
              <div className="rounded-xl bg-[#f5a623]/15 border border-[#f5a623]/40 py-2">
                <p className="text-[#f5a623] text-[10px] font-black uppercase tracking-widest">Rapid Fire</p>
                <p className="text-white text-xl font-black tabular-nums">{secondRunnerUp.rf}</p>
              </div>
              <div className="rounded-xl bg-blue-500/15 border border-blue-500/40 py-2">
                <p className="text-blue-300 text-[10px] font-black uppercase tracking-widest">Buzzer</p>
                <p className="text-white text-xl font-black tabular-nums">{secondRunnerUp.bz}</p>
              </div>
              <div className="rounded-xl bg-cyan-500/15 border border-cyan-500/40 py-2">
                <p className="text-cyan-300 text-[10px] font-black uppercase tracking-widest">Sprint</p>
                <p className="text-white text-xl font-black tabular-nums">{secondRunnerUp.is}</p>
              </div>
              <div className="rounded-xl bg-purple-500/15 border border-purple-500/40 py-2">
                <p className="text-purple-300 text-[10px] font-black uppercase tracking-widest">Mystery</p>
                <p className="text-white text-xl font-black tabular-nums">{secondRunnerUp.mc}</p>
              </div>
            </div>
          )}
          <p className="text-slate-300 text-base mt-6 text-center">
            {hasBreakdown ? (
              <>
                RF {secondRunnerUp.rf}
                <span className="mx-2 text-slate-600">+</span>
                BZ {secondRunnerUp.bz}
                <span className="mx-2 text-slate-600">+</span>
                IS {secondRunnerUp.is}
                <span className="mx-2 text-slate-600">+</span>
                MC {secondRunnerUp.mc}
              </>
            ) : (
              <>
                Semi: <span className="font-bold text-white">{secondRunnerUp.semi}</span>
                <span className="mx-3 text-slate-600">+</span>
                Mystery Chain: <span className="font-bold text-white">{secondRunnerUp.mc}</span>
              </>
            )}
            <span className="mx-3 text-slate-600">=</span>
            <span className="font-black text-3xl text-white ml-1">{secondRunnerUp.total} pts</span>
          </p>
        </div>
        <p className="text-slate-500 text-sm italic text-center max-w-xl">
          Congratulations {secondRunnerUp.name}. The Grand Final continues with {teams[0].name} and {teams[1].name}.
        </p>
      </div>
    )
  }

  // Done — cumulative results view
  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white p-4 flex flex-col gap-6 items-center justify-center">
      <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest">Mysteries Solved — Cumulative Results</p>

      <div className="w-full max-w-lg space-y-3">
        {[
          {name:s.teamA,mc:s.scoreA,semi:s.semiA ?? 0,rf:s.rfA ?? 0,bz:s.bzA ?? 0,is:s.isA ?? 0,rev:s.revealedA,cid:s.chosenA},
          {name:s.teamB,mc:s.scoreB,semi:s.semiB ?? 0,rf:s.rfB ?? 0,bz:s.bzB ?? 0,is:s.isB ?? 0,rev:s.revealedB,cid:s.chosenB},
          {name:s.teamC,mc:s.scoreC,semi:s.semiC ?? 0,rf:s.rfC ?? 0,bz:s.bzC ?? 0,is:s.isC ?? 0,rev:s.revealedC,cid:s.chosenC},
        ].map(t => ({...t, score: t.mc + t.semi})).sort((a,b) => b.score - a.score).map((t, i) => {
          const pack = s.packs.find(p => p.id === t.cid)
          const hasBreakdown = (t.rf + t.bz + t.is) > 0
          return (
            <div key={t.name} className={`rounded-xl px-5 py-4 border ${
              i === 0 ? 'bg-yellow-500/20 border-yellow-500/40' :
              i === 1 ? 'bg-slate-500/20 border-slate-500/30' :
              'bg-orange-900/20 border-orange-900/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl">{['🥇','🥈','🥉'][i]}</span>
                  <div className="min-w-0">
                    <p className="text-white font-bold truncate">{t.name}</p>
                    <p className="text-slate-400 text-xs">{pack?.emoji} {pack?.title}</p>
                  </div>
                </div>
                <span className="text-white text-2xl font-black tabular-nums shrink-0 ml-3">{t.score}</span>
              </div>
              {/* Breakdown row */}
              <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-5 gap-1.5 text-center text-[10px]">
                {hasBreakdown ? (
                  <>
                    <div className="rounded-md bg-[#f5a623]/10 border border-[#f5a623]/30 px-1.5 py-1">
                      <p className="text-[#f5a623] font-black uppercase tracking-wider text-[9px]">RF</p>
                      <p className="text-white font-black tabular-nums text-sm">{t.rf}</p>
                    </div>
                    <div className="rounded-md bg-blue-500/10 border border-blue-500/30 px-1.5 py-1">
                      <p className="text-blue-300 font-black uppercase tracking-wider text-[9px]">Buzzer</p>
                      <p className="text-white font-black tabular-nums text-sm">{t.bz}</p>
                    </div>
                    <div className="rounded-md bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-1">
                      <p className="text-cyan-300 font-black uppercase tracking-wider text-[9px]">IS</p>
                      <p className="text-white font-black tabular-nums text-sm">{t.is}</p>
                    </div>
                  </>
                ) : (
                  <div className="col-span-3 rounded-md bg-white/5 border border-white/10 px-1.5 py-1">
                    <p className="text-slate-400 font-black uppercase tracking-wider text-[9px]">Semi</p>
                    <p className="text-white font-black tabular-nums text-sm">{t.semi}</p>
                  </div>
                )}
                <div className="rounded-md bg-purple-500/10 border border-purple-500/30 px-1.5 py-1">
                  <p className="text-purple-300 font-black uppercase tracking-wider text-[9px]">MC</p>
                  <p className="text-white font-black tabular-nums text-sm">{t.mc}</p>
                </div>
                <div className="rounded-md bg-yellow-500/15 border border-yellow-500/40 px-1.5 py-1">
                  <p className="text-yellow-300 font-black uppercase tracking-wider text-[9px]">Total</p>
                  <p className="text-white font-black tabular-nums text-sm">{t.score}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
