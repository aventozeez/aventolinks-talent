'use client'

import { useRef, useState, useCallback } from 'react'

const POSITIONS = [
  'Goalkeeper',
  'Right Back',
  'Centre Back',
  'Left Back',
  'Defensive Midfielder',
  'Central Midfielder',
  'Attacking Midfielder',
  'Right Winger',
  'Left Winger',
  'Striker',
  'Coach',
  'Assistant Coach',
  'Fitness Coach',
]

// Card dimensions (landscape, ID-card style)
const W = 700
const H = 280

const DARK = '#140820'
const PINK = '#e040fb'
const PINK_LIGHT = '#f3aaff'
const WHITE = '#ffffff'

export default function PhotocardPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [name, setName] = useState('')
  const [position, setPosition] = useState('')
  const [number, setNumber] = useState('')
  const [nationality, setNationality] = useState('')
  const [playerImg, setPlayerImg] = useState<HTMLImageElement | null>(null)
  const [playerPreview, setPlayerPreview] = useState<string | null>(null)
  const [generated, setGenerated] = useState(false)

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPlayerPreview(url)
    const img = new Image()
    img.onload = () => setPlayerImg(img)
    img.src = url
  }

  const drawCard = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = W
    canvas.height = H

    // ── Background ──────────────────────────────────────────────
    ctx.fillStyle = '#f5f0f8'
    ctx.fillRect(0, 0, W, H)

    // ── Header bar ──────────────────────────────────────────────
    const headerH = 56
    ctx.fillStyle = DARK
    ctx.fillRect(0, 0, W, headerH)

    // Pink bottom edge on header
    ctx.fillStyle = PINK
    ctx.fillRect(0, headerH - 3, W, 3)

    // Header text
    ctx.fillStyle = WHITE
    ctx.font = 'bold 18px Inter, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText('AUBURN CITY FC', 120, 24)

    ctx.fillStyle = PINK_LIGHT
    ctx.font = '11px Inter, sans-serif'
    ctx.fillText('ELITE PLAYER CARD', 120, 42)

    // ── Footer bar ───────────────────────────────────────────────
    const footerH = 38
    ctx.fillStyle = DARK
    ctx.fillRect(0, H - footerH, W, footerH)

    // Pink top edge on footer
    ctx.fillStyle = PINK
    ctx.fillRect(0, H - footerH, W, 3)

    ctx.fillStyle = WHITE
    ctx.font = 'bold 11px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('PRO TEAM CARD  •  AUBURN CITY FC  •  OFFICIAL PLAYER CARD', W / 2, H - footerH / 2)

    // ── Jersey number badge ──────────────────────────────────────
    if (number) {
      const bx = W - 52
      const by = 10
      const br = 28
      // Shadow
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.4)'
      ctx.shadowBlur = 8
      ctx.fillStyle = PINK
      ctx.beginPath()
      ctx.arc(bx, by + br, br, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      ctx.fillStyle = WHITE
      ctx.font = 'bold 20px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(number, bx, by + br + 2)

      ctx.fillStyle = WHITE
      ctx.font = '7px Inter, sans-serif'
      ctx.fillText('JERSEY', bx, by + br + 18)
    }

    // ── Club logo box (header left) ──────────────────────────────
    ctx.fillStyle = '#0d0618'
    ctx.fillRect(0, 0, 100, headerH)
    ctx.strokeStyle = PINK
    ctx.lineWidth = 1.5
    ctx.strokeRect(0, 0, 100, headerH)

    const logo = new Image()
    logo.src = '/club-logo.png'
    const renderLogo = () => {
      ctx.drawImage(logo, 8, 4, 84, 48)
      finishCard(ctx, headerH, footerH)
    }
    if (logo.complete && logo.naturalWidth > 0) {
      renderLogo()
    } else {
      logo.onload = renderLogo
      logo.onerror = () => {
        // Fallback: draw initials
        ctx.fillStyle = PINK
        ctx.font = 'bold 20px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('AC', 50, headerH / 2)
        finishCard(ctx, headerH, footerH)
      }
    }

    setGenerated(true)
  }, [playerImg, name, position, number, nationality])

  function finishCard(ctx: CanvasRenderingContext2D, headerH: number, footerH: number) {
    const bodyY = headerH + 4
    const bodyH = H - headerH - footerH - 8

    // ── Photo area ───────────────────────────────────────────────
    const photoX = 18
    const photoY = bodyY + 8
    const photoW = 170
    const photoH = bodyH - 16

    ctx.fillStyle = '#ede8f2'
    ctx.strokeStyle = PINK
    ctx.lineWidth = 2
    ctx.beginPath()
    roundRect(ctx, photoX, photoY, photoW, photoH, 6)
    ctx.fill()
    ctx.stroke()

    if (playerImg) {
      ctx.save()
      ctx.beginPath()
      roundRect(ctx, photoX, photoY, photoW, photoH, 6)
      ctx.clip()
      const scale = Math.max(photoW / playerImg.width, photoH / playerImg.height)
      const sw = photoW / scale
      const sh = photoH / scale
      const sx = (playerImg.width - sw) / 2
      const sy = (playerImg.height - sh) / 2
      ctx.drawImage(playerImg, sx, sy, sw, sh, photoX, photoY, photoW, photoH)
      ctx.restore()
      ctx.strokeStyle = PINK
      ctx.lineWidth = 2
      ctx.beginPath()
      roundRect(ctx, photoX, photoY, photoW, photoH, 6)
      ctx.stroke()
    } else {
      ctx.fillStyle = PINK
      ctx.font = 'bold 13px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('PLAYER', photoX + photoW / 2, photoY + photoH / 2 - 8)
      ctx.fillText('PHOTO', photoX + photoW / 2, photoY + photoH / 2 + 10)
    }

    // ── Fields (right of photo) ──────────────────────────────────
    const fieldX = photoX + photoW + 24
    const fieldW = W - fieldX - 24
    const fields = [
      { label: 'NAME', value: name || '' },
      { label: 'POSITION', value: position || '' },
      { label: 'TEAM NAME', value: 'Auburn City FC' },
      { label: 'NATIONALITY', value: nationality || '' },
    ]

    const fieldGap = (bodyH - 16) / fields.length
    fields.forEach((f, i) => {
      const fy = bodyY + 14 + i * fieldGap

      // Label
      ctx.fillStyle = PINK
      ctx.font = 'bold 9px Inter, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(f.label, fieldX, fy)

      // Value
      ctx.fillStyle = DARK
      ctx.font = f.value ? 'bold 15px Inter, sans-serif' : '13px Inter, sans-serif'
      ctx.fillStyle = f.value ? DARK : '#bbb'
      ctx.fillText(f.value || '—', fieldX, fy + 18)

      // Underline
      ctx.strokeStyle = PINK
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(fieldX, fy + 24)
      ctx.lineTo(fieldX + fieldW, fy + 24)
      ctx.stroke()
    })
  }

  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `${name || 'player'}-auburn-city-fc.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const scale = 0.9

  return (
    <div className="min-h-screen bg-[#0d0618] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/club-logo.png" alt="Auburn City FC" className="w-16 h-16 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <div>
            <h1 className="text-2xl font-bold text-white">Auburn City FC</h1>
            <p className="text-[#e040fb] text-sm">Player Photocard Generator</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-start">
          {/* Form */}
          <div className="bg-[#1a0829] rounded-2xl p-7 space-y-5 border border-[#3a1550]">
            {/* Photo upload */}
            <div>
              <label className="block text-xs font-bold text-[#e040fb] uppercase tracking-wider mb-2">Player Photo</label>
              <div className="flex items-center gap-4">
                {playerPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={playerPreview} alt="preview" className="w-14 h-14 rounded-lg object-cover border-2 border-[#e040fb]" />
                )}
                <label className="cursor-pointer bg-[#2a1040] hover:bg-[#3a1550] text-gray-300 text-sm px-4 py-2.5 rounded-lg border border-[#4a2060] transition-colors">
                  {playerPreview ? 'Change Photo' : 'Upload Photo'}
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-bold text-[#e040fb] uppercase tracking-wider mb-2">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. John Okafor"
                className="w-full bg-[#2a1040] border border-[#4a2060] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#e040fb] placeholder-[#5a3070] text-sm"
              />
            </div>

            {/* Position */}
            <div>
              <label className="block text-xs font-bold text-[#e040fb] uppercase tracking-wider mb-2">Position</label>
              <select
                value={position}
                onChange={e => setPosition(e.target.value)}
                className="w-full bg-[#2a1040] border border-[#4a2060] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#e040fb] text-sm"
              >
                <option value="">Select position...</option>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Nationality */}
            <div>
              <label className="block text-xs font-bold text-[#e040fb] uppercase tracking-wider mb-2">Nationality</label>
              <input
                type="text"
                value={nationality}
                onChange={e => setNationality(e.target.value)}
                placeholder="e.g. Nigerian"
                className="w-full bg-[#2a1040] border border-[#4a2060] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#e040fb] placeholder-[#5a3070] text-sm"
              />
            </div>

            {/* Jersey */}
            <div>
              <label className="block text-xs font-bold text-[#e040fb] uppercase tracking-wider mb-2">Jersey Number <span className="text-[#5a3070] normal-case font-normal">(optional)</span></label>
              <input
                type="number"
                value={number}
                onChange={e => setNumber(e.target.value)}
                placeholder="e.g. 10"
                min="1"
                max="99"
                className="w-full bg-[#2a1040] border border-[#4a2060] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#e040fb] placeholder-[#5a3070] text-sm"
              />
            </div>

            <button
              onClick={drawCard}
              className="w-full bg-[#e040fb] hover:bg-[#cc33e6] text-white font-bold py-3 rounded-xl transition-colors text-sm tracking-wide"
            >
              Generate Photocard
            </button>
          </div>

          {/* Preview */}
          <div className="flex flex-col items-center gap-5">
            <div
              className="rounded-xl overflow-hidden shadow-2xl border border-[#3a1550] bg-[#1a0829] flex items-center justify-center"
              style={{ width: W * scale, height: H * scale }}
            >
              {!generated ? (
                <div className="text-center text-[#5a3070] px-8">
                  <div className="text-4xl mb-3">🪪</div>
                  <p className="text-sm">Fill in your details and click<br /><span className="text-[#e040fb] font-semibold">Generate Photocard</span></p>
                </div>
              ) : null}
              <canvas
                ref={canvasRef}
                style={{
                  display: generated ? 'block' : 'none',
                  width: W * scale,
                  height: H * scale,
                }}
              />
            </div>

            {generated && (
              <button
                onClick={handleDownload}
                className="bg-[#e040fb] hover:bg-[#cc33e6] text-white font-semibold px-8 py-3 rounded-xl transition-colors text-sm flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download Card
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
