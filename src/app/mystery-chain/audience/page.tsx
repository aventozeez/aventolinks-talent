'use client'

import { useEffect, useState, useRef } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'

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
  const [displayed, setDisplayed] = useState('')
  const [cursorVisible, setCursorVisible] = useState(true)
  const [done, setDone] = useState(false)
  const indexRef = useRef(0)

  // Typewriter
  useEffect(() => {
    setDisplayed('')
    indexRef.current = 0
    setDone(false)
    const iv = setInterval(() => {
      indexRef.current++
      setDisplayed(fullText.slice(0, indexRef.current))
      if (indexRef.current >= fullText.length) {
        clearInterval(iv)
        setDone(true)
      }
    }, 28)
    return () => clearInterval(iv)
  }, [fullText])

  // Text-to-speech narration
  useEffect(() => {
    if (!fullText || typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(fullText)
    utter.rate = 0.88
    utter.pitch = 0.95
    utter.volume = 1
    // prefer a deep/dramatic voice if available
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v => /male|david|google uk|daniel/i.test(v.name))
    if (preferred) utter.voice = preferred
    window.speechSynthesis.speak(utter)
    return () => { window.speechSynthesis.cancel() }
  }, [fullText])

  // Blinking cursor
  useEffect(() => {
    const iv = setInterval(() => setCursorVisible(v => !v), 530)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="min-h-screen bg-[#06080f] text-white flex flex-col overflow-hidden relative">

      {/* ── FULL-SCREEN CARTOON SCENE ── */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        <svg viewBox="0 0 1000 560" xmlns="http://www.w3.org/2000/svg"
          style={{width:'100%', height:'100%', display:'block'}}>
          <defs>
            <linearGradient id="mc-grass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4caf50"/><stop offset="100%" stopColor="#2e7d32"/>
            </linearGradient>
          </defs>

          {/* SKY */}
          <rect width="1000" height="390" fill="#5bb8f5">
            <animate attributeName="fill"
              values="#5bb8f5;#5bb8f5;#6a5a80;#12122a"
              keyTimes="0;0.45;0.65;1" dur="35s" repeatCount="indefinite"/>
          </rect>

          {/* SUN */}
          <circle r="38" fill="#FFD700" opacity="1">
            <animate attributeName="cx" values="90;420;860;1100" keyTimes="0;0.3;0.55;0.72" dur="35s" repeatCount="indefinite"/>
            <animate attributeName="cy" values="200;80;140;350"  keyTimes="0;0.3;0.55;0.72" dur="35s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="1;1;0.5;0"  keyTimes="0;0.5;0.65;0.75" dur="35s" repeatCount="indefinite"/>
          </circle>

          {/* WHITE CLOUD drifts left → right */}
          <g>
            <animateTransform attributeName="transform" type="translate"
              values="-200,0; 600,0; 1200,0" keyTimes="0;0.5;1" dur="35s" repeatCount="indefinite"/>
            <ellipse cx="0"   cy="100" rx="80"  ry="36" fill="white" opacity="0.9"/>
            <ellipse cx="60"  cy="90"  rx="55"  ry="30" fill="white" opacity="0.9"/>
            <ellipse cx="-55" cy="106" rx="50"  ry="28" fill="white" opacity="0.9"/>
          </g>

          {/* DARK THREAT CLOUDS roll in from right */}
          <g>
            <animateTransform attributeName="transform" type="translate"
              values="1000,-20; 1000,-20; 400,-20; -100,-20"
              keyTimes="0;0.52;0.72;1" dur="35s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0;0;0.9;1" keyTimes="0;0.52;0.72;1" dur="35s" repeatCount="indefinite"/>
            <ellipse cx="0"   cy="80"  rx="160" ry="65" fill="#1e1e30"/>
            <ellipse cx="120" cy="65"  rx="120" ry="55" fill="#252535"/>
            <ellipse cx="-100"cy="90"  rx="110" ry="50" fill="#1e1e30"/>
            <ellipse cx="240" cy="75"  rx="130" ry="58" fill="#2a2a3a"/>
          </g>

          {/* GROUND */}
          <rect y="390" width="1000" height="170" fill="url(#mc-grass)"/>
          <rect y="386" width="1000" height="8"   fill="#66bb6a"/>

          {/* PATH to school */}
          <rect x="395" y="390" width="75" height="170" fill="#9e9e9e"/>
          <rect x="410" y="390" width="4"  height="170" fill="#bdbdbd"/>
          <rect x="455" y="390" width="4"  height="170" fill="#bdbdbd"/>

          {/* ══ SCHOOL BUILDING ══ */}
          <rect x="250" y="175" width="400" height="225" fill="#f5e6c8" stroke="#c4a46b" strokeWidth="2"/>
          <polygon points="225,178 675,178 638,115 262,115" fill="#c0392b" stroke="#96281b" strokeWidth="2"/>
          {/* windows */}
          {[275,355,435,515,595].map((x,i) => (
            <g key={i}>
              <rect x={x} y="200" width="56" height="50" rx="3" fill="#87ceeb" stroke="#c4a46b" strokeWidth="1.5"/>
              <line x1={x+28} y1="200" x2={x+28} y2="250" stroke="#c4a46b" strokeWidth="1"/>
              <line x1={x}    y1="225" x2={x+56} y2="225" stroke="#c4a46b" strokeWidth="1"/>
              <rect x={x} y="200" width="56" height="50" rx="3" fill="#FFD700" opacity="0">
                <animate attributeName="opacity"
                  values="0;0;0;0.5;0;0.5;0;0.4;0"
                  keyTimes="0;0.6;0.65;0.7;0.74;0.8;0.84;0.92;1"
                  dur="35s" repeatCount="indefinite"/>
              </rect>
            </g>
          ))}
          {/* door */}
          <rect x="415" y="330" width="65" height="70" rx="5" fill="#795548" stroke="#5d4037" strokeWidth="2"/>
          <circle cx="472" cy="366" r="5" fill="#ffd54f"/>
          {/* school sign */}
          <rect x="265" y="122" width="370" height="26" rx="3" fill="white" stroke="#c4a46b" strokeWidth="1"/>
          <text x="450" y="140" textAnchor="middle" fontSize="14" fill="#333"
            fontFamily="Arial,sans-serif" fontWeight="bold">CRESCENT ACADEMY</text>
          {/* flag */}
          <line x1="660" y1="30" x2="660" y2="178" stroke="#9e9e9e" strokeWidth="4"/>
          <rect x="660" y="30" width="48" height="30" fill="#006600"/>
          <rect x="660" y="30" width="48" height="10" fill="#006600"/>
          <rect x="660" y="40" width="48" height="10" fill="white"/>
          <rect x="660" y="50" width="48" height="10" fill="#006600"/>

          {/* ── CLOCK (top-left of scene) ── */}
          <g transform="translate(80,90)">
            <circle r="38" fill="white" stroke="#444" strokeWidth="4"/>
            <circle r="4"  fill="#222"/>
            {/* hour hand 8→10 */}
            <line x1="0" y1="0" x2="0" y2="-22" stroke="#222" strokeWidth="5" strokeLinecap="round">
              <animateTransform attributeName="transform" type="rotate"
                values="240,0,0; 240,0,0; 300,0,0; 300,0,0"
                keyTimes="0;0.42;0.5;1" dur="35s" repeatCount="indefinite"/>
            </line>
            {/* minute hand 15→30 */}
            <line x1="0" y1="0" x2="0" y2="-30" stroke="#555" strokeWidth="3.5" strokeLinecap="round">
              <animateTransform attributeName="transform" type="rotate"
                values="90,0,0; 90,0,0; 180,0,0; 180,0,0"
                keyTimes="0;0.42;0.5;1" dur="35s" repeatCount="indefinite"/>
            </line>
            {/* alarm ring */}
            <circle r="38" fill="none" stroke="#e53935" strokeWidth="4" opacity="0">
              <animate attributeName="opacity"
                values="0;0;0;1;0;1;0;0"
                keyTimes="0;0.44;0.47;0.51;0.55;0.59;0.63;1"
                dur="35s" repeatCount="indefinite"/>
            </circle>
            <text x="0" y="18" textAnchor="middle" fontSize="11" fill="#666" fontFamily="Arial,sans-serif">AM</text>
          </g>

          {/* ── STUDENT 1 – blue shirt ── */}
          <g>
            <animateTransform attributeName="transform" type="translate"
              values="1050,0; 1050,0; 420,0; 420,0"
              keyTimes="0;0.03;0.36;1" dur="35s" repeatCount="indefinite"/>
            <circle cx="0"  cy="350" r="18"  fill="#ffcc80"/>
            <rect x="-14"  y="368"  width="28" height="38" rx="5" fill="#1565c0"/>
            <rect x="-13"  y="333"  width="26" height="11" rx="5" fill="#5d4037"/>
            <rect x="14"   y="370"  width="18" height="26" rx="4" fill="#e53935"/>
            <rect x="-12"  y="406"  width="11" height="28" rx="4" fill="#333">
              <animateTransform attributeName="transform" type="rotate"
                values="20,-6,406; -20,-6,406; 20,-6,406" dur="0.5s" repeatCount="indefinite"/>
            </rect>
            <rect x="1"    y="406"  width="11" height="28" rx="4" fill="#333">
              <animateTransform attributeName="transform" type="rotate"
                values="-20,7,406; 20,7,406; -20,7,406" dur="0.5s" repeatCount="indefinite"/>
            </rect>
            <ellipse cx="-6" cy="434" rx="10" ry="5" fill="#111"/>
            <ellipse cx="6"  cy="434" rx="10" ry="5" fill="#111"/>
          </g>

          {/* ── STUDENT 2 – pink ── */}
          <g>
            <animateTransform attributeName="transform" type="translate"
              values="1150,0; 1150,0; 450,0; 450,0"
              keyTimes="0;0.05;0.39;1" dur="35s" repeatCount="indefinite"/>
            <circle cx="0"  cy="350" r="17"  fill="#ffe0b2"/>
            <rect x="-13"  y="367"  width="26" height="36" rx="5" fill="#e91e8c"/>
            <rect x="-13"  y="334"  width="26" height="12" rx="6" fill="#4a148c"/>
            <rect x="13"   y="369"  width="16" height="22" rx="4" fill="#7b1fa2"/>
            <rect x="-11"  y="403"  width="10" height="26" rx="4" fill="#c2185b">
              <animateTransform attributeName="transform" type="rotate"
                values="18,-6,403; -18,-6,403; 18,-6,403" dur="0.5s" repeatCount="indefinite" begin="0.15s"/>
            </rect>
            <rect x="1"    y="403"  width="10" height="26" rx="4" fill="#c2185b">
              <animateTransform attributeName="transform" type="rotate"
                values="-18,6,403; 18,6,403; -18,6,403" dur="0.5s" repeatCount="indefinite" begin="0.15s"/>
            </rect>
            <ellipse cx="-5" cy="429" rx="9" ry="5" fill="#111"/>
            <ellipse cx="5"  cy="429" rx="9" ry="5" fill="#111"/>
          </g>

          {/* ── STUDENT 3 – green shirt ── */}
          <g>
            <animateTransform attributeName="transform" type="translate"
              values="1250,0; 1250,0; 475,0; 475,0"
              keyTimes="0;0.07;0.42;1" dur="35s" repeatCount="indefinite"/>
            <circle cx="0"  cy="350" r="18"  fill="#ffb74d"/>
            <rect x="-14"  y="368"  width="28" height="38" rx="5" fill="#2e7d32"/>
            <rect x="-13"  y="333"  width="26" height="11" rx="5" fill="#111"/>
            <rect x="14"   y="370"  width="18" height="24" rx="4" fill="#1976d2"/>
            <rect x="-12"  y="406"  width="11" height="28" rx="4" fill="#333">
              <animateTransform attributeName="transform" type="rotate"
                values="20,-6,406; -20,-6,406; 20,-6,406" dur="0.5s" repeatCount="indefinite" begin="0.28s"/>
            </rect>
            <rect x="1"    y="406"  width="11" height="28" rx="4" fill="#333">
              <animateTransform attributeName="transform" type="rotate"
                values="-20,7,406; 20,7,406; -20,7,406" dur="0.5s" repeatCount="indefinite" begin="0.28s"/>
            </rect>
            <ellipse cx="-6" cy="434" rx="10" ry="5" fill="#111"/>
            <ellipse cx="6"  cy="434" rx="10" ry="5" fill="#111"/>
          </g>

          {/* ── TEACHER at door ── */}
          <g transform="translate(390,0)">
            <circle cx="0"  cy="350" r="17"  fill="#ffe0b2"/>
            <rect x="-13"  y="367"  width="26" height="35" rx="5" fill="#6a1b9a"/>
            <circle cx="0"  cy="334" r="10"  fill="#5d4037"/>
            <circle cx="8"  cy="331" r="7"   fill="#5d4037"/>
            <rect x="-11"  y="402"  width="10" height="24" rx="4" fill="#4a148c"/>
            <rect x="1"    y="402"  width="10" height="24" rx="4" fill="#4a148c"/>
            <ellipse cx="-5" cy="426" rx="9" ry="4" fill="#111"/>
            <ellipse cx="5"  cy="426" rx="9" ry="4" fill="#111"/>
            {/* raised alarm arm */}
            <line x1="-13" y1="375" x2="-38" y2="352" stroke="#ffe0b2" strokeWidth="7"
              strokeLinecap="round" opacity="0">
              <animate attributeName="opacity" values="0;0;0;1;1" keyTimes="0;0.44;0.5;0.56;1" dur="35s" repeatCount="indefinite"/>
            </line>
            {/* ! speech bubble */}
            <g opacity="0">
              <animate attributeName="opacity" values="0;0;0;0;1;1" keyTimes="0;0.44;0.51;0.55;0.6;1" dur="35s" repeatCount="indefinite"/>
              <circle cx="-56" cy="336" r="18" fill="white" stroke="#e53935" strokeWidth="2.5"/>
              <text x="-56" y="343" textAnchor="middle" fontSize="20" fill="#e53935" fontWeight="900">!</text>
            </g>
          </g>

          {/* ── THREAT FIGURE ── */}
          <g>
            <animateTransform attributeName="transform" type="translate"
              values="1100,0; 1100,0; 1100,0; 820,0; 700,0"
              keyTimes="0;0.55;0.65;0.82;1" dur="35s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0;0;0;0.9;1" keyTimes="0;0.55;0.65;0.82;1" dur="35s" repeatCount="indefinite"/>
            <circle cx="0"  cy="348" r="22"  fill="#090912"/>
            <rect x="-18"  y="370"  width="36" height="50" rx="7" fill="#090912"/>
            <rect x="-15"  y="420"  width="13" height="34" rx="5" fill="#090912">
              <animateTransform attributeName="transform" type="rotate"
                values="16,-8,420; -16,-8,420; 16,-8,420" dur="0.58s" repeatCount="indefinite"/>
            </rect>
            <rect x="2"    y="420"  width="13" height="34" rx="5" fill="#090912">
              <animateTransform attributeName="transform" type="rotate"
                values="-16,8,420; 16,8,420; -16,8,420" dur="0.58s" repeatCount="indefinite"/>
            </rect>
            <circle cx="-8" cy="344" r="6.5" fill="#e53935"/>
            <circle cx="8"  cy="344" r="6.5" fill="#e53935"/>
            <circle cx="-8" cy="344" r="3"   fill="#ffcdd2"/>
            <circle cx="8"  cy="344" r="3"   fill="#ffcdd2"/>
            <ellipse cx="0" cy="458" rx="36" ry="11" fill="rgba(0,0,0,0.35)"/>
          </g>

          {/* ── WARNING TRIANGLE ── */}
          <g transform="translate(820,50)">
            <animate attributeName="opacity" values="0;0;0;0;1;0;1;0;1" keyTimes="0;0.6;0.65;0.68;0.73;0.77;0.82;0.87;1" dur="35s" repeatCount="indefinite"/>
            <polygon points="0,-42 36,24 -36,24" fill="#ffd600" stroke="#f57f17" strokeWidth="3.5"/>
            <text x="0" y="20" textAnchor="middle" fontSize="32" fill="#e53935" fontWeight="900">!</text>
          </g>

          {/* CAUTION TAPE strip */}
          {Array.from({length:28}).map((_,i) => (
            <rect key={i} x={i*36} y="548" width="18" height="12" fill={i%2===0?'#ffd600':'#1a1a1a'} opacity="0.6"/>
          ))}
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

      {/* ── SUBTITLE BAR – pinned to bottom, over the scene ── */}
      <div className="absolute bottom-0 inset-x-0 z-20 px-4 pb-4 pt-2"
        style={{background:'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.7) 70%, transparent 100%)'}}>
        <p className="text-white font-semibold text-center text-lg leading-7 min-h-[3.5rem] drop-shadow"
          style={{textShadow:'0 2px 8px rgba(0,0,0,0.9), 0 0 2px #000'}}>
          {displayed}
          <span className={`inline-block w-0.5 h-5 bg-white ml-1 align-middle transition-opacity ${cursorVisible ? 'opacity-100' : 'opacity-0'}`} />
        </p>
        {done && (
          <p className="text-center text-[#f5a623] text-sm font-bold tracking-widest animate-pulse mt-1">
            ● WAITING FOR RIDDLES TO BEGIN…
          </p>
        )}
      </div>
    </div>
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
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, (data: MCAudienceState) => setS(data))
    return () => unsub()
  }, [])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!s?.timerStart) { setTimeLeft(MC_TIME_MS); return }
    const tick = () => setTimeLeft(Math.max(0, MC_TIME_MS - (Date.now() - (s.timerStart ?? 0))))
    tick(); timerRef.current = setInterval(tick, 250)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [s?.timerStart])

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
