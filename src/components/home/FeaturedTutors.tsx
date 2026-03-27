import Link from 'next/link'
import Image from 'next/image'
import { Star, CheckCircle2 } from 'lucide-react'

const tutors = [
  {
    id: 1,
    name: 'Amara Okafor',
    title: 'Mathematics & Physics Expert',
    subjects: ['WAEC Math', 'Physics', 'JAMB'],
    rating: 4.9,
    reviews: 142,
    rate: '₦3,500/hr',
    location: 'Lagos',
    image: 'https://randomuser.me/api/portraits/women/44.jpg',
    verified: true,
    sessions: '800+ sessions',
    languages: ['English', 'Yoruba'],
  },
  {
    id: 2,
    name: 'Chidi Eze',
    title: 'French & Spanish Language Tutor',
    subjects: ['French', 'Spanish', 'English'],
    rating: 5.0,
    reviews: 98,
    rate: '₦4,000/hr',
    location: 'Abuja',
    image: 'https://randomuser.me/api/portraits/men/32.jpg',
    verified: true,
    sessions: '600+ sessions',
    languages: ['English', 'French', 'Spanish'],
  },
  {
    id: 3,
    name: 'Fatima Al-Hassan',
    title: 'Arabic & Research Writing Coach',
    subjects: ['Arabic', 'Research Writing', 'Study Abroad'],
    rating: 4.8,
    reviews: 76,
    rate: '₦5,000/hr',
    location: 'Kano',
    image: 'https://randomuser.me/api/portraits/women/68.jpg',
    verified: true,
    sessions: '400+ sessions',
    languages: ['English', 'Arabic', 'Hausa'],
  },
  {
    id: 4,
    name: 'Emeka Nwosu',
    title: 'Coding & AI Instructor',
    subjects: ['Python', 'Web Dev', 'Data Analysis'],
    rating: 4.9,
    reviews: 115,
    rate: '₦6,000/hr',
    location: 'Port Harcourt',
    image: 'https://randomuser.me/api/portraits/men/75.jpg',
    verified: true,
    sessions: '700+ sessions',
    languages: ['English', 'Igbo'],
  },
  {
    id: 5,
    name: 'Ngozi Adeyemi',
    title: 'Biology & Chemistry Specialist',
    subjects: ['Chemistry', 'Biology', 'WAEC Science'],
    rating: 4.7,
    reviews: 89,
    rate: '₦3,000/hr',
    location: 'Ibadan',
    image: 'https://randomuser.me/api/portraits/women/21.jpg',
    verified: true,
    sessions: '550+ sessions',
    languages: ['English', 'Yoruba'],
  },
  {
    id: 6,
    name: 'Ibrahim Musa',
    title: 'Economics & Business Studies Tutor',
    subjects: ['Economics', 'Accounting', 'Commerce'],
    rating: 4.8,
    reviews: 63,
    rate: '₦3,500/hr',
    location: 'Kaduna',
    image: 'https://randomuser.me/api/portraits/men/55.jpg',
    verified: true,
    sessions: '350+ sessions',
    languages: ['English', 'Hausa'],
  },
]

export default function FeaturedTutors() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12 gap-4">
          <div>
            <span className="text-sm font-semibold text-primary-700 uppercase tracking-wider">Top Tutors</span>
            <h2 className="mt-2 text-3xl sm:text-4xl font-bold text-gray-900">
              Meet Our Featured Tutors
            </h2>
            <p className="mt-3 text-lg text-gray-500">
              Vetted, verified, and highly rated by Nigerian students like you.
            </p>
          </div>
          <Link
            href="/tutors"
            className="text-sm font-semibold text-primary-800 hover:text-primary-600 flex-shrink-0 underline underline-offset-2"
          >
            See all tutors →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {tutors.map((tutor) => (
            <Link
              key={tutor.id}
              href={`/tutors/${tutor.id}`}
              className="group bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="relative">
                  <Image
                    src={tutor.image}
                    alt={tutor.name}
                    width={60}
                    height={60}
                    className="w-14 h-14 rounded-full object-cover"
                  />
                  {tutor.verified && (
                    <CheckCircle2 className="absolute -bottom-1 -right-1 w-5 h-5 text-primary-700 bg-white rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 group-hover:text-primary-800 transition-colors truncate">
                    {tutor.name}
                  </h3>
                  <p className="text-sm text-gray-500 truncate">{tutor.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{tutor.location}</p>
                </div>
              </div>

              {/* Subjects */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {tutor.subjects.map((s) => (
                  <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-primary-50 text-primary-800 font-medium">
                    {s}
                  </span>
                ))}
              </div>

              {/* Stats row */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-gold-500 fill-gold-500" />
                  <span className="font-semibold text-gray-800">{tutor.rating}</span>
                  <span className="text-gray-400">({tutor.reviews})</span>
                </div>
                <span className="text-xs text-gray-400">{tutor.sessions}</span>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                <span className="text-sm text-gray-500">{tutor.languages.join(' · ')}</span>
                <span className="text-base font-bold text-primary-800">{tutor.rate}</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/tutors"
            className="inline-flex items-center gap-2 px-8 py-3.5 border-2 border-primary-800 text-primary-800 rounded-full font-semibold hover:bg-primary-800 hover:text-white transition-all"
          >
            Browse All 500+ Tutors
          </Link>
        </div>
      </div>
    </section>
  )
}
