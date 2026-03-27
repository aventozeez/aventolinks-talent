import Link from 'next/link'
import { CheckCircle2, School, Laptop, Users, BarChart3 } from 'lucide-react'

const benefits = [
  'Install coding and digital learning platforms',
  'Train teachers with modern pedagogy tools',
  'Give students access to 500+ verified tutors',
  'Run WAEC/JAMB prep bootcamps on-site',
  'Track student progress with real-time dashboards',
  'Issue school-branded certificates and achievements',
]

const features = [
  { icon: Laptop, title: 'Software Installation', desc: 'We help schools install & configure e-learning tools' },
  { icon: Users, title: 'Teacher Training', desc: 'Structured professional development for educators' },
  { icon: BarChart3, title: 'Progress Analytics', desc: 'School-wide dashboards to track performance' },
  { icon: School, title: 'Branded Programs', desc: 'Custom bootcamps under your school\'s name' },
]

export default function ForSchools() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          {/* Left: content */}
          <div>
            <span className="text-sm font-semibold text-primary-700 uppercase tracking-wider">School Partnerships</span>
            <h2 className="mt-2 text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Bring AventoLinks Into Your School
            </h2>
            <p className="text-lg text-gray-500 mb-6">
              We don&apos;t just provide tutors — we partner with secondary schools to build a full
              digital learning infrastructure, from software setup to teacher training and student outcomes.
            </p>

            <ul className="space-y-3 mb-8">
              {benefits.map((b) => (
                <li key={b} className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary-700 flex-shrink-0" />
                  <span className="text-gray-700 text-sm">{b}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/schools"
                className="px-6 py-3 bg-primary-800 text-white rounded-full font-semibold hover:bg-primary-700 transition-colors text-center"
              >
                Partner With Us
              </Link>
              <Link
                href="/schools#case-studies"
                className="px-6 py-3 border border-gray-200 text-gray-700 rounded-full font-medium hover:border-primary-800 hover:text-primary-800 transition-colors text-center"
              >
                See Case Studies
              </Link>
            </div>
          </div>

          {/* Right: feature cards */}
          <div className="grid grid-cols-2 gap-4">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center mb-3">
                  <Icon className="w-5 h-5 text-primary-800" />
                </div>
                <h3 className="font-bold text-gray-900 text-sm mb-1">{title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}

            {/* Trust badge */}
            <div className="col-span-2 bg-primary-800 rounded-2xl p-5 text-white">
              <p className="text-2xl font-black mb-1">50+</p>
              <p className="text-sm font-semibold text-gold-400">Partner Schools Across Nigeria</p>
              <p className="text-xs text-white/70 mt-1">Lagos · Abuja · Kano · Enugu · Port Harcourt and more</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
