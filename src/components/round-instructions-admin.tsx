'use client'
import { useState } from 'react'
import { RoundInfo } from '@/lib/round-info'

const toneMap = {
  green: 'text-green-300 border-green-400/30 bg-green-500/10',
  red:   'text-red-300   border-red-400/30   bg-red-500/10',
  amber: 'text-amber-300 border-amber-400/30 bg-amber-500/10',
  blue:  'text-blue-300  border-blue-400/30  bg-blue-500/10',
  slate: 'text-slate-200 border-slate-400/25 bg-slate-500/10',
} as const

/** Compact instructions card sized for the admin control panel. Collapsed by default. */
export default function AdminRoundIntro({ info, defaultOpen = true }: { info: RoundInfo; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: `${info.accent}55`, background: `linear-gradient(180deg, ${info.accent}12 0%, rgba(0,0,0,0.15) 100%)` }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-white/[0.03] transition-colors"
        aria-expanded={open}
      >
        <span className="text-2xl leading-none">{info.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.28em]" style={{ color: info.accent }}>Read to participants</p>
          <p className="text-sm font-black text-white truncate">{info.title} — {info.tagline}</p>
        </div>
        <span className="text-xs text-white/50">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-3.5 pb-4 pt-1 space-y-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-2">How it&apos;s played</p>
            <ol className="space-y-1.5">
              {info.rules.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black"
                    style={{ background: `${info.accent}22`, color: info.accent, border: `1px solid ${info.accent}55` }}>
                    {i + 1}
                  </span>
                  <p className="text-[11px] leading-snug text-white/85">{r}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-2">Scoring</p>
            <ul className="grid grid-cols-2 gap-1.5">
              {info.scoring.map((line, i) => (
                <li key={i} className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${toneMap[line.tone ?? 'slate']}`}>
                  <span className="text-[10px] font-semibold truncate">{line.label}</span>
                  <span className="text-xs font-black tabular-nums shrink-0">{line.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
