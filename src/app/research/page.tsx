import Link from 'next/link'
import { Microscope, FileText, Trophy, Globe, CheckCircle2, ArrowRight } from 'lucide-react'

const tracks = [
  {
    icon: FileText,
    title: 'Research Writing Fundamentals',
    description: 'Learn how to formulate research questions, structure papers, cite sources (APA/MLA), and present findings professionally.',
    level: 'Beginner',
    duration: '6 weeks',
    color: 'bg-blue-50 text-blue-800',
  },
  {
    icon: Microscope,
    title: 'Science & STEM Research',
    description: 'Conduct lab-based and data-driven research. Perfect for secondary school students entering science competitions.',
    level: 'Intermediate',
    duration: '8 weeks',
    color: 'bg-green-50 text-green-800',
  },
  {
    icon: Globe,
    title: 'Social Science & Policy Research',
    description: 'Investigate Nigerian society, economics, and policy. Write papers that could influence real decisions.',
    level: 'Intermediate',
    duration: '8 weeks',
    color: 'bg-purple-50 text-purple-800',
  },
  {
    icon: Trophy,
    title: 'Scholars Challenge Track',
    description: 'Intensive mentorship to prepare and submit research for the AventoLinks Scholars Challenge and national/international competitions.',
    level: 'Advanced',
    duration: '12 weeks',
    color: 'bg-gold-500/10 text-gold-600',
  },
]

const outcomes = [
  'Publish a student research paper with professional formatting',
  'Enter national and international research competitions',
  'Build a strong portfolio for university applications',
  'Develop critical thinking and analytical writing skills',
  'Earn an AventoLinks Research Certificate',
  'Get connected to university professors as mentors',
]

export default function ResearchPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-teal-800 to-primary-900 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
          <Microscope className="w-12 h-12 mx-auto mb-4 text-gold-400" />
          <h1 className="text-4xl font-bold mb-3">Research & Innovation Program</h1>
          <p className="text-white/75 text-lg max-w-2xl mx-auto">
            AventoLinks is the only Nigerian tutoring platform that teaches secondary school students
            how to think, research, and publish like professionals. This is your unfair advantage.
          </p>
          <Link
            href="/register?program=research"
            className="inline-block mt-8 px-8 py-3.5 bg-gold-500 text-white font-bold rounded-full hover:bg-gold-600 transition-colors"
          >
            Join the Program
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

        {/* Tracks */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Choose Your Research Track</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {tracks.map(({ icon: Icon, title, description, level, duration, color }) => (
              <div key={title} className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-md transition-shadow">
                <div className={`w-10 h-10 rounded-xl ${color.split(' ')[0]} flex items-center justify-center mb-4`}>
                  <Icon className={`w-5 h-5 ${color.split(' ')[1]}`} />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-bold text-gray-900">{title}</h3>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed mb-4">{description}</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className={`px-2.5 py-1 rounded-full font-semibold ${color}`}>{level}</span>
                  <span className="text-gray-400">{duration}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Outcomes */}
        <div className="bg-primary-800 rounded-2xl p-8 text-white">
          <h2 className="text-2xl font-bold mb-6">What You&apos;ll Walk Away With</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {outcomes.map((outcome) => (
              <div key={outcome} className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-gold-400 flex-shrink-0 mt-0.5" />
                <span className="text-white/85 text-sm">{outcome}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 flex gap-4">
            <Link
              href="/register?program=research"
              className="px-6 py-3 bg-gold-500 text-white rounded-full font-semibold hover:bg-gold-600 transition-colors"
            >
              Enroll Now
            </Link>
            <Link
              href="/research/how-it-works"
              className="px-6 py-3 bg-white/10 border border-white/20 text-white rounded-full font-medium hover:bg-white/20 transition-colors flex items-center gap-2"
            >
              Learn More <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
