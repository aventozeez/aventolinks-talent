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

      {/* Cartoon scene — SVG animated film strip */}
      <div className="absolute inset-x-0 bottom-0 pointer-events-none overflow-hidden select-none" style={{height:'45%', opacity:0.85}}>
        <svg viewBox="0 0 1000 260" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%',display:'block'}}>
          <defs>
            <linearGradient id="sky-day" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5bb8f5"/><stop offset="100%" stopColor="#c9e8fb"/>
            </linearGradient>
            <linearGradient id="sky-dusk" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a1a40"/><stop offset="100%" stopColor="#3a2a50"/>
            </linearGradient>
            <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4caf50"/><stop offset="100%" stopColor="#2e7d32"/>
            </linearGradient>
          </defs>

          {/* ── SKY – brightens then darkens ── */}
          <rect width="1000" height="180" fill="#5bb8f5">
            <animate attributeName="fill"
              values="#5bb8f5;#5bb8f5;#7a6a90;#1a1a40"
              keyTimes="0;0.45;0.65;1"
              dur="35s" repeatCount="indefinite"/>
          </rect>

          {/* ── SUN – rises then sets ── */}
          <circle r="28" fill="#FFD700">
            <animate attributeName="cx" values="80;400;820;1050" keyTimes="0;0.3;0.55;0.7" dur="35s" repeatCount="indefinite"/>
            <animate attributeName="cy" values="110;55;90;200"  keyTimes="0;0.3;0.55;0.7" dur="35s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="1;1;0.6;0" keyTimes="0;0.5;0.65;0.75" dur="35s" repeatCount="indefinite"/>
          </circle>

          {/* ── DAY CLOUD ── */}
          <g>
            <animate attributeName="transform" values="translate(-120,0);translate(500,0);translate(1100,0)" keyTimes="0;0.45;0.9" dur="35s" repeatCount="indefinite"/>
            <ellipse cx="0" cy="50" rx="60" ry="28" fill="white" opacity="0.85"/>
            <ellipse cx="45" cy="44" rx="42" ry="24" fill="white" opacity="0.85"/>
            <ellipse cx="-35" cy="48" rx="38" ry="22" fill="white" opacity="0.85"/>
          </g>

          {/* ── DARK THREAT CLOUDS – roll in from right ── */}
          <g opacity="0">
            <animate attributeName="opacity" values="0;0;0;0.9;1" keyTimes="0;0.5;0.62;0.78;1" dur="35s" repeatCount="indefinite"/>
            <animate attributeName="transform" values="translate(600,0);translate(600,0);translate(300,-10);translate(0,-10)" keyTimes="0;0.55;0.72;1" dur="35s" repeatCount="indefinite"/>
            <ellipse cx="0"   cy="40" rx="120" ry="50" fill="#2a2a3a"/>
            <ellipse cx="90"  cy="30" rx="90"  ry="42" fill="#333348"/>
            <ellipse cx="-70" cy="45" rx="80"  ry="38" fill="#252535"/>
            <ellipse cx="170" cy="50" rx="100" ry="45" fill="#2a2a3a"/>
          </g>

          {/* ── GROUND ── */}
          <rect y="180" width="1000" height="80" fill="url(#grass)"/>
          <rect y="178" width="1000" height="6"  fill="#66bb6a"/>
          {/* Path to school */}
          <rect x="380" y="180" width="70" height="80" fill="#9e9e9e"/>
          <rect x="395" y="180" width="3"  height="80" fill="#bdbdbd"/>
          <rect x="447" y="180" width="3"  height="80" fill="#bdbdbd"/>

          {/* ── SCHOOL BUILDING ── */}
          {/* Main block */}
          <rect x="300" y="80" width="320" height="110" fill="#f5e6c8" stroke="#c4a46b" strokeWidth="2"/>
          {/* Roof */}
          <polygon points="280,82 640,82 605,45 315,45" fill="#c0392b" stroke="#96281b" strokeWidth="2"/>
          {/* Windows row */}
          {[330,400,470,540].map((x,i) => (
            <g key={i}>
              <rect x={x} y="100" width="44" height="38" rx="3" fill="#87ceeb" stroke="#c4a46b" strokeWidth="1.5"/>
              <line x1={x+22} y1="100" x2={x+22} y2="138" stroke="#c4a46b" strokeWidth="1"/>
              <line x1={x}    y1="119" x2={x+44} y2="119" stroke="#c4a46b" strokeWidth="1"/>
              {/* Light flicker in windows at threat phase */}
              <rect x={x} y="100" width="44" height="38" rx="3" fill="#FFD700" opacity="0">
                <animate attributeName="opacity"
                  values="0;0;0;0.4;0;0.4;0;0.3;0"
                  keyTimes="0;0.6;0.65;0.7;0.73;0.78;0.82;0.9;1"
                  dur="35s" repeatCount="indefinite"/>
              </rect>
            </g>
          ))}
          {/* Door */}
          <rect x="408" y="152" width="48" height="38" rx="4" fill="#795548" stroke="#5d4037" strokeWidth="2"/>
          <circle cx="450" cy="172" r="3.5" fill="#ffd54f"/>
          {/* School sign */}
          <rect x="312" y="52" width="296" height="20" rx="3" fill="white" stroke="#c4a46b" strokeWidth="1"/>
          <text x="460" y="66" textAnchor="middle" fontSize="11" fill="#333" fontFamily="Arial,sans-serif" fontWeight="bold">CRESCENT ACADEMY</text>
          {/* Flag */}
          <line x1="610" y1="10" x2="610" y2="82" stroke="#9e9e9e" strokeWidth="3"/>
          <rect x="610" y="10" width="36" height="22" fill="#006600"/>
          <rect x="610" y="10" width="36" height="7"  fill="#006600"/>
          <rect x="610" y="17" width="36" height="8"  fill="white"/>
          <rect x="610" y="25" width="36" height="7"  fill="#006600"/>

          {/* ── CLOCK top-left ── */}
          <g transform="translate(55,52)">
            <circle r="28" fill="white" stroke="#555" strokeWidth="3"/>
            <circle r="3"  fill="#333"/>
            {/* Hour hand: 8 o'clock → 10 o'clock */}
            <line x1="0" y1="0" x2="0" y2="-17" stroke="#333" strokeWidth="3.5" strokeLinecap="round">
              <animateTransform attributeName="transform" type="rotate"
                values="240;240;300;300" keyTimes="0;0.42;0.5;1" dur="35s" repeatCount="indefinite"/>
            </line>
            {/* Minute hand: 15min → 30min */}
            <line x1="0" y1="0" x2="0" y2="-22" stroke="#555" strokeWidth="2.5" strokeLinecap="round">
              <animateTransform attributeName="transform" type="rotate"
                values="90;90;180;180" keyTimes="0;0.42;0.5;1" dur="35s" repeatCount="indefinite"/>
            </line>
            {/* Red alarm flash when time changes */}
            <circle r="28" fill="none" stroke="#e53935" strokeWidth="3" opacity="0">
              <animate attributeName="opacity"
                values="0;0;0;0.8;0;0.8;0;0" keyTimes="0;0.44;0.46;0.5;0.54;0.58;0.62;1"
                dur="35s" repeatCount="indefinite"/>
            </circle>
            <text x="0" y="14" textAnchor="middle" fontSize="8" fill="#555" fontFamily="Arial,sans-serif">
              AM
            </text>
          </g>

          {/* ── STUDENT 1 (blue shirt, backpack) ── */}
          <g>
            <animate attributeName="transform"
              values="translate(980,0);translate(980,0);translate(415,0);translate(415,0)"
              keyTimes="0;0.02;0.35;1" dur="35s" repeatCount="indefinite"/>
            {/* body */}
            <rect x="-10" y="163" width="20" height="26" rx="4" fill="#1565c0"/>
            {/* head */}
            <circle cx="0" cy="157" r="13" fill="#ffcc80"/>
            {/* hair */}
            <rect x="-13" y="144" width="26" height="8" rx="4" fill="#5d4037"/>
            {/* backpack */}
            <rect x="10"  y="165" width="14" height="18" rx="3" fill="#e53935"/>
            <rect x="12"  y="170" width="10" height="4"  rx="1" fill="#c62828"/>
            {/* legs – walking */}
            <rect x="-9" y="189" width="8" height="20" rx="3" fill="#424242">
              <animateTransform attributeName="transform" type="rotate"
                values="18,-5,189;-18,-5,189;18,-5,189" dur="0.55s" repeatCount="indefinite"/>
            </rect>
            <rect x="1"  y="189" width="8" height="20" rx="3" fill="#424242">
              <animateTransform attributeName="transform" type="rotate"
                values="-18,5,189;18,5,189;-18,5,189" dur="0.55s" repeatCount="indefinite"/>
            </rect>
            {/* shoes */}
            <ellipse cx="-5" cy="209" rx="7" ry="4" fill="#212121"/>
            <ellipse cx="5"  cy="209" rx="7" ry="4" fill="#212121"/>
          </g>

          {/* ── STUDENT 2 (pink dress) ── */}
          <g>
            <animate attributeName="transform"
              values="translate(1060,0);translate(1060,0);translate(445,0);translate(445,0)"
              keyTimes="0;0.04;0.38;1" dur="35s" repeatCount="indefinite"/>
            <rect x="-9"  y="163" width="18" height="26" rx="4" fill="#e91e8c"/>
            <circle cx="0" cy="157" r="12" fill="#ffe0b2"/>
            <rect x="-12" y="144" width="24" height="10" rx="5" fill="#4a148c"/>
            <rect x="9"   y="165" width="13" height="16" rx="3" fill="#7b1fa2"/>
            <rect x="-8"  y="189" width="7"  height="19" rx="3" fill="#c2185b">
              <animateTransform attributeName="transform" type="rotate"
                values="16,-4,189;-16,-4,189;16,-4,189" dur="0.55s" repeatCount="indefinite" begin="0.18s"/>
            </rect>
            <rect x="1"   y="189" width="7"  height="19" rx="3" fill="#c2185b">
              <animateTransform attributeName="transform" type="rotate"
                values="-16,4,189;16,4,189;-16,4,189" dur="0.55s" repeatCount="indefinite" begin="0.18s"/>
            </rect>
            <ellipse cx="-4" cy="208" rx="6" ry="3.5" fill="#212121"/>
            <ellipse cx="4"  cy="208" rx="6" ry="3.5" fill="#212121"/>
          </g>

          {/* ── STUDENT 3 (green shirt) ── */}
          <g>
            <animate attributeName="transform"
              values="translate(1140,0);translate(1140,0);translate(470,0);translate(470,0)"
              keyTimes="0;0.06;0.41;1" dur="35s" repeatCount="indefinite"/>
            <rect x="-10" y="163" width="20" height="26" rx="4" fill="#2e7d32"/>
            <circle cx="0" cy="157" r="13" fill="#ffb74d"/>
            <rect x="-13" y="144" width="26" height="8" rx="4" fill="#1a1a1a"/>
            <rect x="10"  y="165" width="14" height="17" rx="3" fill="#1976d2"/>
            <rect x="-9"  y="189" width="8"  height="20" rx="3" fill="#424242">
              <animateTransform attributeName="transform" type="rotate"
                values="18,-5,189;-18,-5,189;18,-5,189" dur="0.55s" repeatCount="indefinite" begin="0.27s"/>
            </rect>
            <rect x="1"   y="189" width="8"  height="20" rx="3" fill="#424242">
              <animateTransform attributeName="transform" type="rotate"
                values="-18,5,189;18,5,189;-18,5,189" dur="0.55s" repeatCount="indefinite" begin="0.27s"/>
            </rect>
            <ellipse cx="-5" cy="209" rx="7" ry="4" fill="#212121"/>
            <ellipse cx="5"  cy="209" rx="7" ry="4" fill="#212121"/>
          </g>

          {/* ── TEACHER at door – turns to look, raises hand in alarm ── */}
          <g transform="translate(388,0)">
            {/* teacher body */}
            <rect x="-11" y="163" width="22" height="28" rx="4" fill="#6a1b9a"/>
            <circle cx="0" cy="157" r="13" fill="#ffe0b2"/>
            {/* hair bun */}
            <circle cx="0" cy="144" r="8" fill="#5d4037"/>
            <circle cx="6" cy="141" r="5" fill="#5d4037"/>
            {/* legs */}
            <rect x="-9" y="191" width="8" height="18" rx="3" fill="#4a148c"/>
            <rect x="1"  y="191" width="8" height="18" rx="3" fill="#4a148c"/>
            <ellipse cx="-5" cy="209" rx="6" ry="3.5" fill="#212121"/>
            <ellipse cx="5"  cy="209" rx="6" ry="3.5" fill="#212121"/>
            {/* Alarm arm – raised when teacher notices */}
            <line x1="-11" y1="172" x2="-30" y2="155" stroke="#ffe0b2" strokeWidth="5" strokeLinecap="round" opacity="0">
              <animate attributeName="opacity" values="0;0;0;1;1" keyTimes="0;0.44;0.5;0.55;1" dur="35s" repeatCount="indefinite"/>
            </line>
            {/* ! bubble */}
            <g opacity="0">
              <animate attributeName="opacity" values="0;0;0;0;1;1" keyTimes="0;0.44;0.5;0.54;0.6;1" dur="35s" repeatCount="indefinite"/>
              <circle cx="-42" cy="140" r="14" fill="white" stroke="#e53935" strokeWidth="2"/>
              <text x="-42" y="146" textAnchor="middle" fontSize="16" fill="#e53935" fontWeight="bold">!</text>
            </g>
          </g>

          {/* ── THREAT FIGURE – dark silhouette stalking from right ── */}
          <g opacity="0">
            <animate attributeName="opacity" values="0;0;0;0;0.85;1" keyTimes="0;0.55;0.62;0.68;0.8;1" dur="35s" repeatCount="indefinite"/>
            <animate attributeName="transform"
              values="translate(1050,0);translate(1050,0);translate(1050,0);translate(820,0);translate(720,0)"
              keyTimes="0;0.55;0.65;0.82;1" dur="35s" repeatCount="indefinite"/>
            {/* shadow body */}
            <circle cx="0" cy="150" r="16" fill="#0d0d1a"/>
            <rect x="-14" y="166" width="28" height="36" rx="5" fill="#0d0d1a"/>
            <rect x="-11" y="202" width="9"  height="24" rx="4" fill="#0d0d1a">
              <animateTransform attributeName="transform" type="rotate"
                values="15,-6,202;-15,-6,202;15,-6,202" dur="0.6s" repeatCount="indefinite"/>
            </rect>
            <rect x="2"   y="202" width="9"  height="24" rx="4" fill="#0d0d1a">
              <animateTransform attributeName="transform" type="rotate"
                values="-15,6,202;15,6,202;-15,6,202" dur="0.6s" repeatCount="indefinite"/>
            </rect>
            {/* red eyes */}
            <circle cx="-6" cy="147" r="5" fill="#e53935"/>
            <circle cx="6"  cy="147" r="5" fill="#e53935"/>
            <circle cx="-6" cy="147" r="2.5" fill="#ffcdd2"/>
            <circle cx="6"  cy="147" r="2.5" fill="#ffcdd2"/>
            {/* ground shadow */}
            <ellipse cx="0" cy="228" rx="28" ry="9" fill="rgba(0,0,0,0.4)"/>
          </g>

          {/* ── WARNING SIGN – pops up at threat phase ── */}
          <g opacity="0">
            <animate attributeName="opacity" values="0;0;0;0;1;0;1;0;1" keyTimes="0;0.6;0.65;0.68;0.72;0.76;0.8;0.85;1" dur="35s" repeatCount="indefinite"/>
            <animate attributeName="transform" values="translate(820,10);translate(820,10)" dur="35s" repeatCount="indefinite"/>
            <polygon points="0,-30 26,18 -26,18" fill="#ffd600" stroke="#f57f17" strokeWidth="2.5"/>
            <text x="0" y="14" textAnchor="middle" fontSize="22" fill="#e53935" fontWeight="900">!</text>
          </g>

          {/* ── CAUTION TAPE – bottom strip ── */}
          <g>
            {Array.from({length:28}).map((_,i) => (
              <rect key={i} x={i*36} y="250" width="18" height="10" fill={i%2===0?'#ffd600':'#212121'} opacity="0.55"/>
            ))}
          </g>
        </svg>
      </div>

      <div className="relative z-10 flex flex-col flex-1 p-5 gap-4">
        <Scoreboard s={s} activeKey={null} />

        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-2">

          {/* Title */}
          <div className="text-center">
            <p className="text-purple-400 text-xs font-bold uppercase tracking-[0.3em] mb-1">{storyTeam} selected</p>
            <p className="text-white text-3xl font-black tracking-tight">
              {s.activePackEmoji} {s.activePackTitle}
            </p>
          </div>

          {/* Story box */}
          <div className="w-full max-w-2xl bg-black/50 border border-purple-800/40 rounded-2xl p-6 shadow-xl shadow-purple-900/20 backdrop-blur">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse" style={{animationDelay:'0.2s'}} />
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" style={{animationDelay:'0.4s'}} />
              <p className="text-slate-500 text-xs font-mono ml-1 uppercase tracking-widest">INCIDENT REPORT — CLASSIFIED</p>
            </div>

            <p className="text-green-300 font-mono text-sm leading-7 min-h-[6rem]">
              {displayed}
              <span className={`inline-block w-0.5 h-4 bg-green-400 ml-0.5 align-middle ${cursorVisible ? 'opacity-100' : 'opacity-0'}`} />
            </p>
          </div>

          {/* Waiting indicator */}
          {done && (
            <div className="flex items-center gap-3 mt-2 animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-[#f5a623]" />
              <p className="text-[#f5a623] text-sm font-bold tracking-wide">
                Waiting for riddles to begin…
              </p>
              <div className="w-1.5 h-1.5 rounded-full bg-[#f5a623]" />
            </div>
          )}
        </div>
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
