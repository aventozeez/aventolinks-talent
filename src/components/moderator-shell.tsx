'use client'
import { ReactNode } from 'react'

type Props = {
  round: string
  roundEmoji?: string
  phaseLabel: string
  stepHint?: string
  nextUp?: string
  connected?: boolean
  children: ReactNode
}

/**
 * Tablet-optimised layout for the moderator. Sticky header, one big card in
 * the middle, sticky "Next up" footer. Read-only — the moderator never grades
 * or advances state from this screen.
 */
export default function ModeratorShell({
  round, roundEmoji = '📖', phaseLabel, stepHint, nextUp, connected = true, children,
}: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#0b0f1a] via-[#101527] to-[#0b0f1a] text-white">
      <header className="sticky top-0 z-20 backdrop-blur-md bg-black/40 border-b border-white/10 px-4 md:px-8 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-3xl md:text-4xl">{roundEmoji}</span>
          <div className="leading-tight">
            <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.35em] text-[#f5a623]">Moderator · {round}</p>
            <p className="text-lg md:text-2xl font-black text-white">{phaseLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {stepHint && (
            <span className="hidden md:inline-flex px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-xs font-bold text-white/80">
              {stepHint}
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
            connected ? 'bg-green-500/20 text-green-300 ring-1 ring-green-500/40' : 'bg-red-500/20 text-red-300 ring-1 ring-red-500/40'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-8 py-6 md:py-8 overflow-y-auto">
        {children}
      </main>

      {nextUp && (
        <footer className="sticky bottom-0 z-20 backdrop-blur-md bg-black/60 border-t border-white/10 px-4 md:px-8 py-3 flex items-center gap-3 shrink-0">
          <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.35em] text-slate-400 shrink-0">Next up</span>
          <span className="text-sm md:text-base font-bold text-white/90 truncate">{nextUp}</span>
        </footer>
      )}
    </div>
  )
}

export function ModCard({ label, children, tone = 'default' }: {
  label?: string
  children: ReactNode
  tone?: 'default' | 'answer' | 'question' | 'warning'
}) {
  const cls = tone === 'answer'
    ? 'border-yellow-400/60 bg-yellow-400/10'
    : tone === 'question'
      ? 'border-blue-400/60 bg-blue-400/10'
      : tone === 'warning'
        ? 'border-red-400/60 bg-red-400/10'
        : 'border-white/15 bg-white/5'
  return (
    <div className={`rounded-3xl border-2 ${cls} p-5 md:p-8 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.6)]`}>
      {label && <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.35em] text-white/50 mb-2">{label}</p>}
      {children}
    </div>
  )
}
