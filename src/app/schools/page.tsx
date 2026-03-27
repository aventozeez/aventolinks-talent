import Link from 'next/link'
import { School, Laptop, Users, BarChart3, CheckCircle2, Mail } from 'lucide-react'

const packages = [
  {
    name: 'Starter',
    price: '₦150,000/term',
    color: 'border-gray-200',
    headerBg: 'bg-gray-50',
    features: [
      'Access for up to 100 students',
      'Basic tutor matching portal',
      'Monthly progress reports',
      '2 teacher training sessions',
      'Email support',
    ],
    cta: 'Get Started',
    ctaStyle: 'border border-primary-800 text-primary-800 hover:bg-primary-800 hover:text-white',
  },
  {
    name: 'Standard',
    price: '₦350,000/term',
    color: 'border-primary-800',
    headerBg: 'bg-primary-800',
    badge: 'Most Popular',
    features: [
      'Access for up to 300 students',
      'Full platform access + software setup',
      'Weekly + monthly analytics',
      '6 teacher training sessions',
      'WAEC/JAMB bootcamp module',
      'Dedicated account manager',
      'WhatsApp priority support',
    ],
    cta: 'Partner Now',
    ctaStyle: 'bg-primary-800 text-white hover:bg-primary-700',
  },
  {
    name: 'Enterprise',
    price: 'Custom Pricing',
    color: 'border-gray-200',
    headerBg: 'bg-gray-900',
    features: [
      'Unlimited students',
      'Full white-label platform',
      'Custom curriculum integration',
      'On-site visits & installations',
      'Teacher certification program',
      'Ministry of Education reporting',
      'Dedicated 24/7 support team',
    ],
    cta: 'Contact Us',
    ctaStyle: 'bg-gray-900 text-white hover:bg-gray-800',
  },
]

const benefits = [
  { icon: Laptop, title: 'Software Installation', desc: 'We physically visit to set up coding platforms, e-learning tools, and digital labs.' },
  { icon: Users, title: 'Teacher Training', desc: 'Structured professional development sessions — in-person or virtual.' },
  { icon: BarChart3, title: 'School Dashboard', desc: 'Track every student\'s progress, attendance, and results in one place.' },
  { icon: School, title: 'Branded Programs', desc: 'Run AventoLinks bootcamps under your school\'s name and branding.' },
]

export default function SchoolsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-br from-gray-900 to-primary-900 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
          <School className="w-12 h-12 mx-auto mb-4 text-gold-400" />
          <h1 className="text-4xl font-bold mb-3">AventoLinks for Schools</h1>
          <p className="text-white/75 text-lg max-w-2xl mx-auto">
            We don&apos;t just sell access — we become your school&apos;s education technology partner.
            From software to teacher training to student outcomes.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">

        {/* Benefits */}
        <h2 className="text-2xl font-bold text-gray-900 mb-8">What You Get as a Partner School</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
          {benefits.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center mb-3">
                <Icon className="w-5 h-5 text-primary-800" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
              <p className="text-sm text-gray-500">{desc}</p>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Partnership Packages</h2>
        <p className="text-gray-500 mb-8">Flexible plans for secondary schools of all sizes.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {packages.map((pkg) => (
            <div key={pkg.name} className={`bg-white rounded-2xl border-2 ${pkg.color} overflow-hidden`}>
              <div className={`${pkg.headerBg} p-5 relative`}>
                {pkg.badge && (
                  <span className="absolute top-3 right-3 text-xs font-bold px-2.5 py-1 bg-gold-500 text-white rounded-full">
                    {pkg.badge}
                  </span>
                )}
                <h3 className={`text-xl font-bold mb-1 ${pkg.headerBg === 'bg-primary-800' || pkg.headerBg === 'bg-gray-900' ? 'text-white' : 'text-gray-900'}`}>
                  {pkg.name}
                </h3>
                <p className={`text-2xl font-black ${pkg.headerBg === 'bg-primary-800' || pkg.headerBg === 'bg-gray-900' ? 'text-gold-400' : 'text-primary-800'}`}>
                  {pkg.price}
                </p>
              </div>
              <div className="p-5 space-y-3">
                {pkg.features.map((f) => (
                  <div key={f} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary-700 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{f}</span>
                  </div>
                ))}
                <Link
                  href="/schools/contact"
                  className={`mt-4 block w-full text-center py-2.5 rounded-full font-semibold transition-colors ${pkg.ctaStyle}`}
                >
                  {pkg.cta}
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="bg-primary-800 rounded-2xl p-8 text-white text-center">
          <Mail className="w-10 h-10 mx-auto mb-3 text-gold-400" />
          <h3 className="text-2xl font-bold mb-2">Ready to Transform Your School?</h3>
          <p className="text-white/70 mb-6 max-w-lg mx-auto">
            Our school partnership team will reach out within 24 hours to discuss your specific needs,
            arrange a demo, and create a custom proposal.
          </p>
          <Link
            href="mailto:schools@aventolinks.com"
            className="inline-block px-8 py-3 bg-gold-500 text-white rounded-full font-bold hover:bg-gold-600 transition-colors"
          >
            Email schools@aventolinks.com
          </Link>
        </div>
      </div>
    </div>
  )
}
