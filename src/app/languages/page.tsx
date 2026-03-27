import Link from 'next/link'
import { Globe2, ArrowRight } from 'lucide-react'

const languages = [
  {
    name: 'English',
    flag: '🇬🇧',
    href: '/languages/english',
    tutors: 120,
    levels: ['IELTS Prep', 'Business English', 'Academic Writing', 'Conversation'],
    color: 'from-blue-600 to-blue-800',
    bgLight: 'bg-blue-50',
    textColor: 'text-blue-800',
    description: 'Boost your academic and professional English. Prepare for IELTS, TOEFL, or UK/US university applications.',
  },
  {
    name: 'French',
    flag: '🇫🇷',
    href: '/languages/french',
    tutors: 45,
    levels: ['A1 Beginner', 'A2–B1 Intermediate', 'B2–C1 Advanced', 'DELF/DALF Prep'],
    color: 'from-indigo-600 to-indigo-800',
    bgLight: 'bg-indigo-50',
    textColor: 'text-indigo-800',
    description: 'Learn French for scholarships, travel, the AU, or just because it\'s beautiful. Taught by native-level instructors.',
  },
  {
    name: 'Arabic',
    flag: '🇸🇦',
    href: '/languages/arabic',
    tutors: 38,
    levels: ['Modern Standard Arabic', 'Quranic Arabic', 'Conversational', 'Egyptian/Gulf dialect'],
    color: 'from-green-600 to-green-800',
    bgLight: 'bg-green-50',
    textColor: 'text-green-800',
    description: 'Learn Arabic for Islamic studies, business, or scholarships to Saudi Arabia, Egypt, and the Arab world.',
  },
  {
    name: 'Spanish',
    flag: '🇪🇸',
    href: '/languages/spanish',
    tutors: 28,
    levels: ['A1 Beginner', 'Intermediate Conversation', 'DELE Exam Prep', 'Latin American Spanish'],
    color: 'from-red-500 to-red-700',
    bgLight: 'bg-red-50',
    textColor: 'text-red-700',
    description: 'Spanish opens doors to Spain, Latin America, and global business. Start from zero or sharpen your skills.',
  },
  {
    name: 'German',
    flag: '🇩🇪',
    href: '/languages/german',
    tutors: 18,
    levels: ['A1–A2 Beginner', 'B1–B2 Intermediate', 'TestDaF / Goethe Prep', 'Technical German'],
    color: 'from-gray-600 to-gray-800',
    bgLight: 'bg-gray-50',
    textColor: 'text-gray-700',
    description: 'Germany is one of the top study destinations for Nigerian students. Get your language ready for admission.',
  },
  {
    name: 'Yoruba / Igbo / Hausa',
    flag: '🇳🇬',
    href: '/languages/nigerian',
    tutors: 22,
    levels: ['Conversational', 'Written & Literacy', 'Cultural Context', 'WAEC Language Prep'],
    color: 'from-primary-600 to-primary-800',
    bgLight: 'bg-primary-50',
    textColor: 'text-primary-800',
    description: 'Preserve and master Nigerian languages. Useful for WAEC and for staying connected to your roots.',
  },
]

export default function LanguagesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-800 to-primary-800 py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
          <Globe2 className="w-12 h-12 mx-auto mb-4 text-gold-400" />
          <h1 className="text-4xl font-bold mb-3">Learn Any Language</h1>
          <p className="text-white/75 text-lg max-w-xl mx-auto">
            From IELTS prep to Arabic for scholarships — our language tutors meet you at your level
            and take you where you want to go.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {languages.map((lang) => (
            <Link
              key={lang.name}
              href={lang.href}
              className="group bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="text-4xl">{lang.flag}</span>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 group-hover:text-primary-800 transition-colors">
                    {lang.name}
                  </h2>
                  <p className={`text-xs font-semibold ${lang.textColor}`}>{lang.tutors}+ tutors</p>
                </div>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">{lang.description}</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {lang.levels.map((level) => (
                  <span key={level} className={`text-xs px-2.5 py-1 rounded-full ${lang.bgLight} ${lang.textColor} font-medium`}>
                    {level}
                  </span>
                ))}
              </div>
              <div className={`flex items-center gap-1 text-sm font-semibold ${lang.textColor}`}>
                Browse tutors <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
