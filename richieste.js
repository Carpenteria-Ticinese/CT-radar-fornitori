// CT Radar Fornitori — richieste.js
// «Richiesta d'offerta»: scegli articoli (o scrivi righe a mano) con quantità
// e unità, scegli uno o più fornitori. Il programma prepara:
//   • la LETTERA da copiare (testo base modificabile in Impostazioni)
//   • la SCHEDA Excel: Codice CT | Descrizione | Quantità | Unità |
//     Prezzo unitario | Sconto % | Netto | Note
// Se il fornitore rimanda la scheda compilata, «Importa offerta» la riconosce
// dalla colonna «Codice CT» e abbina senza AI.
// Le tabelle rf_richieste* si creano con il file SQL 08.

'use strict'

var RIC = null

async function disegnaRichieste(param) {
  if (!(await caricaBase()) || !(await caricaArticoli()) || !(await caricaFornitori())) return
  var v = el('vista-richieste')
  if (!(await sessioneValida())) return
  var r = await sb.from('rf_richieste').select('*').order('creato_il', { ascending: false }).limit(100)
  if (r.error) {
    if (/does not exist|relation|schema cache/i.test(r.error.message || '')) {
      v.innerHTML = '<h1>📝 Richiesta d\'offerta</h1>' + banner('warn', 'Le richieste d\'offerta non sono ancora attive: va lanciato il file SQL <strong>08_RICHIESTE_OFFERTA.sql</strong>.')
      return
    }
    throw r.error
  }
  if (param) return dettaglioRichiesta(param)
  var richieste = r.data || []
  v.innerHTML = '<div class="intestazione"><h1>📝 Richiesta d\'offerta</h1>' +
      '<button type="button" class="btn btn-primario" id="ri-nuova">＋ Nuova richiesta</button></div>' +
    '<div class="elenco">' + (richieste.map(function (x) {
      return '<button type="button" class="riga" data-id="' + x.id + '"><div class="corpo">' +
        '<div class="desc">' + esc(x.numero) + (x.riferimento ? ' — ' + esc(x.riferimento) : '') + '</div>' +
        '<div class="tags">' + tag('', '📅', 'del ' + RFC.fmtData(x.data_richiesta)) + (x.termine ? tag('', '⏰', 'termine ' + RFC.fmtData(x.termine)) : '') +
          tag(x.stato === 'inviata' ? 'ok' : '', x.stato === 'inviata' ? '📤' : '📝', x.stato === 'inviata' ? 'Inviata' : x.stato === 'chiusa' ? 'Chiusa' : 'Bozza') +
          tag('', '👤', RFC.timbro(x.creato_iniziali, x.creato_il)) + '</div></div></button>'
    }).join('') || '<div class="vuoto">Nessuna richiesta. Premi ＋ Nuova richiesta.</div>') + '</div>'
  el('ri-nuova').addEventListener('click', nuovaRichiesta)
  v.querySelectorAll('.riga').forEach(function (b) { b.addEventListener('click', function () { vai('richieste', b.dataset.id) }) })
}

function nuovaRichiesta() {
  RIC = { righe: [], fornitori: [] }
  var v = el('vista-richieste')
  v.innerHTML = '<div class="gruppo-btn" style="margin-bottom:12px"><button type="button" class="btn" id="rn-indietro">← Richieste</button></div>' +
    '<h1>＋ Nuova richiesta d\'offerta</h1>' +
    '<div class="scheda"><div class="griglia">' +
      '<div><label for="rn-rif">Riferimento (cantiere, oggetto)</label><input id="rn-rif"></div>' +
      '<div><label for="rn-termine">Termine per l\'offerta</label><input id="rn-termine" type="date"></div>' +
      '<div><label for="rn-luogo">Trasporto franco</label><input id="rn-luogo" value="' + esc(RF.imp.luogo_franco || 'Bellinzona') + '"></div>' +
    '</div><label for="rn-note">Note (vanno nella scheda)</label><input id="rn-note"></div>' +
    '<div class="scheda"><h2>📦 Righe</h2>' +
      '<div class="griglia"><div><label>Articolo</label><div id="rn-art"></div></div>' +
        '<div><label for="rn-q">Quantità</label><input id="rn-q" inputmode="decimal"></div>' +
        '<div><label for="rn-u">Unità</label><select id="rn-u">' + opzioniUnita('pz') + '</select></div></div>' +
      '<div class="gruppo-btn" style="margin-top:8px"><button type="button" class="btn" id="rn-agg">＋ Aggiungi articolo</button>' +
        '<button type="button" class="btn" id="rn-mano">✍️ Riga a mano</button></div>' +
      '<div id="rn-righe" style="margin-top:12px"></div></div>' +
    '<div class="scheda"><h2>🏭 Fornitori</h2>' +
      '<input id="rn-fcerca" type="search" placeholder="Cerca fornitore…" aria-label="Cerca fornitore">' +
      '<div id="rn-forn" style="max-height:320px;overflow:auto;margin-top:8px"></div></div>' +
    '<div id="rn-err"></div>' +
    '<div class="barra-azioni"><button type="button" class="btn" id="rn-annulla">Annulla</button>' +
      '<div class="info" id="rn-info"></div><button type="button" class="btn btn-primario" id="rn-prepara">📝 Prepara richiesta</button></div>'
  var scelto = null
  var menu = menuArticolo(el('rn-art'), { alCambio: function (id) {
    scelto = id; var a = articoloDaId(id); if (a) el('rn-u').value = a.unita; el('rn-q').focus()
  } })
  el('rn-agg').addEventListener('click', function () {
    var a = scelto ? articoloDaId(scelto) : null
    if (!a) return toast('Scegli un articolo.')
    RIC.righe.push({ articolo_id: a.id, descrizione: a.descrizione, codice: a.codice, quantita: RFC.numero(el('rn-q').value), unita: el('rn-u').value })
    scelto = null; menu.imposta(null); el('rn-q').value = ''; disegnaRigheRic()
  })
  el('rn-mano').addEventListener('click', function () {
    apriFinestra({
      titolo: '✍️ Riga a mano',
      html: '<label for="rm-d">Descrizione</label><input id="rm-d"><div class="griglia"><div><label for="rm-q">Quantità</label><input id="rm-q" inputmode="decimal"></div>' +
        '<div><label for="rm-u">Unità</label><select id="rm-u">' + opzioniUnita('pz') + '</select></div></div>',
      pulsanti: [{ testo: 'Annulla', sinistra: true, azione: function (f) { f.chiudi() } },
        { testo: '＋ Aggiungi', classe: 'btn-primario', azione: function (f) {
          var d = f.q('#rm-d').value.trim(); if (!d) return toast('Scrivi la descrizione.')
          RIC.righe.push({ articolo_id: null, descrizione: d, codice: null, quantita: RFC.numero(f.q('#rm-q').value), unita: f.q('#rm-u').value })
          f.chiudi(); disegnaRigheRic()
        } }]
    })
  })
  el('rn-fcerca').addEventListener('input', disegnaFornRic)
  el('rn-indietro').addEventListener('click', function () { vai('richieste') })
  el('rn-annulla').addEventListener('click', function () { vai('richieste') })
  el('rn-prepara').addEventListener('click', salvaRichiesta)
  disegnaRigheRic(); disegnaFornRic()
}

function disegnaRigheRic() {
  html('rn-righe', RIC.righe.length ? '<div class="tabella-wrap"><table class="tab a-schede"><thead><tr><th>Codice CT</th><th>Descrizione</th><th class="num">Quantità</th><th>Unità</th><th></th></tr></thead><tbody>' +
    RIC.righe.map(function (r, i) {
      return '<tr><td data-et="Codice CT" class="mono">' + esc(r.codice || '(a mano)') + '</td><td data-et="Descrizione">' + esc(r.descrizione) + '</td>' +
        '<td data-et="Quantità" class="num">' + (r.quantita != null ? RFC.fmt(r.quantita, 2) : '–') + '</td><td data-et="Unità">' + esc(r.unita) + '</td>' +
        '<td><button type="button" class="btn btn-piccolo" data-togli="' + i + '">✕ Togli</button></td></tr>'
    }).join('') + '</tbody></table></div>' : '<div class="dim">Nessuna riga.</div>')
  el('rn-righe').querySelectorAll('[data-togli]').forEach(function (b) {
    b.addEventListener('click', function () { RIC.righe.splice(Number(b.dataset.togli), 1); disegnaRigheRic() })
  })
  infoRic()
}
function disegnaFornRic() {
  var t = el('rn-fcerca').value
  var lista = RF.fornitori.filter(function (f) { return f.contatto && f.contatto.attivo !== false && !(f.radar && f.radar.archiviato) && (!t || RFC.corrisponde(f._cerca, t)) })
  html('rn-forn', lista.slice(0, 200).map(function (f) {
    return '<label class="scelta"><input type="checkbox" data-k="' + f.contatto.id + '"' + (RIC.fornitori.indexOf(f.contatto.id) >= 0 ? ' checked' : '') + '> ' + esc(f.nome) +
      (f.contatto.email ? ' <span class="dim piccolo">' + esc(f.contatto.email) + '</span>' : '') + '</label>'
  }).join('') || '<div class="dim">Nessun fornitore.</div>')
  el('rn-forn').querySelectorAll('[data-k]').forEach(function (c) {
    c.addEventListener('change', function () {
      if (c.checked) { if (RIC.fornitori.indexOf(c.dataset.k) < 0) RIC.fornitori.push(c.dataset.k) }
      else RIC.fornitori = RIC.fornitori.filter(function (x) { return x !== c.dataset.k })
      infoRic()
    })
  })
}
function infoRic() { html('rn-info', RIC.righe.length + ' righe · ' + RIC.fornitori.length + ' fornitori') }

async function salvaRichiesta() {
  if (!RIC.righe.length) return html('rn-err', banner('warn', 'Aggiungi almeno una riga.'))
  if (!RIC.fornitori.length) return html('rn-err', banner('warn', 'Scegli almeno un fornitore.'))
  el('rn-prepara').disabled = true
  try {
    if (!(await sessioneValida())) return
    var n = await sb.rpc('rf_nuovo_numero_richiesta')
    if (n.error) throw n.error
    var ins = await sb.from('rf_richieste').insert({
      numero: n.data, riferimento: el('rn-rif').value.trim() || null, termine: el('rn-termine').value || null,
      luogo_franco: el('rn-luogo').value.trim() || null, note: el('rn-note').value.trim() || null
    }).select('id').single()
    if (ins.error) throw ins.error
    var id = ins.data.id
    var r1 = await sb.from('rf_richieste_righe').insert(RIC.righe.map(function (r, i) {
      return { richiesta_id: id, ordine: i + 1, articolo_id: r.articolo_id, descrizione: r.descrizione, quantita: r.quantita, unita: r.unita }
    }))
    if (r1.error) throw r1.error
    var fids = []
    for (var i = 0; i < RIC.fornitori.length; i++) fids.push(await assicuraFornitoreRadar(RIC.fornitori[i]))
    var r2 = await sb.from('rf_richieste_fornitori').insert(fids.map(function (f) { return { richiesta_id: id, fornitore_id: f } }))
    if (r2.error) throw r2.error
    toast('📝 Richiesta ' + n.data + ' preparata')
    vai('richieste', id)
  } catch (e) {
    el('rn-prepara').disabled = false
    html('rn-err', banner('err', esc('Non salvata: ' + spiegaErrore(e))))
  }
}

async function dettaglioRichiesta(id) {
  var v = el('vista-richieste')
  var q = await Promise.all([
    sb.from('rf_richieste').select('*').eq('id', id).single(),
    sb.from('rf_richieste_righe').select('*').eq('richiesta_id', id).order('ordine'),
    sb.from('rf_richieste_fornitori').select('*').eq('richiesta_id', id)
  ])
  q.forEach(function (x) { if (x.error) throw x.error })
  var ric = q[0].data, righe = q[1].data || [], forn = q[2].data || []
  v.innerHTML = '<div class="gruppo-btn" style="margin-bottom:12px"><button type="button" class="btn" id="rd-indietro">← Richieste</button></div>' +
    '<div class="scheda"><h1>📝 ' + esc(ric.numero) + (ric.riferimento ? ' — ' + esc(ric.riferimento) : '') + '</h1>' +
      '<p class="dim">' + esc(RFC.timbro(ric.creato_iniziali, ric.creato_il)) + (ric.termine ? ' · termine ' + RFC.fmtData(ric.termine) : '') + ' · ' + righe.length + ' righe</p>' +
      (ric.stato !== 'inviata' ? '<button type="button" class="btn" id="rd-inviata">📤 Segna come inviata</button>' : tag('ok', '📤', 'Inviata')) + '</div>' +
    forn.map(function (x) {
      var f = fornitoreDaId(x.fornitore_id)
      var lettera = testoLettera(ric)
      var email = f && f.contatto ? f.contatto.email : ''
      var oggetto = (lettera.split('\n')[0] || '').replace(/^Oggetto:\s*/i, '')
      var corpo = lettera.split('\n').slice(1).join('\n').replace(/^\s+/, '')
      return '<div class="scheda"><h2>🏭 ' + esc(f ? f.nome : '?') + '</h2>' +
        '<label for="let-' + x.id + '">Lettera</label><textarea id="let-' + x.id + '" rows="12">' + esc(lettera) + '</textarea>' +
        '<div class="gruppo-btn" style="margin-top:8px">' +
          '<button type="button" class="btn" data-copia="let-' + x.id + '">📋 Copia testo</button>' +
          '<button type="button" class="btn" data-scheda="' + x.fornitore_id + '">⬇️ Scheda Excel</button>' +
          (email ? '<a class="btn" href="mailto:' + esc(email) + '?subject=' + encodeURIComponent(oggetto) + '&body=' + encodeURIComponent(corpo) + '">✉️ Scrivi la mail</a>' : '') +
        '</div><p class="aiuto">«Scrivi la mail» apre il tuo programma di posta: allega la scheda Excel e invia tu.</p></div>'
    }).join('')
  el('rd-indietro').addEventListener('click', function () { vai('richieste') })
  v.querySelectorAll('[data-copia]').forEach(function (b) { b.addEventListener('click', function () { copiaTesto(el(b.dataset.copia).value) }) })
  v.querySelectorAll('[data-scheda]').forEach(function (b) {
    b.addEventListener('click', function () { schedaExcel(ric, righe, fornitoreDaId(b.dataset.scheda)).catch(function (e) { avvisa('err', esc(spiegaErrore(e))) }) })
  })
  if (el('rd-inviata')) el('rd-inviata').addEventListener('click', async function () {
    var u = await sb.from('rf_richieste').update({ stato: 'inviata' }).eq('id', id)
    if (u.error) return avvisa('err', esc(spiegaErrore(u.error)))
    dettaglioRichiesta(id)
  })
}

function dataLunga(iso) { var d = RFC.fmtData(iso); return d === '–' ? '[data]' : d.slice(0, 6) + '20' + d.slice(6) }
function testoLettera(ric) {
  return String(RF.imp.testo_lettera || '')
    .replace(/\[riferimento\]/g, ric.riferimento || ric.numero)
    .replace(/\[luogo\]/g, ric.luogo_franco || RF.imp.luogo_franco || 'Bellinzona')
    .replace(/\[data\]/g, ric.termine ? dataLunga(ric.termine) : 'da concordare')
}

async function schedaExcel(ric, righe, f) {
  await caricaLibreria('xlsx')
  var aoa = [
    ['Richiesta d\'offerta — Carpenteria Ticinese Sagl, Via Girardolo del Nado 2, 6500 Bellinzona'],
    ['Fornitore:', f ? f.nome : ''],
    ['Data:', dataLunga(ric.data_richiesta)],
    ['N° richiesta:', ric.numero],
    ['Termine:', ric.termine ? dataLunga(ric.termine) : ''],
    ['Riferimento:', ric.riferimento || ''],
    ['Trasporto franco:', ric.luogo_franco || ''],
    [''],
    ['Codice CT', 'Descrizione', 'Quantità', 'Unità', 'Prezzo unitario', 'Sconto %', 'Netto', 'Note']
  ]
  righe.forEach(function (r, i) {
    var a = r.articolo_id ? articoloDaId(r.articolo_id) : null
    aoa.push([a ? a.codice : 'RIGA_' + (i + 1), r.descrizione, r.quantita == null ? '' : Number(r.quantita), r.unita || '', '', '', '', r.note || ''])
  })
  if (ric.note) aoa.push([''], ['Note:', ric.note])
  aoa.push([''], ['Compilate le colonne Prezzo unitario, Sconto % e Netto, e rimandateci questo file. Grazie!'])
  var ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 30 }, { wch: 50 }, { wch: 10 }, { wch: 8 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 30 }]
  var wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Richiesta')
  var nome = 'Richiesta_' + ric.numero + '_' + RFC.senzaAccenti(f ? f.nome : '').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 30) + '.xlsx'
  XLSX.writeFile(wb, nome)
  toast('⬇️ Scheda scaricata: ' + nome)
}
