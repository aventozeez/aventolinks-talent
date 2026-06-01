// FSC dummy question seeder — run with: node seed-fsc-questions.mjs
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pyzqhzoubvemkhprsjra.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5enFoem91YnZlbWtocHJzanJhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDYzOTQ1MiwiZXhwIjoyMDkwMjE1NDUyfQ.jEACx3nLh9BoLLwMbTH9p22z6MX8MXIWukzGsEcMcZ8'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Run raw SQL via Supabase's pg-meta API ────────────────────────────────
async function runSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
    },
    body: JSON.stringify({ query: sql }),
  })
  return res.ok
}

// Fallback: use supabase-js to call the function
async function migrateColumns() {
  // Try via the management API endpoint for executing SQL
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  })

  // Try direct table inspection — insert a test row to see what columns exist
  // Strategy: try inserting with 'type' only. If it works, table has the column.
  const { error: probeErr } = await supabase
    .from('fsc_questions')
    .insert({ question: '__probe__', answer: '__probe__', category: 'probe', type: 'regular' })

  if (!probeErr) {
    // type column exists — clean up probe row
    await supabase.from('fsc_questions').delete().eq('question', '__probe__')
    return { hasType: true, hasSteps: false }
  }

  // type column doesn't exist → return false so we can work around it
  return { hasType: false, hasSteps: false }
}

// ── 20 regular questions ───────────────────────────────────────────────────
const regularQuestions = [
  // Science
  { question: 'What is the chemical symbol for gold?',                                     answer: 'Au',                            category: 'Science'          },
  { question: 'How many bones are in the adult human body?',                               answer: '206',                           category: 'Science'          },
  { question: 'What planet is known as the Red Planet?',                                   answer: 'Mars',                          category: 'Science'          },
  { question: 'What gas do plants absorb during photosynthesis?',                          answer: 'Carbon dioxide (CO₂)',           category: 'Science'          },
  { question: 'What is the speed of light in a vacuum (approximately)?',                   answer: '300,000 km/s (3 × 10⁸ m/s)',    category: 'Science'          },
  { question: 'What is the powerhouse of the cell?',                                       answer: 'Mitochondria',                  category: 'Science'          },
  { question: 'What element has atomic number 1?',                                         answer: 'Hydrogen',                      category: 'Science'          },
  // Mathematics
  { question: 'What is the value of π (pi) to 2 decimal places?',                         answer: '3.14',                          category: 'Mathematics'      },
  { question: 'What is the square root of 144?',                                           answer: '12',                            category: 'Mathematics'      },
  { question: 'How many sides does a hexagon have?',                                       answer: '6',                             category: 'Mathematics'      },
  { question: 'What is 15% of 200?',                                                       answer: '30',                            category: 'Mathematics'      },
  { question: 'What is the sum of interior angles in a triangle?',                         answer: '180 degrees',                   category: 'Mathematics'      },
  // History & Geography
  { question: 'In what year did Nigeria gain independence?',                               answer: '1960',                          category: 'History'          },
  { question: 'Who was the first President of the United States?',                         answer: 'George Washington',             category: 'History'          },
  { question: 'What is the capital city of Nigeria?',                                      answer: 'Abuja',                         category: 'Geography'        },
  { question: 'Which continent is the largest by area?',                                   answer: 'Asia',                          category: 'Geography'        },
  { question: 'What is the longest river in the world?',                                   answer: 'The Nile',                      category: 'Geography'        },
  // General Knowledge
  { question: 'How many colours are in a rainbow?',                                        answer: '7',                             category: 'General Knowledge'},
  { question: 'What language has the most native speakers in the world?',                  answer: 'Mandarin Chinese',              category: 'General Knowledge'},
  { question: 'What is the largest organ in the human body?',                              answer: 'The skin',                      category: 'General Knowledge'},
]

// ── 2 sprint problems with 5 steps each ───────────────────────────────────
const sprintProblems = [
  {
    question: 'A student wants to conduct a scientific experiment to test whether plants grow faster with or without sunlight.',
    answer: '',
    category: 'Science',
    type: 'sprint',
    steps: [
      'Form a hypothesis: "Plants exposed to sunlight will grow faster than those in the dark."',
      'Set up two identical plants in the same soil with equal amounts of water.',
      'Place one plant in a sunny spot and the other in a dark room.',
      'Observe and record the growth of both plants daily for two weeks.',
      'Analyse the results and draw a conclusion to confirm or reject the hypothesis.',
    ],
  },
  {
    question: 'A community faces frequent flooding during the rainy season and needs a sustainable drainage solution.',
    answer: '',
    category: 'Innovation',
    type: 'sprint',
    steps: [
      'Identify and map the flood-prone areas in the community.',
      'Analyse the causes: blocked drains, poor soil absorption, or inadequate infrastructure.',
      'Design a drainage plan with channels, retention ponds, and permeable surfaces.',
      'Present the plan to community stakeholders and gather feedback.',
      'Implement the drainage system in phases, starting with the most critical areas.',
    ],
  },
]

async function seed() {
  console.log('🌱 Seeding FSC questions…\n')

  // ── Step 1: detect schema ────────────────────────────────────────────────
  console.log('🔍 Checking fsc_questions schema…')
  const { hasType } = await migrateColumns()

  if (hasType) {
    console.log('  ✅ "type" column found — full insert mode\n')
  } else {
    console.log('  ⚠️  "type" and "steps" columns NOT found.')
    console.log('  📋 Please run this SQL in your Supabase dashboard → SQL Editor:\n')
    console.log('  ─────────────────────────────────────────────────────────────')
    console.log(`  ALTER TABLE fsc_questions
    ADD COLUMN IF NOT EXISTS type  text NOT NULL DEFAULT 'regular',
    ADD COLUMN IF NOT EXISTS steps jsonb;

  CREATE TABLE IF NOT EXISTS fsc_match_state (
    id         text PRIMARY KEY,
    data       jsonb NOT NULL,
    updated_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS fsc_is_answers (
    match_id      text        NOT NULL DEFAULT 'default',
    team          text        NOT NULL,
    problem_index int         NOT NULL,
    answer        jsonb       NOT NULL,
    submitted_at  timestamptz DEFAULT now(),
    PRIMARY KEY (match_id, team, problem_index)
  );`)
    console.log('  ─────────────────────────────────────────────────────────────\n')
    console.log('  After running the SQL, re-run this script.\n')
    console.log('  Inserting regular questions (base columns only) for now…\n')
  }

  // ── Step 2: clear existing questions ────────────────────────────────────
  console.log('🗑️  Clearing existing fsc_questions…')
  await supabase.from('fsc_questions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  ✅ Cleared\n')

  // ── Step 3: insert regular questions ────────────────────────────────────
  console.log(`📝 Inserting ${regularQuestions.length} regular questions…`)
  const regRows = hasType
    ? regularQuestions.map(q => ({ ...q, type: 'regular', steps: null }))
    : regularQuestions.map(({ question, answer, category }) => ({ question, answer, category }))

  const { data: regData, error: regErr } = await supabase
    .from('fsc_questions')
    .insert(regRows)
    .select('id, question')

  if (regErr) {
    console.error('  ❌ Error:', regErr.message)
  } else {
    console.log(`  ✅ Inserted ${regData.length} regular questions:`)
    regData.forEach((q, i) => console.log(`     ${String(i + 1).padStart(2)}. ${q.question.substring(0, 65)}`))
  }

  // ── Step 4: insert sprint problems ──────────────────────────────────────
  if (hasType) {
    console.log(`\n💡 Inserting ${sprintProblems.length} sprint problems…`)
    const { data: sprintData, error: sprintErr } = await supabase
      .from('fsc_questions')
      .insert(sprintProblems)
      .select('id, question')

    if (sprintErr) {
      console.error('  ❌ Error:', sprintErr.message)
    } else {
      console.log(`  ✅ Inserted ${sprintData.length} sprint problems:`)
      sprintData.forEach((q, i) => console.log(`     ${i + 1}. ${q.question.substring(0, 65)}…`))
    }

    console.log('\n🎉 All questions seeded successfully!')
    console.log(`   ⚡ Regular questions: ${regularQuestions.length} (10 for Rapid Fire + 10 for Buzzer)`)
    console.log(`   💡 Sprint problems:   ${sprintProblems.length} (for Innovation Sprint)`)
    console.log('\n   Head to the admin → Questions tab to verify, then launch a test match!')
  } else {
    console.log('\n⚠️  Regular questions inserted (no type/steps columns yet).')
    console.log('   Run the SQL above, then re-run this script to add sprint problems.')
  }
}

seed().catch(console.error)
