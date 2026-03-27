import Image from 'next/image'
import { Star, Quote } from 'lucide-react'

const testimonials = [
  {
    name: 'Tobiloba Adeyemi',
    role: 'SS3 Student, Lagos',
    image: 'https://randomuser.me/api/portraits/women/31.jpg',
    rating: 5,
    quote:
      "I scored A1 in WAEC Chemistry after just 6 weeks with my AventoLinks tutor. The platform matched me perfectly — she even knew my school's syllabus. 100% recommend!",
  },
  {
    name: 'Abdullahi Bello',
    role: 'University Freshman, Kano',
    image: 'https://randomuser.me/api/portraits/men/28.jpg',
    rating: 5,
    quote:
      "I went from near-zero French to conversational in 3 months. My tutor was so patient and structured. I'm now applying for a French government scholarship — thank you AventoLinks!",
  },
  {
    name: 'Mrs. Chioma Obi',
    role: 'Vice Principal, Enugu',
    image: 'https://randomuser.me/api/portraits/women/56.jpg',
    rating: 5,
    quote:
      "AventoLinks partnered with our school to install coding software and train our students. The impact was immediate — three of our students won the AventoLinks Scholars Challenge this year.",
  },
  {
    name: 'Suleiman Garba',
    role: 'JAMB Candidate, Abuja',
    image: 'https://randomuser.me/api/portraits/men/47.jpg',
    rating: 5,
    quote:
      "Booked a JAMB prep tutor and my score jumped from 198 to 278 in 2 months. The tutors here are actually brilliant, not just reading from textbooks. Worth every naira.",
  },
  {
    name: 'Adaeze Nkemdirim',
    role: 'Undergraduate, UK (via AventoLinks)',
    image: 'https://randomuser.me/api/portraits/women/72.jpg',
    rating: 5,
    quote:
      "The study abroad mentorship was life-changing. My mentor helped me write my SOP, find scholarships, and prepare for my visa interview. I'm now studying in Edinburgh!",
  },
  {
    name: 'Rilwan Fashola',
    role: 'Python Developer (self-taught via AventoLinks)',
    image: 'https://randomuser.me/api/portraits/men/61.jpg',
    rating: 5,
    quote:
      "Started as a complete beginner. My coding tutor took me from 'what is a variable' to building my first full-stack project in 5 months. Now I'm freelancing full-time.",
  },
]

export default function Testimonials() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-sm font-semibold text-primary-700 uppercase tracking-wider">Testimonials</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold text-gray-900">
            Real Students. Real Results.
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            Over 10,000 Nigerians have transformed their academic and professional lives on AventoLinks.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative"
            >
              <Quote className="absolute top-5 right-5 w-8 h-8 text-primary-100" />

              {/* Stars */}
              <div className="flex items-center gap-0.5 mb-4">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-gold-500 fill-gold-500" />
                ))}
              </div>

              <p className="text-gray-700 text-sm leading-relaxed mb-6">&quot;{t.quote}&quot;</p>

              <div className="flex items-center gap-3">
                <Image
                  src={t.image}
                  alt={t.name}
                  width={44}
                  height={44}
                  className="w-11 h-11 rounded-full object-cover"
                />
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
