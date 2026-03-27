import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for your main database tables
export type Profile = {
  id: string
  full_name: string
  email: string
  role: 'student' | 'tutor' | 'school_admin'
  avatar_url?: string
  location?: string
  created_at: string
}

export type Tutor = {
  id: string
  profile_id: string
  bio: string
  subjects: string[]
  languages: string[]
  hourly_rate_ngn: number
  rating: number
  total_sessions: number
  is_verified: boolean
  created_at: string
}

export type Session = {
  id: string
  student_id: string
  tutor_id: string
  subject: string
  scheduled_at: string
  duration_minutes: number
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
  price_ngn: number
  created_at: string
}

export type Review = {
  id: string
  session_id: string
  student_id: string
  tutor_id: string
  rating: number
  comment: string
  created_at: string
}
