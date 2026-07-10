'use client'
import { useEffect, useState } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'
import ModeratorOverlay from '@/components/moderator-overlay'

const CHANNEL = 'mc:state:mod'

type MCPuzzle = { id: string; picture: string; clue: string; scrambled: string; answer: string; storySnippet: string }
type MCPack = { id: string; title: string; emoji: string; puzzles: MCPuzzle[] }
type MCState = {
  phase: string
  teamA: string; teamB: string; teamC: string
  packs: MCPack[]
  chosenA: string | null; chosenB: string | null; chosenC: string | null
  queueA: MCPuzzle[]; queueB: MCPuzzle[]; queueC: MCPuzzle[]
}

export default function MCModerator() {
  const [s, setS] = useState<MCState | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, p => {
      setConnected(true)
      if (p) setS(p as MCState)
    })
    return () => { unsub() }
  }, [])

  let phaseLabel = 'Waiting for admin…'
  let currentQuestion: string | null = null
  let currentAnswer: string | null = null
  let nextQuestion: string | null = null
  let nextAnswer: string | null = null
  let extra: React.ReactNode = null

  if (s) {
    const activeLetter: 'A' | 'B' | 'C' | null =
      s.phase === 'a_playing' || s.phase === 'story_A' || s.phase === 'summary_A' || s.phase === 'pick_A' ? 'A'
      : s.phase === 'b_playing' || s.phase === 'story_B' || s.phase === 'summary_B' || s.phase === 'pick_B' ? 'B'
      : s.phase === 'c_playing' || s.phase === 'story_C' || s.phase === 'summary_C' || s.phase === 'pick_C' ? 'C'
      : null
    const activeName = activeLetter === 'A' ? s.teamA : activeLetter === 'B' ? s.teamB : activeLetter === 'C' ? s.teamC : null
    const queue = activeLetter === 'A' ? s.queueA : activeLetter === 'B' ? s.queueB : activeLetter === 'C' ? s.queueC : []
    const chosenId = activeLetter === 'A' ? s.chosenA : activeLetter === 'B' ? s.chosenB : activeLetter === 'C' ? s.chosenC : null
    const activePack = chosenId ? s.packs.find(p => p.id === chosenId) : null
    const puzzle = queue[0] ?? null
    const nextPuzzle = queue[1] ?? null

    phaseLabel =
      s.phase === 'a_playing' ? `${s.teamA} playing`
      : s.phase === 'b_playing' ? `${s.teamB} playing`
      : s.phase === 'c_playing' ? `${s.teamC} playing`
      : s.phase === 'story_A' ? `${s.teamA} story`
      : s.phase === 'story_B' ? `${s.teamB} story`
      : s.phase === 'story_C' ? `${s.teamC} story`
      : s.phase === 'summary_A' ? `${s.teamA} summary`
      : s.phase === 'summary_B' ? `${s.teamB} summary`
      : s.phase === 'summary_C' ? `${s.teamC} summary`
      : s.phase === 'pick_A' ? `${s.teamA} picking`
      : s.phase === 'pick_B' ? `${s.teamB} picking`
      : s.phase === 'pick_C' ? `${s.teamC} picking`
      : s.phase === 'compare_mc' ? 'MC compare'
      : s.phase === 'compare_total' ? 'Cumulative compare'
      : s.phase === 'done' ? 'Round done'
      : s.phase

    if ((s.phase === 'a_playing' || s.phase === 'b_playing' || s.phase === 'c_playing') && puzzle) {
      currentQuestion = `${activeName} · ${puzzle.picture} ${puzzle.clue}`
      currentAnswer = puzzle.answer
      nextQuestion = nextPuzzle ? `${nextPuzzle.picture} ${nextPuzzle.clue}` : null
      nextAnswer = nextPuzzle?.answer ?? null
      extra = (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/50">Scrambled</p>
          <p className="text-lg font-mono tracking-widest text-white">{puzzle.scrambled}</p>
          <p className="text-[10px] text-slate-400 mt-2 leading-snug"><span className="text-white/60 font-bold">Unlocks:</span> {puzzle.storySnippet}</p>
          {activePack && <p className="text-[10px] text-slate-500 mt-1">{activePack.emoji} {activePack.title}</p>}
        </div>
      )
    }
  }

  return (
    <div className="fixed inset-0 bg-black">
      <iframe
        src="/mystery-chain/audience"
        className="absolute inset-0 w-full h-full border-0"
        title="MC audience view (moderator mirror)"
      />
      <ModeratorOverlay
        round="Mystery Chain" roundEmoji="🔒" phaseLabel={phaseLabel}
        currentQuestion={currentQuestion} currentAnswer={currentAnswer}
        nextQuestion={nextQuestion} nextAnswer={nextAnswer}
        connected={connected} extra={extra}
      />
    </div>
  )
}
