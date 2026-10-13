// CT Radar Fornitori — fornitori.js
// Pagina «Fornitori»: l'elenco viene dalla Rubrica (tm_contatti, SOLA LETTURA).
// Nel Radar stanno solo i dati del Radar (rf_fornitori): attività, valuta,
// sconto di base, trasporto, ordine minimo, costo di arrivo, valutazioni.
// Un fornitore nuovo si crea nella Rubrica (pulsante «Crea in Rubrica»).

'use strict'

var FORN = { testo: '', soloConPrezzi: false, archiviati: false, gruppo: 'fornitori' }

async function disegnaFornitori() {
  if (!(await caricaBase()) || !(await caricaFornitori())) return
  var v = el('vista-fornitori')
  v.innerHTML =
    '<div class="intestazione"><h1>🏭 Fornitori</h1>' +
      '<div class="gruppo-btn">' +
        '<button type="button" class="btn" id="fo-ricarica">🔄 Ricarica dalla Rubrica</button>' +
        '<a class="btn btn-primario" href="' + URL_RUBRICA + '" target="_blank" rel="noopener">📇 Crea in Rubrica</a>' +
      '</div></div>' +
    '<p class="aiuto">I fornitori sono i contatti della Rubrica segnati «Fornitori». Nome, telefono e indirizzo si cambiano nella Rubrica; qui solo i dati del Radar.</p>' +
    (RF.rubricaVuota ? banner('warn', 'Non vedo nessun contatto della Rubrica. Il tuo utente deve essere collegato all\'azienda (tabella tm_utenti): chiedi al titolare.') : '') +
    '<div class="barra-ricerca"><div class="campo"><span class="lente" aria-hidden="true">🔍</span>' +
      '<input id="fo-testo" type="search" placeholder="Cerca fornitore…" aria-label="Cerca fornitore" autocomplete="off"></div></div>' +
    '<label for="fo-gruppo">Mostra</label>' +
    '<select id="fo-gruppo" style="max-width:420px">' +
      '<option value="fornitori"' + (FORN.gruppo === 'fornitori' ? ' selected' : '') + '>🏭 Fornitori (dalla Rubrica)</option>' +
      '<option value="ditte"' + (FORN.gruppo === 'ditte' ? ' selected' : '') + '>🔎 Ditte da valutare (' + (RF.ditte || []).length + ')</option>' +
    '</select>' +
    '<div class="gruppo-btn" style="margin:8px 0" id="fo-filtri"' + (FORN.gruppo === 'ditte' ? ' hidden' : '') + '>' +
      '<label class="scelta"><input type="checkbox" id="fo-prezzi"' + (FORN.soloConPrezzi ? ' checked' : '') + '> Solo con scheda Radar</label>' +
      '<label class="scelta"><input type="checkbox" id="fo-arch"' + (FORN.archiviati ? ' checked' : '') + '> Mostra archiviati</label>' +
    '</div>' +
    '<div id="fo-conteggio" class="conteggio"></div><div id="fo-elenco" class="elenco"></div>'
  el('fo-testo').value = FORN.testo
  el('fo-testo').addEventListener('input', function () { FORN.testo = this.value; elencoFornitori() })
  el('fo-gruppo').addEventListener('change', function () {
    FORN.gruppo = this.value; el('fo-filtri').hidden = FORN.gruppo === 'ditte'; elencoFornitori()
  })
  el('fo-prezzi').addEventListener('change', function () { FORN.soloConPrezzi = this.checked; elencoFornitori() })
  el('fo-arch').addEventListener('change', function () { FORN.archiviati = this.checked; elencoFornitori() })
  el('fo-ricarica').addEventListener('click', async function () {
    try { await caricaFornitori(true); toast('🔄 Fornitori ricaricati'); elencoFornitori() }
    catch (e) { avvisa('err', esc(spiegaErrore(e))) }
  })
  elencoFornitori()
}

function elencoFornitori() {
  if (FORN.gruppo === 'ditte') return elencoDitte()
  var lista = RF.fornitori.filter(function (f) {
    var archiviato = (f.radar && f.radar.archiviato) || (f.contatto && f.contatto.attivo === false)
    if (archiviato && !FORN.archiviati) return false
    if (FORN.soloConPrezzi && !f.radar) return false
    return !FORN.testo || RFC.corrisponde(f._cerca, FORN.testo)
  })
  html('fo-conteggio', lista.length + (lista.length === 1 ? ' fornitore' : ' fornitori'))
  html('fo-elenco', lista.map(function (f) {
    var r = f.radar, k = f.contatto
    var t = []
    if (!r) t.push(tag('', '➕', 'Senza scheda Radar'))
    if (r && r.archiviato) t.push(tag('', '📦', 'Archiviato nel Radar'))
    if (k && k.attivo === false) t.push(tag('', '📦', 'Archiviato in Rubrica'))
    if (r && r.valuta === 'EUR') t.push(tag('info', '💶', 'EUR'))
    if (r && r.solo_pacchi_interi) t.push(tag('info', '📦', 'Solo pacchi interi'))
    ;((r && r.attivita) || []).forEach(function (a) { t.push(tag('', '🏷️', a)) })
    return '<button type="button" class="riga" data-k="' + esc(k ? k.id : '') + '" data-r="' + esc(r ? r.id : '') + '">' +
      '<div class="corpo"><div class="desc">' + esc(f.nome) + '</div>' +
      '<div class="dim piccolo">' + esc([k && k.citta, k && k.paese, k && k.telefono].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="tags" style="margin-top:4px">' + t.join(' ') + '</div></div></button>'
  }).join('') || '<div class="vuoto">Nessun fornitore. Se manca, crealo in Rubrica (categoria «Fornitori») e poi «🔄 Ricarica».</div>')
  el('fo-elenco').querySelectorAll('.riga').forEach(function (b) {
    b.addEventListener('click', function () { vai('fornitore', b.dataset.k || ('r:' + b.dataset.r)) })
  })
}

// ── Ditte da valutare ────────────────────────────────────────────────────────
function elencoDitte() {
  var lista = (RF.ditte || []).filter(function (d) { return !FORN.testo || RFC.corrisponde(d._cerca, FORN.testo) })
  html('fo-conteggio', lista.length + (lista.length === 1 ? ' ditta da valutare' : ' ditte da valutare') +
    ' — non sono fornitori: diventano fornitori solo con «✅ Diventa fornitore».')
  html('fo-elenco', lista.map(function (d) {
    var r = d.radar
    var t = [tag('info', '🔎', 'Ditta da valutare')]
    if (r.origine) t.push(tag('', '📍', r.origine))
    ;(r.specialita || []).forEach(function (s) { t.push(tag('', '🏷️', s)) })
    return '<button type="button" class="riga" data-r="' + esc(r.id) + '"><div class="corpo">' +
      '<div class="desc">' + esc(d.nome) + '</div>' +
      '<div class="dim piccolo">' + esc([r.luogo, r.sito_web].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="tags" style="margin-top:4px">' + t.join(' ') + '</div></div></button>'
  }).join('') || '<div class="vuoto">Nessuna ditta da valutare.</div>')
  el('fo-elenco').querySelectorAll('.riga').forEach(function (b) {
    b.addEventListener('click', function () { vai('fornitore', 'r:' + b.dataset.r) })
  })
}

async function disegnaDitta(d) {
  var r = d.radar
  var v = el('vista-fornitore')
  if (!(await sessioneValida())) return
  var q = await sb.from('rf_valutazioni').select('*').eq('fornitore_id', r.id).order('creato_il', { ascending: false })
  if (q.error) throw q.error
  var valutazioni = q.data || []
  var sito = r.sito_web ? (/^https?:\/\//i.test(r.sito_web) ? r.sito_web : 'https://' + r.sito_web) : ''
  v.innerHTML =
    '<div class="gruppo-btn non-stampare" style="margin-bottom:12px"><button type="button" class="btn" id="fd-indietro">← Ditte da valutare</button></div>' +
    '<div class="scheda"><div class="intestazione"><h1>🔎 ' + esc(d.nome) + '</h1></div>' +
      banner('info', 'Ditta da valutare: <strong>non è un fornitore</strong> e non è in Rubrica. Non compare in import, confronti e richieste d\'offerta.') +
      '<div class="griglia">' +
        '<div><span class="dim">Origine</span><br>' + esc(r.origine || '–') + '</div>' +
        '<div><span class="dim">Luogo</span><br>' + esc(r.luogo || '–') + '</div>' +
        '<div><span class="dim">Sito</span><br>' + (sito ? '<a href="' + esc(sito) + '" target="_blank" rel="noopener">🌐 ' + esc(r.sito_web) + '</a>' : '–') + '</div>' +
        '<div><span class="dim">Specialità</span><br>' + esc((r.specialita || []).join(', ') || '–') + '</div>' +
      '</div>' +
      '<label for="fd-note">Note</label><textarea id="fd-note" rows="6">' + esc(r.note || '') + '</textarea>' +
      '<div class="gruppo-btn" style="margin-top:8px"><button type="button" class="btn" id="fd-salva-note">💾 Salva note</button></div>' +
      '<div id="fd-err"></div>' +
    '</div>' +
    '<div class="scheda"><h2>⭐ Valutazione</h2>' +
      '<div class="voti" role="group" aria-label="Voto da 1 a 5">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<button type="button" class="btn" data-voto="' + n + '" aria-pressed="false">' + n + ' ' + ['', 'scarso', 'mediocre', 'buono', 'molto buono', 'ottimo'][n] + '</button>'
      }).join('') + '</div>' +
      '<label for="fd-vnote">Note (qualità, puntualità, affidabilità)</label><textarea id="fd-vnote" rows="3"></textarea>' +
      '<div class="gruppo-btn" style="margin-top:8px"><button type="button" class="btn" id="fd-voto-salva">⭐ Aggiungi valutazione</button></div>' +
      '<div class="elenco" style="margin-top:12px">' + (valutazioni.map(function (x) {
        return '<div class="scheda" style="margin:0;padding:10px">' + (x.voto ? '<strong>' + x.voto + ' su 5</strong> · ' : '') +
          '<span class="dim">' + esc(RFC.timbro(x.creato_iniziali, x.creato_il)) + '</span>' +
          (x.note ? '<div style="white-space:pre-line">' + esc(x.note) + '</div>' : '') + '</div>'
      }).join('') || '<div class="dim">Nessuna valutazione.</div>') + '</div></div>' +
    '<div class="barra-azioni non-stampare"><div class="spazio"></div>' +
      '<button type="button" class="btn btn-primario" id="fd-diventa">✅ Diventa fornitore</button></div>'

  el('fd-indietro').addEventListener('click', function () { FORN.gruppo = 'ditte'; vai('fornitori') })
  el('fd-salva-note').addEventListener('click', async function () {
    var u = await sb.from('rf_fornitori').update({ note: el('fd-note').value.trim() || null }).eq('id', r.id).select('id')
    if (u.error || !u.data || !u.data.length) return html('fd-err', banner('err', esc('Non salvato: ' + spiegaErrore(u.error || 'permessi'))))
    await caricaFornitori(true); toast('💾 Note salvate')
  })
  var voto = null
  v.querySelectorAll('[data-voto]').forEach(function (b) {
    b.addEventListener('click', function () {
      voto = Number(b.dataset.voto)
      v.querySelectorAll('[data-voto]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)) })
    })
  })
  el('fd-voto-salva').addEventListener('click', async function () {
    if (!voto) return toast('Scegli il voto da 1 a 5.')
    var ins = await sb.from('rf_valutazioni').insert({ fornitore_id: r.id, voto: voto, note: el('fd-vnote').value.trim() || null })
    if (ins.error) return avvisa('err', esc('Valutazione non salvata: ' + spiegaErrore(ins.error)))
    toast('⭐ Valutazione salvata'); disegnaDitta(d)
  })
  el('fd-diventa').addEventListener('click', function () { finestraDiventaFornitore(d) })
}

// «Diventa fornitore»: Umberto crea il contatto in Rubrica, poi qui lo sceglie.
// Il Radar NON crea contatti: collega soltanto (funzione rf_diventa_fornitore).
function finestraDiventaFornitore(d) {
  var proposto = indovinaFornitore(d.nome, null)
  var fin = apriFinestra({
    titolo: '✅ ' + d.nome + ' diventa fornitore',
    html:
      '<ol style="margin:0 0 12px 18px;padding:0">' +
        '<li>Crea il contatto nella <strong>Rubrica</strong>, categoria <strong>Fornitori</strong>.</li>' +
        '<li>Torna qui e premi <strong>🔄 Ricarica dalla Rubrica</strong>.</li>' +
        '<li>Scegli il contatto e premi <strong>Collega</strong>.</li></ol>' +
      '<div class="gruppo-btn">' +
        '<a class="btn" href="' + URL_RUBRICA + '" target="_blank" rel="noopener">📇 Apri la Rubrica</a>' +
        '<button type="button" class="btn" id="dv-copia">📋 Copia il nome</button>' +
        '<button type="button" class="btn" id="dv-ricarica">🔄 Ricarica dalla Rubrica</button></div>' +
      '<label for="dv-contatto">Contatto della Rubrica</label><select id="dv-contatto"></select>' +
      '<div id="dv-info" class="aiuto"></div><div id="dv-err" style="margin-top:8px"></div>',
    pulsanti: [
      { testo: 'Annulla', sinistra: true, azione: function (f) { f.chiudi() } },
      { testo: '🔗 Collega', classe: 'btn-primario', azione: collega }
    ]
  })
  function riempi() {
    var sel = fin.q('#dv-contatto'), att = sel.value || (proposto && proposto.contatto ? proposto.contatto.id : '')
    sel.innerHTML = '<option value="">— scegli il contatto —</option>' + RF.fornitori
      .filter(function (f) { return f.contatto && f.contatto.attivo !== false })
      .map(function (f) {
        return '<option value="' + f.contatto.id + '"' + (f.contatto.id === att ? ' selected' : '') + '>' + esc(f.nome) +
          (f.radar ? ' — ha già una scheda Radar: si uniscono' : '') + '</option>'
      }).join('')
    html(fin.q('#dv-info'), proposto && proposto.contatto ? 'Proposto per nome: <strong>' + esc(proposto.nome) + '</strong>. Controlla che sia la ditta giusta.' :
      'Nessun contatto con questo nome: crealo prima nella Rubrica.')
  }
  riempi()
  fin.q('#dv-copia').addEventListener('click', function () { copiaTesto(d.nome) })
  fin.q('#dv-ricarica').addEventListener('click', async function () {
    try { await caricaFornitori(true); proposto = indovinaFornitore(d.nome, null); riempi(); toast('🔄 Rubrica ricaricata') }
    catch (e) { html(fin.q('#dv-err'), banner('err', esc(spiegaErrore(e)))) }
  })
  async function collega(f, b) {
    var c = f.q('#dv-contatto').value
    if (!c) return html(f.q('#dv-err'), banner('warn', 'Scegli il contatto della Rubrica.'))
    b.disabled = true
    var r = await sb.rpc('rf_diventa_fornitore', { p_ditta: d.id, p_contatto: c })
    if (r.error) { b.disabled = false; return html(f.q('#dv-err'), banner('err', esc(spiegaErrore(r.error)))) }
    f.chiudi()
    await caricaFornitori(true)
    toast('✅ ' + d.nome + ' ora è un fornitore')
    vai('fornitore', c)
  }
}

// ── Scheda fornitore (parametro = id del contatto, oppure «r:<id radar>») ────
async function disegnaFornitore(param) {
  if (!(await caricaBase()) || !(await caricaFornitori())) return
  if (String(param || '').indexOf('r:') === 0) {
    var dd = dittaDaId(param.slice(2))
    if (dd) return disegnaDitta(dd)
  }
  var f = String(param || '').indexOf('r:') === 0 ? fornitoreDaId(param.slice(2)) : fornitoreDaContatto(param)
  var v = el('vista-fornitore')
  if (!f) { v.innerHTML = '<button class="btn" onclick="vai(\'fornitori\')">← Fornitori</button>' + banner('warn', 'Fornitore non trovato.'); return }
  var k = f.contatto, r = f.radar
  var valutazioni = [], documenti = [], nPrezzi = 0
  if (r) {
    if (!(await sessioneValida())) return
    var q = await Promise.all([
      sb.from('rf_valutazioni').select('*').eq('fornitore_id', r.id).order('creato_il', { ascending: false }),
      sb.from('rf_documenti').select('id,tipo,numero,data_documento,versione,percorso,nome_file,creato_iniziali,creato_il,nessun_prezzo').eq('fornitore_id', r.id).order('creato_il', { ascending: false }).limit(50),
      sb.from('rf_prezzi').select('id', { count: 'exact', head: true }).eq('fornitore_id', r.id).eq('stato', 'attivo')
    ])
    if (q[0].error) throw q[0].error
    if (q[1].error) throw q[1].error
    valutazioni = q[0].data || []; documenti = q[1].data || []; nPrezzi = q[2].count || 0
  }
  var voti = valutazioni.filter(function (x) { return x.voto }).map(function (x) { return x.voto })
  var media = voti.length ? voti.reduce(function (a, b) { return a + b }, 0) / voti.length : null
  var servizi = RF.categorie.filter(function (c) { return !c.archiviata })

  v.innerHTML =
    '<div class="gruppo-btn non-stampare" style="margin-bottom:12px"><button type="button" class="btn" id="fs-indietro">← Fornitori</button></div>' +
    '<div class="scheda"><div class="intestazione"><h1>🏭 ' + esc(f.nome) + '</h1>' +
      '<a class="btn" href="' + URL_RUBRICA + '" target="_blank" rel="noopener">📇 Apri la Rubrica</a></div>' +
      (k ? '<div class="griglia">' +
        '<div><span class="dim">Indirizzo</span><br>' + esc([k.indirizzo, [k.cap, k.citta].filter(Boolean).join(' '), k.paese].filter(Boolean).join(', ') || '–') + '</div>' +
        '<div><span class="dim">Telefono</span><br>' + (k.telefono ? '<a href="tel:' + esc(k.telefono) + '">📞 ' + esc(k.telefono) + '</a>' : '–') + '</div>' +
        '<div><span class="dim">Email</span><br>' + (k.email ? '<a href="mailto:' + esc(k.email) + '">✉️ ' + esc(k.email) + '</a>' : '–') + '</div>' +
        '<div><span class="dim">Prezzi attivi</span><br>' + nPrezzi + '</div>' +
        '<div><span class="dim">Voto medio</span><br>' + (media != null ? RFC.fmt(media, 1) + ' su 5 (' + voti.length + ')' : '–') + '</div>' +
      '</div>' : banner('warn', 'Il contatto della Rubrica non si legge (permessi o contatto archiviato).')) +
    '</div>' +

    '<div class="scheda"><h2>📡 Dati del Radar</h2>' +
      '<fieldset style="border:0;padding:0;margin:0"><legend style="font-weight:600">Attività (più di una se serve)</legend>' +
        '<div class="gruppo-btn">' + servizi.map(function (c) {
          var on = r && (r.attivita || []).indexOf(c.nome) >= 0
          return '<label class="scelta" style="margin-right:12px"><input type="checkbox" name="fs-att" value="' + esc(c.nome) + '"' + (on ? ' checked' : '') + '> ' + esc(c.nome) + '</label>'
        }).join('') + '</div></fieldset>' +
      (r && r.specialita && r.specialita.length ? '<p class="aiuto">Specialità dal vecchio Radar: ' + esc(r.specialita.join(', ')) + '</p>' : '') +
      '<div class="griglia">' +
        '<div><label for="fs-valuta">Valuta abituale</label><select id="fs-valuta"><option' + (r && r.valuta === 'CHF' ? ' selected' : '') + '>CHF</option><option' + (r && r.valuta === 'EUR' ? ' selected' : '') + '>EUR</option></select></div>' +
        '<div><label for="fs-sconto">Sconto di base %</label><input id="fs-sconto" inputmode="decimal" value="' + (r ? RFC.fmt(r.sconto_base, 2).replace(/'/g, '') : '0') + '"></div>' +
        '<div><label for="fs-arrivo">Costo di arrivo stimato %</label><input id="fs-arrivo" inputmode="decimal" value="' + (r ? RFC.fmt(r.costo_arrivo_pct, 2).replace(/'/g, '') : '0') + '">' +
          '<div class="aiuto">Trasporto + dogana + IVA d\'importazione. Usato SOLO nel confronto.</div></div>' +
        '<div><label for="fs-paese">Paese (2 lettere)</label><input id="fs-paese" maxlength="2" value="' + esc((r && r.paese) || (k && k.paese) || 'CH') + '"></div>' +
      '</div>' +
      '<label for="fs-minimo">Ordine minimo</label><input id="fs-minimo" value="' + esc((r && r.ordine_minimo) || '') + '" placeholder="es. 1 paletta, 500 CHF…">' +
      '<label class="scelta"><input type="checkbox" id="fs-pacchi"' + (r && r.solo_pacchi_interi ? ' checked' : '') + '> Vende solo pacchi interi (i suoi prezzi compaiono come «prezzo grandi quantità»)</label>' +
      '<label class="scelta"><input type="checkbox" id="fs-codice"' + (r && r.abbina_solo_codice ? ' checked' : '') + '> Abbina le sue offerte SOLO per codice (cambia i nomi delle qualità, es. Agrop)</label>' +
      '<label for="fs-trasporto">Note sul trasporto</label><input id="fs-trasporto" value="' + esc((r && r.note_trasporto) || '') + '">' +
      '<label for="fs-note">Note</label><textarea id="fs-note" rows="4">' + esc((r && r.note) || '') + '</textarea>' +
      (r ? '<p class="aiuto">Creato: ' + esc(RFC.timbro(r.creato_iniziali, r.creato_il)) + (r.modificato_il ? ' · modificato: ' + esc(RFC.timbro(r.modificato_iniziali, r.modificato_il)) : '') + '</p>' : '') +
      '<div id="fs-err"></div>' +
    '</div>' +

    '<div class="scheda"><h2>⭐ Valutazione</h2>' +
      (r || k ? '<div class="voti" role="group" aria-label="Voto da 1 a 5">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<button type="button" class="btn" data-voto="' + n + '" aria-pressed="false">' + n + ' ' + ['', 'scarso', 'mediocre', 'buono', 'molto buono', 'ottimo'][n] + '</button>'
      }).join('') + '</div>' +
      '<label for="fs-vnote">Note (qualità, puntualità, affidabilità)</label><textarea id="fs-vnote" rows="3"></textarea>' +
      '<div class="gruppo-btn" style="margin-top:8px"><button type="button" class="btn" id="fs-valuta-salva">⭐ Aggiungi valutazione</button></div>' : '') +
      '<div class="elenco" style="margin-top:12px">' + (valutazioni.map(function (x) {
        return '<div class="scheda" style="margin:0;padding:10px">' + (x.voto ? '<strong>' + x.voto + ' su 5</strong> · ' : '') +
          '<span class="dim">' + esc(RFC.timbro(x.creato_iniziali, x.creato_il)) + '</span>' +
          (x.note ? '<div style="white-space:pre-line">' + esc(x.note) + '</div>' : '') + '</div>'
      }).join('') || '<div class="dim">Nessuna valutazione.</div>') + '</div>' +
    '</div>' +

    (documenti.length ? '<div class="scheda"><h2>📄 Documenti</h2><div class="tabella-wrap"><table class="tab a-schede"><thead><tr><th>Tipo</th><th>Numero</th><th>Data</th><th>Chi</th><th></th></tr></thead><tbody>' +
      documenti.map(function (d) {
        return '<tr><td data-et="Tipo">' + esc(d.tipo) + (d.versione > 1 ? ' · versione ' + d.versione : '') + '</td>' +
          '<td data-et="Numero">' + esc(d.numero || '–') + '</td><td data-et="Data">' + RFC.fmtData(d.data_documento) + '</td>' +
          '<td data-et="Chi" class="nowrap">' + esc(RFC.timbro(d.creato_iniziali, d.creato_il)) + '</td>' +
          '<td>' + (d.percorso ? '<button type="button" class="btn btn-piccolo" data-doc="' + esc(d.percorso) + '">📄 Apri</button>' : '') + '</td></tr>'
      }).join('') + '</tbody></table></div></div>' : '') +

    '<div class="barra-azioni non-stampare">' +
      (RF.titolare && r ? '<button type="button" class="btn btn-pericolo" id="fs-archivia">' + (r.archiviato ? '↩️ Ripristina' : '📦 Archivia') + '</button>' : '') +
      '<div class="spazio"></div>' +
      (k ? '<button type="button" class="btn btn-primario" id="fs-salva">💾 Salva dati Radar</button>' : '') +
    '</div>'

  el('fs-indietro').addEventListener('click', function () { vai('fornitori') })
  v.querySelectorAll('[data-doc]').forEach(function (b) { b.addEventListener('click', function () { apriDocumento(b.dataset.doc) }) })

  var votoScelto = null
  v.querySelectorAll('[data-voto]').forEach(function (b) {
    b.addEventListener('click', function () {
      votoScelto = Number(b.dataset.voto)
      v.querySelectorAll('[data-voto]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)) })
    })
  })
  if (el('fs-valuta-salva')) el('fs-valuta-salva').addEventListener('click', async function () {
    var note = el('fs-vnote').value.trim()
    if (!votoScelto) return toast('Scegli il voto da 1 a 5.')
    try {
      var fid = r ? r.id : await assicuraFornitoreRadar(k.id)
      var ins = await sb.from('rf_valutazioni').insert({ fornitore_id: fid, voto: votoScelto, note: note || null })
      if (ins.error) throw ins.error
      toast('⭐ Valutazione salvata')
      disegnaFornitore(param)
    } catch (e) { avvisa('err', esc('Valutazione non salvata: ' + spiegaErrore(e))) }
  })

  if (el('fs-salva')) el('fs-salva').addEventListener('click', async function () {
    var dati = {
      attivita: Array.from(v.querySelectorAll('input[name="fs-att"]:checked')).map(function (x) { return x.value }),
      valuta: el('fs-valuta').value,
      sconto_base: RFC.numero(el('fs-sconto').value) || 0,
      costo_arrivo_pct: RFC.numero(el('fs-arrivo').value) || 0,
      paese: (el('fs-paese').value || '').trim().toUpperCase() || null,
      ordine_minimo: el('fs-minimo').value.trim() || null,
      solo_pacchi_interi: el('fs-pacchi').checked,
      abbina_solo_codice: el('fs-codice').checked,
      note_trasporto: el('fs-trasporto').value.trim() || null,
      note: el('fs-note').value.trim() || null
    }
    if (dati.sconto_base < 0 || dati.sconto_base >= 100) return html('fs-err', banner('err', 'Lo sconto di base va da 0 a 99.'))
    if (dati.costo_arrivo_pct < 0) return html('fs-err', banner('err', 'Il costo di arrivo non può essere negativo.'))
    if (dati.paese && !/^[A-Z]{2}$/.test(dati.paese)) return html('fs-err', banner('err', 'Il paese va scritto con 2 lettere (CH, IT, DE…).'))
    try {
      if (!(await sessioneValida())) return
      var fid = r ? r.id : await assicuraFornitoreRadar(k.id)
      var u = await sb.from('rf_fornitori').update(dati).eq('id', fid).select('id')
      if (u.error) throw u.error
      await caricaFornitori(true)
      toast('💾 Dati Radar salvati')
      disegnaFornitore(param)
    } catch (e) { html('fs-err', banner('err', esc('Non salvato: ' + spiegaErrore(e)))) }
  })

  if (el('fs-archivia')) el('fs-archivia').addEventListener('click', async function () {
    var ok = await conferma(r.archiviato ? 'Ripristina fornitore' : 'Archivia fornitore',
      r.archiviato ? 'Il fornitore torna nei confronti.' : 'I suoi prezzi escono dal confronto. Prezzi, documenti e storico restano. Il contatto in Rubrica non cambia.',
      r.archiviato ? '↩️ Ripristina' : '📦 Archivia', !r.archiviato)
    if (!ok) return
    var u = await sb.from('rf_fornitori').update({ archiviato: !r.archiviato }).eq('id', r.id).select('id')
    if (u.error) return avvisa('err', esc('Non riuscito: ' + spiegaErrore(u.error)))
    await caricaFornitori(true); await caricaArticoli(true)
    toast(r.archiviato ? '↩️ Ripristinato' : '📦 Archiviato')
    disegnaFornitore(param)
  })
}
