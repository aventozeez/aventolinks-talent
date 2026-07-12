'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { wsSubscribe, wsBroadcast } from '@/lib/ws-sync'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { uuid } from '@/lib/uuid'

const CHANNEL = 'tie:state'
const ROUND_MS = 30_000                // 30 seconds per team
const DEFAULT_POOL_SIZE = 30           // 30 questions per pool (min for a valid pool)
const PTS_CORRECT = 1
// Saved tie-breaker matches — Supabase row id.
const TB_MATCHES_ROW_ID = 'tie_saved_matches'

type SavedTBMatch = {
  id: string
  teamA: string
  teamB: string
  teamC?: string
  poolAId: string
  poolBId: string
  poolCId?: string
  poolATitle: string
  poolBTitle: string
  poolCTitle?: string
  scoreA: number
  scoreB: number
  scoreC?: number
  correctA: number
  correctB: number
  correctC?: number
  winner: string   // team name, "Tie", or comma-separated names for multi-way tie
  played_at: string
}

async function getSavedTBMatches(): Promise<SavedTBMatch[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('fsc_match_state').select('data').eq('id', TB_MATCHES_ROW_ID).maybeSingle()
    return (data?.data?.matches as SavedTBMatch[]) ?? []
  } catch { return [] }
}
async function saveTBMatchesList(matches: SavedTBMatch[]): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('fsc_match_state')
      .upsert({ id: TB_MATCHES_ROW_ID, data: { matches }, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  } catch { /* offline — matches only persist in-memory this session */ }
}

type RegisteredTeam = { id: string; name: string; school: string }

type TBQuestion = { id: string; text: string; answer: string }
type TBPool = { id: string; title: string; questions: TBQuestion[] }

type TBPhase =
  | 'setup'
  | 'intro'
  | 'announce_a'
  | 'a_playing'
  | 'score_a'
  | 'announce_b'
  | 'b_playing'
  | 'score_b'
  | 'announce_c'
  | 'c_playing'
  | 'score_c'
  | 'compare'

type TBState = {
  phase: TBPhase
  // 3-team mode (used for a 3-way MC tie). Optional to keep older payloads
  // backward-compatible — everything defaults to the classic A-vs-B flow.
  threeTeam?: boolean
  teamA: string
  teamB: string
  teamC?: string
  priorA: number
  priorB: number
  priorC?: number
  pools: TBPool[]                // multiple pools; the host picks a DIFFERENT one per team
  chosenPoolA: string | null     // pool team A played (locked when their round starts)
  chosenPoolB: string | null     // pool team B played (locked when their round starts)
  chosenPoolC?: string | null
  queueA: TBQuestion[]
  queueB: TBQuestion[]
  queueC?: TBQuestion[]
  scoreA: number
  scoreB: number
  scoreC?: number
  correctA: number
  correctB: number
  correctC?: number
  timerStart: number | null
  currentQ: TBQuestion | null
  showAnswer: boolean
}

// ── Default pools ─────────────────────────────────────────────────────────
// 25 themed pools of 30 questions each. Pulled from fsc_questions during
// build; safe to ship offline. Admin can edit any of them before use.

const POOL_1: Omit<TBQuestion, 'id'>[] = [
  { text: "A bag has 3 red and 5 blue balls. What is the probability of picking red?", answer: "3/8" },
  { text: "If x/3 = 14, what is x?", answer: "42" },
  { text: "The sum of three consecutive odd numbers is 87. What is the largest number?", answer: "31" },
  { text: "What does Blockchain mainly record?", answer: "Transactions" },
  { text: "What does QR in QR code stand for?", answer: "Quick Response" },
  { text: "What is encryption used for?", answer: "Securing information" },
  { text: "What is the name for animals active at night?", answer: "Nocturnal" },
  { text: "What is the next number: 5, 10, 20, 40, ___?", answer: "80" },
  { text: "What is the study of volcanoes called?", answer: "Volcanology" },
  { text: "Which African country contains Mount Elgon?", answer: "Uganda and Kenya" },
  { text: "Which African country has the city of Aswan and the High Dam?", answer: "Egypt" },
  { text: "Which African country has the city of Monrovia as its capital?", answer: "Liberia" },
  { text: "Which African country has the Virunga Mountains?", answer: "Rwanda, Uganda, and DR Congo" },
  { text: "Which African country was ruled by Emperor Haile Selassie?", answer: "Ethiopia" },
  { text: "Which company developed the Android operating system before it was acquired by Google?", answer: "Android Inc." },
  { text: "Which country has the capital Oslo?", answer: "Norway" },
  { text: "Which country has the city of Prague?", answer: "Czech Republic" },
  { text: "Which country hosted the 2014 FIFA World Cup?", answer: "Brazil" },
  { text: "Which country is home to Mount Fuji?", answer: "Japan" },
  { text: "Which country is known as the Land of the Midnight Sun?", answer: "Norway" },
  { text: "Which country won the first AFCON title?", answer: "Egypt" },
  { text: "Which football club is nicknamed The Red Devils?", answer: "Manchester United" },
  { text: "Which mineral is essential for thyroid function?", answer: "Iodine" },
  { text: "Which Nigerian city was the capital before Abuja?", answer: "Lagos" },
  { text: "Which Nigerian state is known as the Gateway State?", answer: "Ogun State" },
  { text: "Which Nigerian woman became the first female vice-chancellor of a Nigerian university?", answer: "Grace Alele-Williams" },
  { text: "Which part of the digestive system absorbs most nutrients?", answer: "Small intestine" },
  { text: "Which planet is closest to the Sun?", answer: "Mercury" },
  { text: "Which scientist discovered the electron?", answer: "J.J. Thomson" },
  { text: "Which scientist proposed the atomic model with electrons orbiting the nucleus?", answer: "Niels Bohr" },
]

const POOL_2: Omit<TBQuestion, 'id'>[] = [
  { text: "A car travels 240 km in 4 hours. What is its average speed?", answer: "60 km/h" },
  { text: "If x² = 225, what is the positive value of x?", answer: "15" },
  { text: "The sum of two consecutive even numbers is 74. What is the larger number?", answer: "38" },
  { text: "What does CAPTCHA stand for?", answer: "Completely Automated Public Turing Test to Tell Computers and Humans Apart" },
  { text: "What does robotics mainly combine?", answer: "Engineering and computer science" },
  { text: "What is phishing in cybersecurity?", answer: "Fraudulent attempt to steal information" },
  { text: "What is the name for the study of weather?", answer: "Meteorology" },
  { text: "What is the official residence of Nigeria's President called?", answer: "Aso Villa" },
  { text: "What is the sum of interior angles in a triangle?", answer: "180 degrees" },
  { text: "Which African country contains Table Mountain?", answer: "South Africa" },
  { text: "Which African country has the city of Bamako as its capital?", answer: "Mali" },
  { text: "Which African country has the city of Moroni as its capital?", answer: "Comoros" },
  { text: "Which African country is bordered by both the Atlantic Ocean and the Mediterranean Sea?", answer: "Morocco" },
  { text: "Which African country won AFCON 2023, played in 2024?", answer: "Côte d'Ivoire" },
  { text: "Which continent is the largest by area?", answer: "Asia" },
  { text: "Which country has the capital Reykjavik?", answer: "Iceland" },
  { text: "Which country has the city of Rotterdam?", answer: "Netherlands" },
  { text: "Which country hosted the 2016 Olympic Games?", answer: "Brazil" },
  { text: "Which country is home to the Amazon River?", answer: "Brazil" },
  { text: "Which country is known as the Land of the Pure?", answer: "Pakistan" },
  { text: "Which country won the first AFCON tournament?", answer: "Egypt" },
  { text: "Which football club plays at Stamford Bridge?", answer: "Chelsea" },
  { text: "Which mineral is the main component of bones and teeth?", answer: "Calcium" },
  { text: "Which Nigerian city was the capital before Lagos became the capital?", answer: "Calabar" },
  { text: "Which Nigerian state is known as the Heartbeat of the Nation?", answer: "Edo State" },
  { text: "Which Nigerian woman led the 1929 Aba Women's Protest?", answer: "It was led collectively by Igbo women leaders" },
  { text: "Which part of the digestive system connects the mouth to the stomach?", answer: "Esophagus" },
  { text: "Which planet is famous for the Great Red Spot?", answer: "Jupiter" },
  { text: "Which scientist discovered the law of buoyancy while taking a bath?", answer: "Archimedes" },
  { text: "Which scientist proposed the heliocentric model?", answer: "Nicolaus Copernicus" },
]

const POOL_3: Omit<TBQuestion, 'id'>[] = [
  { text: "A clock shows 4:00. What is the angle between the hands?", answer: "120°" },
  { text: "In computing, what does 'LAN' stand for?", answer: "Local Area Network" },
  { text: "The sum of two numbers is 50 and their difference is 10. What is the larger number?", answer: "30" },
  { text: "What does CAPTCHA test for?", answer: "Whether the user is human" },
  { text: "What does ROM stand for?", answer: "Read Only Memory" },
  { text: "What is phishing?", answer: "Attempt to steal information through deception" },
  { text: "What is the name given to the first ten amendments of the U.S. Constitution?", answer: "Bill of Rights" },
  { text: "What is the official term for a country's written body of fundamental laws?", answer: "Constitution" },
  { text: "What is the term for a country governed by a monarch?", answer: "Monarchy" },
  { text: "Which African country contains the ancient city of Kairouan?", answer: "Tunisia" },
  { text: "Which African country has the city of Banjul as its capital?", answer: "Gambia" },
  { text: "Which African country has the city of Mwanza on Lake Victoria?", answer: "Tanzania" },
  { text: "Which African country is called the Giant of Africa?", answer: "Nigeria" },
  { text: "Which African empire was famous for the city of Timbuktu as a learning center?", answer: "Mali Empire" },
  { text: "Which country contains the autonomous region of Greenland?", answer: "Denmark" },
  { text: "Which country has the capital Sofia?", answer: "Bulgaria" },
  { text: "Which country has the city of Salzburg?", answer: "Austria" },
  { text: "Which country hosted the 2022 FIFA World Cup?", answer: "Qatar" },
  { text: "Which country is home to the ancient city of Carthage?", answer: "Tunisia" },
  { text: "Which country is known as the Land of the Rising Sun?", answer: "Japan" },
  { text: "Which country won the first Basketball World Cup in 1950?", answer: "Argentina" },
  { text: "Which footballer is nicknamed CR7?", answer: "Cristiano Ronaldo" },
  { text: "Which mountain range separates Europe from Asia?", answer: "Ural Mountains" },
  { text: "Which Nigerian civil war lasted from 1967 to 1970?", answer: "Nigerian Civil War or Biafran War" },
  { text: "Which Nigerian state is known as the Home of Harmony?", answer: "Kwara State" },
  { text: "Which Nigerian writer won the Booker Prize in 1991?", answer: "Ben Okri" },
  { text: "Which part of the digestive system produces bile?", answer: "Liver" },
  { text: "Which planet is farthest from the Sun?", answer: "Neptune" },
  { text: "Which scientist discovered the nucleus of the atom?", answer: "Ernest Rutherford" },
  { text: "Which scientist proposed the theory of evolution?", answer: "Charles Darwin" },
]

const POOL_4: Omit<TBQuestion, 'id'>[] = [
  { text: "A father is four times as old as his son. Their ages add up to 50. How old is the son?", answer: "10" },
  { text: "In computing, what does 'open source' mean?", answer: "Source code is publicly available" },
  { text: "Three consecutive integers add up to 99. What is the smallest?", answer: "32" },
  { text: "What does Cloud Computing allow users to access?", answer: "Computing resources over the internet" },
  { text: "What does SaaS stand for?", answer: "Software as a Service" },
  { text: "What is the basic unit of life?", answer: "Cell" },
  { text: "What is the name of molten rock beneath Earth's surface?", answer: "Magma" },
  { text: "What is the only continent crossed by both the Equator and the Tropic of Capricorn?", answer: "Africa" },
  { text: "What is the term for a country leaving an international organization?", answer: "Withdrawal" },
  { text: "Which African country contains the city of Alexandria?", answer: "Egypt" },
  { text: "Which African country has the city of Bissau as its capital?", answer: "Guinea-Bissau" },
  { text: "Which African country has the city of N'Djamena as its capital?", answer: "Chad" },
  { text: "Which African country is completely surrounded by South Africa?", answer: "Lesotho" },
  { text: "Which African footballer won the Ballon d'Or in 1995?", answer: "George Weah" },
  { text: "Which country contains the city of Mecca?", answer: "Saudi Arabia" },
  { text: "Which country has the capital Tallinn?", answer: "Estonia" },
  { text: "Which country has the city of Seoul?", answer: "South Korea" },
  { text: "Which country hosted the first African FIFA World Cup?", answer: "South Africa" },
  { text: "Which country is home to the Atacama Desert?", answer: "Chile" },
  { text: "Which country is known as the Land of the Thunder Dragon?", answer: "Bhutan" },
  { text: "Which country won the first Cricket World Cup in 1975?", answer: "West Indies" },
  { text: "Which footballer is nicknamed The Egyptian King?", answer: "Mohamed Salah" },
  { text: "Which natural disaster is measured with a seismograph?", answer: "Earthquake" },
  { text: "Which Nigerian institution conducts national elections?", answer: "INEC" },
  { text: "Which Nigerian state is known as the Home of Peace and Tourism?", answer: "Plateau State" },
  { text: "Which Nigerian writer won the Nobel Prize in Literature in 1986?", answer: "Wole Soyinka" },
  { text: "Which part of the ear helps maintain balance?", answer: "Semicircular canals" },
  { text: "Which planet is known as Earth's twin?", answer: "Venus" },
  { text: "Which scientist discovered the planet Uranus?", answer: "William Herschel" },
  { text: "Which scientist proposed the three laws of planetary motion?", answer: "Johannes Kepler" },
]

const POOL_5: Omit<TBQuestion, 'id'>[] = [
  { text: "A number increased by 40% becomes 70. What was the original number?", answer: "50" },
  { text: "In computing, what is a 'bug'?", answer: "An error in a program" },
  { text: "What does 'algorithm' mean in computing?", answer: "A step-by-step procedure for solving a problem" },
  { text: "What does CPU stand for?", answer: "Central Processing Unit" },
  { text: "What does SMS stand for?", answer: "Short Message Service" },
  { text: "What is the capital city of Nigeria?", answer: "Abuja" },
  { text: "What is the name of the boundary between two tectonic plates?", answer: "Fault line" },
  { text: "What is the only letter of the English alphabet that does not appear on the Periodic Table?", answer: "J" },
  { text: "What is the term for a government headed by a prime minister?", answer: "Parliamentary System" },
  { text: "Which African country contains the city of Durban?", answer: "South Africa" },
  { text: "Which African country has the city of Brazzaville as its capital?", answer: "Republic of Congo" },
  { text: "Which African country has the city of Nairobi as its capital?", answer: "Kenya" },
  { text: "Which African country is famous for the Fish River Canyon?", answer: "Namibia" },
  { text: "Which African nation became the first to reach the semi-finals of the FIFA World Cup?", answer: "Morocco" },
  { text: "Which country has no official capital city?", answer: "Nauru" },
  { text: "Which country has the capital Vilnius?", answer: "Lithuania" },
  { text: "Which country has the city of St. Petersburg?", answer: "Russia" },
  { text: "Which country hosted the first modern Olympics?", answer: "Greece" },
  { text: "Which country is home to the city of Kyoto?", answer: "Japan" },
  { text: "Which country is known as the Land of Thunder Dragon?", answer: "Bhutan" },
  { text: "Which country won the first FIFA Club World Cup in 2000?", answer: "Corinthians (Brazil)" },
  { text: "Which force keeps planets in orbit?", answer: "Gravity" },
  { text: "Which Nigerian activist founded the Oodua People's Congress?", answer: "Frederick Fasehun" },
  { text: "Which Nigerian kingdom was famous for bronze artworks?", answer: "Benin Kingdom" },
  { text: "Which Nigerian state is known as the Home of Solid Minerals?", answer: "Nasarawa State" },
  { text: "Which ocean is the largest?", answer: "Pacific Ocean" },
  { text: "Which part of the ear helps with balance?", answer: "Semicircular canals" },
  { text: "Which planet is known as the Blue Planet?", answer: "Earth" },
  { text: "Which scientist discovered the structure of benzene as a ring?", answer: "August Kekulé" },
  { text: "Which sea has no outlet and is one of the saltiest bodies of water on Earth?", answer: "Dead Sea" },
]

const POOL_6: Omit<TBQuestion, 'id'>[] = [
  { text: "A number is doubled and then increased by 9 to give 35. What is the number?", answer: "13" },
  { text: "In cybersecurity, what is ransomware?", answer: "Malware that locks data and demands payment" },
  { text: "What does 'BIOS' stand for?", answer: "Basic Input/Output System" },
  { text: "What does cybersecurity protect?", answer: "Digital systems and data" },
  { text: "What does STEM stand for?", answer: "Science, Technology, Engineering and Mathematics" },
  { text: "What is the chemical symbol for gold?", answer: "Au" },
  { text: "What is the name of the Earth's largest ocean current system?", answer: "Thermohaline Circulation" },
  { text: "What is the only mammal capable of true sustained flight?", answer: "Bat" },
  { text: "What is the term for a government ruled by a small group of people?", answer: "Oligarchy" },
  { text: "Which African country contains the city of Kisumu on Lake Victoria?", answer: "Kenya" },
  { text: "Which African country has the city of Cairo as its capital?", answer: "Egypt" },
  { text: "Which African country has the city of Niamey as its capital?", answer: "Niger" },
  { text: "Which African country is home to Lake Tanganyika, the deepest lake in Africa?", answer: "Tanzania" },
  { text: "Which African queen resisted Roman rule in ancient Egypt?", answer: "Cleopatra" },
  { text: "Which country has no rivers?", answer: "Saudi Arabia" },
  { text: "Which country has the capital Warsaw?", answer: "Poland" },
  { text: "Which country has the city of Vancouver?", answer: "Canada" },
  { text: "Which country is both in Europe and Asia?", answer: "Turkey" },
  { text: "Which country is home to the city of Mecca?", answer: "Saudi Arabia" },
  { text: "Which country is known as the Land of Volcanoes?", answer: "Iceland" },
  { text: "Which country won the first FIFA Confederations Cup?", answer: "Argentina (1992 King Fahd Cup precursor recognized by FIFA)" },
  { text: "Which gas do plants release during photosynthesis?", answer: "Oxygen" },
  { text: "Which Nigerian city hosted FESTAC '77?", answer: "Lagos" },
  { text: "Which Nigerian leader created 12 states in 1967?", answer: "Yakubu Gowon" },
  { text: "Which Nigerian state is known as the Jewel in the Savannah?", answer: "Gombe State" },
  { text: "Which ocean surrounds the Maldives?", answer: "Indian Ocean" },
  { text: "Which part of the eye controls light entering?", answer: "Iris" },
  { text: "Which planet is known for extreme winds?", answer: "Neptune" },
  { text: "Which scientist discovered the vaccine for smallpox?", answer: "Edward Jenner" },
  { text: "Which sea separates Europe and Africa?", answer: "Mediterranean Sea" },
]

const POOL_7: Omit<TBQuestion, 'id'>[] = [
  { text: "A rectangle has length 12 cm and area 96 cm². What is its width?", answer: "8 cm" },
  { text: "In technology, what does 'AI hallucination' mean?", answer: "When AI gives false or made-up information" },
  { text: "What does 'cache' mean in computing?", answer: "Temporary storage for faster access" },
  { text: "What does DNS stand for?", answer: "Domain Name System" },
  { text: "What does URL stand for?", answer: "Uniform Resource Locator" },
  { text: "What is the chemical symbol for silver?", answer: "Ag" },
  { text: "What is the name of the force that opposes motion between surfaces?", answer: "Friction" },
  { text: "What is the only metal that is liquid at room temperature?", answer: "Mercury" },
  { text: "What is the term for a government ruled by religious leaders?", answer: "Theocracy" },
  { text: "Which African country contains the ruins of Great Zimbabwe?", answer: "Zimbabwe" },
  { text: "Which African country has the city of Conakry as its capital?", answer: "Guinea" },
  { text: "Which African country has the city of Ouagadougou as its capital?", answer: "Burkina Faso" },
  { text: "Which African country is home to Lake Turkana?", answer: "Kenya" },
  { text: "Which African river crosses the Equator twice?", answer: "Congo River" },
  { text: "Which country has the ancient city of Angkor Wat?", answer: "Cambodia" },
  { text: "Which country has the capital Wellington?", answer: "New Zealand" },
  { text: "Which country has the city of Venice?", answer: "Italy" },
  { text: "Which country is called the 'Land of a Thousand Lakes'?", answer: "Finland" },
  { text: "Which country is home to the Great Barrier Reef?", answer: "Australia" },
  { text: "Which country is known as the Pearl of the Orient Seas?", answer: "Philippines" },
  { text: "Which country won the first FIFA U-17 World Cup?", answer: "Nigeria" },
  { text: "Which gas is commonly called laughing gas?", answer: "Nitrous oxide" },
  { text: "Which Nigerian city hosts Aso Rock?", answer: "Abuja" },
  { text: "Which Nigerian leader introduced the National Youth Service Corps?", answer: "Yakubu Gowon" },
  { text: "Which Nigerian state is known as the Land of Beauty?", answer: "Adamawa State" },
  { text: "Which organ contains the malleus, incus, and stapes?", answer: "Ear" },
  { text: "Which part of the eye focuses light?", answer: "Lens" },
  { text: "Which planet is known for its rings?", answer: "Saturn" },
  { text: "Which scientist discovered vaccination for smallpox?", answer: "Edward Jenner" },
  { text: "Which sport awards the Webb Ellis Cup?", answer: "Rugby Union" },
]

const POOL_8: Omit<TBQuestion, 'id'>[] = [
  { text: "A triangle has angles x, 2x and 3x. What is x?", answer: "30°" },
  { text: "In what year did Nigeria gain independence?", answer: "1960" },
  { text: "What does 'cloud storage' mean?", answer: "Storing data on remote internet servers" },
  { text: "What does e-commerce mean?", answer: "Buying and selling online" },
  { text: "What does USB stand for?", answer: "Universal Serial Bus" },
  { text: "What is the chemical symbol for sodium?", answer: "Na" },
  { text: "What is the name of the imaginary line at 0 degrees longitude?", answer: "Prime Meridian" },
  { text: "What is the political term for the removal of a president through legal constitutional process?", answer: "Impeachment" },
  { text: "What is the term for a system where supreme authority rests with the people?", answer: "Popular Sovereignty" },
  { text: "Which African country contains the Serengeti National Park?", answer: "Tanzania" },
  { text: "Which African country has the city of Dakar as its capital?", answer: "Senegal" },
  { text: "Which African country has the city of Praia as its capital?", answer: "Cape Verde" },
  { text: "Which African country is home to Mount Kenya?", answer: "Kenya" },
  { text: "Which animal has fingerprints almost identical to humans?", answer: "Koala" },
  { text: "Which country has the ancient city of Timbuktu?", answer: "Mali" },
  { text: "Which country has the capital Zagreb?", answer: "Croatia" },
  { text: "Which country has the city of Vienna?", answer: "Austria" },
  { text: "Which country is called the Land Down Under?", answer: "Australia" },
  { text: "Which country is home to the Suez Canal?", answer: "Egypt" },
  { text: "Which country is known for maple leaf symbol?", answer: "Canada" },
  { text: "Which country won the first FIFA Women's World Cup?", answer: "United States" },
  { text: "Which gas is needed for human respiration?", answer: "Oxygen" },
  { text: "Which Nigerian city is associated with the Nok culture discoveries?", answer: "Nok area in Kaduna State" },
  { text: "Which Nigerian military leader moved the capital from Lagos to Abuja by decree?", answer: "Murtala Mohammed" },
  { text: "Which Nigerian state is known as the Land of Equity?", answer: "Imo State" },
  { text: "Which organ controls balance and coordination?", answer: "Cerebellum" },
  { text: "Which part of the human body contains the cochlea?", answer: "Ear" },
  { text: "Which planet is smallest in the solar system?", answer: "Mercury" },
  { text: "Which scientist discovered X-rays?", answer: "Wilhelm Röntgen" },
  { text: "Which sport has a Stanley Cup trophy?", answer: "Ice Hockey" },
]

const POOL_9: Omit<TBQuestion, 'id'>[] = [
  { text: "How many bones are in the adult human body?", answer: "206" },
  { text: "The angles in a quadrilateral sum to what?", answer: "360°" },
  { text: "What does 'CPU' stand for?", answer: "Central Processing Unit" },
  { text: "What does fintech mean?", answer: "Financial technology" },
  { text: "What does UX mean in technology design?", answer: "User Experience" },
  { text: "What is the deepest ocean trench in the world?", answer: "Mariana Trench" },
  { text: "What is the name of the imaginary line dividing Earth into Northern and Southern Hemispheres?", answer: "Equator" },
  { text: "What is the powerhouse of the cell?", answer: "Mitochondria" },
  { text: "What is the term for a temporary government formed after a crisis?", answer: "Interim government" },
  { text: "Which African country contains the Simien Mountains?", answer: "Ethiopia" },
  { text: "Which African country has the city of Djibouti as its capital?", answer: "Djibouti" },
  { text: "Which African country has the city of Rabat as its capital?", answer: "Morocco" },
  { text: "Which African country is home to Robben Island?", answer: "South Africa" },
  { text: "Which animal is the largest mammal?", answer: "Blue Whale" },
  { text: "Which country has the capital Ankara?", answer: "Turkey" },
  { text: "Which country has the city of Antwerp?", answer: "Belgium" },
  { text: "Which country has the island of Bali?", answer: "Indonesia" },
  { text: "Which country is called the Land of a Thousand Lakes?", answer: "Finland" },
  { text: "Which country is known as the Boot of Europe?", answer: "Italy" },
  { text: "Which country is known for the ancient city of Petra?", answer: "Jordan" },
  { text: "Which country won the first FIFA World Cup in 1930?", answer: "Uruguay" },
  { text: "Which gas is produced when acids react with carbonates?", answer: "Carbon dioxide" },
  { text: "Which Nigerian city is called Garden City?", answer: "Port Harcourt" },
  { text: "Which Nigerian nationalist became the first President of Nigeria?", answer: "Nnamdi Azikiwe" },
  { text: "Which Nigerian state is known as the Land of Honour?", answer: "Ekiti State" },
  { text: "Which organ controls body movement and thought?", answer: "Brain" },
  { text: "Which part of the human body produces red blood cells?", answer: "Bone marrow" },
  { text: "Which planet is the hottest in the solar system?", answer: "Venus" },
  { text: "Which scientist first isolated radium?", answer: "Marie Curie" },
  { text: "Which sport has positions called pitcher and catcher?", answer: "Baseball" },
]

const POOL_10: Omit<TBQuestion, 'id'>[] = [
  { text: "How many colours are in a rainbow?", answer: "7" },
  { text: "The angles of a triangle are 40°, 60° and x. What is x?", answer: "80°" },
  { text: "What does 'download' mean?", answer: "Transfer data from internet/server to a device" },
  { text: "What does GPS stand for?", answer: "Global Positioning System" },
  { text: "What does VPN stand for?", answer: "Virtual Private Network" },
  { text: "What is the deepest point on Earth called?", answer: "Challenger Deep" },
  { text: "What is the name of the largest artery in the human body?", answer: "Aorta" },
  { text: "What is the primary purpose of a VPN?", answer: "Secure/private internet connection" },
  { text: "What is the term for a vote in which citizens choose elected representatives?", answer: "Election" },
  { text: "Which African country contains the Skeleton Coast?", answer: "Namibia" },
  { text: "Which African country has the city of Dodoma as its capital?", answer: "Tanzania" },
  { text: "Which African country has the city of Stone Town in Zanzibar?", answer: "Tanzania" },
  { text: "Which African country is home to the ancient city of Meroë, famous for its pyramids?", answer: "Sudan" },
  { text: "Which athlete has won the most Olympic medals in history?", answer: "Michael Phelps" },
  { text: "Which country has the capital Athens?", answer: "Greece" },
  { text: "Which country has the city of Barcelona?", answer: "Spain" },
  { text: "Which country has the largest population in the world?", answer: "India" },
  { text: "Which country is called the Land of Eagles?", answer: "Albania" },
  { text: "Which country is known as the Emerald Isle?", answer: "Ireland" },
  { text: "Which country is known for the city of Dubrovnik?", answer: "Croatia" },
  { text: "Which country won the first Olympic football gold medal in 1900?", answer: "Great Britain" },
  { text: "Which gas is used by divers to avoid nitrogen narcosis in special mixtures?", answer: "Helium" },
  { text: "Which Nigerian city is called the Coal City?", answer: "Enugu" },
  { text: "Which Nigerian nationalist was known as the 'Zik of Africa'?", answer: "Nnamdi Azikiwe" },
  { text: "Which Nigerian state is known as the Land of Hospitality?", answer: "Katsina State" },
  { text: "Which organ controls most body activities through the nervous system?", answer: "Brain" },
  { text: "Which part of the human brain is primarily responsible for balance and coordination?", answer: "Cerebellum" },
  { text: "Which queen led the Zazzau Kingdom and is famous in Hausa history?", answer: "Queen Amina" },
  { text: "Which scientist first proposed continental drift?", answer: "Alfred Wegener" },
  { text: "Which sport is associated with a Grand Slam?", answer: "Tennis" },
]

const POOL_11: Omit<TBQuestion, 'id'>[] = [
  { text: "How many sides does a hexagon have?", answer: "6" },
  { text: "The angles of a triangle are in the ratio 2:3:4. What is the largest angle?", answer: "80°" },
  { text: "What does 'HTTP' stand for?", answer: "HyperText Transfer Protocol" },
  { text: "What does GUI stand for?", answer: "Graphical User Interface" },
  { text: "What does VR stand for?", answer: "Virtual Reality" },
  { text: "What is the function of platelets in blood?", answer: "Blood clotting" },
  { text: "What is the name of the largest moon in the solar system?", answer: "Ganymede" },
  { text: "What is the process by which rocks are broken down into smaller pieces at Earth's surface?", answer: "Weathering" },
  { text: "What is the term for government by the people?", answer: "Democracy" },
  { text: "Which African country has both desert and Mediterranean climate regions and borders the Atlantic Ocean?", answer: "Morocco" },
  { text: "Which African country has the city of Freetown as its capital?", answer: "Sierra Leone" },
  { text: "Which African country has the city of Tripoli as its capital?", answer: "Libya" },
  { text: "Which African country is known as the Land of a Thousand Hills?", answer: "Rwanda" },
  { text: "Which athlete is known as the fastest man in history?", answer: "Usain Bolt" },
  { text: "Which country has the capital Bangkok?", answer: "Thailand" },
  { text: "Which country has the city of Buenos Aires?", answer: "Argentina" },
  { text: "Which country has the longest coastline in the world?", answer: "Canada" },
  { text: "Which country is called the Land of Fire?", answer: "Azerbaijan" },
  { text: "Which country is known as the Hermit Kingdom?", answer: "North Korea" },
  { text: "Which country is known for the city of Havana?", answer: "Cuba" },
  { text: "Which country won the first Rugby World Cup in 1987?", answer: "New Zealand" },
  { text: "Which gas is used by plants to make food?", answer: "Carbon dioxide" },
  { text: "Which Nigerian city is famous for cocoa trade historically?", answer: "Ibadan" },
  { text: "Which Nigerian river is the longest?", answer: "River Niger" },
  { text: "Which Nigerian state is known as the Land of Promise?", answer: "Akwa Ibom" },
  { text: "Which organ filters waste from the blood?", answer: "Kidney" },
  { text: "Which part of the human eye contains photoreceptor cells?", answer: "Retina" },
  { text: "Which river forms part of the border between the United States and Mexico?", answer: "Rio Grande" },
  { text: "Which scientist formulated the law of universal gravitation?", answer: "Isaac Newton" },
  { text: "Which sport is associated with Lewis Hamilton?", answer: "Formula One" },
]

const POOL_12: Omit<TBQuestion, 'id'>[] = [
  { text: "If 2³ × 2⁴ = 2ⁿ, what is n?", answer: "7" },
  { text: "The average of 6, 8, 10 and x is 12. Find x.", answer: "24" },
  { text: "What does 'machine learning' allow computers to do?", answer: "Learn from data" },
  { text: "What does HTML stand for?", answer: "HyperText Markup Language" },
  { text: "What does Wi-Fi officially stand for?", answer: "Nothing official" },
  { text: "What is the hardest naturally occurring substance on Earth?", answer: "Diamond" },
  { text: "What is the name of the layer of Earth's atmosphere where weather occurs?", answer: "Troposphere" },
  { text: "What is the process by which water moves through soil and porous rock?", answer: "Percolation" },
  { text: "What is the term for political power shared between central and regional governments?", answer: "Federalism" },
  { text: "Which African country has Lake Malawi?", answer: "Malawi" },
  { text: "Which African country has the city of Gaborone as its capital?", answer: "Botswana" },
  { text: "Which African country has the city of Tunis as its capital?", answer: "Tunisia" },
  { text: "Which African country is known as the Warm Heart of Africa?", answer: "Malawi" },
  { text: "Which athlete is known as the Flying Sikh?", answer: "Milkha Singh" },
  { text: "Which country has the capital Bern?", answer: "Switzerland" },
  { text: "Which country has the city of Casablanca?", answer: "Morocco" },
  { text: "Which country has the longest land border with Nigeria?", answer: "Niger" },
  { text: "Which country is called the Land of Ice?", answer: "Iceland" },
  { text: "Which country is known as the Kingdom in the Sky?", answer: "Lesotho" },
  { text: "Which country owns the Galápagos Islands?", answer: "Ecuador" },
  { text: "Which country won the first UEFA European Championship in 1960?", answer: "Soviet Union (USSR)" },
  { text: "Which gas is used in balloons because it is lighter than air?", answer: "Helium" },
  { text: "Which Nigerian city is famous for the ancient Nok civilization discoveries?", answer: "Nok (Kaduna State)" },
  { text: "Which Nigerian river joins River Niger at Lokoja?", answer: "River Benue" },
  { text: "Which Nigerian state is known as the Land of Virtue?", answer: "Osun State" },
  { text: "Which organ in the human body produces hormones such as thyroxine?", answer: "Thyroid Gland" },
  { text: "Which part of the human nervous system connects the brain to the rest of the body?", answer: "Spinal Cord" },
  { text: "Which scientist created the first successful rabies vaccine?", answer: "Louis Pasteur" },
  { text: "Which scientist formulated the laws of inheritance?", answer: "Gregor Mendel" },
  { text: "Which sport is associated with Serena Williams?", answer: "Tennis" },
]

const POOL_13: Omit<TBQuestion, 'id'>[] = [
  { text: "If 30% of a number is 45, what is the number?", answer: "150" },
  { text: "The average of five consecutive integers is 28. What is the largest integer?", answer: "30" },
  { text: "What does 'RAM' stand for?", answer: "Random Access Memory" },
  { text: "What does HTTPS indicate on a website?", answer: "Secure connection" },
  { text: "What element has atomic number 1?", answer: "Hydrogen" },
  { text: "What is the highest court in Nigeria?", answer: "Supreme Court of Nigeria" },
  { text: "What is the name of the layer of gases surrounding Earth?", answer: "Atmosphere" },
  { text: "What is the process of breaking down food in the body called?", answer: "Digestion" },
  { text: "What is the term for the division of powers between branches of government?", answer: "Separation of Powers" },
  { text: "Which African country has more pyramids than Egypt?", answer: "Sudan" },
  { text: "Which African country has the city of Harare as its capital?", answer: "Zimbabwe" },
  { text: "Which African country has the city of Windhoek as its capital?", answer: "Namibia" },
  { text: "Which African country is known for the ancient city of Great Zimbabwe?", answer: "Zimbabwe" },
  { text: "Which athlete is nicknamed 'The Baltimore Bullet'?", answer: "Michael Phelps" },
  { text: "Which country has the capital Bogotá?", answer: "Colombia" },
  { text: "Which country has the city of Cusco?", answer: "Peru" },
  { text: "Which country has the most islands in the world?", answer: "Sweden" },
  { text: "Which country is called the Land of Milk and Honey?", answer: "Israel" },
  { text: "Which country is known as the Land Down Under?", answer: "Australia" },
  { text: "Which country spans the greatest number of time zones in the world?", answer: "France" },
  { text: "Which country won the first Women's World Cup?", answer: "United States" },
  { text: "Which gas is used in fire extinguishers?", answer: "Carbon dioxide" },
  { text: "Which Nigerian city is famous for the Argungu Fishing Festival?", answer: "Argungu" },
  { text: "Which Nigerian state is called the Coal City State?", answer: "Enugu State" },
  { text: "Which Nigerian state is known as the Light of the Nation?", answer: "Anambra State" },
  { text: "Which organ is responsible for pumping blood?", answer: "Heart" },
  { text: "Which part of the plant absorbs water?", answer: "Root" },
  { text: "Which scientist developed the concept of radioactivity with uranium?", answer: "Henri Becquerel" },
  { text: "Which scientist introduced the concept of natural selection?", answer: "Charles Darwin" },
  { text: "Which sport is associated with the America's Cup?", answer: "Sailing" },
]

const POOL_14: Omit<TBQuestion, 'id'>[] = [
  { text: "If 3x + 5 = 35, what is x?", answer: "10" },
  { text: "The average of five consecutive integers is 42. What is the smallest integer?", answer: "40" },
  { text: "What does 'spam' mean in email communication?", answer: "Unwanted or unsolicited messages" },
  { text: "What does ICT stand for?", answer: "Information and Communication Technology" },
  { text: "What gas do plants absorb during photosynthesis?", answer: "Carbon dioxide (CO₂)" },
  { text: "What is the highest law-making body in Nigeria called?", answer: "National Assembly" },
  { text: "What is the name of the pigment that gives plants their green color?", answer: "Chlorophyll" },
  { text: "What is the purpose of an operating system?", answer: "Manage computer hardware and software resources" },
  { text: "What is the term for the right to vote?", answer: "Suffrage" },
  { text: "Which African country has Mount Cameroon?", answer: "Cameroon" },
  { text: "Which African country has the city of Juba as its capital?", answer: "South Sudan" },
  { text: "Which African country has the city of Yaoundé as its capital?", answer: "Cameroon" },
  { text: "Which African country is the only one with Spanish as an official language?", answer: "Equatorial Guinea" },
  { text: "Which basketball player is associated with the Chicago Bulls and number 23?", answer: "Michael Jordan" },
  { text: "Which country has the capital Brussels?", answer: "Belgium" },
  { text: "Which country has the city of Dubai?", answer: "United Arab Emirates" },
  { text: "Which country has the oldest continuously used national flag?", answer: "Denmark" },
  { text: "Which country is called the Land of the Free?", answer: "United States" },
  { text: "Which country is known as the Land of a Thousand Hills?", answer: "Rwanda" },
  { text: "Which country spans the greatest number of time zones?", answer: "France" },
  { text: "Which country won the UEFA Euro 2024?", answer: "Spain" },
  { text: "Which gas makes up about 78% of Earth's atmosphere?", answer: "Nitrogen" },
  { text: "Which Nigerian city is famous for the Durbar festival?", answer: "Kano" },
  { text: "Which Nigerian state is called the Confluence State?", answer: "Kogi State" },
  { text: "Which Nigerian state is known as the Nation's Food Basket?", answer: "Benue State" },
  { text: "Which organ produces bile?", answer: "Liver" },
  { text: "Which part of the plant conducts photosynthesis?", answer: "Leaf" },
  { text: "Which scientist developed the first successful AC electrical system?", answer: "Nikola Tesla" },
  { text: "Which scientist invented the first practical telephone?", answer: "Alexander Graham Bell" },
  { text: "Which sport is associated with the Claret Jug?", answer: "Golf" },
]

const POOL_15: Omit<TBQuestion, 'id'>[] = [
  { text: "If 4 pencils cost ₦200, how much will 9 pencils cost at the same rate?", answer: "₦450" },
  { text: "The HCF of 24 and 36 is what?", answer: "12" },
  { text: "What does 'SSD' stand for in computing?", answer: "Solid State Drive" },
  { text: "What does IoT stand for?", answer: "Internet of Things" },
  { text: "What is 'data encryption'?", answer: "Converting data into coded form" },
  { text: "What is the largest chamber of the human heart?", answer: "Left Ventricle" },
  { text: "What is the name of the process by which a solid changes directly into gas?", answer: "Sublimation" },
  { text: "What is the purpose of encryption?", answer: "To protect information by encoding it" },
  { text: "What is the value of π (pi) to 2 decimal places?", answer: "3.14" },
  { text: "Which African country has Portuguese as its official language and Luanda as capital?", answer: "Angola" },
  { text: "Which African country has the city of Kampala as its capital?", answer: "Uganda" },
  { text: "Which African country has the Danakil Depression?", answer: "Ethiopia" },
  { text: "Which African country uses both English and Swahili as official languages and has Dodoma as its capital?", answer: "Tanzania" },
  { text: "Which blood group is the universal recipient?", answer: "AB Positive" },
  { text: "Which country has the capital Bucharest?", answer: "Romania" },
  { text: "Which country has the city of Dubrovnik?", answer: "Croatia" },
  { text: "Which country has the Taj Mahal?", answer: "India" },
  { text: "Which country is called the Land of the Incas?", answer: "Peru" },
  { text: "Which country is known as the Land of a Thousand Lakes?", answer: "Finland" },
  { text: "Which country won the 1990 FIFA World Cup?", answer: "Germany" },
  { text: "Which desert is located in southern Africa and covers parts of Botswana and Namibia?", answer: "Kalahari Desert" },
  { text: "Which gas protects Earth from harmful ultraviolet rays?", answer: "Ozone" },
  { text: "Which Nigerian city is known as the ancient city of brown roofs?", answer: "Ibadan" },
  { text: "Which Nigerian state is called the Food Basket of the Nation?", answer: "Benue State" },
  { text: "Which Nigerian state is known as the Nature's Gift to the Nation?", answer: "Taraba State" },
  { text: "Which organ produces insulin?", answer: "Pancreas" },
  { text: "Which part of the plant transports food?", answer: "Phloem" },
  { text: "Which scientist developed the laws of electromagnetism summarized in equations?", answer: "James Clerk Maxwell" },
  { text: "Which scientist invented the first successful electric light bulb for commercial use?", answer: "Thomas Edison" },
  { text: "Which sport is associated with the Davis Cup?", answer: "Tennis" },
]

const POOL_16: Omit<TBQuestion, 'id'>[] = [
  { text: "If 40% of x is 72, what is x?", answer: "180" },
  { text: "The LCM of 12 and 18 is what?", answer: "36" },
  { text: "What does 'URL' stand for?", answer: "Uniform Resource Locator" },
  { text: "What does IP mean in IP address?", answer: "Internet Protocol" },
  { text: "What is 15% of 200?", answer: "30" },
  { text: "What is the largest gland in the human body?", answer: "Liver" },
  { text: "What is the name of the process by which water enters the air from plant leaves?", answer: "Transpiration" },
  { text: "What is the SI unit of electric current?", answer: "Ampere" },
  { text: "What is the voting system called when citizens vote directly on a specific issue?", answer: "Referendum" },
  { text: "Which African country has the ancient city of Axum?", answer: "Ethiopia" },
  { text: "Which African country has the city of Khartoum as its capital?", answer: "Sudan" },
  { text: "Which African country has the Etosha National Park?", answer: "Namibia" },
  { text: "Which African country was formerly called Bechuanaland?", answer: "Botswana" },
  { text: "Which blood type is the universal donor?", answer: "O Negative" },
  { text: "Which country has the capital Budapest?", answer: "Hungary" },
  { text: "Which country has the city of Geneva?", answer: "Switzerland" },
  { text: "Which country has three capital cities?", answer: "South Africa" },
  { text: "Which country is called the Land of the Morning Calm?", answer: "South Korea" },
  { text: "Which country is known as the Land of Fire and Ice?", answer: "Iceland" },
  { text: "Which country won the 1998 FIFA World Cup?", answer: "France" },
  { text: "Which disease is caused by lack of insulin or poor insulin use?", answer: "Diabetes" },
  { text: "Which gland produces adrenaline?", answer: "Adrenal gland" },
  { text: "Which Nigerian city is known as the birthplace of the Sokoto Caliphate?", answer: "Sokoto" },
  { text: "Which Nigerian state is called the Glory of All Lands?", answer: "Bayelsa State" },
  { text: "Which Nigerian state is known as the Pace Setter State?", answer: "Oyo State" },
  { text: "Which organ removes excess water and salts from blood?", answer: "Kidney" },
  { text: "Which planet has a moon called Titan?", answer: "Saturn" },
  { text: "Which scientist developed the laws of inheritance using pea plants?", answer: "Gregor Mendel" },
  { text: "Which scientist is associated with relativity?", answer: "Albert Einstein" },
  { text: "Which sport is associated with the Ryder Cup?", answer: "Golf" },
]

const POOL_17: Omit<TBQuestion, 'id'>[] = [
  { text: "If 5 workers finish a job in 12 days, how many worker-days is the job?", answer: "60 worker-days" },
  { text: "The mean of 12, 18, 20 and 30 is what?", answer: "20" },
  { text: "What does 'veto power' mean in politics?", answer: "Power to reject or block a decision" },
  { text: "What does ISP stand for?", answer: "Internet Service Provider" },
  { text: "What is a bicameral legislature?", answer: "A legislature with two chambers" },
  { text: "What is the largest layer of the Earth by volume?", answer: "Mantle" },
  { text: "What is the name of the process where plants make food using sunlight?", answer: "Photosynthesis" },
  { text: "What is the SI unit of energy?", answer: "Joule" },
  { text: "What is two-factor authentication?", answer: "Using two methods to verify identity" },
  { text: "Which African country has the ancient city of Leptis Magna?", answer: "Libya" },
  { text: "Which African country has the city of Kigali as its capital?", answer: "Rwanda" },
  { text: "Which African country has the highest mountain in Africa?", answer: "Tanzania" },
  { text: "Which African country was formerly called Dahomey?", answer: "Benin" },
  { text: "Which blood vessels carry blood back to the heart?", answer: "Veins" },
  { text: "Which country has the capital Copenhagen?", answer: "Denmark" },
  { text: "Which country has the city of Helsinki?", answer: "Finland" },
  { text: "Which country has won the most FIFA World Cups?", answer: "Brazil" },
  { text: "Which country is called the Land of the Thunderbolt?", answer: "Bhutan" },
  { text: "Which country is known as the Land of Poets and Thinkers?", answer: "Germany" },
  { text: "Which country won the 2002 FIFA World Cup?", answer: "Brazil" },
  { text: "Which disease is caused by Plasmodium?", answer: "Malaria" },
  { text: "Which global body has five permanent Security Council members?", answer: "United Nations" },
  { text: "Which Nigerian city is known as the cradle of Yoruba civilization?", answer: "Ile-Ife" },
  { text: "Which Nigerian state is called the Home of Aquatic Splendour?", answer: "Lagos State" },
  { text: "Which Nigerian state is known as the Salt of the Nation?", answer: "Ebonyi State" },
  { text: "Which organ secretes bile?", answer: "Liver" },
  { text: "Which planet has Olympus Mons?", answer: "Mars" },
  { text: "Which scientist developed the periodic table?", answer: "Dmitri Mendeleev" },
  { text: "Which scientist is associated with the conservation of mass?", answer: "Antoine Lavoisier" },
  { text: "Which sport is associated with Tiger Woods?", answer: "Golf" },
]

const POOL_18: Omit<TBQuestion, 'id'>[] = [
  { text: "If 5x - 10 = 40, what is x?", answer: "10" },
  { text: "The median of 4, 7, 9, 12, 18 is what?", answer: "9" },
  { text: "What does 5G mean?", answer: "Fifth Generation" },
  { text: "What does JPEG stand for?", answer: "Joint Photographic Experts Group" },
  { text: "What is a browser used for?", answer: "Accessing websites" },
  { text: "What is the largest organ in the human body?", answer: "The skin" },
  { text: "What is the name of the protective outer layer of Earth made of gases?", answer: "Atmosphere" },
  { text: "What is the SI unit of force?", answer: "Newton" },
  { text: "What language has the most native speakers in the world?", answer: "Mandarin Chinese" },
  { text: "Which African country has the ancient rock-hewn churches of Lalibela?", answer: "Ethiopia" },
  { text: "Which African country has the city of Lalibela?", answer: "Ethiopia" },
  { text: "Which African country has the highest population?", answer: "Nigeria" },
  { text: "Which African country was formerly called French Sudan?", answer: "Mali" },
  { text: "Which body of water separates Saudi Arabia from Africa?", answer: "Red Sea" },
  { text: "Which country has the capital Doha?", answer: "Qatar" },
  { text: "Which country has the city of Istanbul?", answer: "Turkey" },
  { text: "Which country has won the most Men's Cricket World Cups?", answer: "Australia" },
  { text: "Which country is called the Land of White Elephant?", answer: "Thailand" },
  { text: "Which country is known as the Land of Smiles?", answer: "Thailand" },
  { text: "Which country won the 2006 FIFA World Cup?", answer: "Italy" },
  { text: "Which element has atomic number 1?", answer: "Hydrogen" },
  { text: "Which hormone regulates blood sugar?", answer: "Insulin" },
  { text: "Which Nigerian city is known as the headquarters of the ancient Kanem-Bornu Empire?", answer: "Maiduguri" },
  { text: "Which Nigerian state is called the Home of Peace?", answer: "Borno State" },
  { text: "Which Nigerian state is known as the Seat of the Caliphate?", answer: "Sokoto State" },
  { text: "Which organ stores bile?", answer: "Gall bladder" },
  { text: "Which planet has the fastest winds?", answer: "Neptune" },
  { text: "Which scientist developed the polio vaccine first used widely in the 1950s?", answer: "Jonas Salk" },
  { text: "Which scientist is associated with the first law of motion?", answer: "Isaac Newton" },
  { text: "Which sport is Simone Biles known for?", answer: "Gymnastics" },
]

const POOL_19: Omit<TBQuestion, 'id'>[] = [
  { text: "If 7x = 91, what is x?", answer: "13" },
  { text: "The product of two consecutive integers is 156. What is the larger integer?", answer: "13" },
  { text: "What does a modem do?", answer: "Connects a device/network to the internet" },
  { text: "What does LED stand for?", answer: "Light Emitting Diode" },
  { text: "What is a coalition government?", answer: "Government formed by multiple parties" },
  { text: "What is the largest type of biome on Earth by area?", answer: "Marine biome" },
  { text: "What is the name of the protein that carries oxygen in red blood cells?", answer: "Haemoglobin" },
  { text: "What is the SI unit of frequency?", answer: "Hertz" },
  { text: "What planet is known as the Red Planet?", answer: "Mars" },
  { text: "Which African country has the Atlas Mountains?", answer: "Morocco" },
  { text: "Which African country has the city of Libreville as its capital?", answer: "Gabon" },
  { text: "Which African country has the island of Djerba?", answer: "Tunisia" },
  { text: "Which African country was formerly called Gold Coast?", answer: "Ghana" },
  { text: "Which body system includes arteries, veins, and capillaries?", answer: "Circulatory system" },
  { text: "Which country has the capital Dublin?", answer: "Ireland" },
  { text: "Which country has the city of Kraków?", answer: "Poland" },
  { text: "Which country has won the most Olympic gold medals overall?", answer: "United States" },
  { text: "Which country is called the Pearl of Africa?", answer: "Uganda" },
  { text: "Which country is known as the Land of the Blue Sky?", answer: "Mongolia" },
  { text: "Which country won the 2019 Rugby World Cup?", answer: "South Africa" },
  { text: "Which element has the chemical symbol K?", answer: "Potassium" },
  { text: "Which human organ contains alveoli?", answer: "Lungs" },
  { text: "Which Nigerian city is known for leather works?", answer: "Kano" },
  { text: "Which Nigerian state is called the Land of Opportunities?", answer: "Bayelsa State" },
  { text: "Which Nigerian state is known as the Slogan 'Centre of Commerce'?", answer: "Kano State" },
  { text: "Which organ stores urine?", answer: "Bladder" },
  { text: "Which planet has the Great Dark Spot?", answer: "Neptune" },
  { text: "Which scientist discovered electromagnetic induction?", answer: "Michael Faraday" },
  { text: "Which scientist is associated with the laws of motion?", answer: "Isaac Newton" },
  { text: "Which sport uses a piste?", answer: "Fencing" },
]

const POOL_20: Omit<TBQuestion, 'id'>[] = [
  { text: "If a number is reduced by 20% to become 80, what was the original number?", answer: "100" },
  { text: "The product of two consecutive integers is 72. What is the larger integer?", answer: "9" },
  { text: "What does AI chatbot mean?", answer: "Artificial intelligence chat robot/program" },
  { text: "What does machine learning allow computers to do?", answer: "Learn from data" },
  { text: "What is a computer virus?", answer: "Malicious program that spreads and disrupts systems" },
  { text: "What is the legal process of approving a treaty by a legislature called?", answer: "Ratification" },
  { text: "What is the name of the scale used to measure earthquake magnitude?", answer: "Richter scale" },
  { text: "What is the SI unit of pressure?", answer: "Pascal" },
  { text: "What type of rock is formed from cooled magma?", answer: "Igneous Rock" },
  { text: "Which African country has the Blyde River Canyon?", answer: "South Africa" },
  { text: "Which African country has the city of Lomé as its capital?", answer: "Togo" },
  { text: "Which African country has the island of Gorée, known for slave trade history?", answer: "Senegal" },
  { text: "Which African country was formerly called Northern Rhodesia?", answer: "Zambia" },
  { text: "Which branch of government is responsible for interpreting laws?", answer: "Judiciary" },
  { text: "Which country has the capital Havana?", answer: "Cuba" },
  { text: "Which country has the city of Kuala Lumpur?", answer: "Malaysia" },
  { text: "Which country has won the most Rugby World Cups?", answer: "South Africa" },
  { text: "Which country is called the Rainbow Nation?", answer: "South Africa" },
  { text: "Which country is known as the Land of the Dragon?", answer: "Wales" },
  { text: "Which country won the 2022 FIFA World Cup?", answer: "Argentina" },
  { text: "Which element has the chemical symbol Pb?", answer: "Lead" },
  { text: "Which human organ contains the alveoli?", answer: "Lungs" },
  { text: "Which Nigerian city is known for the groundnut pyramids?", answer: "Kano" },
  { text: "Which Nigerian state is called the Pride of the Sahel?", answer: "Yobe State" },
  { text: "Which Nigerian state is known as the Sunshine State?", answer: "Ondo State" },
  { text: "Which organelle is known as the powerhouse of the cell?", answer: "Mitochondrion" },
  { text: "Which planet has the largest volcano in the solar system?", answer: "Mars" },
  { text: "Which scientist discovered oxygen?", answer: "Joseph Priestley" },
  { text: "Which scientist is associated with the uncertainty principle?", answer: "Werner Heisenberg" },
  { text: "Which sport uses a pommel horse?", answer: "Gymnastics" },
]

const POOL_21: Omit<TBQuestion, 'id'>[] = [
  { text: "If one-third of a number is 18, what is the number?", answer: "54" },
  { text: "The product of two consecutive odd numbers is 63. What is the larger number?", answer: "9" },
  { text: "What does AI stand for?", answer: "Artificial Intelligence" },
  { text: "What does malware mean?", answer: "Malicious software" },
  { text: "What is a database used for?", answer: "Storing organized data" },
  { text: "What is the longest river in the world?", answer: "The Nile" },
  { text: "What is the name of the smallest unit of life capable of independent existence?", answer: "Cell" },
  { text: "What is the SI unit of work?", answer: "Joule" },
  { text: "Which African capital city sits on the Atlantic coast and was formerly called Bathurst?", answer: "Banjul" },
  { text: "Which African country has the Cape of Good Hope?", answer: "South Africa" },
  { text: "Which African country has the city of Lusaka as its capital?", answer: "Zambia" },
  { text: "Which African country has the largest land area?", answer: "Algeria" },
  { text: "Which African country was formerly called Nyasaland?", answer: "Malawi" },
  { text: "Which chemical symbol represents gold?", answer: "Au" },
  { text: "Which country has the capital Jakarta?", answer: "Indonesia" },
  { text: "Which country has the city of Marrakech?", answer: "Morocco" },
  { text: "Which country hosted the 1994 FIFA World Cup?", answer: "United States" },
  { text: "Which country is divided into emirates?", answer: "United Arab Emirates" },
  { text: "Which country is known as the Land of the Free?", answer: "United States" },
  { text: "Which country won the 2023 Rugby World Cup?", answer: "South Africa" },
  { text: "Which element has the chemical symbol W?", answer: "Tungsten" },
  { text: "Which human organ contains the retina?", answer: "Eye" },
  { text: "Which Nigerian city is known for the Osun-Osogbo Sacred Grove?", answer: "Osogbo" },
  { text: "Which Nigerian state is known as God's Own State?", answer: "Abia State" },
  { text: "Which Nigerian state is known as the Treasure Base of the Nation?", answer: "Rivers State" },
  { text: "Which part of the blood fights infection?", answer: "White blood cells" },
  { text: "Which planet has the longest day in the solar system?", answer: "Venus" },
  { text: "Which scientist discovered penicillin?", answer: "Alexander Fleming" },
  { text: "Which scientist is credited with developing the first periodic table arrangement?", answer: "Dmitri Mendeleev" },
  { text: "Which sport uses a shuttlecock?", answer: "Badminton" },
]

const POOL_22: Omit<TBQuestion, 'id'>[] = [
  { text: "If the area of a square is 169 cm², what is its perimeter?", answer: "52 cm" },
  { text: "The ratio 3:4 is equivalent to 18:x. Find x.", answer: "24" },
  { text: "What does API stand for?", answer: "Application Programming Interface" },
  { text: "What does NFC stand for in mobile payments?", answer: "Near Field Communication" },
  { text: "What is a database?", answer: "Organized collection of data" },
  { text: "What is the main function of a firewall in computing?", answer: "To protect a network from unauthorized access" },
  { text: "What is the name of water changing from gas to liquid?", answer: "Condensation" },
  { text: "What is the smallest bone in the human body?", answer: "Stapes" },
  { text: "Which African civilization developed around present-day Sudan and was known for iron production?", answer: "Kingdom of Kush" },
  { text: "Which African country has the city of Accra as its capital?", answer: "Ghana" },
  { text: "Which African country has the city of Malabo as its capital?", answer: "Equatorial Guinea" },
  { text: "Which African country has the largest proven oil reserves?", answer: "Libya" },
  { text: "Which African country was formerly called Southern Rhodesia?", answer: "Zimbabwe" },
  { text: "Which city is located on two continents, Europe and Asia?", answer: "Istanbul" },
  { text: "Which country has the capital Lima?", answer: "Peru" },
  { text: "Which country has the city of Mumbai?", answer: "India" },
  { text: "Which country hosted the 2000 Olympics?", answer: "Australia" },
  { text: "Which country is famous for fjords?", answer: "Norway" },
  { text: "Which country is known as the Land of the Gods?", answer: "Greece" },
  { text: "Which country won the 2023 Women's FIFA World Cup?", answer: "Spain" },
  { text: "Which element has the symbol Fe?", answer: "Iron" },
  { text: "Which human organ is primarily responsible for detoxification?", answer: "Liver" },
  { text: "Which Nigerian city is the seat of the Sultan of Sokoto?", answer: "Sokoto" },
  { text: "Which Nigerian state is known as the Big Heart?", answer: "Delta State" },
  { text: "Which Nigerian state is known as the Young Shall Grow State?", answer: "Anambra State" },
  { text: "Which part of the body produces red blood cells?", answer: "Bone marrow" },
  { text: "Which planet has the most extreme temperature variation?", answer: "Mercury" },
  { text: "Which scientist discovered radio waves experimentally?", answer: "Heinrich Hertz" },
  { text: "Which scientist is credited with discovering the neutron?", answer: "James Chadwick" },
  { text: "Which sport uses a velodrome?", answer: "Cycling" },
]

const POOL_23: Omit<TBQuestion, 'id'>[] = [
  { text: "If the perimeter of a square is 64 cm, what is its area?", answer: "256 cm²" },
  { text: "The ratio of boys to girls is 3:5. If there are 40 students, how many are girls?", answer: "25" },
  { text: "What does AR stand for in technology?", answer: "Augmented Reality" },
  { text: "What does OCR stand for?", answer: "Optical Character Recognition" },
  { text: "What is a manifesto in politics?", answer: "Public declaration of policies and aims" },
  { text: "What is the main function of red blood cells?", answer: "Transport oxygen" },
  { text: "What is the next number: 1, 3, 6, 10, 15, ___?", answer: "21" },
  { text: "What is the speed of light in a vacuum (approximately)?", answer: "300,000 km/s (3 × 10⁸ m/s)" },
  { text: "Which African countries share Victoria Falls?", answer: "Zambia and Zimbabwe" },
  { text: "Which African country has the city of Algiers as its capital?", answer: "Algeria" },
  { text: "Which African country has the city of Maputo as its capital?", answer: "Mozambique" },
  { text: "Which African country has the longest coastline?", answer: "Somalia" },
  { text: "Which African country was formerly called Tanganyika before union with Zanzibar?", answer: "Tanzania" },
  { text: "Which cloud type is most associated with thunderstorms?", answer: "Cumulonimbus" },
  { text: "Which country has the capital Lisbon?", answer: "Portugal" },
  { text: "Which country has the city of Nice?", answer: "France" },
  { text: "Which country hosted the 2008 Olympics?", answer: "China" },
  { text: "Which country is famous for the city of Machu Picchu?", answer: "Peru" },
  { text: "Which country is known as the Land of the Golden Fleece?", answer: "Georgia" },
  { text: "Which country won the 2024 Copa America?", answer: "Argentina" },
  { text: "Which element is essential for strong bones?", answer: "Calcium" },
  { text: "Which human organ is responsible for hearing?", answer: "Ear" },
  { text: "Which Nigerian city served as the capital of the Southern Protectorate before the amalgamation of 1914?", answer: "Calabar" },
  { text: "Which Nigerian state is known as the Centre of Excellence?", answer: "Lagos State" },
  { text: "Which Nigerian traditional city is famous for the Ooni?", answer: "Ile-Ife" },
  { text: "Which part of the brain controls breathing and heartbeat?", answer: "Medulla oblongata" },
  { text: "Which planet has the most known moons?", answer: "Saturn" },
  { text: "Which scientist discovered radioactivity?", answer: "Henri Becquerel" },
  { text: "Which scientist is known as the father of genetics?", answer: "Gregor Mendel" },
  { text: "Which sport uses the Stanley Cup?", answer: "Ice Hockey" },
]

const POOL_24: Omit<TBQuestion, 'id'>[] = [
  { text: "If the probability of rain is 0.25, what is it as a fraction?", answer: "1/4" },
  { text: "The sum of five consecutive numbers is 100. What is the middle number?", answer: "20" },
  { text: "What does Big Data refer to?", answer: "Very large data sets" },
  { text: "What does open-source software mean?", answer: "Software with publicly available source code" },
  { text: "What is a referendum?", answer: "Direct public vote on a specific issue" },
  { text: "What is the main purpose of a search engine?", answer: "To find information on the internet" },
  { text: "What is the next number: 2, 6, 12, 20, 30, ___?", answer: "42" },
  { text: "What is the square root of 144?", answer: "12" },
  { text: "Which African country contains Lake Nasser?", answer: "Egypt" },
  { text: "Which African country has the city of Antananarivo as its capital?", answer: "Madagascar" },
  { text: "Which African country has the city of Maseru as its capital?", answer: "Lesotho" },
  { text: "Which African country has the Namib Desert?", answer: "Namibia" },
  { text: "Which African country was formerly called Upper Volta?", answer: "Burkina Faso" },
  { text: "Which company created the Simon Personal Communicator?", answer: "IBM" },
  { text: "Which country has the capital Ljubljana?", answer: "Slovenia" },
  { text: "Which country has the city of Petra?", answer: "Jordan" },
  { text: "Which country hosted the 2010 FIFA World Cup?", answer: "South Africa" },
  { text: "Which country is famous for the Leaning Tower of Pisa?", answer: "Italy" },
  { text: "Which country is known as the Land of the Long White Cloud?", answer: "New Zealand" },
  { text: "Which country won the FIFA Women's World Cup in 2019?", answer: "United States" },
  { text: "Which empire was ruled by Sundiata Keita?", answer: "Mali Empire" },
  { text: "Which international organization was formed after World War II to maintain global peace?", answer: "United Nations" },
  { text: "Which Nigerian city served as the country's first capital after amalgamation?", answer: "Lagos" },
  { text: "Which Nigerian state is known as the Coal City State?", answer: "Enugu" },
  { text: "Which Nigerian traditional title is associated with the ruler of Benin Kingdom?", answer: "Oba of Benin" },
  { text: "Which part of the brain is involved in memory formation and is shaped like a seahorse?", answer: "Hippocampus" },
  { text: "Which planet has the shortest day?", answer: "Jupiter" },
  { text: "Which scientist discovered radium with Marie Curie?", answer: "Pierre Curie" },
  { text: "Which scientist is known for inventing the dynamite and establishing famous prizes?", answer: "Alfred Nobel" },
  { text: "Which sport uses the term 'checkmate'?", answer: "Chess" },
]

const POOL_25: Omit<TBQuestion, 'id'>[] = [
  { text: "If the sum of four consecutive numbers is 74, what is the smallest number?", answer: "17" },
  { text: "The sum of the interior angles of a hexagon is what?", answer: "720°" },
  { text: "What does biometric authentication use?", answer: "Body features" },
  { text: "What does PDF stand for?", answer: "Portable Document Format" },
  { text: "What is diplomacy?", answer: "Managing relations between countries" },
  { text: "What is the missing number: 4, 9, 16, 25, ___?", answer: "36" },
  { text: "What is the next number: 3, 5, 9, 17, 33, ___?", answer: "65" },
  { text: "What is the study of fossils called?", answer: "Paleontology" },
  { text: "Which African country contains Lake Victoria's largest share?", answer: "Tanzania" },
  { text: "Which African country has the city of Asmara as its capital?", answer: "Eritrea" },
  { text: "Which African country has the city of Mombasa on its coast?", answer: "Kenya" },
  { text: "Which African country has the Okavango Delta?", answer: "Botswana" },
  { text: "Which African country was formerly known as Abyssinia?", answer: "Ethiopia" },
  { text: "Which company developed Android before Google acquired it?", answer: "Android Inc." },
  { text: "Which country has the capital Manila?", answer: "Philippines" },
  { text: "Which country has the city of Porto?", answer: "Portugal" },
  { text: "Which country hosted the 2012 Olympics?", answer: "United Kingdom" },
  { text: "Which country is famous for tulips and windmills?", answer: "Netherlands" },
  { text: "Which country is known as the Land of the Maple Leaf?", answer: "Canada" },
  { text: "Which country won the FIFA World Cup in 2018?", answer: "France" },
  { text: "Which football club is nicknamed The Gunners?", answer: "Arsenal" },
  { text: "Which layer of Earth lies between the crust and the core?", answer: "Mantle" },
  { text: "Which Nigerian city was once the capital of the Northern Protectorate?", answer: "Zungeru" },
  { text: "Which Nigerian state is known as the Food Basket of the Nation?", answer: "Benue" },
  { text: "Which Nigerian woman became the first female Director-General of the World Trade Organization?", answer: "Ngozi Okonjo-Iweala" },
  { text: "Which part of the cell controls activities?", answer: "Nucleus" },
  { text: "Which planet is called the Red Planet?", answer: "Mars" },
  { text: "Which scientist discovered the circulation of blood?", answer: "William Harvey" },
  { text: "Which scientist is known for the equation E = mc²?", answer: "Albert Einstein" },
  { text: "Which sport uses the term 'grandmaster'?", answer: "Chess" },
]

const makeQ = (q: Omit<TBQuestion, 'id'>): TBQuestion => ({ ...q, id: uuid() })
const makePool = (title: string, arr: Omit<TBQuestion, 'id'>[]): TBPool => ({
  id: uuid(),
  title,
  questions: arr.map(makeQ),
})

const DEFAULT_POOLS = () => [
  makePool('Pool 1',  POOL_1),  makePool('Pool 2',  POOL_2),  makePool('Pool 3',  POOL_3),
  makePool('Pool 4',  POOL_4),  makePool('Pool 5',  POOL_5),  makePool('Pool 6',  POOL_6),
  makePool('Pool 7',  POOL_7),  makePool('Pool 8',  POOL_8),  makePool('Pool 9',  POOL_9),
  makePool('Pool 10', POOL_10), makePool('Pool 11', POOL_11), makePool('Pool 12', POOL_12),
  makePool('Pool 13', POOL_13), makePool('Pool 14', POOL_14), makePool('Pool 15', POOL_15),
  makePool('Pool 16', POOL_16), makePool('Pool 17', POOL_17), makePool('Pool 18', POOL_18),
  makePool('Pool 19', POOL_19), makePool('Pool 20', POOL_20), makePool('Pool 21', POOL_21),
  makePool('Pool 22', POOL_22), makePool('Pool 23', POOL_23), makePool('Pool 24', POOL_24),
  makePool('Pool 25', POOL_25),
]

// Blank pool used when the host clicks "+ New Pool"
const makeEmptyPool = (n: number): TBPool => ({
  id: uuid(),
  title: `Pool ${n}`,
  questions: [],
})

const DEFAULT_STATE = (): TBState => ({
  phase: 'setup',
  threeTeam: false,
  teamA: '', teamB: '', teamC: '',
  priorA: 0, priorB: 0, priorC: 0,
  pools: DEFAULT_POOLS(),
  chosenPoolA: null,
  chosenPoolB: null,
  chosenPoolC: null,
  queueA: [], queueB: [], queueC: [],
  scoreA: 0, scoreB: 0, scoreC: 0,
  correctA: 0, correctB: 0, correctC: 0,
  timerStart: null,
  currentQ: null,
  showAnswer: false,
})

export default function TieBreakerAdmin() {
  const [s, setS] = useState<TBState>(DEFAULT_STATE())
  const [poolTab, setPoolTab] = useState<number>(0)  // index of pool currently open for editing
  const [teams, setTeams] = useState<RegisteredTeam[]>([])
  const [savedTBMatches, setSavedTBMatches] = useState<SavedTBMatch[]>([])
  const savedTBRef = useRef<SavedTBMatch[]>([])
  savedTBRef.current = savedTBMatches
  // Pool IDs already used in any saved (undeleted) match — hidden from the
  // setup dropdowns so the same pool can't be replayed.
  const usedPoolIds = new Set<string>(
    savedTBMatches.flatMap(m => [m.poolAId, m.poolBId, m.poolCId].filter(Boolean) as string[])
  )
  const [editingQ, setEditingQ] = useState<string | null>(null)
  const [newQ, setNewQ] = useState({ text: '', answer: '' })
  const [timeLeft, setTimeLeft] = useState(ROUND_MS)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Grace window — 10s of extra time after the 30s expires so admin can still
  // grade a last-second answer that came in right at the buzzer.
  const TB_GRACE_MS = 5_000
  const [tbGraceStart, setTbGraceStart] = useState<number | null>(null)
  const tbGraceStartRef = useRef<number | null>(null)
  tbGraceStartRef.current = tbGraceStart
  const [tbGraceMs, setTbGraceMs] = useState(0)
  // Refs to coordinate hydration + broadcast so we don't overwrite existing
  // DB state with the fresh DEFAULT_STATE we start with on page load.
  const hydrated = useRef(false)                 // have we accepted the DB's current state yet?
  const skipNextBroadcast = useRef(true)         // silence the very next broadcast after hydration

  const broadcast = useCallback((st: TBState) => wsBroadcast(CHANNEL, st), [])
  const update = useCallback((patch: Partial<TBState>) => {
    setS(prev => ({ ...prev, ...patch }))
  }, [])

  // On mount: subscribe to the shared state row. The FIRST payload we see is
  // the current DB state — if we haven't started making changes locally, we
  // hydrate from it so a page reload mid-round resumes cleanly.
  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, (payload) => {
      if (hydrated.current) return
      hydrated.current = true
      skipNextBroadcast.current = true         // skip the setS-triggered broadcast
      // Migrate a pre-refactor payload that has no `pools` field. Rather than
      // crash, we backfill with the default 3 pools so the setup screen still
      // works — the admin can pick or edit from there.
      const raw = payload as Partial<TBState>
      // Legacy phases from the pre-refactor flow — bump them into the new flow.
      const legacyPhase = raw.phase as string | undefined
      const migratedPhase: TBPhase =
        legacyPhase === 'break' ? 'score_a'
        : legacyPhase === 'done'  ? 'compare'
        : (legacyPhase as TBPhase | undefined) ?? 'setup'
      const migrated: TBState = {
        ...DEFAULT_STATE(),
        ...raw,
        phase: migratedPhase,
        // Upgrade path: if the stored payload has fewer pools than the code
        // ships, replace with fresh defaults so admins on a new build see
        // the full set. Pre-refactor rows had 3 pools; current build has 25.
        pools: (raw.pools && raw.pools.length >= DEFAULT_POOLS().length) ? raw.pools : DEFAULT_POOLS(),
      }
      setS(migrated)
    })
    // If nothing arrives from the DB after 800ms, assume there's no prior
    // state and unlock our broadcast so the first user action publishes.
    const t = setTimeout(() => { hydrated.current = true }, 800)
    return () => { unsub(); clearTimeout(t) }
  }, [])

  // Broadcast whenever local state changes, but skip the initial render and
  // the setS that happens as a result of hydration.
  useEffect(() => {
    if (skipNextBroadcast.current) { skipNextBroadcast.current = false; return }
    broadcast(s)
  }, [s, broadcast])

  // Load registered teams for the dropdown
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Use the service-role client (matches how the FSC admin loads teams)
        // so RLS on fsc_teams doesn't wipe out the list, and drop the status
        // filter so newly added teams appear even if their status isn't set.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabaseAdmin as any)
          .from('fsc_teams')
          .select('*')
          .order('created_at')
        if (!cancelled && data) setTeams(data as RegisteredTeam[])
      } catch { /* offline — plain text inputs will show */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Load past tie-breaker matches so used pools can be locked out.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await getSavedTBMatches()
      if (!cancelled) setSavedTBMatches(list)
    })()
    return () => { cancelled = true }
  }, [])

  // 30-second countdown for whichever team is currently playing.
  // On expiry, auto-transition to the break screen (team A) or done (team B).
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!s.timerStart || (s.phase !== 'a_playing' && s.phase !== 'b_playing' && s.phase !== 'c_playing')) {
      setTimeLeft(ROUND_MS)
      return
    }
    // Fresh turn → clear any stale grace from the previous team's expiry.
    setTbGraceStart(null); tbGraceStartRef.current = null; setTbGraceMs(0)

    const tick = () => {
      const left = Math.max(0, ROUND_MS - (Date.now() - s.timerStart!))
      setTimeLeft(left)
      // Open the grace window the moment the 30s runs out — do NOT flip yet.
      if (left === 0 && tbGraceStartRef.current === null) {
        const now = Date.now()
        setTbGraceStart(now); tbGraceStartRef.current = now
      }
      // Count the grace window down separately.
      if (tbGraceStartRef.current !== null) {
        const graceLeft = Math.max(0, TB_GRACE_MS - (Date.now() - tbGraceStartRef.current))
        setTbGraceMs(graceLeft)
        if (graceLeft === 0) {
          clearInterval(timerRef.current!)
          const nextPhase: TBPhase =
            s.phase === 'a_playing' ? 'score_a'
            : s.phase === 'b_playing' ? 'score_b'
            : 'score_c'
          update({ phase: nextPhase, timerStart: null, currentQ: null, showAnswer: false })
          setTbGraceStart(null); tbGraceStartRef.current = null; setTbGraceMs(0)
        }
      }
    }
    tick()
    timerRef.current = setInterval(tick, 200)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.timerStart, s.phase])

  // ── Actions ──────────────────────────────────────────────────────────────
  const isPlayingA = s.phase === 'a_playing'
  const isPlayingB = s.phase === 'b_playing'
  const isPlayingC = s.phase === 'c_playing'
  const activeQueue: TBQuestion[] = isPlayingA ? s.queueA : isPlayingB ? s.queueB : isPlayingC ? (s.queueC ?? []) : []
  // Guard everywhere against missing pools — a DB row from before the refactor
  // won't have this field, so we normalise defensively.
  const safePools = s.pools ?? []
  const chosenPoolA = safePools.find(p => p.id === s.chosenPoolA) ?? null
  const chosenPoolB = safePools.find(p => p.id === s.chosenPoolB) ?? null
  const chosenPoolC = safePools.find(p => p.id === s.chosenPoolC) ?? null
  // Which pool is the currently-playing team on? Used for headers + break/done screens.
  const activePool = isPlayingA ? chosenPoolA : isPlayingB ? chosenPoolB : isPlayingC ? chosenPoolC : null

  // Setup → Intro: pools + names locked in, show instructions on projector.
  function goToInstructions() {
    if (!s.teamA.trim() || !s.teamB.trim()) return
    if (!chosenPoolA || !chosenPoolB) return
    if (chosenPoolA.questions.length === 0 || chosenPoolB.questions.length === 0) return
    if (usedPoolIds.has(chosenPoolA.id) || usedPoolIds.has(chosenPoolB.id)) return
    // Distinct pools per team
    if (s.chosenPoolA === s.chosenPoolB) return
    if (s.threeTeam) {
      if (!(s.teamC ?? '').trim()) return
      if (!chosenPoolC || chosenPoolC.questions.length === 0) return
      if (usedPoolIds.has(chosenPoolC.id)) return
      if (s.chosenPoolC === s.chosenPoolA || s.chosenPoolC === s.chosenPoolB) return
    }
    update({ phase: 'intro' })
  }
  function goToAnnounceA() { update({ phase: 'announce_a' }) }
  function goToAnnounceB() { update({ phase: 'announce_b' }) }
  function goToAnnounceC() { update({ phase: 'announce_c' }) }
  function goToCompare() {
    update({ phase: 'compare' })
    // Persist the match on transition to compare — this is where scores are
    // final and every pool has definitely been played through.
    const poolA = safePools.find(p => p.id === s.chosenPoolA)
    const poolB = safePools.find(p => p.id === s.chosenPoolB)
    if (!poolA || !poolB) return
    // Winner logic: 2-team mode = simple compare. 3-team mode = highest score
    // wins, ties named together.
    let winner: string
    if (s.threeTeam) {
      const scoreC = s.scoreC ?? 0
      const rows = [
        { name: s.teamA, score: s.scoreA },
        { name: s.teamB, score: s.scoreB },
        { name: s.teamC ?? 'Team C', score: scoreC },
      ]
      const top = Math.max(...rows.map(r => r.score))
      const leaders = rows.filter(r => r.score === top)
      winner = leaders.length === 1 ? leaders[0].name : leaders.map(l => l.name).join(', ') + ' (tie)'
    } else {
      winner = s.scoreA > s.scoreB ? s.teamA : s.scoreB > s.scoreA ? s.teamB : 'Tie'
    }
    const record: SavedTBMatch = {
      id: uuid(),
      teamA: s.teamA, teamB: s.teamB,
      poolAId: poolA.id, poolBId: poolB.id,
      poolATitle: poolA.title, poolBTitle: poolB.title,
      scoreA: s.scoreA, scoreB: s.scoreB,
      correctA: s.correctA, correctB: s.correctB,
      winner,
      played_at: new Date().toISOString(),
      ...(s.threeTeam && chosenPoolC ? {
        teamC: s.teamC,
        poolCId: chosenPoolC.id,
        poolCTitle: chosenPoolC.title,
        scoreC: s.scoreC ?? 0,
        correctC: s.correctC ?? 0,
      } : {}),
    }
    const next = [...savedTBRef.current, record]
    setSavedTBMatches(next)
    void saveTBMatchesList(next)
  }

  function startTeamA() {
    if (!chosenPoolA || chosenPoolA.questions.length === 0) return
    const queue = chosenPoolA.questions.map(q => ({ ...q }))
    update({
      phase: 'a_playing',
      queueA: queue,
      scoreA: 0,
      correctA: 0,
      timerStart: Date.now(),
      currentQ: queue[0] ?? null,
      showAnswer: false,
    })
  }

  function startTeamB() {
    if (!chosenPoolB || chosenPoolB.questions.length === 0) return
    const queue = chosenPoolB.questions.map(q => ({ ...q }))
    update({
      phase: 'b_playing',
      queueB: queue,
      scoreB: 0,
      correctB: 0,
      timerStart: Date.now(),
      currentQ: queue[0] ?? null,
      showAnswer: false,
    })
  }

  function startTeamC() {
    if (!chosenPoolC || chosenPoolC.questions.length === 0) return
    const queue = chosenPoolC.questions.map(q => ({ ...q }))
    update({
      phase: 'c_playing',
      queueC: queue,
      scoreC: 0,
      correctC: 0,
      timerStart: Date.now(),
      currentQ: queue[0] ?? null,
      showAnswer: false,
    })
  }

  function markCorrect() {
    if (activeQueue.length === 0) return
    const [, ...rest] = activeQueue
    // Auto-advance to the score reveal if the queue just emptied — no need
    // to burn the rest of the 30 seconds on a dead queue.
    const queueEmpty = rest.length === 0
    if (isPlayingA) {
      update({
        queueA: rest,
        scoreA: s.scoreA + PTS_CORRECT,
        correctA: s.correctA + 1,
        currentQ: rest[0] ?? null,
        showAnswer: false,
        ...(queueEmpty ? { phase: 'score_a' as const, timerStart: null } : {}),
      })
    } else if (isPlayingB) {
      update({
        queueB: rest,
        scoreB: s.scoreB + PTS_CORRECT,
        correctB: s.correctB + 1,
        currentQ: rest[0] ?? null,
        showAnswer: false,
        ...(queueEmpty ? { phase: 'score_b' as const, timerStart: null } : {}),
      })
    } else if (isPlayingC) {
      update({
        queueC: rest,
        scoreC: (s.scoreC ?? 0) + PTS_CORRECT,
        correctC: (s.correctC ?? 0) + 1,
        currentQ: rest[0] ?? null,
        showAnswer: false,
        ...(queueEmpty ? { phase: 'score_c' as const, timerStart: null } : {}),
      })
    }
  }

  // Wrong or skip: put current question at the back of the queue, no points lost.
  function recycle() {
    if (activeQueue.length === 0) return
    const [first, ...rest] = activeQueue
    const next = [...rest, first]
    if (isPlayingA) update({ queueA: next, currentQ: next[0] ?? null, showAnswer: false })
    else if (isPlayingB) update({ queueB: next, currentQ: next[0] ?? null, showAnswer: false })
    else if (isPlayingC) update({ queueC: next, currentQ: next[0] ?? null, showAnswer: false })
  }

  function endRoundEarly() {
    // Explicit end clears the grace window too.
    setTbGraceStart(null); tbGraceStartRef.current = null; setTbGraceMs(0)
    if (isPlayingA) update({ phase: 'score_a', timerStart: null, currentQ: null, showAnswer: false })
    else if (isPlayingB) update({ phase: 'score_b', timerStart: null, currentQ: null, showAnswer: false })
    else if (isPlayingC) update({ phase: 'score_c', timerStart: null, currentQ: null, showAnswer: false })
  }

  // Runs another rapid-fire — same teams, questions cycled from the start.
  function playAnotherRound() {
    update({
      phase: 'setup',
      chosenPoolA: null, chosenPoolB: null, chosenPoolC: null,
      queueA: [], queueB: [], queueC: [],
      scoreA: 0, scoreB: 0, scoreC: 0, correctA: 0, correctB: 0, correctC: 0,
      timerStart: null, currentQ: null, showAnswer: false,
    })
  }

  const reset = () => update(DEFAULT_STATE())

  // Pool editing — always targets the pool currently open in the tabs.
  const updatePoolTitle = (val: string) => {
    setS(p => ({
      ...p,
      pools: p.pools.map((pl, i) => i === poolTab ? { ...pl, title: val } : pl),
    }))
  }
  const updateQ = (id: string, field: 'text' | 'answer', val: string) => {
    setS(p => ({
      ...p,
      pools: p.pools.map((pl, i) =>
        i === poolTab ? { ...pl, questions: pl.questions.map(q => q.id === id ? { ...q, [field]: val } : q) } : pl
      ),
    }))
  }
  const deleteQ = (id: string) => {
    setS(p => ({
      ...p,
      pools: p.pools.map((pl, i) =>
        i === poolTab ? { ...pl, questions: pl.questions.filter(q => q.id !== id) } : pl
      ),
    }))
  }
  const addQ = () => {
    if (!newQ.text.trim()) return
    setS(p => ({
      ...p,
      pools: p.pools.map((pl, i) =>
        i === poolTab
          ? { ...pl, questions: [...pl.questions, makeQ({ text: newQ.text.trim(), answer: newQ.answer.trim() })] }
          : pl
      ),
    }))
    setNewQ({ text: '', answer: '' })
  }
  const currentEditingPool = s.pools[poolTab]
  const currentEditingQs = currentEditingPool?.questions ?? []
  const poolReady = (i: number) => (s.pools[i]?.questions.length ?? 0) > 0 && (s.pools[i]?.questions ?? []).every(q => q.answer.trim())

  // ── Derived render values ───────────────────────────────────────────────
  const timePct = timeLeft / ROUND_MS
  const currentQ: TBQuestion | undefined = activeQueue[0]
  const winnerText = s.scoreA > s.scoreB ? s.teamA
                    : s.scoreB > s.scoreA ? s.teamB
                    : 'It\'s a tie — run another round'

  return (
    <div className="h-screen bg-[#0a1628] text-white p-3 overflow-hidden">
      <div className="max-w-4xl mx-auto space-y-3 h-full overflow-y-auto pr-1">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-pink-300 text-[10px] font-bold uppercase tracking-widest">Admin Control</p>
            <h1 className="text-white text-lg font-black">🔔 Tie Breaker · Rapid Fire</h1>
          </div>
          <div className="flex gap-2">
            <a href="/tie-breaker/audience" target="_blank" rel="noopener noreferrer"
              className="text-xs bg-purple-600/30 border border-purple-500/40 text-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-600/50">
              Audience ↗
            </a>
            {s.phase !== 'setup' && (
              <button onClick={reset} className="text-xs bg-red-600/20 border border-red-500/30 text-red-400 px-3 py-1.5 rounded-lg">
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Score strip */}
        <div className={`grid ${s.threeTeam ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
          <div className={`rounded-xl p-3 text-center border ${
            isPlayingA ? 'bg-green-500/20 border-green-500' : 'bg-white/5 border-white/10'
          }`}>
            {isPlayingA && <p className="text-green-300 text-[10px] font-bold uppercase tracking-widest">Playing</p>}
            <p className="text-slate-300 text-xs font-semibold truncate">{s.teamA || 'Team A'}</p>
            <p className="text-white text-2xl font-black">{s.scoreA}</p>
            {s.priorA > 0 && <p className="text-slate-500 text-[10px]">Prior: {s.priorA}</p>}
          </div>
          <div className={`rounded-xl p-3 text-center border ${
            isPlayingB ? 'bg-blue-500/20 border-blue-500' : 'bg-white/5 border-white/10'
          }`}>
            {isPlayingB && <p className="text-blue-300 text-[10px] font-bold uppercase tracking-widest">Playing</p>}
            <p className="text-slate-300 text-xs font-semibold truncate">{s.teamB || 'Team B'}</p>
            <p className="text-white text-2xl font-black">{s.scoreB}</p>
            {s.priorB > 0 && <p className="text-slate-500 text-[10px]">Prior: {s.priorB}</p>}
          </div>
          {s.threeTeam && (
            <div className={`rounded-xl p-3 text-center border ${
              isPlayingC ? 'bg-purple-500/20 border-purple-500' : 'bg-white/5 border-white/10'
            }`}>
              {isPlayingC && <p className="text-purple-300 text-[10px] font-bold uppercase tracking-widest">Playing</p>}
              <p className="text-slate-300 text-xs font-semibold truncate">{s.teamC || 'Team C'}</p>
              <p className="text-white text-2xl font-black">{s.scoreC ?? 0}</p>
              {(s.priorC ?? 0) > 0 && <p className="text-slate-500 text-[10px]">Prior: {s.priorC}</p>}
            </div>
          )}
        </div>

        {/* Setup */}
        {s.phase === 'setup' && (
          <div className="space-y-3">
            <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-4 space-y-3">
              <h2 className="text-white font-bold text-sm">Team Names &amp; Prior Scores</h2>
              <p className="text-slate-400 text-xs">
                Rapid fire: each team gets <b className="text-white">30 seconds</b> to answer as many
                questions as they can. <b className="text-white">+1</b> per correct, no negative marks.
                Wrong or skipped questions cycle to the back so teams can retry.
              </p>
              <label className="flex items-center gap-2 rounded-lg bg-purple-500/10 border border-purple-500/40 px-3 py-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!s.threeTeam}
                  onChange={e => update({ threeTeam: e.target.checked } as Partial<TBState>)}
                  className="w-4 h-4 accent-purple-500"
                />
                <span className="text-purple-200 text-xs font-bold uppercase tracking-widest">3-team tie-breaker</span>
                <span className="text-purple-300/60 text-[10px] italic ml-auto">Use when the MC round is tied between 3 teams</span>
              </label>
              <div className={`grid ${s.threeTeam ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
                {(s.threeTeam ? (['A', 'B', 'C'] as const) : (['A', 'B'] as const)).map(letter => {
                  const nameKey = `team${letter}` as const
                  const priorKey = `prior${letter}` as const
                  return (
                    <div key={letter} className="space-y-1.5">
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Team {letter}</label>
                      {teams.length > 0 ? (
                        <select
                          value={s[nameKey] ?? ''}
                          onChange={e => update({ [nameKey]: e.target.value } as Partial<TBState>)}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm">
                          <option value="">— select team —</option>
                          {teams.map(t => (
                            <option key={t.id} value={t.name}>{t.name}{t.school ? ` (${t.school})` : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={s[nameKey] ?? ''}
                          onChange={e => update({ [nameKey]: e.target.value } as Partial<TBState>)}
                          placeholder={`Team ${letter} name`}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm" />
                      )}
                      <input
                        type="number" min="0"
                        value={s[priorKey] || ''}
                        onChange={e => update({ [priorKey]: Number(e.target.value) || 0 } as Partial<TBState>)}
                        placeholder="Prior score (optional)"
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm" />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Pool editor — one tab per pool, "+ New Pool" adds another */}
            <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-white font-bold text-sm">Edit Pools</h2>
                <button onClick={() => {
                  const nextIdx = safePools.length + 1
                  const newPool = makeEmptyPool(nextIdx)
                  setS(p => ({ ...p, pools: [...(p.pools ?? []), newPool] }))
                  setPoolTab(safePools.length)   // jump to the new tab
                  setEditingQ(null)
                }}
                  className="text-[10px] bg-purple-600/40 hover:bg-purple-600/70 text-purple-200 px-2 py-1 rounded font-bold">
                  + New Pool
                </button>
              </div>
              <div className="flex gap-2 border-b border-slate-700 pb-1 flex-wrap">
                {safePools.map((pl, i) => (
                  <div key={pl.id} className="flex items-center gap-1">
                    <button onClick={() => { setPoolTab(i); setEditingQ(null) }}
                      className={`text-xs font-bold px-3 py-1.5 rounded-t-lg transition-colors ${
                        poolTab === i
                          ? 'bg-purple-700/40 text-white border border-purple-500/40'
                          : 'text-slate-400 hover:text-white'
                      }`}>
                      Pool {i + 1} ({pl.questions.length})
                      {poolReady(i) && <span className="text-green-400 ml-1">✓</span>}
                    </button>
                    {safePools.length > 1 && (
                      <button
                        onClick={() => {
                          if (!window.confirm(`Delete Pool ${i + 1}? This can't be undone.`)) return
                          setS(p => {
                            const newPools = (p.pools ?? []).filter((_, idx) => idx !== i)
                            return {
                              ...p,
                              pools: newPools,
                              chosenPoolA: p.chosenPoolA === pl.id ? null : p.chosenPoolA,
                              chosenPoolB: p.chosenPoolB === pl.id ? null : p.chosenPoolB,
                            }
                          })
                          setPoolTab(t => Math.max(0, t >= i ? t - 1 : t))
                          setEditingQ(null)
                        }}
                        title={`Delete Pool ${i + 1}`}
                        className="text-[10px] text-slate-600 hover:text-red-400 px-1 py-0.5 rounded hover:bg-slate-700">
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Pool title */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">Pool title</label>
                <input value={currentEditingPool?.title ?? ''} onChange={e => updatePoolTitle(e.target.value)}
                  placeholder="e.g. Pool 1"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-sm" />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400 font-semibold">
                  Pool {poolTab + 1} questions ({currentEditingQs.length}) — fill in ALL answers
                </label>
              </div>

              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {currentEditingQs.map((q, i) => (
                  <div key={q.id} className="bg-slate-800/60 rounded-lg p-2 flex items-start gap-2">
                    <span className="text-[10px] text-slate-500 font-bold w-5 shrink-0 mt-1">{i + 1}</span>
                    <div className="flex-1 space-y-1">
                      {editingQ === q.id ? (<>
                        <input
                          value={q.text}
                          onChange={e => updateQ(q.id, 'text', e.target.value)}
                          className="w-full bg-slate-700 border border-slate-500 rounded px-2 py-1 text-white text-xs"
                          placeholder="Question" autoFocus />
                        <input
                          value={q.answer}
                          onChange={e => updateQ(q.id, 'answer', e.target.value)}
                          className="w-full bg-slate-700 border border-green-500/40 rounded px-2 py-1 text-green-300 text-xs"
                          placeholder="Answer" />
                        <button onClick={() => setEditingQ(null)} className="text-[10px] text-purple-400 hover:text-purple-300">Done editing</button>
                      </>) : (<>
                        <p className="text-white text-xs leading-snug">{q.text}</p>
                        <p className={`text-[10px] ${q.answer ? 'text-green-400' : 'text-red-400/70 italic'}`}>
                          {q.answer ? `A: ${q.answer}` : '⚠ Answer not set'}
                        </p>
                      </>)}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {editingQ !== q.id && (
                        <button onClick={() => setEditingQ(q.id)} className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-700">Edit</button>
                      )}
                      <button onClick={() => deleteQ(q.id)} className="text-[10px] text-slate-600 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-slate-700">✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-slate-800/40 rounded-lg p-2 space-y-1 border border-dashed border-slate-600">
                <input value={newQ.text} onChange={e => setNewQ(p => ({ ...p, text: e.target.value }))}
                  placeholder="New question…" className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs" />
                <input value={newQ.answer} onChange={e => setNewQ(p => ({ ...p, answer: e.target.value }))}
                  placeholder="Answer…" onKeyDown={e => e.key === 'Enter' && addQ()}
                  className="w-full bg-slate-700 border border-green-500/30 rounded px-2 py-1 text-green-300 text-xs" />
                <button onClick={addQ} disabled={!newQ.text.trim()}
                  className="text-[10px] bg-purple-600/40 hover:bg-purple-600/70 disabled:opacity-40 text-purple-300 px-2 py-1 rounded font-semibold">
                  + Add to Pool {poolTab + 1}
                </button>
              </div>
            </div>

            {/* Pool selection — one pool per team, must be different */}
            <div className="bg-[#0d1f3c] border border-pink-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-white font-bold text-sm">Assign a Pool to Each Team</h2>
                <p className="text-slate-500 text-[10px]">Must be different pools</p>
              </div>
              <div className={`grid ${s.threeTeam ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
                {(s.threeTeam ? (['A', 'B', 'C'] as const) : (['A', 'B'] as const)).map(letter => {
                  const key = `chosenPool${letter}` as const
                  const otherKeys = (['A', 'B', 'C'] as const).filter(l => l !== letter).map(l => `chosenPool${l}` as const)
                  const teamName = s[`team${letter}` as const] || `Team ${letter}`
                  const colour = letter === 'A' ? 'green' : letter === 'B' ? 'blue' : 'purple'
                  return (
                    <div key={letter} className="space-y-1.5">
                      <label className={`text-[10px] text-${colour}-400 font-bold uppercase tracking-widest`}>
                        Pool for {teamName}
                      </label>
                      <select
                        value={(s[key] as string | null | undefined) ?? ''}
                        onChange={e => update({ [key]: e.target.value || null } as Partial<TBState>)}
                        className={`w-full bg-slate-800 border border-${colour}-500/40 rounded-lg px-2 py-2 text-white text-sm`}>
                        <option value="">— select a pool —</option>
                        {safePools.map((pl, i) => {
                          const takenByOther = otherKeys.some(k => pl.id === s[k])
                          const alreadyPlayed = usedPoolIds.has(pl.id)
                          return (
                            <option key={pl.id} value={pl.id} disabled={takenByOther || alreadyPlayed || pl.questions.length === 0}>
                              Pool {i + 1} · {pl.title} ({pl.questions.length}q){takenByOther ? ' — taken' : ''}{alreadyPlayed ? ' — already played' : ''}{pl.questions.length === 0 ? ' — empty' : ''}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  )
                })}
              </div>
              {(chosenPoolA && usedPoolIds.has(chosenPoolA.id)) || (chosenPoolB && usedPoolIds.has(chosenPoolB.id)) || (s.threeTeam && chosenPoolC && usedPoolIds.has(chosenPoolC.id)) ? (
                <p className="text-red-300 text-xs bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2 text-center">
                  ⚠️ One or more chosen pools have already been used in a past tie-breaker. Pick fresh pools for every team.
                </p>
              ) : null}
              <button
                onClick={goToInstructions}
                disabled={
                  !s.teamA.trim() || !s.teamB.trim() || !chosenPoolA || !chosenPoolB
                  || s.chosenPoolA === s.chosenPoolB
                  || chosenPoolA.questions.length === 0 || chosenPoolB.questions.length === 0
                  || usedPoolIds.has(chosenPoolA.id) || usedPoolIds.has(chosenPoolB.id)
                  || (s.threeTeam && (
                    !(s.teamC ?? '').trim() || !chosenPoolC || chosenPoolC.questions.length === 0
                    || usedPoolIds.has(chosenPoolC.id)
                    || s.chosenPoolC === s.chosenPoolA || s.chosenPoolC === s.chosenPoolB
                  ))
                }
                className="w-full bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl text-sm">
                📋 Show Instructions on Screen
              </button>
              <p className="text-slate-500 text-[10px] text-center">
                Read the rules to the room, then advance to announce {s.teamA || 'Team A'}.
              </p>
            </div>

            {/* Saved tie-breaker matches — pools already played are locked
                until the match is deleted. */}
            {savedTBMatches.length > 0 && (
              <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-white font-bold text-sm">Past Tie-Breaker Matches</h2>
                  <span className="text-[10px] text-slate-500">{savedTBMatches.length} played</span>
                </div>
                <div className="space-y-1.5">
                  {savedTBMatches.map(m => (
                    <div key={m.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-bold truncate">
                          {m.teamA} <span className="text-slate-500">vs</span> {m.teamB}
                          {m.teamC && <><span className="text-slate-500"> vs</span> {m.teamC}</>}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {m.poolATitle} · {m.poolBTitle}{m.poolCTitle ? ` · ${m.poolCTitle}` : ''}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          <span className="text-green-400 font-bold">{m.scoreA}</span>
                          <span className="mx-1 text-slate-600">—</span>
                          <span className="text-blue-400 font-bold">{m.scoreB}</span>
                          {m.teamC && <>
                            <span className="mx-1 text-slate-600">—</span>
                            <span className="text-purple-400 font-bold">{m.scoreC ?? 0}</span>
                          </>}
                          <span className="mx-1 text-slate-600">·</span>
                          🏆 {m.winner}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if (!window.confirm(`Delete this match? Pools "${m.poolATitle}" and "${m.poolBTitle}" will become selectable again.`)) return
                          const next = savedTBMatches.filter(x => x.id !== m.id)
                          setSavedTBMatches(next)
                          void saveTBMatchesList(next)
                        }}
                        title="Delete match — reopens its pools"
                        className="shrink-0 text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded text-xs font-black">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 italic">Deleting a match reopens its pools for reuse in a future tie-breaker.</p>
              </div>
            )}
          </div>
        )}

        {/* Intro — instructions live on the projector; admin reads then continues */}
        {s.phase === 'intro' && (
          <div className="bg-gradient-to-br from-pink-500/10 to-[#0a1628] border border-pink-500/40 rounded-2xl p-5 space-y-4 text-center">
            <p className="text-pink-300 text-[10px] font-bold uppercase tracking-[0.3em]">Instructions on Projector</p>
            <p className="text-white text-lg font-black leading-snug">
              Read the tie-breaker rules to {s.teamA} and {s.teamB}, then advance when they&apos;re ready.
            </p>
            <p className="text-slate-400 text-xs">
              Pool for <b className="text-green-400">{s.teamA}</b>: {chosenPoolA?.title}
              <span className="mx-2 text-slate-600">·</span>
              Pool for <b className="text-blue-400">{s.teamB}</b>: {chosenPoolB?.title}
            </p>
            <button
              onClick={goToAnnounceA}
              className="w-full bg-pink-600 hover:bg-pink-500 text-white font-black py-3 rounded-xl text-sm">
              ▶ Announce {s.teamA || 'Team A'}
            </button>
            <button
              onClick={() => update({ phase: 'setup' })}
              className="w-full bg-transparent hover:bg-white/5 text-slate-400 py-1.5 rounded-lg text-[10px]">
              ← Back to setup
            </button>
          </div>
        )}

        {/* Announce Team A — projector shows big "Team A up next" screen */}
        {s.phase === 'announce_a' && (
          <div className="bg-gradient-to-br from-green-500/10 to-[#0a1628] border border-green-500/40 rounded-2xl p-5 space-y-4 text-center">
            <p className="text-green-300 text-[10px] font-bold uppercase tracking-[0.3em]">Up Next</p>
            <p className="text-white text-2xl font-black">{s.teamA}</p>
            <p className="text-slate-400 text-xs">
              Playing <b className="text-white">{chosenPoolA?.title}</b> · 30 seconds
            </p>
            <button
              onClick={startTeamA}
              disabled={!chosenPoolA || chosenPoolA.questions.length === 0}
              className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-black py-3 rounded-xl text-sm">
              ▶ Start {s.teamA}&apos;s 30 seconds
            </button>
          </div>
        )}

        {/* Score reveal — Team A */}
        {s.phase === 'score_a' && (
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-green-500/15 to-[#0a1628] border-2 border-green-500/50 rounded-2xl p-5 text-center space-y-2">
              <p className="text-green-300 text-[10px] font-bold uppercase tracking-[0.3em]">{s.teamA} — Score</p>
              <p className="text-white text-6xl font-black">{s.scoreA}</p>
              <p className="text-slate-400 text-xs">
                {s.correctA} correct · {chosenPoolA?.title}
              </p>
            </div>
            <button
              onClick={goToAnnounceB}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl text-sm">
              ▶ Announce {s.teamB || 'Team B'}
            </button>
          </div>
        )}

        {/* Announce Team B */}
        {s.phase === 'announce_b' && (
          <div className="bg-gradient-to-br from-blue-500/10 to-[#0a1628] border border-blue-500/40 rounded-2xl p-5 space-y-4 text-center">
            <p className="text-blue-300 text-[10px] font-bold uppercase tracking-[0.3em]">Up Next</p>
            <p className="text-white text-2xl font-black">{s.teamB}</p>
            <p className="text-slate-400 text-xs">
              Playing <b className="text-white">{chosenPoolB?.title}</b> · 30 seconds
            </p>
            <button
              onClick={startTeamB}
              disabled={!chosenPoolB || chosenPoolB.questions.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-black py-3 rounded-xl text-sm">
              ▶ Start {s.teamB}&apos;s 30 seconds
            </button>
          </div>
        )}

        {/* Score reveal — Team B */}
        {s.phase === 'score_b' && (
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-blue-500/15 to-[#0a1628] border-2 border-blue-500/50 rounded-2xl p-5 text-center space-y-2">
              <p className="text-blue-300 text-[10px] font-bold uppercase tracking-[0.3em]">{s.teamB} — Score</p>
              <p className="text-white text-6xl font-black">{s.scoreB}</p>
              <p className="text-slate-400 text-xs">
                {s.correctB} correct · {chosenPoolB?.title}
              </p>
            </div>
            {s.threeTeam ? (
              <button
                onClick={goToAnnounceC}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-black py-3 rounded-xl text-sm">
                ▶ Announce {s.teamC || 'Team C'}
              </button>
            ) : (
              <button
                onClick={goToCompare}
                className="w-full bg-pink-600 hover:bg-pink-500 text-white font-black py-3 rounded-xl text-sm">
                ▶ Show Final Comparison
              </button>
            )}
          </div>
        )}

        {/* Announce Team C (3-team mode only) */}
        {s.phase === 'announce_c' && (
          <div className="bg-gradient-to-br from-purple-500/10 to-[#0a1628] border border-purple-500/40 rounded-2xl p-5 space-y-4 text-center">
            <p className="text-purple-300 text-[10px] font-bold uppercase tracking-[0.3em]">Up Next</p>
            <p className="text-white text-2xl font-black">{s.teamC}</p>
            <p className="text-slate-400 text-xs">
              Playing <b className="text-white">{chosenPoolC?.title}</b> · 30 seconds
            </p>
            <button
              onClick={startTeamC}
              disabled={!chosenPoolC || chosenPoolC.questions.length === 0}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-black py-3 rounded-xl text-sm">
              ▶ Start {s.teamC}&apos;s 30 seconds
            </button>
          </div>
        )}

        {/* Score reveal — Team C (3-team mode only) */}
        {s.phase === 'score_c' && (
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-purple-500/15 to-[#0a1628] border-2 border-purple-500/50 rounded-2xl p-5 text-center space-y-2">
              <p className="text-purple-300 text-[10px] font-bold uppercase tracking-[0.3em]">{s.teamC} — Score</p>
              <p className="text-white text-6xl font-black">{s.scoreC ?? 0}</p>
              <p className="text-slate-400 text-xs">
                {s.correctC ?? 0} correct · {chosenPoolC?.title}
              </p>
            </div>
            <button
              onClick={goToCompare}
              className="w-full bg-pink-600 hover:bg-pink-500 text-white font-black py-3 rounded-xl text-sm">
              ▶ Show Final Comparison
            </button>
          </div>
        )}

        {/* Playing (any team) */}
        {(isPlayingA || isPlayingB || isPlayingC) && (
          <div className="space-y-3">
            {/* Timer */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${isPlayingA ? 'text-green-300' : isPlayingB ? 'text-blue-300' : 'text-purple-300'}`}>
                    {isPlayingA ? s.teamA : isPlayingB ? s.teamB : s.teamC} · Rapid Fire
                  </p>
                  <p className="text-white text-sm font-bold">
                    {activeQueue.length} left {activePool ? `· ${activePool.title}` : ''}
                  </p>
                </div>
                <p className={`text-4xl font-black tabular-nums ${
                  timePct > 0.4 ? 'text-green-400' : timePct > 0.2 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {(timeLeft / 1000).toFixed(1)}s
                </p>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    timePct > 0.4 ? 'bg-green-400' : timePct > 0.2 ? 'bg-yellow-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${timePct * 100}%` }} />
              </div>
            </div>

            {tbGraceStart !== null && (
              <div className="rounded-xl border-2 border-amber-400/60 bg-amber-500/15 p-3 text-center animate-pulse">
                <p className="text-amber-300 text-[10px] font-black uppercase tracking-[0.3em]">⏰ Grace Window — Grade Last Answer</p>
                <p className="text-white text-2xl font-black mt-0.5 tabular-nums">{(tbGraceMs / 1000).toFixed(1)}s</p>
                <p className="text-amber-200/70 text-[10px] mt-0.5">Correct / Wrong / Skip still counts.</p>
              </div>
            )}

            {/* Current question + answer */}
            {currentQ ? (
              <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-5 space-y-3">
                <p className="text-xl font-bold leading-snug text-center">{currentQ.text}</p>
                <div className="rounded-xl p-3 bg-green-500/15 border border-green-500/40 text-center">
                  <p className="text-green-400 text-[10px] font-bold uppercase tracking-widest">Answer</p>
                  <p className="text-green-300 text-2xl font-black">{currentQ.answer}</p>
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center">
                <p className="text-yellow-400 font-bold">Queue empty! Waiting for time to expire…</p>
              </div>
            )}

            {/* Actions */}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={markCorrect} disabled={!currentQ}
                className="py-3 bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded-xl font-black text-sm text-white">
                ✓ Correct <span className="text-xs font-normal opacity-75">+1</span>
              </button>
              <button onClick={recycle} disabled={!currentQ}
                className="py-3 bg-red-700 hover:bg-red-600 disabled:opacity-40 rounded-xl font-black text-sm text-white">
                ✗ Wrong
              </button>
              <button onClick={recycle} disabled={!currentQ}
                className="py-3 bg-slate-600 hover:bg-slate-500 disabled:opacity-40 rounded-xl font-black text-sm text-white">
                ↷ Skip
              </button>
            </div>
            <p className="text-center text-slate-500 text-[10px]">Wrong &amp; skip both cycle the question to the back of the queue</p>

            <button onClick={endRoundEarly}
              className="w-full py-2 border border-slate-600 hover:border-slate-400 text-slate-400 hover:text-white rounded-lg text-xs">
              End Round Early → {isPlayingA || (isPlayingB && s.threeTeam) ? 'Break' : 'Results'}
            </button>
          </div>
        )}

        {/* Compare — final side-by-side + advance / out */}
        {s.phase === 'compare' && (() => {
          const rows = [
            { key: 'A' as const, name: s.teamA, score: s.scoreA, colour: 'green' },
            { key: 'B' as const, name: s.teamB, score: s.scoreB, colour: 'blue' },
            ...(s.threeTeam ? [{ key: 'C' as const, name: s.teamC ?? 'Team C', score: s.scoreC ?? 0, colour: 'purple' }] : []),
          ]
          const top = Math.max(...rows.map(r => r.score))
          const bottom = Math.min(...rows.map(r => r.score))
          const stillTied = top === bottom  // everyone level
          const advancesName = rows.filter(r => r.score === top).map(r => r.name).join(', ')
          const eliminated = rows.filter(r => r.score === bottom && bottom < top).map(r => r.name).join(', ')
          return (
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-yellow-500/15 to-orange-500/15 border-2 border-yellow-500/60 rounded-2xl p-4 text-center space-y-3">
              <p className="text-yellow-300 text-[10px] font-bold uppercase tracking-[0.3em]">Tie-Breaker Result</p>
              <div className={`grid ${s.threeTeam ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                {rows.map(r => {
                  const advances = !stillTied && r.score === top
                  const out = !stillTied && r.score === bottom && bottom < top
                  return (
                    <div key={r.key}
                      className={`rounded-xl p-3 border ${
                        advances ? 'bg-yellow-500/20 border-yellow-500'
                        : out ? 'bg-red-950/40 border-red-500/40 opacity-70'
                        : 'bg-white/5 border-white/10'
                      }`}>
                      {advances && <p className="text-yellow-300 text-2xl leading-none mb-0.5">🏆</p>}
                      {out && <p className="text-red-400 text-xs font-black uppercase tracking-widest">Out</p>}
                      <p className={`text-${r.colour}-300 text-[10px] font-bold uppercase tracking-widest truncate`}>{r.name}</p>
                      <p className="text-white text-3xl font-black">{r.score}</p>
                      <p className={`text-[10px] mt-0.5 font-bold uppercase ${advances ? 'text-yellow-300' : out ? 'text-red-300' : 'text-slate-500'}`}>
                        {advances ? (s.threeTeam ? 'Safe' : 'Advances') : out ? 'Eliminated' : 'Tied'}
                      </p>
                    </div>
                  )
                })}
              </div>
              <p className="text-white text-base font-black pt-2">
                {stillTied
                  ? '🤝 Still tied — run another round on fresh pools'
                  : s.threeTeam
                    ? `${eliminated} finishes at the bottom${eliminated.includes(',') ? ' (still tied)' : ''}. ${advancesName} advance${advancesName.includes(',') ? '' : 's'}.`
                    : `${advancesName} advances`}
              </p>
            </div>
            {stillTied ? (
              <button onClick={playAnotherRound}
                className="w-full bg-pink-600 hover:bg-pink-500 text-white font-black py-3 rounded-xl text-sm">
                🔔 Still Tied · Run Another Rapid Fire
              </button>
            ) : (
              <button onClick={playAnotherRound}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl text-sm">
                Run Another Rapid Fire
              </button>
            )}
          </div>
          )
        })()}
      </div>
    </div>
  )
}
