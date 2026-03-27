import { Search, SlidersHorizontal, Star, CheckCircle2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

const subjects = ['All', 'WAEC/JAMB', 'Mathematics', 'English', 'Sciences', 'Languages', 'Coding', 'Business', 'Research']
const priceRanges = ['Any Price', 'Under ₦2,000/hr', '₦2,000–₦5,000/hr', 'Above ₦5,000/hr']

const tutors = [
  { id: 1, name: 'Amara Okafor', title: 'Mathematics & Physics', rating: 4.9, reviews: 142, rate: '₦3,500/hr', location: 'Lagos', image: 'https://randomuser.me/api/portraits/women/44.jpg', subjects: ['WAEC Math', 'Physics', 'JAMB'], sessions: 800 },
  { id: 2, name: 'Chidi Eze', title: 'French & Spanish Tutor', rating: 5.0, reviews: 98, rate: '₦4,000/hr', location: 'Abuja', image: 'https://randomuser.me/api/portraits/men/32.jpg', subjects: ['French', 'Spanish', 'English'], sessions: 600 },
  { id: 3, name: 'Fatima Al-Hassan', title: 'Arabic & Research Writing', rating: 4.8, reviews: 76, rate: '₦5,000/hr', location: 'Kano', image: 'https://randomuser.me/api/portraits/women/68.jpg', subjects: ['Arabic', 'Research', 'Study Abroad'], sessions: 400 },
  { id: 4, name: 'Emeka Nwosu', title: 'Coding & AI Instructor', rating: 4.9, reviews: 115, rate: '₦6,000/hr', location: 'Port Harcourt', image: 'https://randomuser.me/api/portraits/men/75.jpg', subjects: ['Python', 'Web Dev', 'AI'], sessions: 700 },
  { id: 5, name: 'Ngozi Adeyemi', title: 'Biology & Chemistry', rating: 4.7, reviews: 89, rate: '₦3,000/hr', location: 'Ibadan', image: 'https://randomuser.me/api/portraits/women/21.jpg', subjects: ['Chemistry', 'Biology', 'WAEC'], sessions: 550 },
  { id: 6, name: 'Ibrahim Musa', title: 'Economics & Business', rating: 4.8, reviews: 63, rate: '₦3,500/hr', location: 'Kaduna', image: 'https://randomuser.me/api/portraits/men/55.jpg', subjects: ['Economics', 'Accounting', 'Commerce'], sessions: 350 },
  { id: 7, name: 'Adaeze Ike', title: 'English & Literature Tutor', rating: 4.9, reviews: 107, rate: '₦2,500/hr', location: 'Enugu', image: 'https://randomuser.me/api/portraits/women/83.jpg', subjects: ['English', 'Literature', 'WAEC'], sessions: 620 },
  { id: 8, name: 'Yusuf Danladi', title: 'Further Mathematics & Stats', rating: 4.6, reviews: 54, rate: '₦4,500/hr', location: 'Jos', image: 'https://randomuser.me/api/portraits/men/91.jpg', subjects: ['Further Math', 'Statistics', 'JAMB'], sessions: 280 },
  { id: 9, name: 'Blessing Okonkwo', title: 'German Language Tutor', rating: 5.0, reviews: 41, rate: '₦5,500/hr', location: 'Lagos', image: 'https://randomuser.me/api/portraits/women/55.jpg', subjects: ['German', 'English', 'Study Abroad'], sessions: 190 },
]

export default function TutorsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-white mb-2">Find Your Perfect Tutor</h1>
          <p className="text-white/70 mb-6">500+ verified Nigerian experts ready to help you succeed</p>
          <div className="flex gap-3 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by subject, name, or skill..."
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
            <button className="px-4 py-3 bg-white/10 border border-white/30 text-white rounded-xl hover:bg-white/20 flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5" />
              <span className="hidden sm:inline">Filters</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filter chips */}
        <div className="flex flex-wrap gap-2 mb-8">
          {subjects.map((s, i) => (
            <button
              key={s}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                i === 0
                  ? 'bg-primary-800 text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:border-primary-800 hover:text-primary-800'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">{tutors.length} tutors found</p>
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-800">
            <option>Sort: Best Match</option>
            <option>Rating: High to Low</option>
            <option>Price: Low to High</option>
            <option>Most Sessions</option>
          </select>
        </div>

        {/* Tutor Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {tutors.map((tutor) => (
            <Link
              key={tutor.id}
              href={`/tutors/${tutor.id}`}
              className="group bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="relative">
                  <Image src={tutor.image} alt={tutor.name} width={56} height={56} className="w-14 h-14 rounded-full object-cover" />
                  <CheckCircle2 className="absolute -bottom-1 -right-1 w-5 h-5 text-primary-700 bg-white rounded-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 group-hover:text-primary-800 truncate">{tutor.name}</h3>
                  <p className="text-sm text-gray-500 truncate">{tutor.title}</p>
                  <p className="text-xs text-gray-400">{tutor.location}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {tutor.subjects.map((s) => (
                  <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-primary-50 text-primary-800 font-medium">{s}</span>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-gold-500 fill-gold-500" />
                  <span className="font-semibold">{tutor.rating}</span>
                  <span className="text-gray-400">({tutor.reviews})</span>
                </div>
                <span className="font-bold text-primary-800">{tutor.rate}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
