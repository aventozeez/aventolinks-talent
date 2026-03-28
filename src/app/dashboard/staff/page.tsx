'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Shield, Users, BookOpen, Star, School, CheckCircle2,
  XCircle, Search, ChevronDown, AlertTriangle, Loader2,
  BarChart3, UserCheck, UserX, Trash2, Eye, RefreshCw,
  MessageSquare, TrendingUp, Lock
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Role = 'student' | 'tutor' | 'school_admin' | 'moderator' | 'admin'

type UserRow = {
  id: string
  full_name: string
  email: string
  role: Role
  location?: string
  state?: string
  created_at: string
  is_staff?: boolean
}

type TutorRow = {
  id: string
  is_verified: boolean
  is_available: boolean
  hourly_rate_ngn: number
  rating: number
  total_sessions: number
  total_reviews: number
  experience_years: number
  subjects: string[]
  profiles: { full_name: string; email: string; location?: string }
}

type BookingRow = {
  id: string
  subject: string
  status: string
  payment_status: string
  price_ngn: number
  scheduled_at: string
  created_at: string
}

type ReviewRow = {
  id: string
  rating: number
  comment: string
  created_at: string
  profiles: { full_name: string }
  tutors: { profiles: { full_name: string } }
}

// ── permissions matrix ──────────────────────────────────────
const CAN = {
  manageRoles:       (role: Role) => role === 'admin',
  deleteUsers:       (role: Role) => role === 'admin',
  verifyTutors:      (role: Role) => role === 'admin' || role === 'moderator',
  manageBookings:    (role: Role) => role === 'admin' || role === 'moderator',
  deleteReviews:     (role: Role) => role === 'admin' || role === 'moderator',
  manageSchools:     (role: Role) => role === 'admin',
  viewStats:         (role: Role) => role === 'admin' || role === 'moderator',
}

const TABS = [
  { id: 'overview',  label: 'Overview',   icon: BarChart3,    roles: ['admin','moderator'] },
  { id: 'users',     label: 'Users',      icon: Users,        roles: ['admin','moderator'] },
  { id: 'tutors',    label: 'Tutors',     icon: UserCheck,    roles: ['admin','moderator'] },
  { id: 'bookings',  label: 'Bookings',   icon: BookOpen,     roles: ['admin','moderator'] },
  { id: 'reviews',   label: 'Reviews',    icon: Star,         roles: ['admin','moderator'] },
  { id: 'schools',   label: 'Schools',    icon: School,       roles: ['admin'] },
]

const ROLE_COLORS: Record<Role, string> = {
  student:      'bg-gray-100 text-gray-700',
  tutor:        'bg-blue-100 text-blue-700',
  school_admin: 'bg-orange-100 text-orange-700',
  moderator:    'bg-purple-100 text-purple-700',
  admin:        'bg-red-100 text-red-700',
}

export default function StaffPortal() {
  const router = useRouter()
  const [myRole, setMyRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  // Data
  const [users, setUsers] = useState<UserRow[]>([])
  const [tutors, setTutors] = useState<TutorRow[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [stats, setStats] = useState({ users: 0, tutors: 0, bookings: 0, revenue: 0, pendingTutors: 0, openBookings: 0 })

  // UI state
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Auth guard
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      if (!prof || (prof.role !== 'admin' && prof.role !== 'moderator')) {
        router.push('/dashboard'); return
      }
      setMyRole(prof.role as Role)
      setLoading(false)
    }
    init()
  }, [router])

  const loadData = useCallback(async () => {
    if (!myRole) return
    // Stats
    const [{ count: uc }, { count: tc }, { data: bData }] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('tutors').select('*', { count: 'exact', head: true }),
      supabase.from('bookings').select('price_ngn, status, payment_status'),
    ])
    const revenue = bData?.filter(b => b.payment_status === 'paid').reduce((s, b) => s + b.price_ngn, 0) || 0
    const openBookings = bData?.filter(b => b.status === 'pending').length || 0
    const { count: pendingTutors } = await supabase.from('tutors').select('*', { count: 'exact', head: true }).eq('is_verified', false)
    setStats({ users: uc || 0, tutors: tc || 0, bookings: bData?.length || 0, revenue, pendingTutors: pendingTutors || 0, openBookings })

    // Users
    const { data: uData } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(100)
    if (uData) setUsers(uData)

    // Tutors
    const { data: tData } = await supabase.from('tutors').select('*, profiles(full_name, email, location)').order('created_at', { ascending: false }).limit(100)
    if (tData) setTutors(tData as unknown as TutorRow[])

    // Bookings
    const { data: bkData } = await supabase.from('bookings').select('*').order('created_at', { ascending: false }).limit(50)
    if (bkData) setBookings(bkData)

    // Reviews
    const { data: rData } = await supabase.from('reviews').select('*, profiles(full_name), tutors(profiles(full_name))').order('created_at', { ascending: false }).limit(50)
    if (rData) setReviews(rData as unknown as ReviewRow[])
  }, [myRole])

  useEffect(() => { if (myRole) loadData() }, [myRole, loadData])

  // ── Actions ──────────────────────────────────────────────

  const updateUserRole = async (userId: string, newRole: Role) => {
    setActionLoading(userId)
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    if (error) showToast('Failed to update role', 'error')
    else { showToast(`Role updated to ${newRole}`); loadData() }
    setActionLoading(null)
  }

  const toggleTutorVerification = async (tutorId: string, current: boolean) => {
    setActionLoading(tutorId)
    const { error } = await supabase.from('tutors').update({ is_verified: !current }).eq('id', tutorId)
    if (error) showToast('Failed to update tutor', 'error')
    else { showToast(current ? 'Tutor unverified' : 'Tutor verified ✓'); loadData() }
    setActionLoading(null)
  }

  const updateBookingStatus = async (bookingId: string, status: string) => {
    setActionLoading(bookingId)
    const { error } = await supabase.from('bookings').update({ status }).eq('id', bookingId)
    if (error) showToast('Failed to update booking', 'error')
    else { showToast(`Booking marked as ${status}`); loadData() }
    setActionLoading(null)
  }

  const deleteReview = async (reviewId: string) => {
    if (!confirm('Delete this review permanently?')) return
    setActionLoading(reviewId)
    const { error } = await supabase.from('reviews').delete().eq('id', reviewId)
    if (error) showToast('Failed to delete review', 'error')
    else { showToast('Review deleted'); loadData() }
    setActionLoading(null)
  }

  // ── Filtered data ─────────────────────────────────────────
  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  )
  const filteredTutors = tutors.filter(t =>
    t.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    t.subjects?.some(s => s.toLowerCase().includes(search.toLowerCase()))
  )

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex items-center gap-3 text-primary-800">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="font-medium">Loading Staff Portal...</span>
      </div>
    </div>
  )

  const visibleTabs = TABS.filter(t => t.roles.includes(myRole!))

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 transition-all ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className={`${myRole === 'admin' ? 'bg-gray-900' : 'bg-purple-900'} text-white`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${myRole === 'admin' ? 'bg-red-500' : 'bg-purple-500'}`}>
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">AventoLinks Staff Portal</h1>
                <p className="text-white/60 text-xs capitalize">
                  {myRole === 'admin' ? '⚡ Admin — Full Access' : '🛡️ Moderator — Limited Access'}
                </p>
              </div>
            </div>
            <button onClick={loadData} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-6 overflow-x-auto pb-1">
            {visibleTabs.map(tab => {
              const Icon = tab.icon
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.id ? 'bg-white text-gray-900' : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}>
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.id === 'tutors' && stats.pendingTutors > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">{stats.pendingTutors}</span>
                  )}
                  {tab.id === 'bookings' && stats.openBookings > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-yellow-500 text-white rounded-full">{stats.openBookings}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── OVERVIEW TAB ─────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { label: 'Total Users', value: stats.users.toLocaleString(), icon: Users, color: 'text-blue-600 bg-blue-50' },
                { label: 'Total Tutors', value: stats.tutors.toLocaleString(), icon: UserCheck, color: 'text-green-600 bg-green-50' },
                { label: 'Total Bookings', value: stats.bookings.toLocaleString(), icon: BookOpen, color: 'text-purple-600 bg-purple-50' },
                { label: 'Revenue (Paid)', value: `₦${stats.revenue.toLocaleString()}`, icon: TrendingUp, color: 'text-primary-700 bg-primary-50', adminOnly: true },
                { label: 'Pending Tutors', value: stats.pendingTutors.toString(), icon: AlertTriangle, color: 'text-yellow-600 bg-yellow-50' },
                { label: 'Open Bookings', value: stats.openBookings.toString(), icon: MessageSquare, color: 'text-orange-600 bg-orange-50' },
              ].filter(s => !s.adminOnly || myRole === 'admin').map(s => {
                const Icon = s.icon
                return (
                  <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-5">
                    <div className={`w-10 h-10 rounded-xl ${s.color.split(' ')[1]} flex items-center justify-center mb-3`}>
                      <Icon className={`w-5 h-5 ${s.color.split(' ')[0]}`} />
                    </div>
                    <p className="text-2xl font-black text-gray-900">{s.value}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{s.label}</p>
                  </div>
                )
              })}
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="font-bold text-gray-900 mb-4">Quick Actions</h3>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => setActiveTab('tutors')} className="px-4 py-2 bg-yellow-50 text-yellow-700 rounded-full text-sm font-medium hover:bg-yellow-100">
                  Review Pending Tutors ({stats.pendingTutors})
                </button>
                <button onClick={() => setActiveTab('bookings')} className="px-4 py-2 bg-orange-50 text-orange-700 rounded-full text-sm font-medium hover:bg-orange-100">
                  Manage Open Bookings ({stats.openBookings})
                </button>
                <button onClick={() => setActiveTab('reviews')} className="px-4 py-2 bg-red-50 text-red-700 rounded-full text-sm font-medium hover:bg-red-100">
                  Moderate Reviews
                </button>
                {CAN.manageRoles(myRole!) && (
                  <button onClick={() => setActiveTab('users')} className="px-4 py-2 bg-primary-50 text-primary-800 rounded-full text-sm font-medium hover:bg-primary-100">
                    Manage User Roles
                  </button>
                )}
                <a href="/dashboard/staff/quiz" className="px-4 py-2 bg-gold-500/10 text-yellow-700 rounded-full text-sm font-medium hover:bg-gold-500/20 inline-flex items-center gap-1.5">
                  🏆 Quiz Manager
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ── USERS TAB ─────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-800" />
              </div>
              <p className="text-sm text-gray-400 self-center">{filteredUsers.length} users</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">User</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Role</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Location</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Joined</th>
                      {CAN.manageRoles(myRole!) && <th className="text-left px-4 py-3 font-semibold text-gray-600">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredUsers.map(user => (
                      <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-800 text-xs font-bold flex-shrink-0">
                              {user.full_name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate">{user.full_name}</p>
                              <p className="text-xs text-gray-400 truncate">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${ROLE_COLORS[user.role]}`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{user.state || user.location || '—'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                          {new Date(user.created_at).toLocaleDateString('en-NG')}
                        </td>
                        {CAN.manageRoles(myRole!) && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                <select
                                  value={user.role}
                                  onChange={e => updateUserRole(user.id, e.target.value as Role)}
                                  disabled={actionLoading === user.id}
                                  className="text-xs pl-2 pr-6 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-primary-800 appearance-none cursor-pointer"
                                >
                                  <option value="student">Student</option>
                                  <option value="tutor">Tutor</option>
                                  <option value="school_admin">School Admin</option>
                                  <option value="moderator">Moderator</option>
                                  <option value="admin">Admin</option>
                                </select>
                                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                              </div>
                              {actionLoading === user.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-700" />}
                            </div>
                          </td>
                        )}
                        {!CAN.manageRoles(myRole!) && (
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <Lock className="w-3 h-3" /> View only
                            </span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TUTORS TAB ─────────────────────────────── */}
        {activeTab === 'tutors' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search tutors..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-800" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTutors.map(tutor => (
                <div key={tutor.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-800 font-bold">
                        {tutor.profiles?.full_name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{tutor.profiles?.full_name}</p>
                        <p className="text-xs text-gray-400">{tutor.profiles?.email}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      tutor.is_verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {tutor.is_verified ? '✓ Verified' : '⏳ Pending'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {tutor.subjects?.slice(0, 4).map(s => (
                      <span key={s} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{s}</span>
                    ))}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                    <span>⭐ {tutor.rating || 0}</span>
                    <span>📚 {tutor.total_sessions} sessions</span>
                    <span>💰 ₦{tutor.hourly_rate_ngn?.toLocaleString()}/hr</span>
                  </div>

                  {CAN.verifyTutors(myRole!) && (
                    <button
                      onClick={() => toggleTutorVerification(tutor.id, tutor.is_verified)}
                      disabled={actionLoading === tutor.id}
                      className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-colors ${
                        tutor.is_verified
                          ? 'bg-red-50 text-red-700 hover:bg-red-100'
                          : 'bg-green-50 text-green-700 hover:bg-green-100'
                      }`}
                    >
                      {actionLoading === tutor.id ? <Loader2 className="w-4 h-4 animate-spin" /> :
                        tutor.is_verified ? <><UserX className="w-4 h-4" /> Unverify</> : <><UserCheck className="w-4 h-4" /> Verify Tutor</>}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── BOOKINGS TAB ─────────────────────────────── */}
        {activeTab === 'bookings' && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Subject</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Payment</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Amount</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Date</th>
                    {CAN.manageBookings(myRole!) && <th className="text-left px-4 py-3 font-semibold text-gray-600">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bookings.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{b.subject}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                          b.status === 'completed' ? 'bg-green-100 text-green-700' :
                          b.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                          b.status === 'pending'   ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>{b.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                          b.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>{b.payment_status}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">₦{b.price_ngn?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                        {new Date(b.scheduled_at).toLocaleDateString('en-NG')}
                      </td>
                      {CAN.manageBookings(myRole!) && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {b.status === 'pending' && (
                              <button onClick={() => updateBookingStatus(b.id, 'confirmed')}
                                disabled={actionLoading === b.id}
                                className="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {b.status !== 'cancelled' && b.status !== 'completed' && (
                              <button onClick={() => updateBookingStatus(b.id, 'cancelled')}
                                disabled={actionLoading === b.id}
                                className="p-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100">
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {actionLoading === b.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 self-center" />}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── REVIEWS TAB ─────────────────────────────── */}
        {activeTab === 'reviews' && (
          <div className="space-y-3">
            {reviews.map(r => (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? 'text-gold-500 fill-gold-500' : 'text-gray-200'}`} />
                      ))}
                    </div>
                    <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('en-NG')}</span>
                  </div>
                  <p className="text-sm text-gray-700 mb-2">&quot;{r.comment || 'No comment'}&quot;</p>
                  <p className="text-xs text-gray-400">
                    By <span className="font-medium text-gray-600">{r.profiles?.full_name}</span>
                    {r.tutors?.profiles?.full_name && <> for <span className="font-medium text-gray-600">{r.tutors.profiles.full_name}</span></>}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button className="p-2 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100">
                    <Eye className="w-4 h-4" />
                  </button>
                  {CAN.deleteReviews(myRole!) && (
                    <button onClick={() => deleteReview(r.id)}
                      disabled={actionLoading === r.id}
                      className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
                      {actionLoading === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SCHOOLS TAB (admin only) ─────────────────── */}
        {activeTab === 'schools' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <School className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-bold text-gray-700 mb-1">School Partnerships</h3>
            <p className="text-sm text-gray-400">School management coming in the next update.</p>
          </div>
        )}
      </div>
    </div>
  )
}
