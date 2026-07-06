'use client'
import Link from 'next/link'
import { ReactNode } from 'react'

export type ScoringLine = { label: string; value: string; tone?: 'green' | 'red' | 'amber' | 'blue' | 'slate' }

export type RoundInstructionsProps = {
  emoji: string
  eyebrow: string       // e.g. "Round 1 of 5"
  title: string         // e.g. "Rapid Fire"
  tagline: string       // one-line summary
  gradient: string      // tailwind gradient classes for the background (from-... via-... to-...)
  accent: string        // hex, used for accent bars and glow
  rules: string[]       // ordered play rules
  scoring: ScoringLine[]
  hostAction: {
    label: string       // "Begin Rapid Fire"
    href: string        // "/final-scholars-challenge/admin?round=rapid_fire"
  }
  footerNote?: ReactNode
}

const toneMap: Record<NonNullable<ScoringLine['tone']>, string> = {
  green: 'text-green-300 border-green-400/40 bg-green-500/10',
  red:   'text-red-300   border-red-400/40   bg-red-500/10',
  amber: 'text-amber-300 border-amber-400/40 bg-amber-500/10',
  blue:  'text-blue-300  border-blue-400/40  bg-blue-500/10',
  slate: 'text-slate-200 border-slate-400/30 bg-slate-500/10',
}

export default function RoundInstructions({
  emoji, eyebrow, title, tagline, gradient, accent, rules, scoring, hostAction, footerNote,
}: RoundInstructionsProps) {
  return (
    <div className={`relative min-h-screen bg-gradient-to-br ${gradient} text-white overflow-hidden`}>
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute -top-40 -right-40 w-[560px] h-[560px] rounded-full blur-3xl opacity-30"
        style={{ background: accent }} />
      <div
        className="pointer-events-none absolute -bottom-40 -left-40 w-[560px] h-[560px] rounded-full blur-3xl opacity-20"
        style={{ background: accent }} />

      <div className="relative max-w-5xl mx-auto px-6 md:px-10 py-10 md:py-14">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="text-6xl md:text-7xl leading-none drop-shadow-[0_0_20px_rgba(255,255,255,0.15)]">{emoji}</div>
          <div>
            <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.4em] opacity-70" style={{ color: accent }}>
              {eyebrow}
            </p>
            <h1 className="text-4xl md:text-6xl font-black leading-tight">{title}</h1>
            <p className="text-sm md:text-lg text-white/70 mt-1 max-w-2xl">{tagline}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Rules card */}
          <section className="lg:col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 md:p-8">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-6 w-1.5 rounded-full" style={{ background: accent }} />
              <h2 className="text-lg md:text-xl font-black uppercase tracking-widest">How it's played</h2>
            </div>
            <ol className="space-y-3">
              {rules.map((r, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    className="mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black"
                    style={{ background: `${accent}25`, color: accent, border: `1px solid ${accent}55` }}>
                    {i + 1}
                  </span>
                  <p className="text-base md:text-lg leading-relaxed text-white/90">{r}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* Scoring card */}
          <aside className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 md:p-8">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-6 w-1.5 rounded-full" style={{ background: accent }} />
              <h2 className="text-lg md:text-xl font-black uppercase tracking-widest">Scoring</h2>
            </div>
            <ul className="space-y-2.5">
              {scoring.map((line, i) => (
                <li key={i} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${toneMap[line.tone ?? 'slate']}`}>
                  <span className="text-sm md:text-base font-semibold">{line.label}</span>
                  <span className="text-lg md:text-xl font-black tabular-nums">{line.value}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        {/* CTA */}
        <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Link
            href={hostAction.href}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-lg font-black shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] transition-transform hover:scale-[1.02]"
            style={{ background: accent, color: '#0a0a1f' }}>
            ▶ {hostAction.label}
          </Link>
          <Link
            href="/final-scholars-challenge"
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-bold text-white/80 hover:text-white border border-white/15 hover:bg-white/5 transition-colors">
            ← Back to hub
          </Link>
        </div>

        {footerNote && (
          <p className="mt-8 text-xs md:text-sm text-white/50 italic">{footerNote}</p>
        )}
      </div>
    </div>
  )
}
