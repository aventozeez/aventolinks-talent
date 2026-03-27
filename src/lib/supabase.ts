import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// =============================================
// AUTH HELPERS
// =============================================

export async function signUp(email: string, password: string, fullName: string, role: 'student' | 'tutor') {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role } }
  })
  return { data, error }
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// =============================================
// DATABASE HELPERS
// =============================================

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return { data, error }
}

export async function getTutors(filters?: {
  subject?: string
  minRate?: number
  maxRate?: number
  search?: string
  limit?: number
}) {
  let query = supabase
    .from('tutors')
    .select(`*, profiles(full_name, avatar_url, location, state)`)
    .eq('is_available', true)
    .order('rating', { ascending: false })

  if (filters?.minRate) query = query.gte('hourly_rate_ngn', filters.minRate)
  if (filters?.maxRate) query = query.lte('hourly_rate_ngn', filters.maxRate)
  if (filters?.subject) query = query.contains('subjects', [filters.subject])
  if (filters?.limit) query = query.limit(filters.limit)

  const { data, error } = await query
  return { data, error }
}

export async function getTutorById(tutorId: string) {
  const { data, error } = await supabase
    .from('tutors')
    .select(`*, profiles(full_name, avatar_url, location, state, bio, phone)`)
    .eq('id', tutorId)
    .single()
  return { data, error }
}

export async function createBooking(booking: {
  student_id: string
  tutor_id: string
  subject: string
  scheduled_at: string
  duration_minutes: number
  price_ngn: number
  notes?: string
}) {
  const { data, error } = await supabase.from('bookings').insert(booking).select().single()
  return { data, error }
}

export async function getMyBookings(userId: string, role: 'student' | 'tutor') {
  const field = role === 'student' ? 'student_id' : 'tutor_id'
  const { data, error } = await supabase
    .from('bookings')
    .select(`*, profiles!bookings_student_id_fkey(full_name, avatar_url)`)
    .eq(field, userId)
    .order('scheduled_at', { ascending: false })
  return { data, error }
}

export async function getSubjects() {
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('is_active', true)
    .order('category')
  return { data, error }
}

// =============================================
// TYPESCRIPT TYPES
// =============================================

export type Profile = {
  id: string
  full_name: string
  email: string
  role: 'student' | 'tutor' | 'school_admin'
  avatar_url?: string
  phone?: string
  location?: string
  state?: string
  bio?: string
  created_at: string
  updated_at: string
}

export type Tutor = {
  id: string
  profile_id: string
  subjects: string[]
  languages: string[]
  hourly_rate_ngn: number
  rating: number
  total_reviews: number
  total_sessions: number
  is_verified: boolean
  is_available: boolean
  teaching_mode: 'online' | 'in-person' | 'both'
  experience_years: number
  education?: string
  profiles?: Profile
}

export type Booking = {
  id: string
  student_id: string
  tutor_id: string
  subject: string
  scheduled_at: string
  duration_minutes: number
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
  price_ngn: number
  payment_status: 'unpaid' | 'paid' | 'refunded'
  paystack_reference?: string
  meeting_link?: string
  notes?: string
  created_at: string
}

export type Review = {
  id: string
  booking_id: string
  student_id: string
  tutor_id: string
  rating: number
  comment?: string
  created_at: string
}

export type Subject = {
  id: string
  name: string
  category: 'exam_prep' | 'stem' | 'languages' | 'coding' | 'business' | 'research' | 'arts'
  description?: string
  is_active: boolean
}
