import Link from 'next/link'
import { Calculator, Globe, Code2, FlaskConical, Microscope, BookMarked, GraduationCap, Landmark } from 'lucide-react'

const categories = [
  {
    icon: BookMarked,
    title: 'WAEC / NECO / JAMB',
    description: 'Exam prep for all major Nigerian national exams with past-question drills.',
    href: '/subjects/exams',
    count: '120+ tutors',
    color: 'from-green-500 to-primary-700',
    bg: 'bg-green-50',
    iconColor: 'text-primary-800',
    badge: 'Most Popular',
  },
  {
    icon: Globe,
    title: 'Language Learning',
    description: 'English, French, Arabic, Spanish, German — from beginner to fluent.',
    href: '/languages',
    count: '85+ tutors',
    color: 'from-blue-500 to-blue-700',
    bg: 'bg-blue-50',
    iconColor: 'text-blue-700',
    badge: null,
  },
  {
    icon: Code2,
    title: 'Coding & AI',
    description: 'Python, web development, data analysis, and intro to artificial intelligence.',
    href: '/subjects/digital',
    count: '60+ tutors',
    color: 'from-purple-500 to-purple-700',
    bg: 'bg-purple-50',
    iconColor: 'text-purple-700',
    badge: 'Fast Growing',
  },
  {
    icon: Microscope,
    title: 'STEM & Sciences',
    description: 'Mathematics, Physics, Chemistry, Biology taught by verified experts.',
    href: '/subjects/stem',
    count: '95+ tutors',
    color: 'from-orange-500 to-red-600',
    bg: 'bg-orange-50',
    iconColor: 'text-orange-700',
    badge: null,
  },
  {
    icon: FlaskConical,
    title: 'Research Program',
    description: 'Teach students how to write papers, conduct research, and win competitions.',
    href: '/research',
    count: '30+ mentors',
    color: 'from-teal-500 to-teal-700',
    bg: 'bg-teal-50',
    iconColor: 'text-teal-700',
    badge: 'Unique to AventoLinks',
  },
  {
    icon: GraduationCap,
    title: 'Study Abroad Guidance',
    description: 'SOP writing, scholarship search, university applications, and interview prep.',
    href: '/mentorship',
    count: '25+ mentors',
    color: 'from-gold-500 to-yellow-600',
    bg: 'bg-yellow-50',
    iconColor: 'text-yellow-700',
    badge: null,
  },
  {
    icon: Calculator,
    title: 'Business & Economics',
    description: 'Accounting, economics, entrepreneurship, and financial literacy.',
    href: '/subjects/business',
    count: '40+ tutors',
    color: 'from-pink-500 to-rose-600',
    bg: 'bg-pink-50',
    iconColor: 'text-pink-700',
    badge: null,
  },
  {
    icon: Landmark,
    title: 'For Schools',
    description: 'AventoLinks partners with schools to install software and train teachers & students.',
    href: '/schools',
    count: '50+ schools',
    color: 'from-slate-500 to-slate-700',
    bg: 'bg-slate-50',
    iconColor: 'text-slate-700',
    badge: 'New',
  },
]

export default function SubjectCategories() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-sm font-semibold text-primary-700 uppercase tracking-wider">What We Offer</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold text-gray-900">
            Every Subject. Every Goal. One Platform.
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            From JAMB prep to landing a scholarship in the UK — AventoLinks covers the full student journey.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {categories.map((cat) => {
            const Icon = cat.icon
            return (
              <Link
                key={cat.title}
                href={cat.href}
                className="group relative bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
              >
                {cat.badge && (
                  <span className="absolute top-4 right-4 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary-100 text-primary-800">
                    {cat.badge}
                  </span>
                )}
                <div className={`w-12 h-12 rounded-xl ${cat.bg} flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 ${cat.iconColor}`} />
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-1 group-hover:text-primary-800 transition-colors">
                  {cat.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed mb-3">{cat.description}</p>
                <span className="text-xs font-semibold text-primary-700">{cat.count}</span>
              </Link>
            )
          })}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/tutors"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-800 text-white rounded-full font-semibold hover:bg-primary-700 transition-colors"
          >
            Browse All Tutors
          </Link>
        </div>
      </div>
    </section>
  )
}
