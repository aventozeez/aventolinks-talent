import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'

export const metadata: Metadata = {
  title: 'AventoLinks — Nigeria\'s #1 Learning & Talent Platform',
  description:
    'Connect with verified Nigerian tutors for WAEC, JAMB, NECO, languages, coding, and research. Get mentorship for study abroad. Partner with schools. Build your future with AventoLinks.',
  keywords: [
    'online tutoring Nigeria', 'JAMB tutor', 'WAEC tutor', 'Nigerian tutor platform',
    'learn French Nigeria', 'learn Arabic Nigeria', 'coding tutor Nigeria',
    'study abroad Nigeria', 'AventoLinks', 'research program Nigeria'
  ],
  openGraph: {
    title: 'AventoLinks — Nigeria\'s #1 Learning & Talent Platform',
    description: 'Find verified tutors for WAEC, JAMB, languages, coding & more. Nigeria\'s most dynamic learning ecosystem.',
    type: 'website',
    locale: 'en_NG',
  },
  themeColor: '#006B3F',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="pt-16">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
