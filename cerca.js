// CT Radar Fornitori — cerca.js
// Pagina «Cerca», scheda articolo (foto, fornitori in ordine di convenienza,
// Storico, Preferito, Modifica, Archivia), nuovo articolo, prezzo a mano,
// esportazione del listino per l'Excel.

'use strict'

var CERCA = { testo: '', categoria: '', soloVerificare: false, archiviati: false, quanti: 100 }

// ═════════════════════════════════════════════════════════════════════════════
// PAGINA CERCA
// ═════════════════════════════════════════════════════════════════════════════
async function disegnaCerca() {
  if (!(await caricaBase()) || !(await caricaArticoli())) return
  var v = el('vista-cerca')
  v.innerHTML =
    '<div class="intestazione"><h1>🔍 Cerca</h1>' +
      '<div class="gruppo-btn">' +
        '<button type="button" class="btn" id="c-esporta">⬇️ Esporta listino</button>' +
        '<button type="button" class="btn btn-primario" id="c-nuovo">＋ Nuovo articolo</button>' +
      '</div></div>' +
    '<div class="barra-ricerca">' +
      '<div class="campo"><span class="lente" aria-hidden="true">🔍</span>' +
        '<input id="c-testo" type="search" placeholder="Cerca: es. abete 19, velux sk06…" autocomplete="off" aria-label="Cerca articolo" /></div>' +
      '<select id="c-categoria" aria-label="Filtra per categoria"><option value="">Tutte le categorie</option>' + opzioniCategorie(CERCA.categoria) + '</select>' +
    '</div>' +
    '<div class="gruppo-btn" style="margin-bottom:8px">' +
      '<label class="scelta"><input type="checkbox" id="c-verificare"' + (CERCA.soloVerificare ? ' checked' : '') + '> Solo «Da verificare»</label>' +
      (RF.titolare ? '<label class="scelta"><input type="checkbox" id="c-archiviati"' + (CERCA.archiviati ? ' checked' : '') + '> Mostra archiviati</label>' : '') +
    '</div>' +
    '<div id="c-conteggio" class="conteggio"></div>' +
    '<div id="c-risultati" class="elenco"></div>'
  el('c-testo').value = CERCA.testo
  var timer = null
  el('c-testo').addEventListener('input', function () {
    clearTimeout(timer)
    timer = setTimeout(function () { CERCA.testo = el('c-testo').value; CERCA.quanti = 100; elencoCerca() }, 150)
  })
  el('c-categoria').addEventListener('change', function () { CERCA.categoria = this.value; CERCA.quanti = 100; elencoCerca() })
  el('c-verificare').addEventListener('change', function () { CERCA.soloVerificare = this.checked; elencoCerca() })
  if (el('c-archiviati')) el('c-archiviati').addEventListener('change', function () { CERCA.archiviati = this.checked; elencoCerca() })
  el('c-nuovo').addEventListener('click', function () { finestraArticolo(null, function (a) { vai('articolo', a.id) }) })
  el('c-esporta').addEventListener('click', esportaListino)
  el('c-testo').focus()
  elencoCerca()
}

function avvisiArticolo(a) {
  var t = []
  if (a.archiviato) t.push(tag('', '📦', 'Archiviato'))
  if (a.da_verificare) t.push(tag('warn', '❓', 'Da verificare'))
  if (!a.n_foto) t.push(tag('', '📷', 'Manca la foto'))
  if (!a.n_prezzi) t.push(tag('', '∅', 'Nessun prezzo'))
  else if (!a.preferito_fornitore_id) t.push(tag('warn', '⭐', 'Nessun preferito'))
  if (a.preferito_scaduto) t.push(tag('warn', '⏰', 'Offerta scaduta'))
  if (a.preferito_vecchio) t.push(tag('warn', '🕰️', 'Prezzo vecchio'))
  if (a.preferito_sconto_noto === false) t.push(tag('warn', '❔', 'Sconto non noto'))
  if (a.preferito_senza_fattore) t.push(tag('err', '📏', 'Unità senza fattore'))
  if (a.preferito_solo_pacchi) t.push(tag('info', '📦', 'Solo pacchi interi'))
  return t.join(' ')
}

function filtraArticoli() {
  return RF.articoli.filter(function (a) {
    if (a.archiviato && !CERCA.archiviati) return false
    if (CERCA.categoria && String(a.categoria_id) !== String(CERCA.categoria)) return false
    if (CERCA.soloVerificare && !a.da_verificare) return false
    return !CERCA.testo || RFC.corrisponde(a._cerca, CERCA.testo)
  })
}

async function elencoCerca() {
  var trovati = filtraArticoli()
  html('c-conteggio', trovati.length + (trovati.length === 1 ? ' articolo' : ' articoli'))
  var mostrati = trovati.slice(0, CERCA.quanti)
  html('c-risultati', mostrati.map(function (a) {
    var prezzo = a.preferito_chf != null
      ? '<strong>' + RFC.fmt(a.preferito_chf) + ' CHF</strong><span class="dim">/ ' + esc(a.unita) + '</span><br>' +
        '<span class="piccolo">⭐ ' + esc(a.preferito_nome || '') + ' · ' + RFC.fmtData(a.preferito_data) + '</span>'
      : a.migliore_chf != null
        ? '<strong>' + RFC.fmt(a.migliore_chf) + ' CHF</strong><span class="dim">/ ' + esc(a.unita) + '</span><br>' +
          '<span class="piccolo">più conveniente: ' + esc(a.migliore_nome || '') + '</span>'
        : '<span class="dim">Nessun prezzo</span>'
    return '<button type="button" class="riga" data-id="' + a.id + '">' +
      '<div class="foto-mini" data-foto="' + esc(a.foto_principale || '') + '">' + (a.foto_principale ? '' : 'Manca foto') + '</div>' +
      '<div class="corpo"><div class="codice">' + esc(a.codice) + '</div>' +
        '<div class="desc">' + esc(a.descrizione) + '</div>' +
        '<div class="dim piccolo">' + esc(a.categoria) + ' · ' + esc(a.tipo) + ' · unità ' + esc(a.unita) + '</div>' +
        '<div class="tags" style="margin-top:4px">' + avvisiArticolo(a) + '</div></div>' +
      '<div class="prezzo">' + prezzo + '</div></button>'
  }).join('') + (trovati.length > mostrati.length
    ? '<button type="button" class="btn" id="c-altri">Mostra altri ' + Math.min(100, trovati.length - mostrati.length) + '</button>' : '')
    || '<div class="vuoto">Nessun articolo trovato. Prova con meno parole, oppure ＋ Nuovo articolo.</div>')
  el('c-risultati').querySelectorAll('.riga').forEach(function (b) {
    b.addEventListener('click', function () { vai('articolo', b.dataset.id) })
  })
  if (el('c-altri')) el('c-altri').addEventListener('click', function () { CERCA.quanti += 100; elencoCerca() })
  // miniature (link firmati)
  var nodi = Array.from(el('c-risultati').querySelectorAll('[data-foto]')).filter(function (n) { return n.dataset.foto })
  if (nodi.length) {
    var link = await linkFirmati(BUCKET_FOTO, nodi.map(function (n) { return n.dataset.foto }))
    nodi.forEach(function (n) { if (link[n.dataset.foto]) n.innerHTML = '<img alt="" loading="lazy" src="' + esc(link[n.dataset.foto]) + '">' })
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SCHEDA ARTICOLO
// ═════════════════════════════════════════════════════════════════════════════
async function disegnaArticolo(id) {
  if (!(await caricaBase()) || !(await caricaArticoli())) return
  var a = articoloDaId(id)
  var v = el('vista-articolo')
  if (!a) { v.innerHTML = '<button class="btn" onclick="vai(\'cerca\')">← Cerca</button>' + banner('warn', 'Articolo non trovato.'); return }
  v.innerHTML = '<div class="caricamento">⏳ Carico…</div>'
  if (!(await sessioneValida())) return
  var r = await Promise.all([
    sb.from('rf_v_confronto').select('*').eq('articolo_id', id).order('posizione'),
    sb.from('rf_foto_articolo').select('*').eq('articolo_id', id).eq('archiviata', false).order('principale', { ascending: false }).order('creato_il'),
    sb.from('rf_articoli').select('*').eq('id', id).single()
  ])
  r.forEach(function (x) { if (x.error) throw x.error })
  var prezzi = r[0].data || [], foto = r[1].data || [], art = r[2].data
  var cat = categoriaDaId(art.categoria_id)

  v.innerHTML =
    '<div class="gruppo-btn non-stampare" style="margin-bottom:12px"><button type="button" class="btn" id="a-indietro">← Cerca</button></div>' +
    '<div class="scheda">' +
      '<div class="intestazione"><h1><span class="mono">' + esc(art.codice) + '</span><br>' + esc(art.descrizione) + '</h1></div>' +
      '<div class="tags" style="margin-bottom:12px">' + avvisiArticolo(a) + '</div>' +
      '<div id="a-foto"></div>' +
      '<div class="griglia" style="margin-top:12px">' +
        '<div><span class="dim">Categoria</span><br>' + esc(cat ? cat.nome + ' (' + cat.gruppo + ')' : '–') + '</div>' +
        '<div><span class="dim">Tipo</span><br>' + esc(art.tipo) + '</div>' +
        '<div><span class="dim">Unità</span><br>' + esc(art.unita) + '</div>' +
        '<div><span class="dim">Creato</span><br>' + esc(RFC.timbro(art.creato_iniziali, art.creato_il)) + '</div>' +
        (art.modificato_il ? '<div><span class="dim">Modificato</span><br>' + esc(RFC.timbro(art.modificato_iniziali, art.modificato_il)) + '</div>' : '') +
      '</div>' +
      (art.note ? '<p style="margin-top:12px"><span class="dim">Note:</span> ' + esc(art.note) + '</p>' : '') +
      (art.da_verificare ? banner('warn', '<strong>Da verificare:</strong> ' + esc(art.da_verificare)) : '') +
    '</div>' +
    '<div class="scheda">' +
      '<div class="intestazione"><h2>🏭 Fornitori, dal più conveniente</h2></div>' +
      '<p class="aiuto">Conveniente = prezzo ARRIVATO in CHF: netto (convertito se in EUR, cambio ' +
        RFC.fmt(RF.imp.cambio_eur_chf, 4) + ' del ' + RFC.fmtData(RF.imp.cambio_data) + ') + costo di arrivo stimato del fornitore.</p>' +
      tabellaConfronto(prezzi, art) +
    '</div>' +
    '<div class="barra-azioni non-stampare">' +
      '<div class="gruppo-btn">' +
        '<button type="button" class="btn" id="a-storico">📊 Storico</button>' +
        '<button type="button" class="btn" id="a-preferito">⭐ Cambia preferito</button>' +
        '<button type="button" class="btn" id="a-manuale">✍️ Prezzo a mano</button>' +
        (RF.titolare ? '<button type="button" class="btn btn-pericolo" id="a-archivia">' + (art.archiviato ? '↩️ Ripristina' : '📦 Archivia') + '</button>' : '') +
      '</div><div class="spazio"></div>' +
      '<button type="button" class="btn btn-primario" id="a-modifica">✏️ Modifica</button>' +
    '</div>'

  disegnaFoto(art, foto)
  el('a-indietro').addEventListener('click', function () { vai('cerca') })
  el('a-storico').addEventListener('click', function () { finestraStorico(art) })
  el('a-preferito').addEventListener('click', function () { finestraPreferito(art, prezzi) })
  el('a-manuale').addEventListener('click', function () { finestraPrezzoManuale(art) })
  el('a-modifica').addEventListener('click', function () {
    finestraArticolo(art, function () { disegnaArticolo(art.id) }, prezzi.length > 0)
  })
  if (el('a-archivia')) el('a-archivia').addEventListener('click', async function () {
    var ok = await conferma(art.archiviato ? 'Ripristina articolo' : 'Archivia articolo',
      art.archiviato ? 'L\'articolo torna visibile nelle ricerche.'
                     : 'L\'articolo sparisce dalle ricerche e dall\'esportazione. Prezzi, foto e storico restano. Si può ripristinare.',
      art.archiviato ? '↩️ Ripristina' : '📦 Archivia', !art.archiviato)
    if (!ok) return
    var u = await sb.from('rf_articoli').update({ archiviato: !art.archiviato }).eq('id', art.id).select('id')
    if (u.error) return avvisa('err', esc('Non riuscito: ' + spiegaErrore(u.error)))
    if (!u.data || !u.data.length) return avvisa('err', 'Non riuscito: nessuna riga modificata (permessi?).')
    await caricaArticoli(true)
    toast(art.archiviato ? '↩️ Ripristinato' : '📦 Archiviato')
    disegnaArticolo(art.id)
  })
}

function tabellaConfronto(prezzi, art) {
  if (!prezzi.length) return '<div class="vuoto">Nessun prezzo. I prezzi entrano con «📥 Importa offerta» oppure «✍️ Prezzo a mano».</div>'
  return '<div class="tabella-wrap"><table class="tab a-schede"><thead><tr>' +
    '<th>#</th><th>Fornitore</th><th>Voce del fornitore</th><th class="num">Listino e sconti</th>' +
    '<th class="num">Netto</th><th class="num">CHF / ' + esc(art.unita) + '</th><th class="num">Arrivato CHF</th>' +
    '<th>Data</th><th>Chi</th><th>Avvisi</th></tr></thead><tbody>' +
    prezzi.map(function (p) {
      // i numeri possono arrivare come testo («0.0000»): si convertono sempre
      ;['sconto1_usato', 'sconto2', 'rincaro', 'extra', 'fattore', 'costo_arrivo_pct'].forEach(function (k) {
        if (p[k] != null) p[k] = Number(p[k])
      })
      var sconti = [p.sconto1_usato ? '−' + RFC.fmt(p.sconto1_usato, 2) + '%' : '', p.sconto2 ? '−' + RFC.fmt(p.sconto2, 2) + '%' : '',
                    p.rincaro ? '+' + RFC.fmt(p.rincaro, 2) + '%' : '', p.extra ? '+' + RFC.fmt(p.extra) + ' extra' : ''].filter(Boolean).join(' ')
      return '<tr class="' + (p.preferito ? 'preferito' : '') + '">' +
        '<td data-et="Posizione">' + p.posizione + '</td>' +
        '<td data-et="Fornitore"><strong>' + esc(p.fornitore_nome) + '</strong>' + (p.preferito ? '<br>' + tag('ok', '⭐', 'Preferito') : '') + '</td>' +
        '<td data-et="Voce">' + esc([p.marca, p.codice_fornitore].filter(Boolean).join(' · ')) +
          (p.descrizione_fornitore ? '<br><span class="dim piccolo">' + esc(p.descrizione_fornitore) + '</span>' : '') +
          (p.unita_fornitore && p.fattore !== 1 ? '<br><span class="piccolo">1 ' + esc(p.unita_fornitore) + ' = ' + (p.fattore ? RFC.fmt(p.fattore, 4) + ' ' + esc(art.unita) : '?') + '</span>' : '') + '</td>' +
        '<td data-et="Listino e sconti" class="num">' + RFC.fmt(p.listino) + ' ' + esc(p.valuta) + '<br><span class="piccolo">' + esc(sconti) + '</span></td>' +
        '<td data-et="Netto" class="num">' + prezzoTesto(p.netto_oggi, p.valuta) + (p.unita_fornitore ? '<span class="dim"> / ' + esc(p.unita_fornitore) + '</span>' : '') + '</td>' +
        '<td data-et="CHF per unità" class="num"><strong>' + (p.netto_chf != null ? RFC.fmt(p.netto_chf) : '–') + '</strong></td>' +
        '<td data-et="Arrivato CHF" class="num">' + (p.arrivato_chf != null ? RFC.fmt(p.arrivato_chf) : '–') +
          (p.costo_arrivo_pct ? '<br><span class="piccolo">+' + RFC.fmt(p.costo_arrivo_pct, 1) + '% arrivo</span>' : '') + '</td>' +
        '<td data-et="Data">' + RFC.fmtData(p.data_prezzo) + (p.valido_fino ? '<br><span class="piccolo">fino al ' + RFC.fmtData(p.valido_fino) + '</span>' : '') + '</td>' +
        '<td data-et="Chi" class="nowrap">' + esc(RFC.timbro(p.creato_iniziali, p.creato_il)) + '</td>' +
        '<td data-et="Avvisi"><div class="tags">' + avvisiPrezzo(p) + '</div></td></tr>'
    }).join('') + '</tbody></table></div>'
}

// ── Foto ─────────────────────────────────────────────────────────────────────
async function disegnaFoto(art, foto) {
  var box = el('a-foto')
  var percorsi = foto.map(function (f) { return f.percorso })
  var link = percorsi.length ? await linkFirmati(BUCKET_FOTO, percorsi) : {}
  box.innerHTML =
    (foto.length ? '<img class="foto-grande" alt="Foto principale di ' + esc(art.descrizione) + '" src="' + esc(link[foto[0].percorso] || '') + '">' :
      banner('info', '📷 Manca la foto. Serve almeno una foto per articolo.')) +
    (foto.length > 1 || foto.length === 1 ? '<div class="galleria">' + foto.map(function (f) {
      return '<figure class="' + (f.principale ? 'principale' : '') + '"><img alt="" src="' + esc(link[f.percorso] || '') + '">' +
        '<figcaption>' + (f.principale ? '⭐ Principale' : '') + '<br>' + esc(RFC.timbro(f.creato_iniziali, f.creato_il)) + '</figcaption>' +
        '<div class="gruppo-btn">' +
          (f.principale ? '' : '<button type="button" class="btn btn-piccolo" data-principale="' + f.id + '">⭐ Principale</button>') +
          '<button type="button" class="btn btn-piccolo" data-nascondi="' + f.id + '">🙈 Togli</button>' +
        '</div></figure>'
    }).join('') + '</div>' : '') +
    '<div class="gruppo-btn non-stampare" style="margin-top:10px">' +
      '<label class="btn" for="a-scatta">📷 Scatta foto</label>' +
      '<input type="file" id="a-scatta" accept="image/*" capture="environment" hidden>' +
      '<label class="btn" for="a-scegli">🖼️ Scegli foto</label>' +
      '<input type="file" id="a-scegli" accept="image/*" multiple hidden>' +
    '</div><div id="a-foto-stato" aria-live="polite"></div>'
  function carica(ev) { caricaFoto(art, Array.from(ev.target.files || []), foto.length === 0) }
  el('a-scatta').addEventListener('change', carica)
  el('a-scegli').addEventListener('change', carica)
  box.querySelectorAll('[data-principale]').forEach(function (b) {
    b.addEventListener('click', async function () {
      var r = await sb.rpc('rf_foto_principale', { p_foto: b.dataset.principale })
      if (r.error) return avvisa('err', esc('Non riuscito: ' + spiegaErrore(r.error)))
      await caricaArticoli(true); disegnaArticolo(art.id)
    })
  })
  box.querySelectorAll('[data-nascondi]').forEach(function (b) {
    b.addEventListener('click', async function () {
      if (!(await conferma('Togli foto', 'La foto non si vede più nella scheda. Il file NON viene cancellato.', '🙈 Togli'))) return
      var r = await sb.from('rf_foto_articolo').update({ archiviata: true, principale: false }).eq('id', b.dataset.nascondi).select('id')
      if (r.error) return avvisa('err', esc('Non riuscito: ' + spiegaErrore(r.error)))
      await caricaArticoli(true); disegnaArticolo(art.id)
    })
  })
}

async function caricaFoto(art, files, primaFoto) {
  if (!files.length) return
  var stato = el('a-foto-stato')
  try {
    if (!(await sessioneValida())) return
    for (var i = 0; i < files.length; i++) {
      html(stato, banner('info', '⏳ Riduco e carico la foto ' + (i + 1) + ' di ' + files.length + '…'))
      var c = await comprimiFoto(files[i], 1600, 0.8)
      var percorso = art.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg'
      var up = await sb.storage.from(BUCKET_FOTO).upload(percorso, c.blob, { contentType: 'image/jpeg', upsert: false })
      if (up.error) throw up.error
      var ins = await sb.from('rf_foto_articolo').insert({
        articolo_id: art.id, percorso: percorso, principale: primaFoto && i === 0,
        larghezza: c.larghezza, altezza: c.altezza, byte: c.blob.size
      })
      if (ins.error) throw ins.error
    }
    await caricaArticoli(true)
    toast('📷 Foto caricata')
    disegnaArticolo(art.id)
  } catch (e) {
    html(stato, banner('err', esc('Foto non caricata: ' + spiegaErrore(e))))
  }
}

// ── Storico (nascosto: si apre col pulsante) ────────────────────────────────
async function finestraStorico(art) {
  if (!(await sessioneValida())) return
  var r = await sb.from('rf_v_storico').select('*').eq('articolo_id', art.id).order('data_prezzo').order('creato_il')
  if (r.error) return avvisa('err', esc('Storico non disponibile: ' + spiegaErrore(r.error)))
  var righe = r.data || []
  var fornitori = {}
  righe.forEach(function (x) { fornitori[x.fornitore_id] = x.fornitore_nome })
  var fin = apriFinestra({
    titolo: '📊 Storico — ' + art.codice, larga: true,
    html:
      '<label for="s-filtro">Fornitore</label><select id="s-filtro"><option value="">Tutti i fornitori</option>' +
        Object.keys(fornitori).map(function (k) { return '<option value="' + k + '">' + esc(fornitori[k]) + '</option>' }).join('') + '</select>' +
      '<div style="height:280px;margin:16px 0"><canvas id="s-grafico" aria-label="Grafico dell\'andamento dei prezzi"></canvas></div>' +
      '<p class="aiuto">Prezzo netto per ' + esc(art.unita) + ' in CHF (gli EUR al cambio di oggi), senza le variazioni da mail.</p>' +
      '<div id="s-tabella"></div>'
  })
  var grafico = null
  function disegna() {
    var filtro = fin.q('#s-filtro').value
    var sel = righe.filter(function (x) { return !filtro || x.fornitore_id === filtro })
    html(fin.q('#s-tabella'), sel.length ? '<div class="tabella-wrap"><table class="tab a-schede"><thead><tr>' +
      '<th>Data</th><th>Fornitore</th><th class="num">Listino</th><th class="num">Netto</th><th class="num">CHF / ' + esc(art.unita) + '</th><th>Stato</th><th>Documento</th><th>Chi</th></tr></thead><tbody>' +
      sel.slice().reverse().map(function (x) {
        return '<tr class="' + (x.stato === 'sostituito' ? 'sostituito' : '') + '">' +
          '<td data-et="Data">' + RFC.fmtData(x.data_prezzo) + '</td>' +
          '<td data-et="Fornitore">' + esc(x.fornitore_nome) + (x.variante ? ' ' + tag('', '🔀', 'Variante') : '') + '</td>' +
          '<td data-et="Listino" class="num">' + prezzoTesto(x.listino, x.valuta) + '</td>' +
          '<td data-et="Netto" class="num">' + prezzoTesto(x.netto_base, x.valuta) + '</td>' +
          '<td data-et="CHF" class="num">' + (x.netto_chf_cambio_oggi != null ? RFC.fmt(x.netto_chf_cambio_oggi) : '–') + '</td>' +
          '<td data-et="Stato">' + (x.stato === 'attivo' ? tag('ok', '✔️', 'Attivo') : tag('', '↪️', 'Sostituito')) + '</td>' +
          '<td data-et="Documento">' + esc([x.documento_tipo, x.documento_numero].filter(Boolean).join(' ')) + '</td>' +
          '<td data-et="Chi" class="nowrap">' + esc(RFC.timbro(x.creato_iniziali, x.creato_il)) + '</td></tr>'
      }).join('') + '</tbody></table></div>' : '<div class="vuoto">Nessun prezzo.</div>')
    disegnaGrafico(sel)
  }
  async function disegnaGrafico(sel) {
    try { await caricaLibreria('chart') } catch (e) { html(fin.q('#s-tabella'), banner('warn', esc('Grafico non disponibile: ' + e.message)) + fin.q('#s-tabella').innerHTML); return }
    var date = Array.from(new Set(sel.map(function (x) { return x.data_prezzo }))).sort()
    var perForn = {}
    sel.forEach(function (x) {
      if (x.netto_chf_cambio_oggi == null) return
      ;(perForn[x.fornitore_nome] = perForn[x.fornitore_nome] || {})[x.data_prezzo] = Number(x.netto_chf_cambio_oggi)
    })
    // colori e TRATTEGGI diversi: le linee si distinguono anche senza colori
    var colori = ['#2d6a4f', '#1d4ed8', '#b45309', '#7c3aed', '#be123c', '#0f766e', '#4b5563']
    var tratti = [[], [6, 4], [2, 3], [10, 3, 2, 3]]
    var punti = ['circle', 'rect', 'triangle', 'rectRot', 'star', 'cross']
    var dataset = Object.keys(perForn).map(function (nome, i) {
      return { label: nome, data: date.map(function (d) { return perForn[nome][d] != null ? perForn[nome][d] : null }),
               borderColor: colori[i % colori.length], backgroundColor: colori[i % colori.length],
               borderDash: tratti[i % tratti.length], pointStyle: punti[i % punti.length], pointRadius: 5, spanGaps: true, tension: 0 }
    })
    if (grafico) grafico.destroy()
    grafico = new window.Chart(fin.q('#s-grafico'), {
      type: 'line',
      data: { labels: date.map(RFC.fmtData), datasets: dataset },
      options: { maintainAspectRatio: false, plugins: { legend: { labels: { usePointStyle: true, font: { size: 15 } } } },
                 scales: { y: { title: { display: true, text: 'CHF / ' + art.unita } } } }
    })
  }
  fin.q('#s-filtro').addEventListener('change', disegna)
  disegna()
}

// ── Cambia preferito ─────────────────────────────────────────────────────────
function finestraPreferito(art, prezzi) {
  var forn = []
  prezzi.forEach(function (p) { if (!forn.some(function (f) { return f.fornitore_id === p.fornitore_id })) forn.push(p) })
  if (!forn.length) return toast('Nessun fornitore con un prezzo: prima importa un\'offerta.')
  apriFinestra({
    titolo: '⭐ Cambia preferito — ' + art.codice,
    html: '<p class="aiuto">Il preferito è il fornitore che consegna anche piccole quantità. Un solo preferito per articolo.</p>' +
      forn.map(function (p) {
        return '<label class="scelta"><input type="radio" name="pref" value="' + p.fornitore_id + '"' + (p.preferito ? ' checked' : '') + '> ' +
          '<span><strong>' + esc(p.fornitore_nome) + '</strong> — ' + (p.netto_chf != null ? RFC.fmt(p.netto_chf) + ' CHF/' + esc(art.unita) : 'prezzo non confrontabile') +
          ' · arrivato ' + (p.arrivato_chf != null ? RFC.fmt(p.arrivato_chf) : '–') + ' · posizione ' + p.posizione +
          (p.solo_pacchi_interi ? ' · ' + tag('info', '📦', 'Solo pacchi interi') : '') + '</span></label>'
      }).join(''),
    pulsanti: [
      { testo: 'Annulla', sinistra: true, azione: function (f) { f.chiudi() } },
      { testo: '⭐ Salva preferito', classe: 'btn-primario', azione: async function (f, b) {
          var sel = f.q('input[name="pref"]:checked')
          if (!sel) return toast('Scegli un fornitore.')
          b.disabled = true
          var r = await sb.from('rf_preferiti').upsert({ articolo_id: art.id, fornitore_id: sel.value }, { onConflict: 'articolo_id' })
          b.disabled = false
          if (r.error) return toast('Non salvato: ' + spiegaErrore(r.error))
          f.chiudi(); await caricaArticoli(true); toast('⭐ Preferito salvato'); disegnaArticolo(art.id)
        } }
    ]
  })
}

// ── Nuovo / modifica articolo ────────────────────────────────────────────────
// art = null → nuovo. dopo(articolo). bloccaUnita: ci sono già prezzi.
// prefill: { descrizione, unita, categoria_id } (dall'import)
function finestraArticolo(art, dopo, bloccaUnita, prefill) {
  var nuovo = !art
  var p = prefill || {}
  var fin = apriFinestra({
    titolo: nuovo ? '＋ Nuovo articolo' : '✏️ Modifica articolo',
    html:
      '<label for="f-descrizione">Descrizione</label><input id="f-descrizione" value="' + esc(nuovo ? (p.descrizione || '') : art.descrizione) + '">' +
      '<label for="f-codice">Codice</label>' +
      (nuovo ? '<input id="f-codice" class="mono" autocomplete="off" spellcheck="false" value="' + esc(p.descrizione ? RFC.proponiCodice(p.descrizione) : '') + '">' +
               '<div class="aiuto">Parti separate da _, solo lettere, numeri, punto e trattino. Es. 3strati_abete_19mm_BC. Il codice NON si potrà cambiare.</div>' +
               '<div id="f-codice-err" class="errore-campo" aria-live="polite"></div>'
             : '<input id="f-codice" class="mono" value="' + esc(art.codice) + '" disabled><div class="aiuto">Il codice non si cambia.</div>') +
      '<div class="griglia">' +
        '<div><label for="f-categoria">Categoria</label><select id="f-categoria">' + opzioniCategorie(nuovo ? p.categoria_id : art.categoria_id, nuovo && !p.categoria_id) + '</select></div>' +
        '<div><label for="f-tipo">Tipo</label><select id="f-tipo">' + ['Materiale', 'Servizio', 'Subappalto'].map(function (t) {
          return '<option' + ((nuovo ? (p.tipo || 'Materiale') : art.tipo) === t ? ' selected' : '') + '>' + t + '</option>' }).join('') + '</select></div>' +
        '<div><label for="f-unita">Unità</label><select id="f-unita"' + (bloccaUnita ? ' disabled' : '') + '>' + opzioniUnita(nuovo ? (p.unita || 'pz') : art.unita) + '</select>' +
          (bloccaUnita ? '<div class="aiuto">Ci sono già prezzi: cambiare l\'unità renderebbe sbagliate le conversioni.</div>' : '') + '</div>' +
      '</div>' +
      '<label for="f-note">Note</label><textarea id="f-note" rows="3">' + esc(nuovo ? '' : (art.note || '')) + '</textarea>' +
      '<label for="f-verificare">Da verificare (dubbi aperti — vuoto = tutto a posto)</label><input id="f-verificare" value="' + esc(nuovo ? '' : (art.da_verificare || '')) + '">' +
      '<div id="f-errore" aria-live="polite" style="margin-top:12px"></div>',
    pulsanti: [
      { testo: 'Annulla', sinistra: true, azione: function (f) { f.chiudi() } },
      { testo: nuovo ? '＋ Crea articolo' : '💾 Salva', classe: 'btn-primario', azione: salva }
    ]
  })
  if (nuovo) {
    var toccato = false
    fin.q('#f-codice').addEventListener('input', function () { toccato = true; controlla() })
    fin.q('#f-descrizione').addEventListener('input', function () {
      if (!toccato) { fin.q('#f-codice').value = RFC.proponiCodice(this.value); controlla() }
    })
    controlla()
  }
  function controlla() {
    var c = fin.q('#f-codice').value.trim()
    var e = RFC.perchéCodiceNonValido(c)
    if (!e && articoloDaCodice(c)) e = 'Questo codice esiste già.'
    html(fin.q('#f-codice-err'), c ? esc(e) : '')
    return !e
  }
  async function salva(f, b) {
    var dati = {
      descrizione: f.q('#f-descrizione').value.trim(),
      categoria_id: Number(f.q('#f-categoria').value) || null,
      tipo: f.q('#f-tipo').value,
      note: f.q('#f-note').value.trim() || null,
      da_verificare: f.q('#f-verificare').value.trim() || null
    }
    if (!bloccaUnita) dati.unita = f.q('#f-unita').value
    if (!dati.descrizione) return html(f.q('#f-errore'), banner('err', 'Scrivi la descrizione.'))
    if (!dati.categoria_id) return html(f.q('#f-errore'), banner('err', 'Scegli la categoria.'))
    if (nuovo) {
      if (!controlla()) return html(f.q('#f-errore'), banner('err', 'Il codice non va bene: ' + esc(RFC.perchéCodiceNonValido(f.q('#f-codice').value.trim()) || 'esiste già.')))
      dati.codice = f.q('#f-codice').value.trim()
    }
    b.disabled = true
    if (!(await sessioneValida())) return
    var r = nuovo ? await sb.from('rf_articoli').insert(dati).select('id').single()
                  : await sb.from('rf_articoli').update(dati).eq('id', art.id).select('id').single()
    b.disabled = false
    if (r.error) return html(f.q('#f-errore'), banner('err', esc('Non salvato: ' + spiegaErrore(r.error))))
    f.chiudi()
    await caricaArticoli(true)
    toast(nuovo ? '＋ Articolo creato' : '💾 Salvato')
    if (dopo) dopo(articoloDaId(r.data.id))
  }
}

// ── Prezzo a mano (es. preso al telefono) ───────────────────────────────────
function finestraPrezzoManuale(art) {
  var fin = apriFinestra({
    titolo: '✍️ Prezzo a mano — ' + art.codice,
    html:
      '<label for="m-forn">Fornitore</label><select id="m-forn">' + opzioniFornitori(null, true) + '</select>' +
      '<div class="griglia">' +
        '<div><label for="m-listino">Listino</label><input id="m-listino" inputmode="decimal"></div>' +
        '<div><label for="m-valuta">Valuta</label><select id="m-valuta"><option>CHF</option><option>EUR</option></select></div>' +
        '<div><label for="m-s1">Sconto 1 %</label><input id="m-s1" inputmode="decimal" value="0"></div>' +
        '<div><label for="m-s2">Sconto 2 %</label><input id="m-s2" inputmode="decimal" value="0"></div>' +
        '<div><label for="m-r">Rincaro %</label><input id="m-r" inputmode="decimal" value="0"></div>' +
        '<div><label for="m-extra">Extra per unità</label><input id="m-extra" inputmode="decimal" value="0"></div>' +
        '<div><label for="m-unita">Unità del fornitore</label><select id="m-unita">' + opzioniUnita(art.unita) + '</select></div>' +
        '<div><label for="m-fattore">Quanti ' + esc(art.unita) + ' in 1 unità del fornitore</label><input id="m-fattore" inputmode="decimal" value="1"></div>' +
        '<div><label for="m-data">Data del prezzo</label><input id="m-data" type="date" value="' + RFC.oggiISO() + '"></div>' +
        '<div><label for="m-fino">Valido fino (facoltativo)</label><input id="m-fino" type="date"></div>' +
      '</div>' +
      '<label class="scelta"><input type="checkbox" id="m-noto" checked> Conosco lo sconto (togli la spunta se hai solo il netto)</label>' +
      '<label for="m-nota">Nota (es. «al telefono con Rossi»)</label><input id="m-nota">' +
      '<div id="m-calcolo" class="banner info" style="margin-top:12px"></div><div id="m-err"></div>',
    pulsanti: [
      { testo: 'Annulla', sinistra: true, azione: function (f) { f.chiudi() } },
      { testo: '💾 Salva prezzo', classe: 'btn-primario', azione: salva }
    ]
  })
  function valori() {
    return {
      listino: RFC.numero(fin.q('#m-listino').value), s1: RFC.numero(fin.q('#m-s1').value) || 0,
      s2: RFC.numero(fin.q('#m-s2').value) || 0, r: RFC.numero(fin.q('#m-r').value) || 0,
      extra: RFC.numero(fin.q('#m-extra').value) || 0, fattore: RFC.numero(fin.q('#m-fattore').value)
    }
  }
  function ricalcola() {
    var v = valori()
    if (v.listino == null) return html(fin.q('#m-calcolo'), 'Netto: scrivi il listino.')
    var n = RFC.nettoBase(v.listino, v.s1, v.s2, v.r, v.extra)
    html(fin.q('#m-calcolo'), 'Netto: <strong>' + RFC.fmt(n) + ' ' + fin.q('#m-valuta').value + '</strong>' +
      (v.fattore && v.fattore !== 1 ? ' → ' + RFC.fmt(n / v.fattore) + ' per ' + esc(art.unita) : ''))
  }
  fin.el.querySelectorAll('input, select').forEach(function (i) { i.addEventListener('input', ricalcola) })
  ricalcola()
  async function salva(f, b) {
    var v = valori()
    var contatto = f.q('#m-forn').value
    if (!contatto) return html(f.q('#m-err'), banner('err', 'Scegli il fornitore.'))
    if (v.listino == null || v.listino < 0) return html(f.q('#m-err'), banner('err', 'Scrivi il listino.'))
    if (!v.fattore || v.fattore <= 0) return html(f.q('#m-err'), banner('err', 'Il fattore deve essere più di 0.'))
    if (v.s1 >= 100 || v.s2 >= 100 || v.s1 < 0 || v.s2 < 0) return html(f.q('#m-err'), banner('err', 'Gli sconti vanno da 0 a 99.'))
    b.disabled = true
    try {
      var fid = await assicuraFornitoreRadar(contatto)
      var noto = f.q('#m-noto').checked
      var r = await sb.rpc('rf_salva_import', { p: {
        documento: { fornitore_id: fid, tipo: 'altro', data_documento: f.q('#m-data').value, valuta: f.q('#m-valuta').value,
                     testo: 'Prezzo inserito a mano' + (f.q('#m-nota').value ? ': ' + f.q('#m-nota').value : '') },
        prezzi: [{ articolo_id: art.id, listino: v.listino, sconto1: noto ? v.s1 : 0, sconto2: noto ? v.s2 : 0, rincaro: noto ? v.r : 0,
                   extra: v.extra, sconto_noto: noto, valuta: f.q('#m-valuta').value, unita_fornitore: f.q('#m-unita').value,
                   fattore: v.fattore, data_prezzo: f.q('#m-data').value, valido_fino: f.q('#m-fino').value || null,
                   nota: f.q('#m-nota').value || null }],
        // articolo senza preferito: lo diventa questo fornitore (se non vende solo pacchi interi)
        preferiti: (!art.preferito_fornitore_id && !((fornitoreDaId(fid) || {}).radar || {}).solo_pacchi_interi)
          ? [{ articolo_id: art.id, fornitore_id: fid }] : []
      } })
      if (r.error) throw r.error
      f.chiudi(); await caricaArticoli(true); toast('💾 Prezzo salvato'); disegnaArticolo(art.id)
    } catch (e) {
      b.disabled = false
      html(f.q('#m-err'), banner('err', esc('Non salvato: ' + spiegaErrore(e))))
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ESPORTAZIONE PER IL MIO EXCEL
// ═════════════════════════════════════════════════════════════════════════════
async function esportaListino() {
  try {
    await caricaLibreria('xlsx')
    if (!(await caricaArticoli(true))) return
    var righe = [['Codice', 'Descrizione', 'Unità', 'Prezzo preferito CHF', 'Fornitore preferito', 'Data prezzo', 'Avviso']]
    RF.articoli.filter(function (a) { return !a.archiviato }).forEach(function (a) {
      var avv = [], prezzo = null, forn = '', data = ''
      if (a.preferito_chf != null) {
        prezzo = RFC.arrotonda(Number(a.preferito_chf), 2); forn = a.preferito_nome || ''; data = RFC.fmtData(a.preferito_data)
      } else if (a.migliore_chf != null) {
        prezzo = RFC.arrotonda(Number(a.migliore_chf), 2); forn = a.migliore_nome || ''
        avv.push('Nessun preferito: prezzo del più conveniente')
      } else if (a.n_prezzi) {
        avv.push('Prezzo non confrontabile (unità senza fattore)')
      } else avv.push('Nessun prezzo')
      if (a.preferito_scaduto) avv.push('Offerta scaduta')
      if (a.preferito_vecchio) avv.push('Prezzo vecchio')
      if (a.preferito_sconto_noto === false) avv.push('Sconto non noto')
      if (a.preferito_solo_pacchi) avv.push('Solo pacchi interi')
      if (a.da_verificare) avv.push('Da verificare: ' + a.da_verificare)
      righe.push([a.codice, a.descrizione, a.unita, prezzo == null ? 'MANCA' : prezzo, forn, data, avv.join(' · ')])
    })
    var wb = XLSX.utils.book_new()
    var ws = XLSX.utils.aoa_to_sheet(righe)
    ws['!cols'] = [{ wch: 34 }, { wch: 48 }, { wch: 8 }, { wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 50 }]
    XLSX.utils.book_append_sheet(wb, ws, 'LISTINO_RADAR')
    var come = XLSX.utils.aoa_to_sheet([
      ['Come usarlo'],
      [''],
      ['1. Copia il foglio LISTINO_RADAR nel tuo Excel (tasto destro sulla linguetta → Sposta o copia → scegli il tuo file → «Crea una copia»).'],
      ['2. Nel tuo foglio, metti il codice dell\'articolo nella colonna A (es. A2).'],
      ['3. Nella cella del prezzo scrivi questa formula (poi trascinala in giù):'],
      ['=SE.ERRORE(INDICE(LISTINO_RADAR!D:D;CONFRONTA(A2;LISTINO_RADAR!A:A;0));"MANCA")'],
      [''],
      ['«MANCA» = il codice non c\'è nel Radar, oppure non ha ancora un prezzo.'],
      ['Il prezzo è in CHF per l\'unità dell\'articolo (colonna C), con sconti, rincari e variazioni di oggi. Gli EUR sono convertiti col cambio delle Impostazioni del Radar.'],
      ['Esportato il ' + RFC.fmtData(RFC.oggiISO()) + ' · cambio EUR→CHF ' + RF.imp.cambio_eur_chf + ' del ' + RFC.fmtData(RF.imp.cambio_data)],
      ['Ogni volta che i prezzi cambiano, esporta di nuovo e sostituisci il foglio LISTINO_RADAR.']
    ])
    come['!cols'] = [{ wch: 120 }]
    XLSX.utils.book_append_sheet(wb, come, 'Come usarlo')
    XLSX.writeFile(wb, 'CT_Listino_Radar_' + RFC.oggiISO() + '.xlsx')
    toast('⬇️ Listino esportato: ' + (righe.length - 1) + ' articoli')
  } catch (e) {
    avvisa('err', esc('Esportazione non riuscita: ' + spiegaErrore(e)))
  }
}
