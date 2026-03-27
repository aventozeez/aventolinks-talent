'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X, ChevronDown, BookOpen } from 'lucide-react'

const navLinks = [
  {
    label: 'Find Tutors',
    href: '/tutors',
  },
  {
    label: 'Subjects',
    href: '/subjects',
    dropdown: [
      { label: 'WAEC / NECO / JAMB', href: '/subjects/exams' },
      { label: 'STEM & Sciences', href: '/subjects/stem' },
      { label: 'Business & Economics', href: '/subjects/business' },
      { label: 'Digital Skills', href: '/subjects/digital' },
    ],
  },
  {
    label: 'Languages',
    href: '/languages',
    dropdown: [
      { label: 'English', href: '/languages/english' },
      { label: 'French', href: '/languages/french' },
      { label: 'Arabic', href: '/languages/arabic' },
      { label: 'Spanish', href: '/languages/spanish' },
      { label: 'German', href: '/languages/german' },
    ],
  },
  { label: 'Research Program', href: '/research' },
  { label: 'Study Abroad', href: '/mentorship' },
  { label: 'For Schools', href: '/schools' },
]

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-800 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-primary-800">
              Avento<span className="text-gold-500">Links</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <div
                key={link.label}
                className="relative"
                onMouseEnter={() => link.dropdown && setActiveDropdown(link.label)}
                onMouseLeave={() => setActiveDropdown(null)}
              >
                <Link
                  href={link.href}
                  className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary-800 rounded-md hover:bg-primary-50 transition-colors"
                >
                  {link.label}
                  {link.dropdown && <ChevronDown className="w-3.5 h-3.5" />}
                </Link>

                {link.dropdown && activeDropdown === link.label && (
                  <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-50">
                    {link.dropdown.map((item) => (
                      <Link
                        key={item.label}
                        href={item.href}
                        className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-800 transition-colors"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Auth Buttons */}
          <div className="hidden lg:flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-primary-800 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="px-5 py-2 text-sm font-semibold text-white bg-primary-800 rounded-full hover:bg-primary-700 transition-colors"
            >
              Get started
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 rounded-md text-gray-600 hover:text-primary-800"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="lg:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-1">
          {navLinks.map((link) => (
            <div key={link.label}>
              <Link
                href={link.href}
                className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:text-primary-800 hover:bg-primary-50 rounded-md"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
              {link.dropdown && (
                <div className="ml-4 border-l-2 border-primary-100 pl-3 mt-1 space-y-1">
                  {link.dropdown.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="block py-1.5 text-sm text-gray-600 hover:text-primary-800"
                      onClick={() => setMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
            <Link href="/login" className="w-full text-center py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-full">
              Log in
            </Link>
            <Link href="/register" className="w-full text-center py-2.5 text-sm font-semibold text-white bg-primary-800 rounded-full">
              Get started free
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
