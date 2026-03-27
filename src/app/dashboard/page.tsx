'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, Calendar, Star, MessageSquare, LogOut, User, TrendingUp, Bell } from 'lucide-react'
import { getSession, getProfile, signOut, type Profile } from '@/lib/supabase'

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const session = await getSession()
      if (!session) { router.push('/login'); return }
      const { data } = await getProfile(session.user.id)
      setProfile(data)
      setLoading(false)
    }
    init()
  }, [router])

  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-primary-800">
          <BookOpen className="w-6 h-6 animate-pulse" />
          <span className="font-medium">Loading your dashboard...</span>
        </div>
      </div>
    )
  }

  const isStudent = profile?.role === 'student'
  const isTutor = profile?.role === 'tutor'

  const studentCards = [
    { icon: BookOpen, label: 'My Sessions', value: '0', href: '/dashboard/sessions', color: 'bg-blue-50 text-blue-700' },
    { icon: Calendar, label: 'Upcoming', value: '0', href: '/dashboard/sessions', color: 'bg-green-50 text-green-700' },
    { icon: Star, label: 'Saved Tutors', value: '0', href: '/dashboard/saved', color: 'bg-yellow-50 text-yellow-700' },
    { icon: MessageSquare, label: 'Messages', value: '0', href: '/dashboard/messages', color: 'bg-purple-50 text-purple-700' },
  ]

  const tutorCards = [
    { icon: Calendar, label: 'Bookings', value: '0', href: '/dashboard/bookings', color: 'bg-blue-50 text-blue-700' },
    { icon: Star, label: 'My Rating', value: '—', href: '/dashboard/reviews', color: 'bg-yellow-50 text-yellow-700' },
    { icon: TrendingUp, label: 'Total Earned', value: '₦0', href: '/dashboard/earnings', color: 'bg-green-50 text-green-700' },
    { icon: MessageSquare, label: 'Messages', value: '0', href: '/dashboard/messages', color: 'bg-purple-50 text-purple-700' },
  ]

  const cards = isTutor ? tutorCards : studentCards

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Dashboard Header */}
      <div className="bg-primary-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm">Welcome back 👋</p>
              <h1 className="text-2xl font-bold mt-1">{profile?.full_name || 'User'}</h1>
              <span className="inline-block mt-2 px-3 py-0.5 rounded-full bg-white/10 text-xs font-medium capitalize">
                {profile?.role}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
                <Bell className="w-5 h-5" />
              </button>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {cards.map(({ icon: Icon, label, value, href, color }) => (
            <Link key={label} href={href} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className={`w-10 h-10 rounded-xl ${color.split(' ')[0]} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color.split(' ')[1]}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{label}</p>
            </Link>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Profile completion */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                <User className="w-5 h-5 text-primary-800" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Complete your profile</h3>
                <p className="text-xs text-gray-400">40% complete</p>
              </div>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full mb-4">
              <div className="w-2/5 h-2 bg-primary-700 rounded-full" />
            </div>
            <Link href="/dashboard/profile" className="block w-full text-center py-2.5 border-2 border-primary-800 text-primary-800 rounded-xl text-sm font-semibold hover:bg-primary-800 hover:text-white transition-all">
              Edit Profile
            </Link>
          </div>

          {/* Quick Find (for students) or Setup Profile (for tutors) */}
          {isStudent && (
            <div className="bg-gradient-to-br from-primary-800 to-primary-600 rounded-2xl p-6 text-white">
              <h3 className="font-bold text-lg mb-2">Find a Tutor</h3>
              <p className="text-white/70 text-sm mb-4">Browse 500+ verified tutors for any subject.</p>
              <Link href="/tutors" className="block w-full text-center py-2.5 bg-white text-primary-800 rounded-xl text-sm font-bold hover:bg-gray-100 transition-colors">
                Browse Tutors
              </Link>
            </div>
          )}

          {isTutor && (
            <div className="bg-gradient-to-br from-primary-800 to-primary-600 rounded-2xl p-6 text-white">
              <h3 className="font-bold text-lg mb-2">Set Your Availability</h3>
              <p className="text-white/70 text-sm mb-4">Let students know when you&apos;re free to teach.</p>
              <Link href="/dashboard/availability" className="block w-full text-center py-2.5 bg-white text-primary-800 rounded-xl text-sm font-bold hover:bg-gray-100 transition-colors">
                Manage Schedule
              </Link>
            </div>
          )}

          {/* Research / Mentorship CTA */}
          <div className="bg-gold-500/10 border border-gold-500/20 rounded-2xl p-6">
            <h3 className="font-bold text-gray-900 mb-2">
              {isStudent ? '🏆 Scholars Challenge' : '📚 Teaching Resources'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {isStudent
                ? 'Enter the AventoLinks Scholars Challenge and win prizes + recognition.'
                : 'Access tips, lesson plan templates, and teaching guides.'}
            </p>
            <Link href={isStudent ? '/research' : '/dashboard/resources'} className="block w-full text-center py-2.5 bg-gold-500 text-white rounded-xl text-sm font-bold hover:bg-gold-600 transition-colors">
              {isStudent ? 'Learn More' : 'View Resources'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
