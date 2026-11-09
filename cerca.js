// CT Radar Fornitori — cerca.js
// Pagina «Cerca», scheda articolo (foto, tutti i fornitori, storico aperto,
// grafico, Preferito, Modifica, Archivia), nuovo articolo, prezzo a mano,
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
      '<label class="scelta"><input type="checkbox" id="c-verificare"' + (CERCA.soloVerificare ? ' checked' : '') + '> Solo «Da verificare» <span id="c-n-verificare"></span></label>' +
      (RF.titolare ? '<label class="scelta"><input type="checkbox" id="c-archiviati"' + (CERCA.archiviati ? ' checked' : '') + '> Mostra archiviati <span id="c-n-archiviati"></span></label>' : '') +
    '</div>' +
    '<div id="c-catalogo">' + bannerCatalogo() + '</div>' +
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
  var nv = Number(a.n_da_verificare) || 0
  if (nv) t.push(tag('warn', '⚠️', nv === 1 ? 'Prezzo da verificare' : nv + ' prezzi da verificare'))
  if (!a.n_foto && a.tipo === 'Materiale') t.push(tag('', '📷', 'Foto da aggiungere'))   // servizi e subappalti: niente foto
  if (!a.n_prezzi) { if (!nv) t.push(a.n_confronto ? tag('', '📚', 'Solo vecchio catalogo') : tag('', '∅', 'Nessun prezzo')) }
  else if (!a.preferito_fornitore_id) t.push(tag('warn', '⭐', 'Nessun preferito'))
  // Gli avvisi parlano del prezzo usato, non di un altro.
  var u = a.usato && a.usato.riga
  if (u && u.scaduto) t.push(tag('warn', '⏰', 'Offerta scaduta'))
  if (u && dataIgnota(u.data_prezzo)) t.push(tag('warn', '📅', 'Senza data certa'))
  else if (u && u.vecchio) t.push(tag('warn', '🕰️', 'Prezzo vecchio'))
  if (u && u.sconto_noto === false) t.push(tag('warn', '❔', 'Sconto non noto'))
  if (a.preferito_senza_fattore) t.push(tag('err', '📏', 'Unità senza fattore'))
  if (u && u.solo_pacchi_interi) t.push(tag('info', '📦', 'Solo pacchi interi'))
  return t.join(' ')
}

// Conteggi accanto ai filtri (Umberto 5.11.2026: «Da verificare» sembrava mostrare tutto, «Archiviati» non cambiava nulla).
// Non era un errore: quasi tutti gli articoli sono da verificare e nessuno è archiviato. Ora i numeri lo dicono.
function eDaVerificare(a) { return !!a.da_verificare || !!Number(a.n_da_verificare) }
function conteggiFiltri() {
  var attivi = RF.articoli.filter(function (a) { return !a.archiviato })
  return {
    attivi: attivi.length,
    daVerificare: attivi.filter(eDaVerificare).length,
    archiviati: RF.articoli.length - attivi.length,
    senzaUsato: attivi.filter(function (a) { return a.n_righe_prezzo && !a.usato.riga }).length,
    soloCatalogo: attivi.filter(function (a) { return a.n_righe_prezzo && !a.usato.riga && a.n_confronto }).length
  }
}

function filtraArticoli() {
  return RF.articoli.filter(function (a) {
    if (a.archiviato && !CERCA.archiviati) return false
    if (CERCA.categoria && String(a.categoria_id) !== String(CERCA.categoria)) return false
    if (CERCA.soloVerificare && !a.da_verificare && !Number(a.n_da_verificare)) return false
    return !CERCA.testo || RFC.corrisponde(a._cerca, CERCA.testo)
  })
}

// Senza prezzo usato: mai vuoto, mai una cifra. La stessa scritta in Cerca e in cima alla scheda.
function scrittaNessunUsato(s, nRighe) {
  if (!nRighe) return '∅ Nessun prezzo'
  return '🚫 Nessun prezzo usato: ' + String(s.motivo || '').replace(/^in Materiali /, '')
}

// L'avviso sul prezzo usato non confermato: la stessa scritta in Cerca e in cima alla scheda.
function avvisoUsato(r) { return 'Prezzo da verificare' + (r.fornitore_fuori ? ': fornitore da valutare' : '') }

// Il vecchio catalogo: solo confronto, in grigio, mai «prezzo usato» (Umberto, 9.11.2026).
function testoConfronto(a) {
  if (a.confronto == null) return ''
  return '<span class="confronto piccolo">📚 Vecchio catalogo ' + RFC.fmt(a.confronto) + ' CHF: solo confronto</span>'
}

// Elenco di Cerca: la stessa cifra della scheda e dell'offerta (prezzo arrivato, netto accanto).
function prezzoElenco(a) {
  var u = a.usato || {}, r = u.riga
  if (!r) return '<span class="' + (a.n_righe_prezzo ? 'nessun-usato' : 'dim') + '">' + esc(scrittaNessunUsato(u, a.n_righe_prezzo)) + '</span>' +
    (a.confronto != null ? '<br>' + testoConfronto(a) : '')
  return '<strong>' + RFC.fmt(r.arrivato_chf) + ' CHF</strong><span class="dim">/ ' + esc(a.unita) + '</span><br>' +
    '<span class="piccolo">arrivato · netto ' + RFC.fmt(r.netto_chf) + '</span><br>' +
    '<span class="piccolo">' + (r.preferito ? '⭐ ' : '') + esc(r.fornitore_nome || '') + ' · ' + dataPrezzoTesto(r) + '</span>' +
    (u.daVerificare ? '<br><span class="piccolo">⚠️ ' + esc(avvisoUsato(r)) + '</span>' : '') +
    (a.confronto != null ? '<br>' + testoConfronto(a) : '')
}

async function elencoCerca() {
  var trovati = filtraArticoli()
  var cf = conteggiFiltri()
  if (el('c-n-verificare')) el('c-n-verificare').textContent = '(' + cf.daVerificare + ' su ' + cf.attivi + ')'
  if (el('c-n-archiviati')) el('c-n-archiviati').textContent = '(' + cf.archiviati + ')'
  var spiega = ''
  if (CERCA.archiviati && !cf.archiviati) spiega = ' · Nessun articolo archiviato: l\'elenco non cambia.'
  else if (CERCA.archiviati) spiega = ' · compresi ' + cf.archiviati + ' archiviati'
  if (CERCA.soloVerificare && cf.daVerificare === cf.attivi) spiega += ' · Tutti gli articoli sono da verificare: l\'elenco non cambia.'
  else if (CERCA.soloVerificare) spiega += ' · ' + cf.daVerificare + ' da verificare su ' + cf.attivi + ': apri un articolo per vedere il perché.'
  if (cf.senzaUsato) spiega += ' · ' + cf.senzaUsato + ' senza prezzo usato' + (cf.soloCatalogo ? ' (' + cf.soloCatalogo + ' con solo il vecchio catalogo)' : '')
  html('c-conteggio', trovati.length + (trovati.length === 1 ? ' articolo' : ' articoli') + esc(spiega))
  var mostrati = trovati.slice(0, CERCA.quanti)
  html('c-risultati', mostrati.map(function (a) {
    var prezzo = prezzoElenco(a)
    return '<button type="button" class="riga" data-id="' + a.id + '">' +
      '<div class="foto-mini" data-foto="' + esc(a.foto_principale || '') + '">' + (a.foto_principale || a.tipo !== 'Materiale' ? '' : '<span aria-hidden="true">📷</span>') + '</div>' +
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
    nodi.forEach(function (n) {
      n.innerHTML = link[n.dataset.foto] ? '<img alt="" loading="lazy" src="' + esc(link[n.dataset.foto]) + '">' : '❌ Errore foto'
    })
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
    conRiprova(function () { return sb.from('rf_v_confronto').select('*').eq('articolo_id', id).order('posizione') }),
    conRiprova(function () { return sb.from('rf_foto_articolo').select('*').eq('articolo_id', id).eq('archiviata', false).order('principale', { ascending: false }).order('creato_il') }),
    conRiprova(function () { return sb.from('rf_articoli').select('*').eq('id', id).single() }),
    conRiprova(function () { return sb.from('rf_v_prezzi_attuali').select('*').eq('articolo_id', id).order('data_prezzo', { ascending: false }) }),
    conRiprova(function () { return sb.from('rf_v_storico').select('*').eq('articolo_id', id).order('data_prezzo', { ascending: false }).order('creato_il', { ascending: false }) }),
    conRiprova(function () { return sb.from('rf_prezzi').select('id,origine_riga,nota,sostituito_da,verificato_iniziali').eq('articolo_id', id) })
  ])
  r.slice(0, 3).forEach(function (x) { if (x.error) throw x.error })
  // il vecchio catalogo non sta mai fra i confermati: è solo confronto
  var prezzi = (r[0].data || []).filter(function (p) { return !RF.catalogo.fornitori[p.fornitore_id] }), foto = r[1].data || [], art = r[2].data
  // Tutti i prezzi attivi di tutti i fornitori: confermati (= il confronto), da verificare (anche di un fornitore da valutare), fornitore archiviato.
  var tutti = marcaConfronto(r[3].data || [])
  var nelConfronto = {}
  prezzi.forEach(function (p) { nelConfronto[p.id] = true })
  var daVerificare = tutti.filter(function (p) { return !p.solo_confronto && (p.da_verificare || p.fornitore_fuori) })
  var altri = tutti.filter(function (p) { return !p.solo_confronto && !p.da_verificare && !p.fornitore_fuori && !nelConfronto[p.id] })
  var confronti = tutti.filter(function (p) { return p.solo_confronto })
  var storico = arricchisciStorico(r[4].data || [], r[5])
  await aggiungiTestoDocumenti(storico)
  var cat = categoriaDaId(art.categoria_id)
  function attesi() { return Number(a.n_righe_prezzo) || 0 }
  if ((!foto.length && Number(a.n_foto) > 0) || (!tutti.length && attesi() > 0)) {   // l'elenco è di prima? si rilegge una volta
    await caricaArticoli(true)
    a = articoloDaId(id) || a
  }
  var fotoPerse = !foto.length && Number(a.n_foto) > 0
  // Con le RLS un accesso negato dà zero righe senza errore: «nessun prezzo» si scrive solo se è vero.
  var prezziPersi = r[3].error || (!tutti.length && attesi() > 0)
  var storicoPerso = r[4].error || (!storico.length && (tutti.length > 0 || attesi() > 0))
  var usato = prezzoUsato(tutti)
  var idUsato = usato.riga ? usato.riga.id : null
  var conf = prezzoConfronto(tutti)
  if (!prezziPersi) { a.usato = usato; a.n_righe_prezzo = tutti.length; a.n_confronto = confronti.length; a.confronto = conf ? Number(conf.arrivato_chf) : null }   // tornando all'elenco si vede la stessa cifra

  v.innerHTML =
    '<div class="gruppo-btn non-stampare" style="margin-bottom:12px"><button type="button" class="btn" id="a-indietro">← Cerca</button></div>' +
    '<div class="scheda">' +
      '<div class="intestazione"><h1><span class="mono">' + esc(art.codice) + '</span><br>' + esc(art.descrizione) + '</h1></div>' +
      bannerCatalogo() +
      (prezziPersi ? '' : rigaPrezzoUsato(usato, art, storico, tutti.length, conf)) +
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
    '<div class="scheda" id="a-fornitori">' +
      '<div class="intestazione"><h2>🏭 Tutti i fornitori</h2></div>' +
      (prezziPersi ? banner('err', r[3].error ? esc('Prezzi non letti: ' + spiegaErrore(r[3].error))
        : 'L\'elenco dice che ci sono prezzi, ma non ne leggo nessuno: esci e rientra; se continua, avvisa il titolare.')
      : !tutti.length ? tabellaConfronto([], art)
      : '<p id="a-riepilogo-fornitori"><strong>' + esc(riepilogoFornitori(tutti)) + '</strong></p>' +
        '<h3 class="gruppo-prezzi">✅ Confermati, dal più conveniente (' + prezzi.length + ')</h3>' +
        (prezzi.length
          ? '<p class="aiuto">Conveniente = prezzo ARRIVATO in CHF: netto (convertito se in EUR, cambio ' +
              RFC.fmt(RF.imp.cambio_eur_chf, 4) + ' del ' + RFC.fmtData(RF.imp.cambio_data) + ') + costo di arrivo stimato del fornitore.</p>' +
            tabellaConfronto(prezzi, art, idUsato)
          : '<p class="aiuto">Nessun prezzo confermato.</p>') +
        (daVerificare.length ? '<div id="a-daverificare">' +
          '<h3 class="gruppo-prezzi">⚠️ Da verificare (' + daVerificare.length + ')</h3>' +
          '<p class="aiuto">Non sono confermati. Si usano solo se non c\'è nessun prezzo confermato, e allora si vede un avviso. Controlla e premi «✅ Conferma», oppure carica un prezzo nuovo.' +
            (daVerificare.some(function (p) { return p.fornitore_fuori }) ? ' Fornitore da valutare: crea il contatto in Anagrafiche e premi «✅ Diventa fornitore» nella scheda della ditta (🏭 Fornitori). «✅ Scegli il fornitore» sposta invece il prezzo su un fornitore che esiste già.' : '') + '</p>' +
          tabellaDaVerificare(daVerificare, art, false, idUsato) +
        '</div>' : '') +
        (confronti.length ? '<div id="a-confronto" class="confronto">' +
          '<h3 class="gruppo-prezzi">📚 Vecchio catalogo, solo confronto (' + confronti.length + ')</h3>' +
          '<p class="aiuto">Prezzi del vecchio «Catalogo offerte». Non si usano mai, né qui né nelle offerte: servono solo per confrontare.</p>' +
          tabellaDaVerificare(confronti, art, 'confronto') +
        '</div>' : '') +
        (altri.length ? '<div id="a-altri">' +
          '<h3 class="gruppo-prezzi">📦 Fornitore archiviato (' + altri.length + ')</h3>' +
          '<p class="aiuto">Prezzi confermati, ma il fornitore è archiviato: non si usano.</p>' +
          tabellaDaVerificare(altri, art, true) +
        '</div>' : '')) +
    '</div>' +
    '<div class="scheda" id="a-storico">' +
      '<div class="intestazione"><h2>📜 Storico dei prezzi</h2></div>' +
      (storicoPerso ? banner('err', r[4].error ? esc('Storico non letto: ' + spiegaErrore(r[4].error))
        : 'Ci sono prezzi, ma non leggo il loro storico: esci e rientra; se continua, avvisa il titolare.')
      : !storico.length ? '<div class="vuoto">Nessun prezzo nello storico.</div>'
      : '<p class="aiuto">Prezzo netto per ' + esc(art.unita) + ' in CHF (gli EUR al cambio di oggi), senza le variazioni da mail. Dal più recente.</p>' +
        tabellaStorico(storico, art, idUsato)) +
    '</div>' +
    '<div class="barra-azioni non-stampare">' +
      '<div class="gruppo-btn">' +
        '<button type="button" class="btn" id="a-grafico">📊 Grafico dei prezzi</button>' +
        '<button type="button" class="btn" id="a-preferito">⭐ Cambia preferito</button>' +
        '<button type="button" class="btn" id="a-manuale">✍️ Prezzo a mano</button>' +
        (RF.titolare ? '<button type="button" class="btn btn-pericolo" id="a-archivia">' + (art.archiviato ? '↩️ Ripristina' : '📦 Archivia') + '</button>' : '') +
      '</div><div class="spazio"></div>' +
      '<button type="button" class="btn btn-primario" id="a-modifica">✏️ Modifica</button>' +
    '</div>'

  disegnaFoto(art, foto, fotoPerse)
  collegaProve(v)
  v.querySelectorAll('[data-conferma]').forEach(function (b) {
    b.addEventListener('click', function () {
      var p = tutti.filter(function (x) { return x.id === b.dataset.conferma })[0]
      if (p) finestraConfermaPrezzo(p, art)
    })
  })
  el('a-indietro').addEventListener('click', function () { vai('cerca') })
  el('a-grafico').addEventListener('click', function () { finestraGrafico(art) })
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

function tabellaConfronto(prezzi, art, idUsato) {
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
        '<td data-et="Fornitore"><strong>' + esc(p.fornitore_nome) + '</strong>' + (p.preferito ? '<br>' + tag('ok', '⭐', 'Preferito') : '') +
          (p.id === idUsato ? '<br>' + tag('ok', '💰', 'Prezzo usato') : '') + '</td>' +
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
        '<td data-et="Avvisi"><div class="tags">' + avvisiPrezzo(p) + '</div>' +
          (p.documento_percorso ? '<div style="margin-top:6px">' + bottoneProva(p) + '</div>' : '') + '</td></tr>'
    }).join('') + '</tbody></table></div>'
}

// In cima alla scheda: il prezzo usato, lo stesso che prende l'offerta (regola_prezzo.js).
function rigaPrezzoUsato(s, art, storico, nRighe, conf) {
  var r = s.riga
  var grigio = conf ? '<div class="confronto">📚 Vecchio catalogo: ' + RFC.fmt(conf.arrivato_chf) + ' CHF / ' + esc(art.unita) + ', solo confronto (non si usa mai)</div>' : ''
  if (!r) {
    return '<div class="prezzo-usato" id="a-prezzo-usato"><strong>' + esc(scrittaNessunUsato(s, nRighe)) + '</strong>' +
      '<div>' + esc(!nRighe ? 'Per questo articolo non c\'è nessun prezzo.' : 'L\'offerta segnerà il prezzo come mancante.') + '</div>' + grigio + '</div>'
  }
  var origine = storico.filter(function (x) { return x.id === r.id })[0] || { origine_letta: false }
  var perche = r.preferito ? tag('ok', '⭐', 'Preferito') : s.daVerificare ? '' : tag('info', '📉', 'Il più conveniente')
  return '<div class="prezzo-usato" id="a-prezzo-usato">' +
    '<div class="prezzo-usato-cifra">💰 Prezzo usato: <strong>' + RFC.fmt(r.arrivato_chf) + ' CHF</strong> / ' + esc(art.unita) +
      ' arrivato <span class="prezzo-usato-netto">(netto ' + RFC.fmt(r.netto_chf) + ')</span></div>' +
    (s.daVerificare ? banner('warn', '<strong>' + esc(avvisoUsato(r)) + '.</strong> Non c\'è nessun prezzo confermato: si usa questo, anche nelle offerte. ' +
      (r.fornitore_fuori ? 'Crea il fornitore in Anagrafiche, oppure premi «✅ Scegli il fornitore».' : 'Controllalo e premi «✅ Conferma».')) : '') +
    '<div>Fornitore: <strong>' + esc(r.fornitore_nome) + '</strong> ' + perche + '</div>' +
    '<div>' + (dataIgnota(r.data_prezzo) ? '' : 'Data: ') + dataPrezzoTesto(r) + '</div>' +
    '<div class="origine">Da dove viene: ' + daDoveViene(origine) + '</div>' + grigio +
    '</div>'
}

// «3 fornitori, 5 prezzi: Alfa, Beta, Gamma»
function riepilogoFornitori(tutti) {
  var nomi = {}
  tutti.forEach(function (p) { nomi[p.fornitore_id] = p.fornitore_nome })
  var n = Object.keys(nomi).length
  return n + (n === 1 ? ' fornitore, ' : ' fornitori, ') + tutti.length + (tutti.length === 1 ? ' prezzo: ' : ' prezzi: ') +
    Object.keys(nomi).map(function (k) { return nomi[k] }).sort(function (a, b) { return String(a).localeCompare(String(b), 'it') }).join(', ')
}

// Storico: alle righe di rf_v_storico si aggiungono origine, nota e conferma, che stanno su rf_prezzi.
function arricchisciStorico(righe, prezziRisposta) {
  var perId = {}, prima = {}
  ;(prezziRisposta.data || []).forEach(function (q) {
    perId[q.id] = q
    if (q.sostituito_da && q.origine_riga) prima[q.sostituito_da] = q.origine_riga
  })
  return righe.map(function (x) {
    var q = perId[x.id] || {}
    return Object.assign({}, x, { origine_riga: q.origine_riga, nota: q.nota, verificato_iniziali: q.verificato_iniziali,
                                  origine_prima: prima[x.id], origine_letta: !prezziRisposta.error })
  })
}

// «A mano» è scritto solo nel testo del documento senza file (vedi finestraPrezzoManuale). Se non si legge resta «Altro documento»: vero anche così.
async function aggiungiTestoDocumenti(storico) {
  var ids = Array.from(new Set(storico.filter(function (x) { return x.documento_id && x.documento_tipo === 'altro' && !x.documento_percorso })
    .map(function (x) { return x.documento_id })))
  if (!ids.length) return
  var d = await sb.from('rf_documenti').select('id,testo').in('id', ids)
  var testi = {}
  ;(d.data || []).forEach(function (t) { testi[t.id] = t.testo })
  storico.forEach(function (x) { x.documento_testo = testi[x.documento_id] })
}

function prezzoStoricoTesto(x, art) {
  if (x.netto_chf_cambio_oggi != null) {
    return '<strong>' + RFC.fmt(x.netto_chf_cambio_oggi) + ' CHF</strong> / ' + esc(art.unita) +
      (x.valuta && x.valuta !== 'CHF' ? '<br><span class="piccolo">' + prezzoTesto(x.netto_base, x.valuta) +
        (x.unita_fornitore ? ' / ' + esc(x.unita_fornitore) : '') + '</span>' : '')
  }
  return prezzoTesto(x.netto_base, x.valuta) + ' / ' + esc(x.unita_fornitore || 'unità non indicata') +
    '<br>' + tag('err', '📏', 'Unità senza fattore')
}

function tabellaStorico(righe, art, idUsato) {
  return '<div class="tabella-wrap"><table class="tab a-schede" id="a-storico-tabella"><thead><tr>' +
    '<th>Data</th><th>Fornitore</th><th class="num">Prezzo netto</th><th>Da dove viene</th></tr></thead><tbody>' +
    righe.map(function (x) {
      return '<tr class="' + (x.stato === 'sostituito' ? 'sostituito' : '') + '">' +
        '<td data-et="Data">' + dataPrezzoTesto(x) + '</td>' +
        '<td data-et="Fornitore"><strong>' + esc(x.fornitore_nome) + '</strong><div class="tags">' +
          (x.id === idUsato ? tag('ok', '💰', 'Prezzo usato') : '') +
          (x.stato === 'attivo' ? tag('ok', '✔️', 'Attivo') : tag('', '↪️', 'Sostituito')) +
          (x.variante ? tag('', '🔀', 'Variante') : '') +
          (RF.catalogo.fornitori[x.fornitore_id] ? tag('', '📚', 'Vecchio catalogo: solo confronto') : '') +
          (x.da_verificare && x.stato === 'attivo' && !RF.catalogo.fornitori[x.fornitore_id] ? tag('warn', '⚠️', 'Da verificare') : '') + '</div></td>' +
        '<td data-et="Prezzo netto" class="num">' + prezzoStoricoTesto(x, art) + '</td>' +
        '<td data-et="Da dove viene" class="origine">' + daDoveViene(x) + '</td></tr>'
    }).join('') + '</tbody></table></div>'
}

// Prezzi «da verificare» di un articolo: si vedono, ma non stanno nel confronto.
// soloLettura: prezzi già confermati di un fornitore archiviato: niente da confermare.
// Fornitore da valutare: «Scegli il fornitore» solo se il prezzo è ancora da verificare (rf_conferma_prezzo rifiuta gli altri).
// soloLettura = 'confronto': prezzi del vecchio catalogo, in grigio, niente da confermare.
function tabellaDaVerificare(prezzi, art, soloLettura, idUsato) {
  var confronto = soloLettura === 'confronto'
  return '<div class="tabella-wrap"><table class="tab a-schede"><thead><tr>' +
    '<th>Fornitore</th><th>Voce</th><th class="num">Listino e sconti</th><th class="num">Netto</th><th class="num">CHF / ' + esc(art.unita) + '</th>' +
    '<th>Data</th><th>Perché</th><th></th></tr></thead><tbody>' +
    prezzi.map(function (p) {
      var s1 = Number(p.sconto1_usato) || 0
      return '<tr>' +
        '<td data-et="Fornitore"><strong>' + esc(p.fornitore_nome) + '</strong>' +
          (p.fornitore_archiviato && !soloLettura ? '<br>' + tag('', '📦', 'Fornitore archiviato: non si usa') : '') +
          (p.id === idUsato ? '<br>' + tag('warn', '💰', 'Prezzo usato') : '') + '</td>' +
        '<td data-et="Voce">' + esc(p.descrizione_fornitore || '–') + (p.nota ? '<br><span class="dim piccolo">' + esc(p.nota) + '</span>' : '') + '</td>' +
        '<td data-et="Listino e sconti" class="num">' + RFC.fmt(p.listino) + ' ' + esc(p.valuta) +
          (s1 ? '<br><span class="piccolo">−' + RFC.fmt(s1, 2) + '%</span>' : '') + '</td>' +
        '<td data-et="Netto" class="num">' + prezzoTesto(p.netto_oggi, p.valuta) + '</td>' +
        '<td data-et="CHF per unità" class="num"><strong>' + (p.netto_chf != null ? RFC.fmt(p.netto_chf) : '–') + '</strong></td>' +
        '<td data-et="Data">' + dataPrezzoTesto(p) + '</td>' +
        '<td data-et="Perché"><div class="tags">' + (confronto ? tag('', '📚', 'Solo confronto') : soloLettura ? tag('', '📦', 'Fornitore archiviato')
            : tag('warn', '⚠️', 'Da verificare') + (p.fornitore_fuori ? tag('warn', '🔎', 'Fornitore da valutare') : '')) + '</div>' +
          (p.da_verificare_motivo && !confronto ? '<span class="piccolo">' + esc(p.da_verificare_motivo) + '</span>' : '') + '</td>' +
        '<td data-et="Azioni" class="non-stampare"><div class="gruppo-btn">' +
          (soloLettura || !p.da_verificare ? '' : '<button type="button" class="btn btn-piccolo btn-primario" data-conferma="' + esc(p.id) + '">' + (p.fornitore_fuori ? '✅ Scegli il fornitore' : '✅ Conferma') + '</button>') +
          bottoneProva(p) + '</div></td></tr>'
    }).join('') + '</tbody></table></div>'
}

// Conferma: fornitore e data devono essere veri. Il database rifiuta il resto (rf_conferma_prezzo).
function finestraConfermaPrezzo(p, art) {
  var certa = !dataIgnota(p.data_prezzo)
  var contattoAttuale = null
  if (!p.fornitore_fuori) {
    var attuale = fornitoreDaId(p.fornitore_id)
    contattoAttuale = attuale && attuale.contatto ? attuale.contatto.id : null
  }
  var fin = apriFinestra({
    titolo: '✅ Conferma prezzo — ' + art.codice,
    html:
      '<p><strong>' + esc(p.descrizione_fornitore || art.descrizione) + '</strong><br>' +
        'Netto: <strong>' + prezzoTesto(p.netto_oggi, p.valuta) + '</strong></p>' +
      (p.data_nel_documento ? '<p class="aiuto">Nel documento: ' + esc(p.data_nel_documento) + '.</p>' : '') +
      (p.fornitore_fuori ? banner('warn', '<strong>' + esc(p.fornitore_nome) + ' è un fornitore da valutare: questo prezzo vale con l\'avviso.</strong> Se scegli un fornitore vero, il prezzo passa a lui e diventa confermato.') : '') +
      '<label for="cf-forn">Fornitore</label><select id="cf-forn">' + opzioniFornitori(contattoAttuale, true) + '</select>' +
      '<p class="aiuto">Se manca, si crea in Anagrafiche.</p>' +
      '<label for="cf-data">Data del prezzo</label>' +
      '<input id="cf-data" type="date" max="' + RFC.oggiISO() + '" value="' + (certa ? esc(String(p.data_prezzo).slice(0, 10)) : '') + '">' +
      '<div id="cf-err"></div>',
    pulsanti: [
      { testo: 'Annulla', sinistra: true, azione: function (f) { f.chiudi() } },
      { testo: '✅ Conferma prezzo', classe: 'btn-primario', azione: salva }
    ]
  })
  async function salva(f, b) {
    var contatto = f.q('#cf-forn').value, data = f.q('#cf-data').value
    if (!contatto) return html(f.q('#cf-err'), banner('warn', 'Scegli il fornitore.'))
    if (!data) return html(f.q('#cf-err'), banner('warn', 'Scrivi la data del prezzo.'))
    if (data > RFC.oggiISO()) return html(f.q('#cf-err'), banner('warn', 'La data non può essere nel futuro.'))
    b.disabled = true
    try {
      if (!(await sessioneValida())) return
      var fid = await assicuraFornitoreRadar(contatto)
      var r = await sb.rpc('rf_conferma_prezzo', { p_id: p.id, p_fornitore: fid, p_data: data })
      if (r.error) throw r.error
      f.sporca = false
      f.chiudi()
      await caricaArticoli(true)
      toast('✅ Prezzo confermato')
      disegnaArticolo(art.id)
    } catch (e) {
      html(f.q('#cf-err'), banner('err', esc('Non riuscito: ' + spiegaErrore(e))))
      b.disabled = false
    }
  }
  return fin
}

// ── Foto ─────────────────────────────────────────────────────────────────────
// Sotto la foto: categoria, nota, fonte, licenza e autore.
// Le foto fatte da Umberto e dai suoi non hanno questi dati: non si scrive niente.
function infoFoto(f) {
  var cat = f.categoria_foto === 'marca' ? tag('info', '🏷️', 'Foto di marca')
    : f.categoria_foto === 'foto generica' ? tag('', '🖼️', 'Foto generica') : ''
  var fonte = /^https?:\/\//i.test(f.fonte_url || '')
    ? '<a class="btn" href="' + esc(f.fonte_url) + '" target="_blank" rel="noopener noreferrer">🔗 Apri la fonte</a>' : ''
  var diritti = [f.licenza ? 'Licenza: ' + f.licenza : '', f.autore ? 'Autore: ' + f.autore : ''].filter(Boolean).join(' · ')
  if (!cat && !f.nota && !fonte && !diritti) return ''
  return '<div class="foto-info">' + cat +
    (f.nota ? '<p class="foto-nota">' + esc(f.nota) + '</p>' : '') +
    (diritti ? '<p class="foto-diritti">' + esc(diritti) + '</p>' : '') +
    fonte + '</div>'
}

async function disegnaFoto(art, foto, perse) {
  var box = el('a-foto')
  var percorsi = foto.map(function (f) { return f.percorso })
  var link = percorsi.length ? await linkFirmati(BUCKET_FOTO, percorsi) : {}
  var NON_DISPONIBILE = '<div class="foto-errore">❌ Foto non disponibile</div>'
  var vuoto = perse ? banner('err', 'L\'elenco dice che ci sono foto, ma non ne leggo nessuna: esci e rientra; se continua, avvisa il titolare.')
    : art.tipo === 'Materiale' ? banner('info', '📷 Foto da aggiungere') : ''
  box.innerHTML =
    (foto.length ? (link[foto[0].percorso]
        ? '<img class="foto-grande" alt="Foto principale di ' + esc(art.descrizione) + '" src="' + esc(link[foto[0].percorso]) + '">'
        : banner('err', 'Foto non disponibile: non riesco ad aprire il file.')) + infoFoto(foto[0]) : vuoto) +
    (foto.length > 1 || foto.length === 1 ? '<div class="galleria">' + foto.map(function (f, i) {
      return '<figure class="' + (f.principale ? 'principale' : '') + '">' +
        (link[f.percorso] ? '<img alt="" src="' + esc(link[f.percorso]) + '">' : NON_DISPONIBILE) +
        '<figcaption>' + (f.principale ? '⭐ Principale' : '') + '<br>' + esc(RFC.timbro(f.creato_iniziali, f.creato_il)) + '</figcaption>' +
        (i > 0 ? infoFoto(f) : '') +
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
  // Se ci sono solo foto di catalogo, la prima foto vera passa davanti: quelle di catalogo restano sotto.
  var soloCatalogo = foto.length > 0 && foto.every(function (f) { return f.catalogo_lotto })
  function carica(ev) { caricaFoto(art, Array.from(ev.target.files || []), foto.length === 0, soloCatalogo) }
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

async function caricaFoto(art, files, primaFoto, sopraCatalogo) {
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
      }).select('id').single()
      if (ins.error) throw ins.error
      if (sopraCatalogo && i === 0) {
        var davanti = await sb.rpc('rf_foto_principale', { p_foto: ins.data.id })
        if (davanti.error) throw davanti.error
      }
    }
    await caricaArticoli(true)
    toast('📷 Foto caricata')
    disegnaArticolo(art.id)
  } catch (e) {
    html(stato, banner('err', esc('Foto non caricata: ' + spiegaErrore(e))))
  }
}

// ── Grafico dei prezzi (la tabella dello storico è aperta nella scheda) ─────
async function finestraGrafico(art) {
  if (!(await sessioneValida())) return
  var r = await sb.from('rf_v_storico').select('*').eq('articolo_id', art.id).order('data_prezzo').order('creato_il')
  if (r.error) return avvisa('err', esc('Grafico non disponibile: ' + spiegaErrore(r.error)))
  var righe = r.data || []
  var fornitori = {}
  righe.forEach(function (x) { fornitori[x.fornitore_id] = x.fornitore_nome })
  var fin = apriFinestra({
    titolo: '📊 Grafico dei prezzi — ' + art.codice, larga: true,
    html:
      '<label for="s-filtro">Fornitore</label><select id="s-filtro"><option value="">Tutti i fornitori</option>' +
        Object.keys(fornitori).map(function (k) { return '<option value="' + k + '">' + esc(fornitori[k]) + '</option>' }).join('') + '</select>' +
      '<div id="s-avviso"></div>' +
      '<div style="height:280px;margin:16px 0"><canvas id="s-grafico" aria-label="Grafico dell\'andamento dei prezzi"></canvas></div>' +
      '<p class="aiuto">Prezzo netto per ' + esc(art.unita) + ' in CHF (gli EUR al cambio di oggi), senza le variazioni da mail.</p>'
  })
  var grafico = null
  function disegna() {
    var filtro = fin.q('#s-filtro').value
    var sel = righe.filter(function (x) { return !filtro || x.fornitore_id === filtro })
    // nel grafico solo i prezzi con una data vera
    var conData = sel.filter(function (x) { return !dataIgnota(x.data_prezzo) })
    html(fin.q('#s-avviso'), conData.length ? '' : banner('info', 'Nessun prezzo con una data certa: il grafico resta vuoto.'))
    disegnaGrafico(conData)
  }
  async function disegnaGrafico(sel) {
    try { await caricaLibreria('chart') } catch (e) { html(fin.q('#s-avviso'), banner('warn', esc('Grafico non disponibile: ' + e.message))); return }
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
  if (!forn.length) return toast('Nessun fornitore con un prezzo confermato: prima conferma un prezzo o importa un\'offerta.')
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
// Colonne A–G: identiche alla v6. L'Excel di Umberto può leggerle ancora: non si toccano finché Preventivi non è online.
// La v6 le prendeva da rf_v_articoli, che col login tocca il limite di 8 secondi del database, anche a pagine e a lotti (su CT-PROVA fallisce).
// Qui lo stesso calcolo della vista (RF_16) sulle righe di rf_v_prezzi_attuali: pp = preferito, mi = il primo del confronto.
function datiListinoV6(a) {
  var conf = (a.righe_prezzo || []).filter(function (p) { return !p.fornitore_archiviato && !p.fornitore_fuori && !p.da_verificare })
  function piuNuovo(x, y) { return x.data_prezzo < y.data_prezzo ? 1 : x.data_prezzo > y.data_prezzo ? -1 : 0 }
  var mi = conf.slice().sort(function (x, y) {
    if (x.arrivato_chf == null || y.arrivato_chf == null) return (x.arrivato_chf == null) - (y.arrivato_chf == null) || piuNuovo(x, y)
    return Number(x.arrivato_chf) - Number(y.arrivato_chf) || piuNuovo(x, y)
  })[0]
  var pp = conf.filter(function (p) { return p.preferito }).sort(function (x, y) { return (x.variante - y.variante) || piuNuovo(x, y) })[0]
  return {
    n_prezzi: conf.length, preferito_chf: pp ? pp.netto_chf : null, preferito_nome: pp ? pp.fornitore_nome : null, preferito_data: pp ? pp.data_prezzo : null,
    preferito_scaduto: pp ? pp.scaduto : null, preferito_vecchio: pp ? pp.vecchio : null, preferito_sconto_noto: pp ? pp.sconto_noto : null,
    preferito_solo_pacchi: pp ? pp.solo_pacchi_interi : null, migliore_chf: mi ? mi.netto_chf : null, migliore_nome: mi ? mi.fornitore_nome : null
  }
}

async function esportaListino() {
  var tasto = el('c-esporta'), scritta = tasto ? tasto.textContent : ''
  if (tasto && tasto.disabled) return
  if (tasto) { tasto.disabled = true; tasto.textContent = '⏳ Preparo il listino…' }
  avvisa('info', '⏳ Preparo il listino…')
  try {
    await caricaLibreria('xlsx')
    if (!(await caricaArticoli(true))) { avvisa('', ''); return }
    var righe = [['Codice', 'Descrizione', 'Unità', 'Prezzo preferito CHF', 'Fornitore preferito', 'Data prezzo', 'Avviso', 'Prezzo arrivato CHF', 'Confermato sì/no']]
    RF.articoli.filter(function (a) { return !a.archiviato }).forEach(function (a) {
      var avv = [], prezzo = null, forn = '', data = '', v6 = datiListinoV6(a)
      if (v6.preferito_chf != null) {
        prezzo = RFC.arrotonda(Number(v6.preferito_chf), 2); forn = v6.preferito_nome || ''; data = RFC.fmtData(v6.preferito_data)
      } else if (v6.migliore_chf != null) {
        prezzo = RFC.arrotonda(Number(v6.migliore_chf), 2); forn = v6.migliore_nome || ''
        avv.push('Nessun preferito: prezzo del più conveniente')
      } else if (v6.n_prezzi) {
        avv.push('Prezzo non confrontabile (unità senza fattore)')
      } else avv.push('Nessun prezzo')
      if (v6.preferito_scaduto) avv.push('Offerta scaduta')
      if (v6.preferito_vecchio) avv.push('Prezzo vecchio')
      if (v6.preferito_sconto_noto === false) avv.push('Sconto non noto')
      if (v6.preferito_solo_pacchi) avv.push('Solo pacchi interi')
      if (a.da_verificare) avv.push('Da verificare: ' + a.da_verificare)
      // H e I: il prezzo della regola nuova, quello che prende l'offerta. Vuote se non c'è prezzo.
      var s = a.usato, u = s && s.riga
      righe.push([a.codice, a.descrizione, a.unita, prezzo == null ? 'MANCA' : prezzo, forn, data, avv.join(' · '),
                  u ? RFC.arrotonda(Number(u.arrivato_chf), 2) : null, u ? (s.daVerificare ? 'No' : 'Sì') : null])
    })
    var wb = XLSX.utils.book_new()
    var ws = XLSX.utils.aoa_to_sheet(righe)
    ws['!cols'] = [{ wch: 34 }, { wch: 48 }, { wch: 8 }, { wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 50 }, { wch: 20 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws, 'LISTINO_RADAR')
    var come = XLSX.utils.aoa_to_sheet([
      ['Come usarlo'],
      [''],
      ['1. Copia il foglio LISTINO_RADAR nel tuo Excel (tasto destro sulla linguetta → Sposta o copia → scegli il tuo file → «Crea una copia»).'],
      ['2. Nel tuo foglio, metti il codice dell\'articolo nella colonna A (es. A2).'],
      ['3. Nella cella del prezzo scrivi questa formula (poi trascinala in giù):'],
      ['=SE.ERRORE(INDICE(LISTINO_RADAR!D:D;CONFRONTA(A2;LISTINO_RADAR!A:A;0));"MANCA")'],
      [''],
      ['«MANCA» = il codice non c\'è nell\'elenco prezzi, oppure non ha ancora un prezzo.'],
      ['Il prezzo è in CHF per l\'unità dell\'articolo (colonna C), con sconti, rincari e variazioni di oggi. Gli EUR sono convertiti col cambio delle Impostazioni.'],
      ['Esportato il ' + RFC.fmtData(RFC.oggiISO()) + ' · cambio EUR→CHF ' + RF.imp.cambio_eur_chf + ' del ' + RFC.fmtData(RF.imp.cambio_data)],
      ['Ogni volta che i prezzi cambiano, esporta di nuovo e sostituisci il foglio LISTINO_RADAR.']
    ])
    come['!cols'] = [{ wch: 120 }]
    XLSX.utils.book_append_sheet(wb, come, 'Come usarlo')
    XLSX.writeFile(wb, 'CT_Listino_Radar_' + RFC.oggiISO() + '.xlsx')
    avvisa('', '')
    toast('⬇️ Listino esportato: ' + (righe.length - 1) + ' articoli')
  } catch (e) {
    avvisa('err', esc('Esportazione non riuscita: ' + spiegaErrore(e)))
  } finally {
    if (tasto) { tasto.disabled = false; tasto.textContent = scritta }
  }
}
