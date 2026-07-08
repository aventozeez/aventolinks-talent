'use client'
import Image from 'next/image'

/**
 * Colourful, mature welcome splash used on the audience projector before any
 * round has started, and again after Reset while the host is entering the next
 * match. Palette is pulled from the Aventolinks logo — deep Nigerian green,
 * gold, warm depth.
 */
export default function WelcomeScreen({ subtitle }: { subtitle?: string }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#02160c] text-white flex items-center justify-center px-6 py-16">
      {/* Layered ambient glows for depth */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[640px] h-[640px] rounded-full blur-3xl opacity-40" style={{ background: '#006B3F' }} />
      <div className="pointer-events-none absolute -bottom-52 -right-40 w-[720px] h-[720px] rounded-full blur-3xl opacity-30" style={{ background: '#F5A623' }} />
      <div className="pointer-events-none absolute top-1/3 right-1/4 w-[420px] h-[420px] rounded-full blur-3xl opacity-15" style={{ background: '#FFD700' }} />

      {/* Fine gold grid overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: 'linear-gradient(#FFD700 1px, transparent 1px), linear-gradient(90deg, #FFD700 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative w-full max-w-5xl mx-auto flex flex-col items-center text-center gap-10">
        {/* Logo medallion */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full blur-2xl opacity-70" style={{ background: '#F5A623' }} />
          <div className="relative w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden ring-4 ring-[#FFD700]/60 shadow-[0_20px_60px_-15px_rgba(245,166,35,0.6)] bg-white">
            <Image src="/aventolinks-logo.jpeg" alt="Aventolinks" fill sizes="160px" className="object-cover" priority />
          </div>
        </div>

        {/* Eyebrow + title */}
        <div className="space-y-4">
          <p className="text-[#FFD700] text-sm md:text-base font-black uppercase tracking-[0.5em]">Oyo State</p>
          <h1 className="text-5xl md:text-8xl font-black leading-[1.05] text-white">
            Welcome to the
            <span className="block mt-2 bg-gradient-to-r from-[#FFD700] via-[#F5A623] to-[#FFD700] bg-clip-text text-transparent drop-shadow-[0_8px_24px_rgba(245,166,35,0.35)]">
              Scholars Challenge
            </span>
            <span className="block mt-3 text-white/95">2026</span>
          </h1>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 w-full max-w-xl">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#FFD700]/60 to-transparent" />
          <span className="text-[#FFD700] text-2xl leading-none">✦</span>
          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#FFD700]/60 to-transparent" />
        </div>

        {/* Powered by */}
        <div className="space-y-2">
          <p className="text-white/70 text-xs md:text-sm font-semibold uppercase tracking-[0.35em]">Powered by</p>
          <p className="text-white text-3xl md:text-5xl font-black tracking-tight">
            <span className="text-[#FFD700]">Avento</span>Links
          </p>
        </div>

        {subtitle && (
          <p className="text-white/60 text-sm md:text-base italic mt-2 max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}
