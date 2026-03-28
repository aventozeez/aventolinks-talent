'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Menu, X, ChevronDown, BookOpen, Shield, LayoutDashboard, LogOut, User } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

// Create client inline to guarantee env vars are picked up at runtime
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Profile = {
  id: string
  full_name: string
  email: string
  role: string
}

const navLinks = [
  { label: 'Find Tutors', href: '/tutors' },
  {
    label: 'Subjects', href: '/subjects',
    dropdown: [
      { label: 'WAEC / NECO / JAMB', href: '/subjects/exams' },
      { label: 'STEM & Sciences', href: '/subjects/stem' },
      { label: 'Business & Economics', href: '/subjects/business' },
      { label: 'Digital Skills', href: '/subjects/digital' },
    ],
  },
  {
    label: 'Languages', href: '/languages',
    dropdown: [
      { label: 'English', href: '/languages/english' },
      { label: 'French', href: '/languages/french' },
      { label: 'Arabic', href: '/languages/arabic' },
      { label: 'Spanish', href: '/languages/spanish' },
      { label: 'German', href: '/languages/german' },
    ],
  },
  { label: 'Research Program', href: '/research' },
  { label: 'Study Abroad', href: '/mentorship' },
  { label: 'For Schools', href: '/schools' },
]

const isStaff = (role?: string) => role === 'admin' || role === 'moderator'

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const supabaseRef = useRef(getSupabase())

  // Close menus on route change
  useEffect(() => {
    setMenuOpen(false)
    setUserMenuOpen(false)
  }, [pathname])

  // Auth state — runs only on client after hydration
  useEffect(() => {
    setHydrated(true)
    const sb = supabaseRef.current

    const fetchProfile = async (userId: string) => {
      const { data, error } = await sb
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('id', userId)
        .single()
      if (data && !error) setProfile(data)
    }

    // Check existing session immediately
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) fetchProfile(session.user.id)
    })

    // Keep in sync with auth changes (login, logout, token refresh)
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabaseRef.current.auth.signOut()
    setProfile(null)
    setMenuOpen(false)
    setUserMenuOpen(false)
    router.push('/')
    router.refresh()
  }

  const closeAll = () => {
    setMenuOpen(false)
    setUserMenuOpen(false)
  }

  // Don't flash login buttons before hydration check completes
  const showAuthButtons = hydrated

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2" onClick={closeAll}>
            <div className="w-8 h-8 rounded-lg bg-primary-800 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-primary-800">
              Avento<span className="text-gold-500">Links</span>
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <div
                key={link.label}
                className="relative"
                onMouseEnter={() => link.dropdown && setActiveDropdown(link.label)}
                onMouseLeave={() => setActiveDropdown(null)}
              >
                <Link
                  href={link.href}
                  className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary-800 rounded-md hover:bg-primary-50 transition-colors"
                >
                  {link.label}
                  {link.dropdown && <ChevronDown className="w-3.5 h-3.5" />}
                </Link>
                {link.dropdown && activeDropdown === link.label && (
                  <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-50">
                    {link.dropdown.map((item) => (
                      <Link key={item.label} href={item.href}
                        className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-800 transition-colors">
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Staff-only links — desktop, visible only to admin/moderator */}
            {isStaff(profile?.role) && (
              <>
                <Link href="/quiz"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gold-600 bg-gold-50 rounded-md hover:bg-gold-100 transition-colors ml-1">
                  🏆 Scholars Challenge
                </Link>
                <Link href="/dashboard/staff"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-primary-800 bg-primary-50 rounded-md hover:bg-primary-100 transition-colors ml-1">
                  <Shield className="w-3.5 h-3.5" />
                  Staff Portal
                </Link>
              </>
            )}
          </div>

          {/* Desktop Right — auth aware */}
          <div className="hidden lg:flex items-center gap-3 min-w-[160px] justify-end">
            {!showAuthButtons ? (
              // Skeleton while hydrating
              <div className="w-32 h-9 bg-gray-100 rounded-full animate-pulse" />
            ) : profile ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 hover:border-primary-800 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-primary-800 flex items-center justify-center text-white text-xs font-bold">
                    {profile.full_name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <span className="text-sm font-medium text-gray-700 max-w-[100px] truncate">
                    {profile.full_name?.split(' ')[0]}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-100 rounded-xl shadow-xl py-2 z-50">
                    <div className="px-4 py-2.5 border-b border-gray-50">
                      <p className="text-sm font-semibold text-gray-900 truncate">{profile.full_name}</p>
                      <p className="text-xs text-gray-400">{profile.email}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                        isStaff(profile.role) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                      }`}>{profile.role}</span>
                    </div>
                    <Link href="/dashboard" onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                      <LayoutDashboard className="w-4 h-4 text-gray-400" /> Dashboard
                    </Link>
                    <Link href="/dashboard/profile" onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                      <User className="w-4 h-4 text-gray-400" /> My Profile
                    </Link>
                    {isStaff(profile.role) && (
                      <Link href="/dashboard/staff" onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-primary-800 hover:bg-primary-50 transition-colors">
                        <Shield className="w-4 h-4" /> Staff Portal
                      </Link>
                    )}
                    <div className="border-t border-gray-50 mt-1 pt-1">
                      <button onClick={handleSignOut}
                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                        <LogOut className="w-4 h-4" /> Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link href="/login"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-primary-800 transition-colors">
                  Log in
                </Link>
                <Link href="/register"
                  className="px-5 py-2 text-sm font-semibold text-white bg-primary-800 rounded-full hover:bg-primary-700 transition-colors">
                  Get started
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="lg:hidden p-2 rounded-md text-gray-600 hover:text-primary-800"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* ── Mobile Menu ── */}
      {menuOpen && (
        <div className="lg:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-1 shadow-lg">

          {/* Logged-in user card */}
          {profile && (
            <div className="flex items-center gap-3 px-3 py-3 mb-2 bg-gray-50 rounded-xl">
              <div className="w-9 h-9 rounded-full bg-primary-800 flex items-center justify-center text-white font-bold flex-shrink-0">
                {profile.full_name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{profile.full_name}</p>
                <p className="text-xs text-gray-400 capitalize">{profile.role}</p>
              </div>
            </div>
          )}

          {/* Nav links */}
          {navLinks.map((link) => (
            <div key={link.label}>
              <Link href={link.href}
                className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:text-primary-800 hover:bg-primary-50 rounded-md"
                onClick={() => setMenuOpen(false)}>
                {link.label}
              </Link>
              {link.dropdown && (
                <div className="ml-4 border-l-2 border-primary-100 pl-3 mt-1 space-y-1">
                  {link.dropdown.map((item) => (
                    <Link key={item.label} href={item.href}
                      className="block py-1.5 text-sm text-gray-600 hover:text-primary-800"
                      onClick={() => setMenuOpen(false)}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Staff-only links — mobile */}
          {isStaff(profile?.role) && (
            <>
              <Link href="/quiz"
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-gold-600 bg-gold-50 rounded-md"
                onClick={() => setMenuOpen(false)}>
                🏆 Scholars Challenge
              </Link>
              <Link href="/dashboard/staff"
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-primary-800 bg-primary-50 rounded-md"
                onClick={() => setMenuOpen(false)}>
                <Shield className="w-4 h-4" /> Staff Portal
              </Link>
            </>
          )}

          {/* Auth section */}
          <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
            {profile ? (
              <>
                <Link href="/dashboard"
                  className="w-full text-center py-2.5 text-sm font-semibold text-primary-800 border-2 border-primary-800 rounded-full"
                  onClick={() => setMenuOpen(false)}>
                  My Dashboard
                </Link>
                <button onClick={handleSignOut}
                  className="w-full text-center py-2.5 text-sm font-medium text-red-600 border border-red-200 rounded-full hover:bg-red-50">
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link href="/login"
                  className="w-full text-center py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-full"
                  onClick={() => setMenuOpen(false)}>
                  Log in
                </Link>
                <Link href="/register"
                  className="w-full text-center py-2.5 text-sm font-semibold text-white bg-primary-800 rounded-full"
                  onClick={() => setMenuOpen(false)}>
                  Get started free
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* Close user menu on outside click */}
      {userMenuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
      )}
    </nav>
  )
}
