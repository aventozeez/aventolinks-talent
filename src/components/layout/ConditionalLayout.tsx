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

  if (isStaffPage || isFSCPage || isQuizLive || isMCPage || isAVPage) {
    return <>{children}</>
  }

  return (
    <>
      <Navbar />
      <main className="pt-16">{children}</main>
    </>
  )
}
