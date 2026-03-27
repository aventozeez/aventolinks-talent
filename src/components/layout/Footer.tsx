import Link from 'next/link'
import { BookOpen, Mail, Phone, MapPin, Facebook, Twitter, Instagram, Linkedin, Youtube } from 'lucide-react'

const footerLinks = {
  Platform: [
    { label: 'Find a Tutor', href: '/tutors' },
    { label: 'Become a Tutor', href: '/become-tutor' },
    { label: 'For Schools', href: '/schools' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'How It Works', href: '/how-it-works' },
  ],
  Subjects: [
    { label: 'WAEC / NECO / JAMB', href: '/subjects/exams' },
    { label: 'STEM & Sciences', href: '/subjects/stem' },
    { label: 'Coding & AI', href: '/subjects/digital' },
    { label: 'Business Studies', href: '/subjects/business' },
    { label: 'Research Program', href: '/research' },
  ],
  Languages: [
    { label: 'English Tutors', href: '/languages/english' },
    { label: 'French Tutors', href: '/languages/french' },
    { label: 'Arabic Tutors', href: '/languages/arabic' },
    { label: 'Spanish Tutors', href: '/languages/spanish' },
    { label: 'German Tutors', href: '/languages/german' },
  ],
  Company: [
    { label: 'About AventoLinks', href: '/about' },
    { label: 'Study Abroad Guidance', href: '/mentorship' },
    { label: 'Scholars Challenge', href: '/scholars-challenge' },
    { label: 'Blog', href: '/blog' },
    { label: 'Careers', href: '/careers' },
  ],
}

const socials = [
  { icon: Facebook, href: '#', label: 'Facebook' },
  { icon: Twitter, href: '#', label: 'Twitter/X' },
  { icon: Instagram, href: '#', label: 'Instagram' },
  { icon: Linkedin, href: '#', label: 'LinkedIn' },
  { icon: Youtube, href: '#', label: 'YouTube' },
]

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">

        {/* Top section */}
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-10 pb-12 border-b border-gray-700">

          {/* Brand */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-primary-700 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">
                Avento<span className="text-gold-500">Links</span>
              </span>
            </Link>
            <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
              Nigeria&apos;s #1 Intelligent Learning & Talent Platform. Connecting students with
              the best tutors, mentors, and opportunities — from Lagos to the world.
            </p>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-400">
                <MapPin className="w-4 h-4 text-primary-500 flex-shrink-0" />
                <span>Lagos, Nigeria</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Mail className="w-4 h-4 text-primary-500 flex-shrink-0" />
                <span>hello@aventolinks.com</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Phone className="w-4 h-4 text-primary-500 flex-shrink-0" />
                <span>+234 800 000 0000</span>
              </div>
            </div>

            {/* Socials */}
            <div className="flex items-center gap-3 pt-1">
              {socials.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-primary-800 flex items-center justify-center transition-colors"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title} className="space-y-3">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">{title}</h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} AventoLinks Ltd. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-gray-300 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-gray-300 transition-colors">Terms of Service</Link>
            <Link href="/cookies" className="hover:text-gray-300 transition-colors">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
