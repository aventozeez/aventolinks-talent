import { UserPlus, Search, Video, Award } from 'lucide-react'

const steps = [
  {
    icon: UserPlus,
    step: '01',
    title: 'Create Your Free Account',
    description:
      'Sign up as a student or tutor in under 2 minutes. Tell us your subjects, goals, and learning style so we can find your perfect match.',
    color: 'bg-primary-50 text-primary-800',
    iconBg: 'bg-primary-100',
  },
  {
    icon: Search,
    step: '02',
    title: 'Find Your Perfect Tutor',
    description:
      'Browse verified Nigerian tutors by subject, rating, price, and availability. Filter by exam prep, language level, or school partnership.',
    color: 'bg-gold-500/10 text-gold-600',
    iconBg: 'bg-gold-100',
  },
  {
    icon: Video,
    step: '03',
    title: 'Book & Learn Live',
    description:
      'Schedule a trial session, then book 1-on-1 or group classes. Learn via live video, chat, or recorded sessions — on any device.',
    color: 'bg-blue-50 text-blue-800',
    iconBg: 'bg-blue-100',
  },
  {
    icon: Award,
    step: '04',
    title: 'Track Progress & Get Certified',
    description:
      'Monitor your learning milestones, earn certificates, enter the AventoLinks Scholars Challenge, and unlock study abroad opportunities.',
    color: 'bg-purple-50 text-purple-800',
    iconBg: 'bg-purple-100',
  },
]

export default function HowItWorks() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-sm font-semibold text-primary-700 uppercase tracking-wider">How It Works</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold text-gray-900">
            Your Learning Journey Starts Here
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            From finding a tutor to landing that scholarship — we&apos;ve mapped every step for you.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <div key={step.step} className="relative">
                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-10 left-full w-full h-0.5 bg-gray-100 z-0 -translate-y-1/2" style={{ width: 'calc(100% - 40px)', left: '70%' }} />
                )}

                <div className="relative bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow z-10">
                  <div className={`w-12 h-12 rounded-xl ${step.iconBg} flex items-center justify-center mb-4`}>
                    <Icon className="w-6 h-6 text-primary-800" />
                  </div>
                  <div className="text-4xl font-black text-gray-100 mb-2 select-none">{step.step}</div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
