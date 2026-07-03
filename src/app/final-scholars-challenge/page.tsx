'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Trophy } from 'lucide-react'

const LINKS = [
  {
    key:     'admin',
    label:   'Admin',
    path:    '/final-scholars-challenge/admin',
    emoji:   '🎛️',
    desc:    'Controls questions, marks correct / wrong, advances rounds',
    border:  'border-[#f5a623]/40',
    bg:      'bg-[#f5a623]/10',
    text:    'text-[#f5a623]',
    subtext: 'text-[#f5a623]/60',
  },
  {
    key:     'audience',
    label:   'Audience Display',
    path:    '/final-scholars-challenge/audience',
    emoji:   '📺',
    desc:    'Big-screen display for the hall / projector — both team scores + question',
    border:  'border-blue-500/40',
    bg:      'bg-blue-500/10',
    text:    'text-blue-300',
    subtext: 'text-blue-400/60',
  },
  {
    key:     'team-a',
    label:   'Team A',
    path:    '/final-scholars-challenge/team-a',
    emoji:   '🔵',
    desc:    "Team A's screen — their score prominent, current question",
    border:  'border-green-500/40',
    bg:      'bg-green-500/10',
    text:    'text-green-300',
    subtext: 'text-green-400/60',
  },
  {
    key:     'team-b',
    label:   'Team B',
    path:    '/final-scholars-challenge/team-b',
    emoji:   '🟣',
    desc:    "Team B's screen — their score prominent, current question",
    border:  'border-purple-500/40',
    bg:      'bg-purple-500/10',
    text:    'text-purple-300',
    subtext: 'text-purple-400/60',
  },
]

export default function FinalScholarsChallengeLanding() {
  const [origin, setOrigin]       = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => { setOrigin(window.location.origin) }, [])

  const copy = (path: string, key: string) => {
    navigator.clipboard.writeText(origin + path)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  function LinkCards({ links }: { links: typeof LINKS }) {
    return (
      <div className="space-y-3">
        {links.map(l => {
          const isCopied = copiedKey === l.key
          return (
            <div key={l.key} className={`flex items-center gap-4 border rounded-2xl px-5 py-4 ${l.border} ${l.bg}`}>
              <span className="text-3xl shrink-0">{l.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className={`font-black text-sm ${l.text}`}>{l.label}</p>
                <p className={`text-xs mt-0.5 ${l.subtext}`}>{l.desc}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <a href={l.path} target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-white transition-colors">
                  Open
                </a>
                <button onClick={() => copy(l.path, l.key)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-colors text-white">
                  {isCopied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#060f1f] text-white flex flex-col items-center px-6 py-12">

      {/* Title */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-[#f5a623]/15 text-[#f5a623] border border-[#f5a623]/30 px-4 py-1.5 rounded-full text-sm font-bold mb-5">
          <Trophy size={15} /> Scholars Challenge
        </div>
        <h1 className="text-4xl font-black text-white">Final Scholars Challenge</h1>
        <p className="text-slate-400 mt-2 text-base">
          Share each link to the right device. All screens update live.
        </p>
      </div>

      <div className="w-full max-w-lg space-y-10">

        {/* FSC rounds */}
        <section>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-3">Qualifying Rounds</p>
          <LinkCards links={LINKS} />
        </section>

      </div>

      <p className="text-slate-600 text-xs mt-12">
        All screens are always live — changes made by the admin appear instantly on every device.
      </p>
    </div>
  )
}
