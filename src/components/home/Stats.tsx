'use client'

import { useEffect, useRef, useState } from 'react'

const stats = [
  { value: 10000, suffix: '+', label: 'Students Enrolled', description: 'Across Nigeria and the diaspora' },
  { value: 500, suffix: '+', label: 'Verified Tutors', description: 'Rigorously screened experts' },
  { value: 50, suffix: '+', label: 'Partner Schools', description: 'Secondary schools nationwide' },
  { value: 4.9, suffix: '/5', label: 'Average Rating', description: 'Student satisfaction score' },
]

function CountUp({ target, suffix, isFloat }: { target: number; suffix: string; isFloat?: boolean }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          const duration = 1800
          const steps = 60
          const increment = target / steps
          let current = 0
          const timer = setInterval(() => {
            current += increment
            if (current >= target) {
              setCount(target)
              clearInterval(timer)
            } else {
              setCount(isFloat ? Math.round(current * 10) / 10 : Math.floor(current))
            }
          }, duration / steps)
        }
      },
      { threshold: 0.3 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [target, isFloat])

  return (
    <span ref={ref}>
      {isFloat ? count.toFixed(1) : count.toLocaleString()}
      {suffix}
    </span>
  )
}

export default function Stats() {
  return (
    <section className="py-16 bg-primary-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-4xl sm:text-5xl font-black text-white mb-1">
                <CountUp
                  target={stat.value}
                  suffix={stat.suffix}
                  isFloat={stat.value === 4.9}
                />
              </div>
              <div className="text-base font-semibold text-gold-400 mb-1">{stat.label}</div>
              <div className="text-sm text-white/60">{stat.description}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
