# AventoLinks — Setup Guide

## Step 1: Install Node.js
Download and install Node.js (LTS version) from:
https://nodejs.org/en/download

After installing, open a new terminal and confirm:
```bash
node --version   # should show v20.x or higher
npm --version    # should show 10.x or higher
```

## Step 2: Install Project Dependencies
Open terminal in the project folder (C:\Users\azeez\Downloads\aventolinkstalent) and run:
```bash
npm install
```

## Step 3: Set Up Supabase (Free)
1. Go to https://supabase.com and create a free account
2. Click "New Project" → fill in name (aventolinks), password, and region (choose Europe West — closest to Nigeria)
3. Once created, go to Settings → API
4. Copy your Project URL and anon public key

## Step 4: Set Up Environment Variables
```bash
# Copy the example file
cp .env.local.example .env.local
```
Then open `.env.local` and paste your Supabase URL and key.

## Step 5: Run the Development Server
```bash
npm run dev
```
Open http://localhost:3000 in your browser — you should see the AventoLinks homepage!

## Step 6: Push to GitHub
1. Go to https://github.com/new
2. Create a new repository named `aventolinks-talent`
3. Back in the terminal, run:
```bash
git init
git add .
git commit -m "Initial commit: AventoLinks platform"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/aventolinks-talent.git
git push -u origin main
```

## Step 7: Deploy to Vercel (Free)
1. Go to https://vercel.com and sign in with GitHub
2. Click "New Project" → import your `aventolinks-talent` repo
3. Add your environment variables (from .env.local) in the Vercel dashboard
4. Click Deploy — your site will be live at `aventolinks-talent.vercel.app`

## Step 8: Set Up Paystack
1. Go to https://paystack.com and create a Nigerian business account
2. Get your test keys from Dashboard → Settings → API Keys
3. Add them to your .env.local

---

## Project Structure

```
src/
├── app/                    # All pages (Next.js App Router)
│   ├── page.tsx            # Homepage
│   ├── tutors/page.tsx     # Browse tutors
│   ├── languages/page.tsx  # Language learning hub
│   ├── research/page.tsx   # Research program
│   ├── mentorship/page.tsx # Study abroad guidance
│   └── schools/page.tsx    # School partnerships
├── components/
│   ├── layout/             # Navbar + Footer
│   └── home/               # Homepage sections
└── lib/
    └── supabase.ts         # Database client + types
```

## Tech Stack
- **Frontend:** Next.js 14 (React)
- **Styling:** Tailwind CSS
- **Database/Auth:** Supabase (PostgreSQL)
- **Payments:** Paystack (Nigerian)
- **Hosting:** Vercel
- **Version Control:** GitHub
