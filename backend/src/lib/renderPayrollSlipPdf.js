import PDFDocument from 'pdfkit'

function money(n) {
  const x = Number(n) || 0
  return `$${x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const C = {
  header: '#0f766e',
  headerSub: '#ccfbf1',
  border: '#e5e7eb',
  borderStrong: '#d1d5db',
  rowAlt: '#f9fafb',
  sectionBg: '#f0fdfa',
  text: '#111827',
  textMuted: '#4b5563',
  textLight: '#6b7280',
  accent: '#0d9488',
  netBg: '#ecfdf5',
  netBorder: '#14b8a6',
  white: '#ffffff',
  cardBg: '#fafafa',
}

/**
 * @param {import('pdfkit').PDFDocument} doc
 */
function strokeRoundRect(doc, x, y, w, h, r = 4) {
  doc.strokeColor(C.borderStrong).lineWidth(1)
  if (typeof doc.roundedRect === 'function') {
    doc.roundedRect(x, y, w, h, r).stroke()
  } else {
    doc.rect(x, y, w, h).stroke()
  }
}

/**
 * @param {import('pdfkit').PDFDocument} doc
 */
function drawPayrollLayout(doc, row, settings, fromDate, toDate) {
  const pageW = doc.page.width
  const M = 48
  const contentW = pageW - M * 2
  /** Usable bottom Y for content (leave room for footer note). */
  const pageContentBottom = () => doc.page.height - M - 40
  let y = M

  // —— Top header ——
  const headerH = 72
  doc.save()
  doc.fillColor(C.header).rect(M, y, contentW, headerH).fill()
  doc.fillColor(C.white).font('Helvetica-Bold', 22).text('Payroll slip', M, y + 16, {
    width: contentW,
    align: 'center',
  })
  doc.font('Helvetica', 10).fillColor(C.headerSub).text('TimeTrack / HRMS', M, y + 46, {
    width: contentW,
    align: 'center',
  })
  doc.restore()
  y += headerH + 14

  // —— Employee summary card ——
  const cardPad = 14
  const cardH = 88
  doc.save()
  doc.fillColor(C.cardBg).rect(M, y, contentW, cardH).fill()
  strokeRoundRect(doc, M, y, contentW, cardH, 6)
  doc.restore()

  const leftCol = M + cardPad
  const mid = leftCol + contentW * 0.48
  doc.font('Helvetica-Bold', 8).fillColor(C.textLight).text('EMPLOYEE', leftCol, y + cardPad, { width: 200 })
  doc.font('Helvetica-Bold', 12).fillColor(C.text).text(row.employeeName || '—', leftCol, y + cardPad + 11, {
    width: contentW * 0.45,
  })

  doc.font('Helvetica-Bold', 8).fillColor(C.textLight).text('PAY PERIOD', mid, y + cardPad, { width: 200 })
  doc.font('Helvetica', 10).fillColor(C.text).text(`${fromDate}   →   ${toDate}`, mid, y + cardPad + 11, {
    width: contentW * 0.45,
  })

  doc.font('Helvetica-Bold', 8).fillColor(C.textLight).text('SALARY TYPE', leftCol, y + cardPad + 36, { width: 200 })
  doc.font('Helvetica', 10).fillColor(C.text).text(String(row.salaryType || '—'), leftCol, y + cardPad + 47, {
    width: 200,
  })

  doc.font('Helvetica-Bold', 8).fillColor(C.textLight).text('HOURLY RATE', mid, y + cardPad + 36, { width: 200 })
  doc.font('Helvetica-Bold', 11).fillColor(C.accent).text(money(row.hourlyRate), mid, y + cardPad + 47, {
    width: contentW * 0.45,
  })

  y += cardH + 16

  const rowH = 22
  const labelW = contentW * 0.58
  const valW = contentW * 0.42 - cardPad

  /**
   * @param {string} title
   * @param {Array<[string, string]>} lines
   * @param {{ emphasizeLast?: boolean }} [opts]
   */
  function drawTableSection(title, lines, opts = {}) {
    const emphasizeLast = opts.emphasizeLast === true
    const boxTop = y
    const titleH = 30
    doc.save()
    doc.fillColor(C.sectionBg).rect(M, y, contentW, titleH).fill()
    doc.strokeColor(C.border).lineWidth(0.5).moveTo(M, y + titleH).lineTo(M + contentW, y + titleH).stroke()
    doc.fillColor(C.accent).font('Helvetica-Bold', 11).text(title, M + cardPad, y + 8, { width: contentW - cardPad * 2 })
    doc.restore()
    y += titleH

    lines.forEach(([label, val], i) => {
      const last = i === lines.length - 1
      const alt = i % 2 === 1
      if (alt) {
        doc.save()
        doc.fillColor(C.rowAlt).rect(M, y, contentW, rowH).fill()
        doc.restore()
      }
      const isBold = emphasizeLast && last
      doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica', isBold ? 10 : 9)
      doc.fillColor(isBold ? C.text : C.textMuted).text(label, M + cardPad, y + 6, {
        width: labelW,
      })
      doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica', 10).fillColor(C.text).text(val, M + labelW, y + 6, {
        width: valW,
        align: 'right',
      })
      y += rowH
    })

    doc.save()
    doc.strokeColor(C.border).lineWidth(0.75)
    doc.moveTo(M, y).lineTo(M + contentW, y).stroke()
    doc.moveTo(M, boxTop).lineTo(M, y).stroke()
    doc.moveTo(M + contentW, boxTop).lineTo(M + contentW, y).stroke()
    doc.moveTo(M, boxTop).lineTo(M + contentW, boxTop).stroke()
    doc.restore()
    y += 12
  }

  const hoursLines = [
    ['Regular', `${row.regularHours ?? 0}`],
    ['OT (35% bucket)', `${row.ot35Hours ?? 0}`],
    ['OT (100% bucket)', `${row.ot100Hours ?? 0}`],
    ['Night', `${row.nightHours ?? 0}`],
    ['Holiday scheduled (h)', `${row.holidayScheduledHours ?? 0}`],
    ['Holiday worked (h)', `${row.holidayWorkedHours ?? 0}`],
    ['Total hours', `${row.totalHours ?? 0}`],
  ]
  drawTableSection('Hours', hoursLines, { emphasizeLast: true })

  const payLines = [
    ['Regular pay', money(row.regularPay)],
    ['OT pay (× OT multiplier)', money(row.ot35Pay)],
    ['OT 100% pay (×2)', money(row.ot100Pay)],
    ['Night differential (+15% premium)', money(row.nightPay)],
    ['Holiday pay', money(row.holidayPay)],
  ]
  if (Number(row.leavePay) > 0) {
    payLines.push(['Approved leave pay', money(row.leavePay)])
  }
  payLines.push(['Gross pay', money(row.totalPay)])
  drawTableSection('Pay', payLines, { emphasizeLast: true })

  doc.font('Helvetica-Oblique', 8).fillColor(C.textLight).text(
    `Rules used — OT multiplier: ${settings.otMultiplier}, Night multiplier: ${settings.nightMultiplier}`,
    M,
    y,
    { width: contentW, align: 'center' }
  )
  y += 20

  const adjLines = [
    ['Additions', money(row.additionsTotal ?? 0)],
    ['Deductions', money(row.deductionsTotal ?? 0)],
    ['Social Security', money(row.socialSecurity ?? 0)],
    ['Tax (DGII)', money(row.tax ?? 0)],
    ['INFOTEP', money(row.infotep ?? 0)],
  ]

  const netH = 54
  const titleH = 30
  const adjBlockH = titleH + adjLines.length * rowH + 12
  const netBlockH = netH + 16
  // Keep Adjustments + Net pay on one page (avoid empty box on page 1 + label on page 2).
  if (y + adjBlockH + netBlockH > pageContentBottom()) {
    doc.addPage()
    y = M
    doc.font('Helvetica', 9).fillColor(C.textMuted).text('Payroll slip — continued', M, y, {
      width: contentW,
      align: 'center',
    })
    y += 22
  }

  drawTableSection('Adjustments & deductions', adjLines, { emphasizeLast: false })

  // —— Net pay highlight ——
  doc.save()
  doc.fillColor(C.netBg).rect(M, y, contentW, netH).fill()
  doc.strokeColor(C.netBorder).lineWidth(1.5)
  if (typeof doc.roundedRect === 'function') {
    doc.roundedRect(M, y, contentW, netH, 8).stroke()
  } else {
    doc.rect(M, y, contentW, netH).stroke()
  }
  doc.restore()
  doc.font('Helvetica-Bold', 9).fillColor(C.textLight).text('NET PAY', M + cardPad, y + 12, { width: 120 })
  doc.font('Helvetica-Bold', 20).fillColor(C.header).text(money(row.netPay ?? 0), M + cardPad, y + 26, {
    width: contentW - cardPad * 2,
    align: 'right',
  })
  y += netH + 16

  const foot = row.govAutoCalculated
    ? 'Government deductions calculated automatically (TSS/DGII rules) unless manually overridden.'
    : 'Government deductions from saved override for this period.'
  doc.font('Helvetica', 8).fillColor('#9ca3af').text(foot, M, doc.page.height - M - 28, {
    width: contentW,
    align: 'center',
  })

  if (row.lineItems && row.lineItems.length > 0) {
    doc.addPage()
    y = M
    doc.font('Helvetica-Bold', 14).fillColor(C.text).text('Line items', M, y, { width: contentW })
    y += 26
    const boxTop = y
    row.lineItems.forEach((it, i) => {
      const lbl = it.label ? `${it.type} — ${it.label}` : it.type
      if (i % 2 === 1) {
        doc.save()
        doc.fillColor(C.rowAlt).rect(M, y, contentW, rowH).fill()
        doc.restore()
      }
      doc.font('Helvetica', 9).fillColor(C.textMuted).text(lbl, M + cardPad, y + 6, { width: labelW })
      doc.font('Helvetica', 10).fillColor(C.text).text(money(it.amount), M + labelW, y + 6, {
        width: valW,
        align: 'right',
      })
      y += rowH
    })
    doc.save()
    doc.strokeColor(C.border).lineWidth(0.75)
    doc.moveTo(M, boxTop).lineTo(M, y).stroke()
    doc.moveTo(M + contentW, boxTop).lineTo(M + contentW, y).stroke()
    doc.moveTo(M, boxTop).lineTo(M + contentW, boxTop).stroke()
    doc.moveTo(M, y).lineTo(M + contentW, y).stroke()
    doc.restore()

    doc.font('Helvetica', 8).fillColor('#9ca3af').text(foot, M, doc.page.height - M - 28, {
      width: contentW,
      align: 'center',
    })
  }
}

/**
 * @param {object} row - output of buildPayrollEmployeeRow
 * @param {object} settings - getSettings() result
 * @param {string} fromDate
 * @param {string} toDate
 * @returns {Promise<Buffer>}
 */
export function renderPayrollSlipPdf(row, settings, fromDate, toDate) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'Payroll slip' } })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    try {
      drawPayrollLayout(doc, row, settings, fromDate, toDate)
    } catch (e) {
      reject(e)
      return
    }

    doc.end()
  })
}
