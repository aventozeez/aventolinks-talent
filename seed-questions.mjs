import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://pyzqhzoubvemkhprsjra.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5enFoem91YnZlbWtocHJzanJhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDYzOTQ1MiwiZXhwIjoyMDkwMjE1NDUyfQ.jEACx3nLh9BoLLwMbTH9p22z6MX8MXIWukzGsEcMcZ8'
)

const questions = [
  { question: 'What is the capital of Nigeria?', answer: 'Abuja', category: 'Geography', type: 'regular' },
  { question: 'What is 15 multiplied by 8?', answer: '120', category: 'Mathematics', type: 'regular' },
  { question: 'What gas do plants absorb during photosynthesis?', answer: 'Carbon dioxide', category: 'Science', type: 'regular' },
  { question: 'Who wrote Romeo and Juliet?', answer: 'William Shakespeare', category: 'Literature', type: 'regular' },
  { question: 'What is the chemical symbol for gold?', answer: 'Au', category: 'Chemistry', type: 'regular' },
  { question: 'How many sides does a hexagon have?', answer: 'Six', category: 'Mathematics', type: 'regular' },
  { question: 'What is the largest planet in our solar system?', answer: 'Jupiter', category: 'Science', type: 'regular' },
  { question: 'In what year did Nigeria gain independence?', answer: '1960', category: 'History', type: 'regular' },
  { question: 'What is the speed of light in a vacuum?', answer: '300,000 km per second', category: 'Physics', type: 'regular' },
  { question: 'What organ pumps blood around the human body?', answer: 'The heart', category: 'Biology', type: 'regular' },
  { question: 'What is the square root of 144?', answer: '12', category: 'Mathematics', type: 'regular' },
  { question: 'Which planet is known as the Red Planet?', answer: 'Mars', category: 'Science', type: 'regular' },
  { question: 'What is the longest river in Africa?', answer: 'The Nile', category: 'Geography', type: 'regular' },
  { question: 'What does DNA stand for?', answer: 'Deoxyribonucleic acid', category: 'Biology', type: 'regular' },
  { question: 'What is the powerhouse of the cell?', answer: 'The mitochondria', category: 'Biology', type: 'regular' },
  { question: 'How many bones are in the adult human body?', answer: '206', category: 'Biology', type: 'regular' },
  { question: 'What is the chemical formula for water?', answer: 'H2O', category: 'Chemistry', type: 'regular' },
  { question: 'Who is known as the father of computers?', answer: 'Charles Babbage', category: 'Technology', type: 'regular' },
  { question: 'What is the smallest prime number?', answer: '2', category: 'Mathematics', type: 'regular' },
  { question: 'What force keeps planets in orbit around the sun?', answer: 'Gravity', category: 'Physics', type: 'regular' },
  { question: 'What is the capital of France?', answer: 'Paris', category: 'Geography', type: 'regular' },
  { question: 'What is the hardest natural substance on Earth?', answer: 'Diamond', category: 'Science', type: 'regular' },
  { question: 'How many degrees are in a right angle?', answer: '90', category: 'Mathematics', type: 'regular' },
  { question: 'What is the name of the process by which water turns into vapour?', answer: 'Evaporation', category: 'Science', type: 'regular' },
  { question: 'Who painted the Mona Lisa?', answer: 'Leonardo da Vinci', category: 'Arts', type: 'regular' },
  { question: 'What is the atomic number of carbon?', answer: '6', category: 'Chemistry', type: 'regular' },
  { question: 'What type of energy does the sun produce?', answer: 'Solar energy', category: 'Physics', type: 'regular' },
  { question: 'What is the currency of the United Kingdom?', answer: 'Pound sterling', category: 'Economics', type: 'regular' },
  { question: 'What is the freezing point of water in Celsius?', answer: '0 degrees Celsius', category: 'Science', type: 'regular' },
  { question: 'How many continents are there on Earth?', answer: 'Seven', category: 'Geography', type: 'regular' },
]

console.log(`Inserting ${questions.length} demo questions...`)
const { data, error } = await sb.from('fsc_questions').insert(questions).select()
if (error) {
  console.error('Failed:', error.message)
} else {
  console.log(`✅ Successfully inserted ${data.length} questions!`)
}
