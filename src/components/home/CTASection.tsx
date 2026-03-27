import Link from 'next/link'

export default function CTASection() {
  return (
    <section className="py-20 bg-gradient-to-br from-primary-900 to-primary-700 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gold-500 rounded-full opacity-10 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary-500 rounded-full opacity-20 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Card: For Students */}
          <div className="bg-white/10 border border-white/20 backdrop-blur-sm rounded-2xl p-8 text-white">
            <span className="inline-block px-3 py-1 rounded-full bg-gold-500 text-white text-xs font-bold mb-4">FOR STUDENTS</span>
            <h3 className="text-2xl font-bold mb-3">Start Learning Today</h3>
            <p className="text-white/75 text-sm mb-6 leading-relaxed">
              Find your perfect tutor in under 3 minutes. First trial session is free.
              Whether it&apos;s JAMB prep, a new language, or coding — we have the right expert for you.
            </p>
            <Link
              href="/register?role=student"
              className="inline-block px-7 py-3 bg-white text-primary-800 rounded-full font-bold hover:bg-gray-100 transition-colors"
            >
              Find a Tutor — It&apos;s Free
            </Link>
          </div>

          {/* Card: For Tutors */}
          <div className="bg-white/10 border border-white/20 backdrop-blur-sm rounded-2xl p-8 text-white">
            <span className="inline-block px-3 py-1 rounded-full bg-primary-600 text-white text-xs font-bold mb-4">FOR TUTORS</span>
            <h3 className="text-2xl font-bold mb-3">Earn Teaching What You Love</h3>
            <p className="text-white/75 text-sm mb-6 leading-relaxed">
              Join 500+ tutors already earning on AventoLinks. Set your own rate, schedule,
              and teach from anywhere. We handle payments securely via Paystack.
            </p>
            <Link
              href="/register?role=tutor"
              className="inline-block px-7 py-3 bg-gold-500 text-white rounded-full font-bold hover:bg-gold-600 transition-colors"
            >
              Become a Tutor
            </Link>
          </div>
        </div>

        <p className="text-center text-white/50 text-sm mt-8">
          No subscription required to browse. Pay only for sessions you book.
          Secure payments via Paystack — Naira, cards, bank transfer, USSD.
        </p>
      </div>
    </section>
  )
}
