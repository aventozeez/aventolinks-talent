'use client'

import { usePathname } from 'next/navigation'
import Navbar from './Navbar'

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isStaffPage = pathname?.startsWith('/dashboard/staff')
  const isFSCPage   = pathname?.startsWith('/final-scholars-challenge')
  const isQuizLive  = pathname?.startsWith('/quiz-live')
  const isMCPage    = pathname?.startsWith('/mystery-chain')
  const isAVPage    = pathname?.startsWith('/audio-visual')
  const isTiePage   = pathname?.startsWith('/tie-breaker')
  const isRFPage    = pathname?.startsWith('/rapid-fire')
  const isBZPage    = pathname?.startsWith('/buzzer')
  const isISPage    = pathname?.startsWith('/innovation-sprint')

  if (isStaffPage || isFSCPage || isQuizLive || isMCPage || isAVPage || isTiePage || isRFPage || isBZPage || isISPage) {
    return <>{children}</>
  }

  return (
    <>
      <Navbar />
      <main className="pt-16">{children}</main>
    </>
  )
}
