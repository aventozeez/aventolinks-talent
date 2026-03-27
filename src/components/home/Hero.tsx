'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Star, Users, BookOpen, TrendingUp } from 'lucide-react'

const popularSearches = [
  'JAMB Mathematics', 'English Language', 'French Beginner', 'Python Coding',
  'WAEC Chemistry', 'Arabic', 'Research Writing', 'IELTS Prep'
]

const trustBadges = [
  { icon: Users, label: '10,000+ Students' },
  { icon: BookOpen, label: '500+ Expert Tutors' },
  { icon: Star, label: '4.9 Average Rating' },
  { icon: TrendingUp, label: '50+ Partner Schools' },
]

export default function Hero() {
  const [query, setQuery] = useState('')
  const router = useRouter()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) router.push(`/tutors?q=${encodeURIComponent(query)}`)
  }

  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700">

      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary-600 rounded-full opacity-30 blur-3xl" />
        <div className="absolute bottom-0 -left-24 w-72 h-72 bg-gold-500 rounded-full opacity-10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-700 rounded-full opacity-20 blur-3xl" />
        {/* Pattern dots */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="max-w-3xl">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-gold-400 animate-pulse" />
            <span className="text-sm text-white/90 font-medium">Nigeria&apos;s #1 Learning Marketplace</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
            Learn Anything.{' '}
            <span className="text-gold-400">Excel</span> Everywhere.{' '}
            <br className="hidden sm:block" />
            Go Global.
          </h1>

          <p className="text-lg sm:text-xl text-white/80 mb-10 max-w-2xl leading-relaxed">
            Connect with verified Nigerian tutors for WAEC, JAMB, languages, coding, and research —
            or get mentorship to secure your dream university abroad.
          </p>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a subject, tutor, or skill..."
                className="w-full pl-12 pr-4 py-4 text-base rounded-2xl border-0 bg-white text-gray-800 placeholder-gray-400 shadow-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
            <button
              type="submit"
              className="px-8 py-4 bg-gold-500 hover:bg-gold-600 text-white font-semibold rounded-2xl shadow-lg transition-colors whitespace-nowrap"
            >
              Find Tutors
            </button>
          </form>

          {/* Popular Searches */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-white/60">Popular:</span>
            {popularSearches.map((term) => (
              <button
                key={term}
                onClick={() => router.push(`/tutors?q=${encodeURIComponent(term)}`)}
                className="text-sm px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80 border border-white/20 transition-colors"
              >
                {term}
              </button>
            ))}
          </div>

          {/* Trust Badges */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {trustBadges.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-white/80">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-gold-400" />
                </div>
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom wave */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 60L1440 60L1440 20C1200 60 960 0 720 20C480 40 240 0 0 20L0 60Z" fill="white" />
        </svg>
      </div>
    </section>
  )
}
