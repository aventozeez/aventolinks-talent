'use client'
import { ReactNode, useState } from 'react'

type Props = {
  round: string
  roundEmoji?: string
  phaseLabel: string
  currentAnswer?: string | null
  currentQuestion?: string | null
  nextAnswer?: string | null
  nextQuestion?: string | null
  connected?: boolean
  extra?: ReactNode
}

/**
 * Floating panel the moderator sees on top of the iframed audience view.
 * Shows the same visuals as the projected screen, with a compact overlay in
 * the corner that carries the answer + next-up preview. Collapsible so it
 * never blocks the actual content the moderator is projecting.
 */
export default function ModeratorOverlay({
  round, roundEmoji = '📖', phaseLabel,
  currentAnswer, currentQuestion, nextAnswer, nextQuestion,
  connected = true, extra,
}: Props) {
  const [open, setOpen] = useState(true)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed top-3 left-3 z-[60] flex items-center gap-2 px-3 py-2 rounded-full bg-black/70 text-white text-xs font-black uppercase tracking-widest backdrop-blur-md shadow-lg ring-1 ring-white/20 hover:bg-black/85"
        aria-label="Show moderator panel"
      >
        <span className="text-base">{roundEmoji}</span>
        <span>Moderator</span>
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
      </button>
    )
  }

  return (
    <div className="fixed top-3 left-3 z-[60] w-[min(420px,calc(100vw-1.5rem))] max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-2xl bg-black/80 backdrop-blur-md ring-1 ring-white/15 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] text-white">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xl">{roundEmoji}</span>
          <div className="leading-tight">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#f5a623]">Moderator · {round}</p>
            <p className="text-sm font-black">{phaseLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
            connected ? 'bg-green-500/20 text-green-300 ring-1 ring-green-500/40' : 'bg-red-500/20 text-red-300 ring-1 ring-red-500/40'
          }`}>
            <span className={`w-1 h-1 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            {connected ? 'Live' : 'Off'}
          </span>
          <button
            onClick={() => setOpen(false)}
            className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-xs flex items-center justify-center"
            aria-label="Hide moderator panel"
            title="Hide"
          >×</button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {currentQuestion && (
          <div className="rounded-xl border border-blue-400/40 bg-blue-400/10 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-blue-200 mb-1">Question</p>
            <p className="text-sm leading-snug">{currentQuestion}</p>
          </div>
        )}
        {currentAnswer && (
          <div className="rounded-xl border-2 border-yellow-400/60 bg-yellow-400/15 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-yellow-200 mb-1">Answer</p>
            <p className="text-xl md:text-2xl font-black text-yellow-100 leading-tight">{currentAnswer}</p>
          </div>
        )}
        {nextQuestion && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-1">On deck</p>
            <p className="text-xs text-white/80 leading-snug">{nextQuestion}</p>
            {nextAnswer && <p className="text-[11px] mt-1 text-yellow-300"><span className="text-white/40">Answer:</span> <span className="font-bold">{nextAnswer}</span></p>}
          </div>
        )}
        {extra}
      </div>
    </div>
  )
}
