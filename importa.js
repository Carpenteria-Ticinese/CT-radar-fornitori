// CT Radar Fornitori — importa.js
// «Importa offerta»: PDF (anche scansionato), Excel/CSV, foto, testo della mail.
//
//   1. Documento   → controllo dimensione (10 MB) e impronta (stesso file = bloccato)
//   2. Preparazione → Excel letto nel browser (solo fogli visibili), PDF come testo
//                     o come immagini se scansionato/rovinato; costo stimato
//   3. Lettura AI  → il Worker restituisce SOLO JSON (testata + righe)
//   4. Regole fisse → tassa CO2 come extra, varianti, netto calcolato dal programma
//   5. Abbinamento → memoria (codice) → AI propone fino a 3 articoli → MAI senza conferma
//   6. Conferma    → una riga per voce: vecchio → nuovo, stato, azioni
//   7. Salva       → documento nello Storage, nuove versioni dei prezzi, memoria

'use strict'

var IMP = null
var TESTO_PER_PARTE = 7000         // caratteri di testo per chiamata all'AI
var PAGINE_PER_PARTE = 2           // pagine-immagine per chiamata
var PARALLELE = 3                  // chiamate contemporanee
var LATO_PAGINA = 2000             // px del lato lungo delle pagine come immagine

function nuovoImport() {
  IMP = {
    passo: 1, file: null, testoMail: '', tipo: null, forzaImmagini: false,
    buffer: null, hash: null, fogli: null, foglio: null, schedaRichiesta: false,
    parti: [], descrizione: '', stimaUsd: 0,
    letto: null, usd: 0, righe: [], ignorate: '',
    contattoId: null, fornitoreId: null, fornitore: null,
    precedente: null, sostituisce: false, memoria: [], prezziAttivi: {}, tipoNuovi: 'Materiale'
  }
}

async function disegnaImporta() {
  if (!(await caricaBase()) || !(await caricaArticoli()) || !(await caricaFornitori())) return
  // si riprende solo la finestra di conferma (lettura già pagata); il resto riparte
  if (IMP && IMP.passo === 3) passoConferma()
  else { nuovoImport(); passo1() }
}

function intestazioneImport(n) {
  var passi = ['1 Documento', '2 Lettura', '3 Controllo e conferma']
  return '<div class="intestazione"><h1>📥 Importa offerta</h1></div>' +
    '<div class="passi">' + passi.map(function (p, i) {
      return '<span class="tag"' + (i + 1 === n ? ' aria-current="step"' : '') + '>' + p + '</span>'
    }).join('') + '</div>'
}

// ═════════════════════════════════════════════════════════════════════════════
// PASSO 1 — il documento
// ═════════════════════════════════════════════════════════════════════════════
function passo1() {
  var v = el('vista-importa')
  v.innerHTML = intestazioneImport(1) +
    (RF.imp && RF.imp.worker_url ? '' : banner('warn', 'La lettura con l\'AI non è attiva: il titolare deve scrivere l\'indirizzo del Worker in ⚙️ Impostazioni. Le schede di richiesta compilate (Excel con «Codice CT») si importano lo stesso.')) +
    '<div class="scheda">' +
      '<h2>Dai al programma l\'offerta così com\'è</h2>' +
      '<div class="zona-file" id="i-zona">' +
        '<p><strong>PDF, Excel (xlsx, xls, csv) o foto</strong> — massimo ' + LIMITE_FILE_MB + ' MB</p>' +
        '<div class="gruppo-btn" style="justify-content:center">' +
          '<label class="btn" for="i-file">📄 Scegli il file</label>' +
          '<input type="file" id="i-file" hidden accept=".pdf,.xlsx,.xls,.csv,image/*,application/pdf">' +
          '<label class="btn" for="i-foto">📷 Fotografa</label>' +
          '<input type="file" id="i-foto" hidden accept="image/*" capture="environment">' +
        '</div>' +
        '<p class="aiuto">Oppure trascina qui il file.</p>' +
        '<div id="i-nome" style="font-weight:600"></div>' +
      '</div>' +
      '<label class="scelta"><input type="checkbox" id="i-immagini"> Leggi il PDF come immagine (scansionato o con il testo rovinato). Il programma se ne accorge anche da solo.</label>' +
      '<label for="i-testo">…oppure incolla qui il testo della mail</label>' +
      '<textarea id="i-testo" rows="6" placeholder="Incolla il testo della mail con i prezzi"></textarea>' +
      '<div id="i-msg" aria-live="polite" style="margin-top:12px"></div>' +
    '</div>' +
    '<div class="barra-azioni"><button type="button" class="btn" id="i-annulla">Annulla</button>' +
      '<div class="spazio"></div><button type="button" class="btn btn-primario" id="i-avanti">Avanti →</button></div>'

  function scelto(f) {
    if (!f) return
    IMP.file = f
    html('i-nome', '📎 ' + esc(f.name) + ' · ' + RFC.fmt(f.size / 1048576, 1) + ' MB')
    html('i-msg', '')
  }
  el('i-file').addEventListener('change', function () { scelto(this.files[0]) })
  el('i-foto').addEventListener('change', function () { scelto(this.files[0]) })
  var zona = el('i-zona')
  zona.addEventListener('dragover', function (e) { e.preventDefault(); zona.classList.add('sopra') })
  zona.addEventListener('dragleave', function () { zona.classList.remove('sopra') })
  zona.addEventListener('drop', function (e) { e.preventDefault(); zona.classList.remove('sopra'); scelto(e.dataTransfer.files[0]) })
  el('i-annulla').addEventListener('click', function () { nuovoImport(); vai('cerca') })
  el('i-avanti').addEventListener('click', function () { preparaDocumento().catch(function (e) {
    html('i-msg', banner('err', esc('Non riesco a leggere il documento: ' + spiegaErrore(e))))
    el('i-avanti').disabled = false
  }) })
}

function tipoFile(f) {
  var n = (f.name || '').toLowerCase()
  if (/\.pdf$/.test(n) || f.type === 'application/pdf') return 'pdf'
  if (/\.(xlsx|xls|csv)$/.test(n)) return 'excel'
  if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|gif)$/.test(n)) return 'immagine'
  return null
}

async function preparaDocumento() {
  var msg = el('i-msg')
  IMP.testoMail = el('i-testo').value.trim()
  IMP.forzaImmagini = el('i-immagini').checked
  if (!IMP.file && !IMP.testoMail) return html(msg, banner('warn', 'Scegli un file oppure incolla il testo della mail.'))
  if (IMP.file && IMP.file.size > LIMITE_FILE_MB * 1048576) {
    return html(msg, banner('err', 'Il file pesa ' + RFC.fmt(IMP.file.size / 1048576, 1) + ' MB: il massimo è ' + LIMITE_FILE_MB + ' MB.'))
  }
  if (IMP.file) {
    IMP.tipo = tipoFile(IMP.file)
    if (!IMP.tipo) return html(msg, banner('err', 'Tipo di file non riconosciuto: servono PDF, Excel, CSV o foto.'))
  } else IMP.tipo = 'testo'
  el('i-avanti').disabled = true
  html(msg, banner('info', '⏳ Controllo il documento…'))
  if (!(await sessioneValida())) return

  // impronta: lo stesso file non entra due volte
  IMP.buffer = IMP.file ? await leggiBuffer(IMP.file) : new TextEncoder().encode(IMP.testoMail).buffer
  IMP.hash = await impronta(IMP.buffer)
  var g = await sb.from('rf_documenti').select('id,numero,creato_il,creato_iniziali,fornitore_id').eq('hash', IMP.hash).maybeSingle()
  if (g.error) throw g.error
  if (g.data) {
    var f = fornitoreDaId(g.data.fornitore_id)
    el('i-avanti').disabled = false
    return html(msg, banner('err', '🚫 <strong>Già importato il ' + esc(RFC.timbro(g.data.creato_iniziali, g.data.creato_il)) + '</strong>' +
      ' (' + esc((f ? f.nome : 'fornitore') + (g.data.numero ? ', n° ' + g.data.numero : '')) + '). Lo stesso file non si importa due volte.'))
  }

  if (IMP.tipo === 'excel') return preparaExcel()
  if (IMP.tipo === 'pdf') return preparaPdf()
  if (IMP.tipo === 'immagine') {
    html(msg, banner('info', '⏳ Preparo la foto…'))
    var c = await comprimiFoto(IMP.file, LATO_PAGINA, 0.85)
    IMP.parti = [{ pagine: 'foto', contenuto: [{ tipo: 'immagine', media_type: 'image/jpeg', dati: await blobInBase64(c.blob) }] }]
    IMP.descrizione = 'Foto, letta come immagine'
    return passoPronto()
  }
  // testo della mail
  IMP.parti = dividiTesto(IMP.testoMail.split(/\r?\n/), null).map(function (t, i, a) {
    return { pagine: 'parte ' + (i + 1) + ' di ' + a.length, contenuto: [{ tipo: 'testo', testo: t }] }
  })
  IMP.descrizione = 'Testo della mail (' + RFC.fmt(IMP.testoMail.length, 0) + ' caratteri)'
  passoPronto()
}

// Divide righe di testo in parti da ~TESTO_PER_PARTE caratteri. intestazione:
// righe da ripetere in cima a ogni parte (es. la riga dei titoli di colonna).
function dividiTesto(righe, intestazione) {
  var parti = [], cur = [], len = 0
  var testa = intestazione ? intestazione.join('\n') + '\n' : ''
  righe.forEach(function (r) {
    if (len + r.length > TESTO_PER_PARTE && cur.length) { parti.push(testa + cur.join('\n')); cur = []; len = 0 }
    cur.push(r); len += r.length + 1
  })
  if (cur.length) parti.push(testa + cur.join('\n'))
  return parti
}

// ── Excel: solo fogli visibili; se più di uno, si chiede quale ──────────────
async function preparaExcel() {
  await caricaLibreria('xlsx')
  var wb = XLSX.read(IMP.buffer, { type: 'array', cellDates: true })
  var info = (wb.Workbook && wb.Workbook.Sheets) || []
  var visibili = wb.SheetNames.filter(function (n, i) { return !(info[i] && info[i].Hidden) })
  IMP.fogli = visibili.map(function (n) {
    var righe = righeFoglio(wb.Sheets[n])
    var testo = righe.slice(0, 15).map(function (r) { return r.join(' ') }).join(' ').toLowerCase()
    return { nome: n, righe: righe, nostro: /carpenteria ticinese/.test(testo),
             conPrezzi: righe.filter(function (r) { return r.some(function (c) { return RFC.numero(c) != null && /\d/.test(c) }) }).length }
  })
  if (!IMP.fogli.length) return html('i-msg', banner('err', 'Il file Excel non ha fogli visibili.'))
  var nascosti = wb.SheetNames.length - visibili.length
  if (IMP.fogli.length === 1) return usaFoglio(IMP.fogli[0], nascosti)
  // più fogli visibili: si chiede, consigliando quello intestato a noi
  var consigliato = IMP.fogli.filter(function (f) { return f.nostro })[0] || IMP.fogli.slice().sort(function (a, b) { return b.conPrezzi - a.conPrezzi })[0]
  el('i-avanti').disabled = false
  apriFinestra({
    titolo: 'Quale foglio leggo?',
    html: '<p>Il file ha ' + IMP.fogli.length + ' fogli visibili' + (nascosti ? ' (e ' + nascosti + ' nascosti, ignorati)' : '') + '. Scegli quello con i prezzi per noi.</p>' +
      IMP.fogli.map(function (f) {
        return '<label class="scelta"><input type="radio" name="foglio" value="' + esc(f.nome) + '"' + (f === consigliato ? ' checked' : '') + '> ' +
          '<span><strong>' + esc(f.nome) + '</strong> — ' + f.righe.length + ' righe' +
          (f.nostro ? ' · ' + tag('ok', '✔️', 'intestato a Carpenteria Ticinese') : ' · ' + tag('warn', '⚠️', 'non intestato a noi')) +
          (f === consigliato ? ' · ' + tag('info', '👍', 'consigliato') : '') + '</span></label>'
      }).join(''),
    pulsanti: [
      { testo: 'Annulla', sinistra: true, azione: function (f) { f.chiudi() } },
      { testo: 'Usa questo foglio', classe: 'btn-primario', azione: function (fin) {
          var n = fin.q('input[name="foglio"]:checked').value
          fin.chiudi()
          usaFoglio(IMP.fogli.filter(function (f) { return f.nome === n })[0], nascosti)
        } }
    ]
  })
}

// Le celle del foglio come testo. Per i numeri:
//  • se il testo mostrato vale lo stesso numero (es. «2200.010» = 2200.01,
//    «1'390.00»), si tiene il testo mostrato: i codici non perdono gli zeri;
//  • altrimenti (es. mostrato «2.48», vero 2.47775) si tiene il valore vero,
//    senza il «rumore» della virgola mobile (0.43724999999999997 → 0.43725).
function righeFoglio(ws) {
  if (!ws || !ws['!ref']) return []
  var rg = XLSX.utils.decode_range(ws['!ref']), out = []
  for (var R = rg.s.r; R <= rg.e.r; R++) {
    var riga = []
    for (var C = rg.s.c; C <= rg.e.c; C++) {
      var c = ws[XLSX.utils.encode_cell({ r: R, c: C })]
      var s = ''
      if (c && c.v != null) {
        if (c.t === 'n') {
          var vero = String(Number(c.v.toFixed(8)))
          s = (c.w && RFC.numero(c.w) === c.v) ? c.w.trim() : vero
        } else if (c.t === 'd' || c.v instanceof Date) {
          s = RFC.fmtData(new Date(c.v).toISOString().slice(0, 10))
        } else s = String(c.w != null ? c.w : c.v)
      }
      riga.push(s.replace(/\s+/g, ' ').trim())
    }
    while (riga.length && riga[riga.length - 1] === '') riga.pop()
    if (riga.some(function (x) { return x !== '' })) out.push(riga)
  }
  return out
}

// La riga dei titoli di colonna: fra le prime 30, quella con più parole da
// titolo (codice, descrizione, prezzo, UM, sconto…). Non la prima che capita.
function rigaTitoli(righe) {
  var re = /codice|descri|prezzo|price|listino|^um$|unit|sconto|rincaro|netto|quantit|importo|finale/i
  var meglio = -1, punti = 1
  righe.slice(0, 30).forEach(function (r, i) {
    var p = r.filter(function (c) { return c && RFC.numero(c) == null && re.test(c) }).length
    if (p > punti) { punti = p; meglio = i }
  })
  return meglio
}

function usaFoglio(foglio, nascosti) {
  IMP.foglio = foglio.nome
  var righe = foglio.righe
  // Scheda di richiesta compilata dal fornitore: colonna «Codice CT» → senza AI
  var iTitoli = righe.findIndex(function (r) { return r.some(function (c) { return /^codice ct$/i.test(c) }) })
  if (iTitoli >= 0) return leggiSchedaRichiesta(righe, iTitoli)
  // riga dei titoli (si ripete in cima a ogni parte mandata all'AI)
  var iTit = rigaTitoli(righe)
  var testa = iTit >= 0 ? righe.slice(0, iTit + 1) : righe.slice(0, 1)
  var corpo = iTit >= 0 ? righe.slice(iTit + 1) : righe.slice(1)
  var testoRighe = corpo.map(function (r) { return r.join(' | ') })
  var intest = testa.map(function (r) { return r.filter(Boolean).join(' | ') })
  IMP.parti = dividiTesto(testoRighe, intest).map(function (t, i, a) {
    return { pagine: 'foglio «' + foglio.nome + '», parte ' + (i + 1) + ' di ' + a.length, contenuto: [{ tipo: 'testo', testo: t }] }
  })
  IMP.descrizione = 'Excel, foglio «' + foglio.nome + '»: ' + corpo.length + ' righe' + (nascosti ? ' (fogli nascosti ignorati: ' + nascosti + ')' : '')
  passoPronto()
}

// La NOSTRA scheda di richiesta, compilata dal fornitore: si abbina per codice, senza AI.
function leggiSchedaRichiesta(righe, iTit) {
  var t = righe[iTit].map(function (c) { return c.toLowerCase() })
  function col(re) { return t.findIndex(function (c) { return re.test(c) }) }
  var cCod = col(/^codice ct$/), cDesc = col(/descrizione/), cQ = col(/quantit/), cU = col(/^unit/),
      cP = col(/prezzo unitario/), cS = col(/sconto/), cN = col(/^netto/), cNote = col(/^note/)
  var testa = {}
  righe.slice(0, iTit).forEach(function (r) {
    var k = (r[0] || '').toLowerCase().replace(/:$/, '')
    if (/fornitore/.test(k)) testa.fornitore = r[1]
    if (/richiesta/.test(k)) testa.numero = r[1]
    if (/^data/.test(k)) testa.data = RFC.dataISO(r[1])
  })
  var righeAI = righe.slice(iTit + 1).filter(function (r) { return r[cCod] }).map(function (r) {
    var p = RFC.numero(r[cP]), s = RFC.numero(r[cS]), n = RFC.numero(r[cN])
    return { codice: null, codice_ct: r[cCod], descrizione: r[cDesc] || r[cCod], marca: null, unita: r[cU] || null,
             quantita: RFC.numero(r[cQ]), listino: p, modifiche: s ? [{ tipo: 'sconto', percentuale: s }] : [],
             netto_dichiarato: n, extra: null, variante: false, tassa: false, nota: cNote >= 0 ? (r[cNote] || null) : null }
  }).filter(function (r) { return r.listino != null || r.netto_dichiarato != null })
  IMP.schedaRichiesta = true
  IMP.letto = { nessun_prezzo: !righeAI.length, testata: { fornitore: testa.fornitore || null, numero: testa.numero || null,
                data: testa.data || RFC.oggiISO(), valido_fino: null, valuta: null, condizioni: null, tipo: 'offerta', partita_iva: null },
                righe: righeAI, pagine_ignorate: null }
  IMP.descrizione = 'Scheda di richiesta compilata (' + righeAI.length + ' righe): abbinamento per «Codice CT», senza AI'
  dopoLettura()
}

// ── PDF: testo se è buono, immagini se è scansionato o rovinato ─────────────
async function preparaPdf() {
  html('i-msg', banner('info', '⏳ Apro il PDF…'))
  await caricaLibreria('pdf')
  var pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(IMP.buffer.slice(0)) }).promise
  if (pdf.numPages > 40) return html('i-msg', banner('err', 'Il PDF ha ' + pdf.numPages + ' pagine: dividilo (massimo 40).'))
  var pagine = [], pezzi = 0, sovrapposti = 0
  for (var i = 1; i <= pdf.numPages; i++) {
    var pg = await pdf.getPage(i)
    var tc = await pg.getTextContent()
    var s = sovrapposizioni(tc)
    pezzi += s.pezzi; sovrapposti += s.sovrapposti
    pagine.push(righeDaTesto(tc))
  }
  var testo = pagine.map(function (p) { return p.join('\n') }).join('\n')
  var q = qualitaTesto(testo, pdf.numPages, pezzi ? sovrapposti / pezzi : 0)
  var immagini = IMP.forzaImmagini || q.scarso
  if (immagini) {
    html('i-msg', banner('info', '⏳ ' + (IMP.forzaImmagini ? 'Leggo il PDF come immagine' : q.motivo + ': lo leggo come immagine') + '. Preparo le pagine…'))
    var img = []
    for (var j = 1; j <= pdf.numPages; j++) {
      var p = await pdf.getPage(j)
      var vp1 = p.getViewport({ scale: 1 })
      var scala = LATO_PAGINA / Math.max(vp1.width, vp1.height)
      var vp = p.getViewport({ scale: scala })
      var c = document.createElement('canvas')
      c.width = Math.round(vp.width); c.height = Math.round(vp.height)
      var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
      // intent «print»: disegna senza aspettare l'animazione dello schermo, così
      // funziona anche se la pagina è in secondo piano (telefono, altra scheda).
      await p.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise
      var blob = await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.85) })
      img.push({ tipo: 'immagine', media_type: 'image/jpeg', dati: await blobInBase64(blob) })
    }
    IMP.parti = []
    for (var k = 0; k < img.length; k += PAGINE_PER_PARTE) {
      IMP.parti.push({ pagine: 'pagine ' + (k + 1) + '-' + Math.min(img.length, k + PAGINE_PER_PARTE) + ' di ' + img.length,
                       contenuto: img.slice(k, k + PAGINE_PER_PARTE) })
    }
    IMP.descrizione = 'PDF di ' + pdf.numPages + (pdf.numPages === 1 ? ' pagina' : ' pagine') + ', letto come IMMAGINE' + (IMP.forzaImmagini ? '' : ' (' + q.motivo + ')')
  } else {
    // una parte per gruppo di pagine, con il segno di pagina
    var righe = []
    pagine.forEach(function (p, i) { righe.push('=== PAGINA ' + (i + 1) + ' di ' + pagine.length + ' ==='); righe = righe.concat(p) })
    IMP.parti = dividiTesto(righe, null).map(function (t, i, a) {
      return { pagine: 'parte ' + (i + 1) + ' di ' + a.length, contenuto: [{ tipo: 'testo', testo: t }] }
    })
    IMP.descrizione = 'PDF di ' + pdf.numPages + (pdf.numPages === 1 ? ' pagina' : ' pagine') + ', letto come TESTO'
  }
  passoPronto()
}

// Ricostruisce le righe del PDF dalle posizioni dei pezzi di testo.
function righeDaTesto(tc) {
  var pezzi = tc.items.filter(function (it) { return it.str && it.str.trim() }).map(function (it) {
    return { x: it.transform[4], y: it.transform[5], s: it.str, w: it.width || 0 }
  })
  pezzi.sort(function (a, b) { return Math.abs(b.y - a.y) > 2.5 ? b.y - a.y : a.x - b.x })
  var righe = [], cur = null
  pezzi.forEach(function (p) {
    if (!cur || Math.abs(cur.y - p.y) > 2.5) { cur = { y: p.y, pz: [] }; righe.push(cur) }
    cur.pz.push(p)
  })
  return righe.map(function (r) {
    r.pz.sort(function (a, b) { return a.x - b.x })
    var out = '', fine = null
    r.pz.forEach(function (p) {
      if (fine != null) out += (p.x - fine > 12 ? ' | ' : ' ')
      out += p.s.trim(); fine = p.x + p.w
    })
    return out
  })
}

// Pezzi di testo che si sovrappongono sulla stessa riga: succede quando il PDF
// ha due strati di testo uno sopra l'altro (es. Lattonieri Abile: 34%; le
// offerte normali: 0%). Letto come testo, mescolerebbe voci diverse.
function sovrapposizioni(tc) {
  var pz = tc.items.filter(function (it) { return it.str && it.str.trim() }).map(function (it) {
    return { x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.transform[3]) || 8 }
  })
  var sopra = 0
  for (var a = 0; a < pz.length; a++) {
    for (var b = 0; b < pz.length; b++) {
      if (a === b) continue
      var A = pz[a], B = pz[b]
      if (Math.abs(A.y - B.y) < Math.min(A.h, B.h) * 0.5 && A.x < B.x + B.w - 2 && B.x < A.x + A.w - 2) { sopra++; break }
    }
  }
  return { pezzi: pz.length, sovrapposti: sopra }
}

// Testo «scarso»: poche lettere per pagina (scansione), testo a strati
// sovrapposti, o parole mescolate (es. «sRpimeoszsioonree»).
function qualitaTesto(t, pagine, quotaSovrapposta) {
  var parole = t.match(/[A-Za-zÀ-ÿ]{4,}/g) || []
  var strane = parole.filter(function (w) { return /[a-zà-ÿ][A-ZÀ-Ý]/.test(w) }).length
  var perPagina = t.replace(/\s/g, '').length / Math.max(1, pagine)
  if (perPagina < 150) return { scarso: true, motivo: 'Sembra scansionato (quasi niente testo)' }
  if ((quotaSovrapposta || 0) > 0.05) return { scarso: true, motivo: 'Il testo del PDF è rovinato (strati sovrapposti)' }
  if (parole.length && strane / parole.length > 0.03) return { scarso: true, motivo: 'Il testo del PDF è rovinato' }
  return { scarso: false }
}

// ═════════════════════════════════════════════════════════════════════════════
// PASSO 2 — pronto per la lettura, con il costo stimato
// ═════════════════════════════════════════════════════════════════════════════
function stimaCostoUsd(parti) {
  var input = 0, output = 0
  parti.forEach(function (p) {
    input += 2200
    p.contenuto.forEach(function (c) {
      if (c.tipo === 'testo') { input += c.testo.length / 3.2; output += c.testo.length / 3.5 }
      else { input += 3600; output += 1800 }
    })
    output += 600
  })
  return (input * 4 + output * 20) / 1e6
}

function passoPronto() {
  IMP.stimaUsd = stimaCostoUsd(IMP.parti)
  var v = el('vista-importa')
  v.innerHTML = intestazioneImport(2) +
    '<div class="scheda"><h2>Pronto da leggere</h2>' +
      '<p>📄 ' + esc(IMP.descrizione) + '</p>' +
      '<p>🤖 Letture AI: <strong>' + IMP.parti.length + '</strong> · costo stimato <strong>circa ' + RFC.fmt(costoCHF(IMP.stimaUsd)) +
        ' CHF</strong> (' + RFC.fmt(IMP.stimaUsd, 3) + ' $), più l\'abbinamento.</p>' +
      '<p class="aiuto">L\'AI legge e propone. Non decide i prezzi e non salva niente: il netto lo calcola il programma e salvi tu.</p>' +
      '<div id="i-progresso" aria-live="polite"></div>' +
    '</div>' +
    '<div class="barra-azioni"><button type="button" class="btn" id="i-annulla">Annulla</button>' +
      '<div class="spazio"></div><button type="button" class="btn btn-primario" id="i-leggi">🤖 Leggi con l\'AI</button></div>'
  el('i-annulla').addEventListener('click', function () { nuovoImport(); passo1() })
  el('i-leggi').addEventListener('click', function () {
    el('i-leggi').disabled = true
    leggiConAI().catch(function (e) {
      html('i-progresso', banner('err', esc('Lettura non riuscita: ' + spiegaErrore(e))))
      el('i-leggi').disabled = false
    })
  })
}

async function leggiConAI() {
  var risultati = new Array(IMP.parti.length), fatte = 0, usd = 0
  function progresso() {
    html('i-progresso', banner('info', '⏳ Lettura ' + fatte + ' di ' + IMP.parti.length + ' completate… (' + RFC.fmt(costoCHF(usd)) + ' CHF finora)'))
  }
  progresso()
  async function leggiParte(contenuto, pagine) {
    try {
      var j = await chiamaWorker({ compito: 'offerta', parti: contenuto, pagine: pagine })
      usd += j.uso.costo_usd
      return [j.dati]
    } catch (e) {
      // risposta troppo lunga: si divide il testo a metà e si riprova (una volta)
      if (/troppo lunga/i.test(e.message) && contenuto.length === 1 && contenuto[0].tipo === 'testo') {
        var righe = contenuto[0].testo.split('\n'), meta = Math.ceil(righe.length / 2)
        var a = await leggiParte([{ tipo: 'testo', testo: righe.slice(0, meta).join('\n') }], pagine + ' (1ª metà)')
        var b = await leggiParte([{ tipo: 'testo', testo: righe[0] + '\n' + righe.slice(meta).join('\n') }], pagine + ' (2ª metà)')
        return a.concat(b)
      }
      throw e
    }
  }
  var coda = IMP.parti.map(function (p, i) { return i })
  async function lavoratore() {
    while (coda.length) {
      var i = coda.shift()
      risultati[i] = await leggiParte(IMP.parti[i].contenuto, IMP.parti[i].pagine)
      fatte++; progresso()
    }
  }
  var lav = []
  for (var k = 0; k < Math.min(PARALLELE, IMP.parti.length); k++) lav.push(lavoratore())
  await Promise.all(lav)
  IMP.usd = usd
  // unione: testata dalla prima parte che ce l'ha, righe in ordine
  var tutti = [].concat.apply([], risultati)
  var testata = {}
  tutti.forEach(function (d) {
    var t = d.testata || {}
    Object.keys(t).forEach(function (k) { if (testata[k] == null && t[k] != null) testata[k] = t[k] })
  })
  IMP.letto = {
    nessun_prezzo: tutti.every(function (d) { return d.nessun_prezzo || !(d.righe || []).length }),
    testata: testata,
    righe: [].concat.apply([], tutti.map(function (d) { return d.righe || [] })),
    pagine_ignorate: tutti.map(function (d) { return d.pagine_ignorate }).filter(Boolean).join(' · ')
  }
  dopoLettura()
}

// ═════════════════════════════════════════════════════════════════════════════
// Dopo la lettura: regole fisse, fornitore, abbinamento
// ═════════════════════════════════════════════════════════════════════════════
function dopoLettura() {
  var v = el('vista-importa')
  if (IMP.letto.nessun_prezzo) {
    v.innerHTML = intestazioneImport(2) +
      banner('info', '∅ <strong>Nessun prezzo trovato.</strong> Il documento non contiene prezzi d\'acquisto: non è stato salvato niente.' +
        (IMP.letto.pagine_ignorate ? '<br><span class="piccolo">' + esc(IMP.letto.pagine_ignorate) + '</span>' : '')) +
      (IMP.usd ? '<p class="dim">Costo della lettura: ' + RFC.fmt(costoCHF(IMP.usd)) + ' CHF.</p>' : '') +
      '<button type="button" class="btn btn-primario" id="i-nuovo">📥 Importa un altro documento</button>'
    el('i-nuovo').addEventListener('click', function () { nuovoImport(); passo1() })
    return
  }
  IMP.righe = RFC.preparaRighe(IMP.letto.righe).map(function (r, i) {
    r.i = i; r.articoloId = null; r.fonte = null; r.sicura = false; r.candidati = []
    r.confermata = false; r.ignorata = false; r.fattoreManuale = null
    return r
  })
  IMP.ignorate = IMP.letto.pagine_ignorate || ''
  // fornitore: per nome normalizzato o per partita IVA
  var t = IMP.letto.testata || {}
  var trovato = indovinaFornitore(t.fornitore, t.partita_iva)
  IMP.contattoId = trovato ? trovato.contatto.id : null
  sceltaFornitore()
}

function indovinaFornitore(nome, piva) {
  var cifre = String(piva || '').replace(/\D/g, '')
  if (cifre.length >= 6) {
    var perIva = RF.fornitori.filter(function (f) { return f.contatto && String(f.contatto.uid_partita_iva || '').replace(/\D/g, '') === cifre })[0]
    if (perIva) return perIva
  }
  var n = RFC.nomeNorm(nome || '')
  if (n.length < 3) return null
  var esatto = RF.fornitori.filter(function (f) { return f.contatto && f._norm === n })[0]
  if (esatto) return esatto
  return RF.fornitori.filter(function (f) {
    return f.contatto && f._norm.length >= 4 && (f._norm.indexOf(n) >= 0 || n.indexOf(f._norm) >= 0)
  })[0] || null
}

function sceltaFornitore() {
  var t = IMP.letto.testata || {}
  var v = el('vista-importa')
  v.innerHTML = intestazioneImport(3) +
    '<div class="scheda"><h2>🏭 Fornitore</h2>' +
      '<p>Nel documento: <strong>' + esc(t.fornitore || '(non scritto)') + '</strong>' + (t.partita_iva ? ' · ' + esc(t.partita_iva) : '') +
        (t.numero ? ' · n° <strong>' + esc(t.numero) + '</strong>' : '') + (t.data ? ' · del ' + RFC.fmtData(t.data) : '') + '</p>' +
      '<label for="i-forn">Fornitore in Rubrica</label><select id="i-forn">' + opzioniFornitori(IMP.contattoId, true) + '</select>' +
      (IMP.contattoId ? '' : banner('warn', 'Non trovo questo fornitore nella Rubrica. Crealo lì (categoria «Fornitori»), poi premi «🔄 Ricarica fornitori».')) +
      '<div class="gruppo-btn" style="margin-top:10px">' +
        '<a class="btn" href="' + URL_RUBRICA + '" target="_blank" rel="noopener">📇 Crea in Rubrica</a>' +
        (t.fornitore ? '<button type="button" class="btn" id="i-copia-nome">📋 Copia il nome</button>' : '') +
        '<button type="button" class="btn" id="i-ricarica">🔄 Ricarica fornitori</button>' +
      '</div>' +
      '<div id="i-msg" style="margin-top:12px"></div>' +
    '</div>' +
    '<div class="barra-azioni"><button type="button" class="btn" id="i-annulla">Annulla</button>' +
      '<div class="info">' + IMP.righe.length + ' voci lette · ' + RFC.fmt(costoCHF(IMP.usd)) + ' CHF</div>' +
      '<button type="button" class="btn btn-primario" id="i-avanti">Avanti →</button></div>'
  el('i-annulla').addEventListener('click', annullaImport)
  if (el('i-copia-nome')) el('i-copia-nome').addEventListener('click', function () { copiaTesto(t.fornitore) })
  el('i-ricarica').addEventListener('click', async function () {
    await caricaFornitori(true)
    var f = indovinaFornitore(t.fornitore, t.partita_iva)
    if (f && !IMP.contattoId) IMP.contattoId = f.contatto.id
    sceltaFornitore()
  })
  el('i-avanti').addEventListener('click', async function () {
    var c = el('i-forn').value
    if (!c) return html('i-msg', banner('warn', 'Scegli il fornitore.'))
    el('i-avanti').disabled = true
    try { IMP.contattoId = c; await preparaAbbinamento() }
    catch (e) { el('i-avanti').disabled = false; html('i-msg', banner('err', esc(spiegaErrore(e)))) }
  })
}

async function annullaImport() {
  if (IMP && IMP.righe.length && !(await conferma('Annulla l\'import', 'Le righe lette non vengono salvate. La lettura AI è già stata pagata (' + RFC.fmt(costoCHF(IMP.usd)) + ' CHF).', 'Annulla l\'import', true))) return
  nuovoImport(); passo1()
}

async function preparaAbbinamento() {
  html('i-msg', banner('info', '⏳ Preparo l\'abbinamento…'))
  if (!(await sessioneValida())) return
  IMP.fornitoreId = await assicuraFornitoreRadar(IMP.contattoId)
  IMP.fornitore = fornitoreDaId(IMP.fornitoreId)
  var rad = IMP.fornitore.radar || {}
  IMP.tipoNuovi = (rad.attivita || []).indexOf('Subappalti') >= 0 ? 'Subappalto' : 'Materiale'
  var t = IMP.letto.testata || {}
  var q = await Promise.all([
    sb.from('rf_abbinamenti').select('*').eq('fornitore_id', IMP.fornitoreId),
    sb.from('rf_v_prezzi_attuali').select('*').eq('fornitore_id', IMP.fornitoreId),
    t.numero ? sb.from('rf_documenti').select('id,numero,versione,data_documento,creato_il,creato_iniziali').eq('fornitore_id', IMP.fornitoreId).eq('numero', t.numero).order('versione', { ascending: false }).limit(1)
             : Promise.resolve({ data: [] })
  ])
  q.forEach(function (x) { if (x.error) throw x.error })
  IMP.memoria = q[0].data || []
  IMP.prezziAttivi = {}
  ;(q[1].data || []).forEach(function (p) { (IMP.prezziAttivi[p.articolo_id] = IMP.prezziAttivi[p.articolo_id] || []).push(p) })
  IMP.precedente = (q[2].data || [])[0] || null
  IMP.sostituisce = false
  if (IMP.precedente) {
    IMP.sostituisce = await conferma('Nuova versione?',
      'C\'è già l\'offerta n° <strong>' + esc(IMP.precedente.numero) + '</strong> di questo fornitore (versione ' + IMP.precedente.versione +
      ', importata il ' + esc(RFC.timbro(IMP.precedente.creato_iniziali, IMP.precedente.creato_il)) + ').<br><br>' +
      '<strong>Nuova versione: sostituisce la precedente?</strong><br><span class="dim">Sì: i prezzi della versione vecchia che non ci sono più vengono chiusi (restano nello storico).</span>',
      'Sì, sostituisce la precedente')
  }

  // a) memoria (+ «Codice CT» della nostra scheda)
  IMP.righe.forEach(function (r) {
    if (r.codice_ct) {
      var a = articoloDaCodice(r.codice_ct)
      if (a) { r.articoloId = a.id; r.fonte = 'Codice CT'; r.sicura = true }
      return
    }
    var cod = (r.codice || '').trim().toLowerCase(), desc = RFC.descrizioneNorm(r.descrizione)
    var esatte = IMP.memoria.filter(function (m) { return (m.codice_fornitore || '').toLowerCase() === cod && m.descrizione_norm === desc })
    if (esatte.length && (cod || !rad.abbina_solo_codice)) {
      r.articoloId = esatte[0].articolo_id; r.fattoreMemoria = esatte[0].fattore
      r.fonte = cod ? 'memoria (codice)' : 'memoria (descrizione)'; r.sicura = !!cod
      return
    }
    // Stesso codice ma descrizione diversa: SOLO una proposta. Alcuni fornitori
    // usano lo stesso codice per prodotti diversi (Somazzi: 24209999 per tegole
    // e lucernari), quindi non è mai un abbinamento sicuro.
    if (cod) {
      var perCodice = IMP.memoria.filter(function (m) { return (m.codice_fornitore || '').toLowerCase() === cod })
      var articoli = Array.from(new Set(perCodice.map(function (m) { return m.articolo_id })))
      if (articoli.length === 1) {
        r.articoloId = articoli[0]; r.fattoreMemoria = perCodice[0].fattore
        r.fonte = 'memoria (stesso codice, descrizione diversa: controlla)'; r.sicura = false
      }
    }
  })
  // b) l'AI propone fino a 3 candidati per le righe rimaste
  var daAbbinare = IMP.righe.filter(function (r) { return !r.articoloId })
  if (daAbbinare.length && !IMP.schedaRichiesta && RF.imp.worker_url) {
    var articoli = RF.articoli.filter(function (a) { return !a.archiviato }).map(function (a) {
      return { c: a.codice, d: a.descrizione, u: a.unita, k: a.categoria }
    })
    for (var k = 0; k < daAbbinare.length; k += 60) {
      var gruppo = daAbbinare.slice(k, k + 60)
      html('i-msg', banner('info', '⏳ L\'AI cerca gli articoli candidati (' + Math.min(k + 60, daAbbinare.length) + ' di ' + daAbbinare.length + ')…'))
      try {
        var j = await chiamaWorker({ compito: 'abbina', articoli: articoli,
          righe: gruppo.map(function (r) { return { i: r.i, codice: r.codice, descrizione: r.descrizione + (r.marca ? ' (' + r.marca + ')' : ''), unita: r.unita } }) })
        IMP.usd += j.uso.costo_usd
        ;(j.dati.risultati || []).forEach(function (x) {
          var r = IMP.righe[x.i]
          if (!r) return
          r.candidati = (x.candidati || []).map(function (c) { var a = articoloDaCodice(c.codice); return a ? { id: a.id, motivo: c.motivo } : null }).filter(Boolean).slice(0, 3)
          if (r.candidati.length) { r.articoloId = r.candidati[0].id; r.fonte = 'proposta AI'; r.sicura = false }
        })
      } catch (e) {
        html('i-msg', banner('warn', esc('Proposte AI non disponibili: ' + spiegaErrore(e) + '. Abbina a mano.')))
      }
    }
  }
  IMP.righe.forEach(calcolaRiga)
  IMP.passo = 3
  passoConferma()
}

// Prezzo nuovo per unità dell'articolo, prezzo vecchio, stato, avvisi della riga
function calcolaRiga(r) {
  var a = r.articoloId ? articoloDaId(r.articoloId) : null
  r.avvisiRiga = r.avvisi.slice()
  r.stato = null; r.vecchio = null; r.var = null; r.nuovoUnita = null; r.fattore = null; r.oltreSoglia = false
  if (r.ignorata) { r.stato = 'ignora'; return }
  if (!a) { r.stato = 'da_abbinare'; return }
  if (r.fattoreManuale) r.fattore = r.fattoreManuale
  else if (!r.unita || r.unita_sigla === a.unita) r.fattore = 1
  else if (r.fattoreMemoria) r.fattore = Number(r.fattoreMemoria)
  if (!r.fattore) r.avvisiRiga.push('Unità diversa (' + (r.unita || '?') + ' → ' + a.unita + '): manca il fattore di conversione')
  r.nuovoUnita = r.fattore ? RFC.arrotonda(r.netto / r.fattore, 4) : null
  var vecchi = (IMP.prezziAttivi[a.id] || []).filter(function (p) { return p.variante === r.variante })
  var v = vecchi[0]
  if (!v) { r.stato = 'nuovo'; return }
  r.vecchio = v.netto_unita != null ? Number(v.netto_unita) : null
  r.vecchioValuta = v.valuta
  if (r.vecchio == null || r.nuovoUnita == null) { r.stato = 'nuovo'; return }
  r.var = RFC.variazionePct(r.vecchio, r.nuovoUnita)
  if (RFC.fmt(r.vecchio) === RFC.fmt(r.nuovoUnita)) r.stato = 'uguale'
  else r.stato = r.nuovoUnita > r.vecchio ? 'aumento' : 'calo'
  var soglia = Number(RF.imp.soglia_variazione_pct) || 15
  if (r.var != null && Math.abs(r.var) > soglia) {
    r.oltreSoglia = true
    r.avvisiRiga.push('Variazione oltre il ' + RFC.fmt(soglia, 0) + '%: controlla bene')
  }
}

var STATI = {
  nuovo: ['info', '🆕', 'Nuovo'], aumento: ['warn', '▲', 'Aumento'], calo: ['ok', '▼', 'Calo'],
  uguale: ['', '＝', 'Uguale'], da_abbinare: ['err', '❓', 'Da abbinare'], ignora: ['', '🚫', 'Ignora']
}
function confermabileInBlocco(r) {
  return r.sicura && (r.fonte === 'memoria (codice)' || r.fonte === 'Codice CT') && r.articoloId && !r.ignorata && r.fattore && !r.avvisiRiga.length
}

// ═════════════════════════════════════════════════════════════════════════════
// PASSO 3 — la finestra di conferma
// ═════════════════════════════════════════════════════════════════════════════
function passoConferma() {
  var t = IMP.letto.testata || {}
  var v = el('vista-importa')
  var nBlocco = IMP.righe.filter(function (r) { return confermabileInBlocco(r) && !r.confermata }).length
  v.innerHTML = intestazioneImport(3) +
    '<div class="scheda">' +
      '<div class="intestazione"><h2>🏭 ' + esc(IMP.fornitore.nome) + '</h2></div>' +
      '<p>' + esc([t.tipo, t.numero ? 'n° ' + t.numero : '', t.data ? 'del ' + RFC.fmtData(t.data) : '',
                   t.valido_fino ? 'valida fino al ' + RFC.fmtData(t.valido_fino) : ''].filter(Boolean).join(' · ')) +
        ' · valuta <strong>' + esc(valutaImport()) + '</strong>' +
        (IMP.sostituisce ? ' · ' + tag('info', '🔁', 'Nuova versione: sostituisce la n° ' + IMP.precedente.numero + ' v' + IMP.precedente.versione) : '') + '</p>' +
      (t.condizioni ? '<p class="dim">' + esc(t.condizioni) + '</p>' : '') +
      (IMP.ignorate ? '<p class="aiuto">Ignorato: ' + esc(IMP.ignorate) + '</p>' : '') +
      (IMP.fornitore.radar && IMP.fornitore.radar.solo_pacchi_interi ? banner('info', '📦 Questo fornitore vende solo pacchi interi: i suoi prezzi compaiono come «prezzo grandi quantità».') : '') +
      '<div class="griglia"><div><label for="i-tipo-nuovi">Tipo per i nuovi articoli creati da qui</label><select id="i-tipo-nuovi">' +
        ['Materiale', 'Servizio', 'Subappalto'].map(function (x) { return '<option' + (x === IMP.tipoNuovi ? ' selected' : '') + '>' + x + '</option>' }).join('') + '</select></div></div>' +
      '<div class="gruppo-btn" style="margin-top:10px">' +
        '<button type="button" class="btn" id="i-tutte"' + (nBlocco ? '' : ' disabled') + '>✔️ Conferma tutte (' + nBlocco + ')</button>' +
        '<span class="aiuto">«Conferma tutte» vale solo per le righe abbinate dalla memoria e senza avvisi.</span>' +
      '</div>' +
      '<label for="i-filtro">Mostra</label><select id="i-filtro">' +
        [['tutte', 'Tutte le righe'], ['proposte', 'Con un articolo proposto, da confermare'], ['da_abbinare', 'Da abbinare'],
         ['avvisi', 'Con avvisi'], ['confermate', 'Confermate']].map(function (o) {
          return '<option value="' + o[0] + '"' + ((IMP.filtro || 'tutte') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'
        }).join('') + '</select>' +
    '</div>' +
    '<div id="i-righe"></div>' +
    '<div class="barra-azioni"><button type="button" class="btn" id="i-annulla">Annulla</button>' +
      '<div class="info" id="i-riepilogo"></div>' +
      '<button type="button" class="btn btn-primario" id="i-salva">💾 Salva</button></div>'
  el('i-tipo-nuovi').addEventListener('change', function () { IMP.tipoNuovi = this.value })
  el('i-filtro').addEventListener('change', function () { IMP.filtro = this.value; disegnaRigheImport() })
  el('i-annulla').addEventListener('click', annullaImport)
  el('i-tutte').addEventListener('click', function () {
    IMP.righe.forEach(function (r) { if (confermabileInBlocco(r)) r.confermata = true })
    passoConferma()
  })
  el('i-salva').addEventListener('click', function () { salvaImport().catch(function (e) {
    avvisa('err', esc('Salvataggio non riuscito: ' + spiegaErrore(e)))
    el('i-salva').disabled = false
  }) })
  disegnaRigheImport()
}

function valutaImport() {
  var t = IMP.letto.testata || {}
  return t.valuta || (IMP.fornitore.radar && IMP.fornitore.radar.valuta) || 'CHF'
}

function righeDaMostrare() {
  var f = IMP.filtro || 'tutte'
  return IMP.righe.filter(function (r) {
    if (f === 'proposte') return r.articoloId && !r.confermata && !r.ignorata
    if (f === 'da_abbinare') return !r.articoloId && !r.ignorata
    if (f === 'avvisi') return (r.avvisiRiga || []).length > 0
    if (f === 'confermate') return r.confermata
    return true
  })
}

function disegnaRigheImport() {
  var box = el('i-righe')
  var mostrate = righeDaMostrare()
  box.innerHTML = (mostrate.length < IMP.righe.length ? '<p class="conteggio">' + mostrate.length + ' righe su ' + IMP.righe.length + '</p>' : '') +
    mostrate.map(function (r) {
    var st = STATI[r.stato] || STATI.da_abbinare
    var a = r.articoloId ? articoloDaId(r.articoloId) : null
    var val = valutaImport()
    var sconti = [r.sconto1 ? '−' + RFC.fmt(r.sconto1, 2) + '%' : '', r.sconto2 ? '−' + RFC.fmt(r.sconto2, 2) + '%' : '',
                  r.rincaro ? '+' + RFC.fmt(r.rincaro, 2) + '%' : '', r.extra ? '+' + RFC.fmt(r.extra) + ' extra' : ''].filter(Boolean).join(' ')
    return '<div class="voce' + (r.confermata ? ' confermata' : '') + (r.ignorata ? ' ignorata' : '') + '" data-i="' + r.i + '">' +
      '<div class="griglia-voce">' +
        '<div class="largo"><span class="et">Voce del fornitore</span>' +
          (r.codice ? '<span class="mono">' + esc(r.codice) + '</span> · ' : '') + '<strong>' + esc(r.descrizione) + '</strong>' +
          '<div class="piccolo">' + esc([r.marca, r.quantita != null ? 'q.tà ' + RFC.fmt(r.quantita, 2) : '', r.unita].filter(Boolean).join(' · ')) +
          ' · listino ' + RFC.fmt(r.listino) + ' ' + esc(val) + (sconti ? ' ' + esc(sconti) : '') + '</div></div>' +
        '<div class="largo"><span class="et">Mio articolo' + (r.fonte ? ' · ' + esc(r.fonte) : '') + '</span><div data-menu="' + r.i + '"></div>' +
          (r.candidati.length > 1 ? '<div class="piccolo" style="margin-top:4px">Altri candidati: ' + r.candidati.slice(1).map(function (c) {
            var x = articoloDaId(c.id); return '<button type="button" class="btn btn-piccolo" data-cand="' + c.id + '">' + esc(x ? x.codice : '') + '</button>'
          }).join(' ') + '</div>' : '') +
          (r.candidati.length && r.candidati[0].id === r.articoloId && r.candidati[0].motivo ? '<div class="piccolo dim">AI: ' + esc(r.candidati[0].motivo) + '</div>' : '') +
          (a && !r.fattore ? '<label class="piccolo" for="fat-' + r.i + '">1 ' + esc(r.unita || '?') + ' = quanti ' + esc(a.unita) + '?</label>' +
            '<input id="fat-' + r.i + '" data-fattore="' + r.i + '" inputmode="decimal" placeholder="es. 3.75">' : '') +
        '</div>' +
        '<div><span class="et">Prezzo vecchio' + (a ? ' / ' + esc(a.unita) : '') + '</span>' + (r.vecchio != null ? prezzoTesto(r.vecchio, r.vecchioValuta) : '–') + '</div>' +
        '<div><span class="et">Prezzo nuovo' + (a ? ' / ' + esc(a.unita) : '') + '</span><strong>' + (r.nuovoUnita != null ? prezzoTesto(r.nuovoUnita, val) : prezzoTesto(r.netto, val) + ' / ' + esc(r.unita || '?')) + '</strong></div>' +
        '<div><span class="et">Variazione</span>' + (r.var != null ? RFC.fmtPct(r.var) : '–') + '</div>' +
      '</div>' +
      '<div class="tags" style="margin-top:8px">' + tag(st[0], st[1], st[2]) +
        (r.confermata ? tag('ok', '✔️', 'Confermata') : '') + (r.variante ? tag('', '🔀', 'Variante') : '') +
        (r.info || []).map(function (x) { return tag('info', 'ℹ️', x) }).join('') +
        (r.avvisiRiga || []).map(function (x) { return tag(/non torna|oltre|manca/i.test(x) ? 'err' : 'warn', '⚠️', x) }).join('') + '</div>' +
      '<div class="gruppo-btn" style="margin-top:8px">' +
        '<button type="button" class="btn ' + (r.confermata ? '' : 'btn-primario') + '" data-azione="conferma"' + (r.ignorata || !r.articoloId ? ' disabled' : '') + '>' + (r.confermata ? '↩️ Togli conferma' : '✔️ Conferma') + '</button>' +
        '<button type="button" class="btn" data-azione="cambia">🔁 Cambia articolo</button>' +
        '<button type="button" class="btn" data-azione="nuovo">＋ Nuovo articolo</button>' +
        '<button type="button" class="btn" data-azione="ignora">' + (r.ignorata ? '↩️ Non ignorare' : '🚫 Ignora') + '</button>' +
      '</div></div>'
  }).join('') + (mostrate.length ? '' : '<div class="vuoto">Nessuna riga da mostrare.</div>')

  IMP.righe.forEach(function (r) {
    var c = box.querySelector('[data-menu="' + r.i + '"]')
    if (c) menuArticolo(c, { valore: r.articoloId, alCambio: function (id) {
      r.articoloId = id; r.fonte = 'scelto a mano'; r.sicura = false; r.confermata = false; r.fattoreManuale = null; r.fattoreMemoria = null
      calcolaRiga(r); passoConferma()
    } })
  })
  box.querySelectorAll('[data-cand]').forEach(function (b) {
    b.addEventListener('click', function () {
      var r = IMP.righe[b.closest('.voce').dataset.i]
      r.articoloId = b.dataset.cand; r.fonte = 'proposta AI'; r.confermata = false; r.fattoreManuale = null
      calcolaRiga(r); passoConferma()
    })
  })
  box.querySelectorAll('[data-fattore]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var r = IMP.righe[inp.dataset.fattore], n = RFC.numero(inp.value)
      if (n && n > 0) { r.fattoreManuale = n; calcolaRiga(r); passoConferma() }
    })
  })
  box.querySelectorAll('[data-azione]').forEach(function (b) {
    b.addEventListener('click', function () {
      var r = IMP.righe[b.closest('.voce').dataset.i]
      var az = b.dataset.azione
      if (az === 'conferma') {
        if (!r.fattore) return toast('Prima scrivi il fattore di conversione dell\'unità.')
        r.confermata = !r.confermata
      }
      if (az === 'ignora') { r.ignorata = !r.ignorata; r.confermata = false; calcolaRiga(r) }
      if (az === 'cambia') { var inp = b.closest('.voce').querySelector('.cerca-art input'); if (inp) { inp.focus(); return } }
      if (az === 'nuovo') {
        var unita = r.unita_sigla || 'pz'
        return finestraArticolo(null, function (a) {
          r.articoloId = a.id; r.fonte = 'nuovo articolo'; r.sicura = false; r.confermata = false
          calcolaRiga(r); passoConferma()
        }, false, { descrizione: r.descrizione, unita: unita, tipo: IMP.tipoNuovi })
      }
      passoConferma()
    })
  })
  var conf = IMP.righe.filter(function (r) { return r.confermata }).length
  var aperte = IMP.righe.filter(function (r) { return !r.confermata && !r.ignorata }).length
  html('i-riepilogo', '✔️ ' + conf + ' confermate · ' + aperte + ' da decidere · ' + RFC.fmt(costoCHF(IMP.usd)) + ' CHF di lettura')
}

// ═════════════════════════════════════════════════════════════════════════════
// SALVA
// ═════════════════════════════════════════════════════════════════════════════
async function salvaImport() {
  var conf = IMP.righe.filter(function (r) { return r.confermata && r.articoloId && r.fattore })
  var aperte = IMP.righe.filter(function (r) { return !r.confermata && !r.ignorata }).length
  if (!conf.length) return toast('Nessuna riga confermata: premi ✔️ Conferma sulle righe da salvare.')
  if (aperte && !(await conferma('Righe non confermate', aperte + (aperte === 1 ? ' riga non è confermata e NON verrà salvata.' : ' righe non sono confermate e NON verranno salvate.') + ' Continuare?', 'Salva le confermate'))) return

  // Preferito: per gli articoli con più fornitori e prezzo cambiato, si chiede.
  var preferiti = await chiediPreferiti(conf)
  if (preferiti === null) return

  el('i-salva').disabled = true
  avvisa('info', '⏳ Salvo…')
  if (!(await sessioneValida())) return
  var t = IMP.letto.testata || {}
  var percorso = null
  if (IMP.file) {
    var est = (IMP.file.name.match(/\.([a-z0-9]{2,5})$/i) || [, 'bin'])[1].toLowerCase()
    var mime = IMP.file.type || ({ pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', csv: 'text/csv' })[est] || 'application/octet-stream'
    percorso = IMP.fornitoreId + '/' + IMP.hash.slice(0, 24) + '.' + est
    var up = await sb.storage.from(BUCKET_DOC).upload(percorso, IMP.file, { contentType: mime, upsert: false })
    if (up.error && !/exists|duplicate/i.test(up.error.message || '')) throw up.error
  }
  var val = valutaImport()
  var dataPrezzo = RFC.dataISO(t.data) || RFC.oggiISO()
  var r = await sb.rpc('rf_salva_import', { p: {
    documento: {
      fornitore_id: IMP.fornitoreId,
      tipo: IMP.schedaRichiesta ? 'scheda_richiesta' : (t.tipo === 'listino' ? 'listino' : t.tipo === 'altro' ? 'altro' : 'offerta'),
      numero: t.numero || null, data_documento: dataPrezzo, valido_fino: RFC.dataISO(t.valido_fino),
      versione: IMP.sostituisce ? (IMP.precedente.versione || 1) + 1 : 1,
      sostituisce_id: IMP.sostituisce ? IMP.precedente.id : null,
      percorso: percorso, nome_file: IMP.file ? IMP.file.name : null, mime: IMP.file ? IMP.file.type : 'text/plain',
      byte: IMP.file ? IMP.file.size : IMP.testoMail.length, hash: IMP.hash, testo: IMP.file ? null : IMP.testoMail,
      valuta: val, condizioni: t.condizioni || null, righe_lette: IMP.righe.length,
      costo_lettura_usd: RFC.arrotonda(IMP.usd, 4)
    },
    prezzi: conf.map(function (x) {
      return {
        articolo_id: x.articoloId, codice_fornitore: x.codice, descrizione_fornitore: x.descrizione, marca: x.marca,
        unita_fornitore: x.unita, fattore: x.fattore, quantita_offerta: x.quantita, listino: x.listino,
        sconto1: x.sconto1, sconto2: x.sconto2, rincaro: x.rincaro, extra: x.extra, sconto_noto: x.sconto_noto,
        netto_dichiarato: x.netto_dichiarato, valuta: val, data_prezzo: dataPrezzo, valido_fino: RFC.dataISO(t.valido_fino),
        variante: x.variante, nota: x.nota
      }
    }),
    abbinamenti: conf.filter(function (x) { return !x.codice_ct }).map(function (x) {
      return { codice_fornitore: x.codice || '', descrizione_norm: RFC.descrizioneNorm(x.descrizione), articolo_id: x.articoloId,
               unita_fornitore: x.unita, fattore: x.fattore }
    }),
    preferiti: preferiti,
    chiudi_vecchia_versione: IMP.sostituisce
  } })
  if (r.error) throw r.error
  await caricaArticoli(true)
  var n = r.data.prezzi
  var v = el('vista-importa')
  avvisa('', '')
  v.innerHTML = intestazioneImport(3) +
    banner('ok', '💾 <strong>Salvati ' + n + (n === 1 ? ' prezzo' : ' prezzi') + '</strong> di ' + esc(IMP.fornitore.nome) +
      (r.data.chiusi ? ' · ' + r.data.chiusi + ' prezzi della versione precedente chiusi' : '') +
      (preferiti.length ? ' · ' + preferiti.length + ' preferiti aggiornati' : '') + '. Costo della lettura: ' + RFC.fmt(costoCHF(IMP.usd)) + ' CHF.') +
    '<div class="elenco">' + conf.map(function (x) {
      var a = articoloDaId(x.articoloId)
      return '<button type="button" class="riga" data-id="' + x.articoloId + '"><div class="corpo"><div class="codice">' + esc(a ? a.codice : '') + '</div>' +
        '<div class="desc">' + esc(a ? a.descrizione : '') + '</div></div><div class="prezzo"><strong>' + prezzoTesto(x.nuovoUnita, val) + '</strong></div></button>'
    }).join('') + '</div>' +
    '<div class="barra-azioni"><div class="spazio"></div><button type="button" class="btn btn-primario" id="i-nuovo">📥 Importa un altro documento</button></div>'
  v.querySelectorAll('.riga').forEach(function (b) { b.addEventListener('click', function () { vai('articolo', b.dataset.id) }) })
  el('i-nuovo').addEventListener('click', function () { nuovoImport(); passo1() })
  IMP.passo = 4
}

// «Vuoi cambiare il preferito?» — per gli articoli con più fornitori e prezzo
// cambiato; se l'articolo non ha nessun preferito, si propone questo fornitore
// (se non vende solo pacchi interi). Ritorna l'elenco, oppure null = annulla.
async function chiediPreferiti(conf) {
  var ids = Array.from(new Set(conf.map(function (r) { return r.articoloId })))
  var altri = {}
  for (var k = 0; k < ids.length; k += 100) {
    var q = await sb.from('rf_v_confronto').select('articolo_id,fornitore_id,fornitore_nome,netto_chf,arrivato_chf,preferito,posizione')
      .in('articolo_id', ids.slice(k, k + 100))
    if (q.error) throw q.error
    ;(q.data || []).forEach(function (p) { (altri[p.articolo_id] = altri[p.articolo_id] || []).push(p) })
  }
  var soloPacchi = IMP.fornitore.radar && IMP.fornitore.radar.solo_pacchi_interi
  var cambio = valutaImport() === 'EUR' ? Number(RF.imp.cambio_eur_chf) : 1
  var arrivo = 1 + (Number(IMP.fornitore.radar && IMP.fornitore.radar.costo_arrivo_pct) || 0) / 100
  var domande = []
  ids.forEach(function (id) {
    var a = articoloDaId(id)
    var r = conf.filter(function (x) { return x.articoloId === id && !x.variante })[0] || conf.filter(function (x) { return x.articoloId === id })[0]
    var concorrenti = (altri[id] || []).filter(function (p) { return p.fornitore_id !== IMP.fornitoreId })
    var pref = (altri[id] || []).filter(function (p) { return p.preferito })[0]
    var senzaPreferito = !a || !a.preferito_fornitore_id
    if (senzaPreferito) {
      domande.push({ id: id, a: a, r: r, concorrenti: concorrenti, pref: null, proposta: !soloPacchi })
    } else if (concorrenti.length && a.preferito_fornitore_id !== IMP.fornitoreId && (r.stato === 'aumento' || r.stato === 'calo' || r.stato === 'nuovo')) {
      domande.push({ id: id, a: a, r: r, concorrenti: concorrenti, pref: pref, proposta: false })
    } else if (concorrenti.length && a.preferito_fornitore_id === IMP.fornitoreId && r.stato === 'aumento') {
      domande.push({ id: id, a: a, r: r, concorrenti: concorrenti, pref: pref, proposta: false, giaPreferito: true })
    }
  })
  if (!domande.length) return []
  var semplici = domande.filter(function (d) { return !d.pref && !d.concorrenti.length })
  var vere = domande.filter(function (d) { return !(semplici.indexOf(d) >= 0) })
  // articoli senza nessun altro fornitore: questo diventa il preferito senza chiedere
  var risultato = semplici.filter(function (d) { return d.proposta }).map(function (d) { return { articolo_id: d.id, fornitore_id: IMP.fornitoreId } })
  if (!vere.length) return risultato
  return new Promise(function (ok) {
    apriFinestra({
      titolo: '⭐ Vuoi cambiare il preferito?', larga: true,
      html: '<p class="aiuto">Il preferito è il fornitore che consegna anche piccole quantità. Prezzi in CHF per unità dell\'articolo; «arrivato» comprende il costo di arrivo stimato.</p>' +
        vere.map(function (d) {
          var nuovoChf = d.r.nuovoUnita != null ? d.r.nuovoUnita * cambio : null
          return '<div class="voce"><strong>' + esc(d.a ? d.a.codice : '') + '</strong> — ' + esc(d.a ? d.a.descrizione : '') +
            '<ul style="margin:6px 0 6px 18px;padding:0">' +
              '<li><strong>' + esc(IMP.fornitore.nome) + '</strong> (questa offerta): ' + (nuovoChf != null ? RFC.fmt(nuovoChf) + ' CHF · arrivato ' + RFC.fmt(nuovoChf * arrivo) : '–') +
                (d.giaPreferito ? ' · ' + tag('ok', '⭐', 'è il preferito') + ' ' + tag('warn', '▲', 'aumenta') : '') + '</li>' +
              d.concorrenti.map(function (p) {
                return '<li>' + esc(p.fornitore_nome) + ': ' + (p.netto_chf != null ? RFC.fmt(p.netto_chf) + ' CHF · arrivato ' + RFC.fmt(p.arrivato_chf) : '–') +
                  (p.preferito ? ' · ' + tag('ok', '⭐', 'preferito') : '') + '</li>'
              }).join('') + '</ul>' +
            (d.giaPreferito ? '<p class="aiuto">Per scegliere un altro preferito apri la scheda dell\'articolo → ⭐ Cambia preferito.</p>'
              : '<label class="scelta"><input type="checkbox" data-pref="' + d.id + '"' + (d.proposta ? ' checked' : '') + '> Rendi preferito ' + esc(IMP.fornitore.nome) + '</label>') +
            '</div>'
        }).join(''),
      pulsanti: [
        { testo: 'Annulla', sinistra: true, azione: function (f) { f.chiudi(); ok(null) } },
        { testo: 'Continua e salva', classe: 'btn-primario', azione: function (f) {
            f.q('.contenuto').querySelectorAll('[data-pref]:checked').forEach(function (c) {
              risultato.push({ articolo_id: c.dataset.pref, fornitore_id: IMP.fornitoreId })
            })
            f.chiudi(); ok(risultato)
          } }
      ]
    })
  })
}
