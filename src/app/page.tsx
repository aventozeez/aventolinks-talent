import Hero from '@/components/home/Hero'
import HowItWorks from '@/components/home/HowItWorks'
import SubjectCategories from '@/components/home/SubjectCategories'
import Stats from '@/components/home/Stats'
import FeaturedTutors from '@/components/home/FeaturedTutors'
import ForSchools from '@/components/home/ForSchools'
import Testimonials from '@/components/home/Testimonials'
import CTASection from '@/components/home/CTASection'

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <SubjectCategories />
      <Stats />
      <FeaturedTutors />
      <ForSchools />
      <Testimonials />
      <CTASection />
    </>
  )
}
