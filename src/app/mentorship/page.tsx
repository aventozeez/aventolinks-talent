import Link from 'next/link'
import { GraduationCap, FileEdit, Search, MessageSquare, CheckCircle2, MapPin } from 'lucide-react'

const services = [
  { icon: Search, title: 'University Selection', description: 'We help you shortlist the right universities based on your profile, budget, goals, and country preference.' },
  { icon: FileEdit, title: 'SOP & Essay Writing', description: 'Our mentors help you craft compelling Statements of Purpose that get you noticed by admissions committees.' },
  { icon: Search, title: 'Scholarship Search', description: 'Access our curated database of scholarships open to Nigerian students — fully funded and partial awards.' },
  { icon: MessageSquare, title: 'Interview Preparation', description: 'Practice mock visa and university interviews with mentors who have been through the process themselves.' },
]

const destinations = [
  { country: 'United Kingdom', flag: '🇬🇧', unis: 'UCL, Edinburgh, Exeter, Coventry', scholarships: 'Chevening, Commonwealth' },
  { country: 'United States', flag: '🇺🇸', unis: 'NYU, Howard, Clark Atlanta, UMass', scholarships: 'Fulbright, MasterCard Foundation' },
  { country: 'Canada', flag: '🇨🇦', unis: 'Toronto, Waterloo, York, Dalhousie', scholarships: 'Vanier, Trudeau' },
  { country: 'Germany', flag: '🇩🇪', unis: 'TU Berlin, Frankfurt, Heidelberg', scholarships: 'DAAD (full funding)' },
  { country: 'France', flag: '🇫🇷', unis: 'Paris-Saclay, Sorbonne, Sciences Po', scholarships: 'Eiffel, Campus France' },
  { country: 'Saudi Arabia / UAE', flag: '🇸🇦', unis: 'KFUPM, KAU, AUS, NYU Abu Dhabi', scholarships: 'King Abdullah, ADEK' },
]

export default function MentorshipPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-br from-yellow-700 to-primary-900 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
          <GraduationCap className="w-12 h-12 mx-auto mb-4 text-gold-300" />
          <h1 className="text-4xl font-bold mb-3">Study Abroad Mentorship</h1>
          <p className="text-white/75 text-lg max-w-2xl mx-auto">
            Thousands of Nigerian students miss out on international scholarships because of poor guidance.
            AventoLinks mentors have been there — and they&apos;ll walk you through every step.
          </p>
          <Link
            href="/register?program=mentorship"
            className="inline-block mt-8 px-8 py-3.5 bg-gold-500 text-white font-bold rounded-full hover:bg-gold-600 transition-colors"
          >
            Book a Mentor
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">

        {/* Services */}
        <h2 className="text-2xl font-bold text-gray-900 mb-8">What Our Mentors Help You With</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
          {services.map(({ icon: Icon, title, description }) => (
            <div key={title} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center mb-3">
                <Icon className="w-5 h-5 text-yellow-700" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>

        {/* Destinations */}
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Study Destinations We Cover</h2>
        <p className="text-gray-500 mb-8">Our mentors have personally navigated admissions in these countries.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {destinations.map((dest) => (
            <div key={dest.country} className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{dest.flag}</span>
                <h3 className="font-bold text-gray-900">{dest.country}</h3>
              </div>
              <div className="flex items-start gap-2 mb-2">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-600">{dest.unis}</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary-700 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-primary-700 font-medium">{dest.scholarships}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
