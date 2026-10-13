// CT Radar Fornitori — variazioni.js
// «Variazioni»: un fornitore scrive «da tal data +3% sui prodotti Siga» oppure
// «da oggi 25% invece del 20% su Velux». Si incolla la mail (o si compila a
// mano), l'AI propone tipo / percentuale / ambito / date, e PRIMA di salvare
// si vede l'anteprima di tutti i prezzi toccati (vecchio → nuovo).
//
// Regole (le applica il database, funzione rf_calcolo):
//   NUOVO SCONTO sostituisce lo sconto del prezzo (20% → 25% = 25%, non 45%);
//                non vale per i prezzi con «sconto non noto» (segnalati).
//   RINCARO      si moltiplica (+3% poi +5% = ×1.03×1.05).
//   Una variazione vale solo per i prezzi con data PRECEDENTE al suo «dal».

'use strict'

async function disegnaVariazioni() {
  if (!(await caricaBase()) || !(await caricaFornitori())) return
  var v = el('vista-variazioni')
  v.innerHTML = '<div class="intestazione"><h1>📈 Variazioni</h1>' +
    '<button type="button" class="btn btn-primario" id="va-nuova">＋ Nuova variazione</button></div>' +
    '<p class="aiuto">Nuovo sconto: SOSTITUISCE lo sconto del prezzo. Rincaro: si MOLTIPLICA. Valgono solo per i prezzi più vecchi del loro «dal»; con una data futura partono da sole quel giorno.</p>' +
    '<div id="va-elenco" class="caricamento">⏳ Carico…</div>'
  el('va-nuova').addEventListener('click', function () { finestraVariazione() })
  if (!(await sessioneValida())) return
  var r = await sb.from('rf_variazioni').select('*').order('dal', { ascending: false }).limit(500)
  if (r.error) throw r.error
  var oggi = RFC.oggiISO()
  var gruppi = { attive: [], future: [], finite: [], annullate: [] }
  ;(r.data || []).forEach(function (x) {
    if (x.annullata) gruppi.annullate.push(x)
    else if (x.dal > oggi) gruppi.future.push(x)
    else if (x.al && x.al < oggi) gruppi.finite.push(x)
    else gruppi.attive.push(x)
  })
  var titoli = { attive: '✅ Attive', future: '⏳ Future (partono da sole)', finite: '⏹️ Finite', annullate: '🚫 Annullate' }
  html('va-elenco', Object.keys(gruppi).map(function (g) {
    if (!gruppi[g].length) return ''
    return '<h2 style="margin-top:16px">' + titoli[g] + ' (' + gruppi[g].length + ')</h2><div class="elenco">' + gruppi[g].map(rigaVariazione).join('') + '</div>'
  }).join('') || '<div class="vuoto">Nessuna variazione. Quando un fornitore annuncia uno sconto nuovo o un rincaro, premi ＋ Nuova variazione.</div>')
  el('va-elenco').classList.remove('caricamento')
  el('va-elenco').querySelectorAll('[data-annulla]').forEach(function (b) {
    b.addEventListener('click', async function () {
      if (!(await conferma('Annulla variazione', 'I prezzi tornano a come erano senza questa variazione. La variazione resta nell\'elenco come «annullata».', '🚫 Annulla variazione', true))) return
      var u = await sb.from('rf_variazioni').update({ annullata: true }).eq('id', b.dataset.annulla).select('id')
      if (u.error) return avvisa('err', esc('Non riuscito: ' + spiegaErrore(u.error)))
      await caricaArticoli(true)
      toast('🚫 Variazione annullata')
      disegnaVariazioni()
    })
  })
}

function testoAmbito(x) {
  if (x.ambito === 'tutto') return 'tutti i prodotti del fornitore'
  if (x.ambito === 'categoria') { var c = categoriaDaId(x.ambito_categoria_id); return 'categoria ' + (c ? c.nome : '?') }
  if (x.ambito === 'marca') return 'marca ' + x.ambito_marca
  return (x.ambito_articoli || []).map(function (id) { var a = articoloDaId(id); return a ? a.codice : '?' }).join(', ')
}

function rigaVariazione(x) {
  var f = fornitoreDaId(x.fornitore_id)
  return '<div class="scheda" style="margin:0">' +
    '<div class="tags">' + (x.tipo === 'sconto' ? tag('ok', '🏷️', 'NUOVO SCONTO ' + RFC.fmt(x.percentuale, 2) + '%')
                                                 : tag('warn', '📈', 'RINCARO ' + RFC.fmtPct(Number(x.percentuale), 2))) +
      tag('', '🏭', f ? f.nome : '?') + tag('', '🎯', testoAmbito(x)) +
      tag('', '📅', 'dal ' + RFC.fmtData(x.dal) + (x.al ? ' al ' + RFC.fmtData(x.al) : ' (per sempre)')) + '</div>' +
    '<div class="dim piccolo" style="margin-top:6px">' + esc(RFC.timbro(x.creato_iniziali, x.creato_il)) +
      (x.annullata ? ' · annullata: ' + esc(RFC.timbro(x.annullata_iniziali, x.annullata_il)) : '') + '</div>' +
    (x.testo ? '<details style="margin-top:6px"><summary>📧 Testo della mail</summary><div style="white-space:pre-line">' + esc(x.testo) + '</div></details>' : '') +
    (!x.annullata ? '<div class="gruppo-btn" style="margin-top:8px"><button type="button" class="btn btn-pericolo btn-piccolo" data-annulla="' + x.id + '">🚫 Annulla variazione</button></div>' : '') +
  '</div>'
}

// ── Nuova variazione ─────────────────────────────────────────────────────────
function finestraVariazione() {
  var articoliScelti = []
  var anteprimaFatta = false
  var fin = apriFinestra({
    titolo: '＋ Nuova variazione', larga: true,
    html:
      '<label for="vn-mail">Testo della mail (incollalo qui)</label>' +
      '<textarea id="vn-mail" rows="5" placeholder="es. Dal 1° novembre 2026 i prodotti Siga aumentano del 3%"></textarea>' +
      '<div class="gruppo-btn" style="margin-top:8px"><button type="button" class="btn" id="vn-ai">🤖 Proponi dalla mail</button>' +
        '<span class="aiuto">Oppure compila a mano qui sotto.</span></div>' +
      '<div id="vn-ai-msg" aria-live="polite" style="margin-top:8px"></div>' +
      '<label for="vn-forn">Fornitore</label><select id="vn-forn">' + opzioniFornitori(null, true) + '</select>' +
      '<fieldset style="border:0;padding:0;margin:12px 0 0"><legend style="font-weight:600">Tipo</legend>' +
        '<label class="scelta"><input type="radio" name="vn-tipo" value="rincaro" checked> 📈 Rincaro (si moltiplica)</label>' +
        '<label class="scelta"><input type="radio" name="vn-tipo" value="sconto"> 🏷️ Nuovo sconto (sostituisce lo sconto di prima)</label></fieldset>' +
      '<div class="griglia">' +
        '<div><label for="vn-pct">Percentuale %</label><input id="vn-pct" inputmode="decimal" placeholder="es. 3"></div>' +
        '<div><label for="vn-dal">Dal</label><input id="vn-dal" type="date" value="' + RFC.oggiISO() + '"></div>' +
        '<div><label for="vn-al">Al (vuoto = per sempre)</label><input id="vn-al" type="date"></div>' +
      '</div>' +
      '<label for="vn-ambito">Su che cosa</label><select id="vn-ambito">' +
        '<option value="tutto">Tutto il fornitore</option><option value="categoria">Una categoria</option>' +
        '<option value="marca">Una marca</option><option value="articoli">Articoli scelti</option></select>' +
      '<div id="vn-valore"></div>' +
      '<div class="gruppo-btn" style="margin-top:12px"><button type="button" class="btn" id="vn-anteprima">👁️ Anteprima dei prezzi toccati</button></div>' +
      '<div id="vn-esito" aria-live="polite" style="margin-top:12px"></div>',
    pulsanti: [
      { testo: 'Annulla', sinistra: true, azione: function (f) { f.chiudi() } },
      { testo: '💾 Salva variazione', classe: 'btn-primario', id: 'vn-salva', azione: salva }
    ]
  })
  var q = fin.q.bind(fin)

  function campoValore() {
    var amb = q('#vn-ambito').value
    var box = q('#vn-valore')
    if (amb === 'categoria') box.innerHTML = '<label for="vn-cat">Categoria</label><select id="vn-cat">' + opzioniCategorie(null, true) + '</select>'
    else if (amb === 'marca') box.innerHTML = '<label for="vn-marca">Marca</label><input id="vn-marca" list="vn-marche" placeholder="es. Siga, Velux"><datalist id="vn-marche"></datalist>' +
      '<div class="aiuto">Vale per i prezzi in cui la marca è scritta così (maiuscole indifferenti).</div>'
    else if (amb === 'articoli') {
      box.innerHTML = '<label>Articoli</label><div id="vn-art-menu"></div><div id="vn-art-lista" class="tags" style="margin-top:8px"></div>'
      menuArticolo(q('#vn-art-menu'), { alCambio: function (id) {
        if (id && articoliScelti.indexOf(id) < 0) articoliScelti.push(id)
        disegnaScelti()
      } })
      disegnaScelti()
    } else box.innerHTML = ''
    if (amb === 'marca') caricaMarche()
    box.querySelectorAll('input, select').forEach(function (i) { i.addEventListener('input', cambiato) })
  }
  function disegnaScelti() {
    var l = q('#vn-art-lista')
    if (!l) return
    l.innerHTML = articoliScelti.map(function (id) {
      var a = articoloDaId(id)
      return '<button type="button" class="tag" data-togli="' + id + '">✕ ' + esc(a ? a.codice : id) + '</button>'
    }).join('') || '<span class="dim">Nessun articolo scelto.</span>'
    l.querySelectorAll('[data-togli]').forEach(function (b) {
      b.addEventListener('click', function () { articoliScelti = articoliScelti.filter(function (x) { return x !== b.dataset.togli }); disegnaScelti(); cambiato() })
    })
    cambiato()
  }
  async function caricaMarche() {
    var c = q('#vn-forn').value, f = c ? fornitoreDaContatto(c) : null
    var dl = q('#vn-marche')
    if (!dl || !f || !f.id) return
    var r = await sb.from('rf_prezzi').select('marca').eq('fornitore_id', f.id).eq('stato', 'attivo').not('marca', 'is', null).limit(2000)
    if (r.error) return
    dl.innerHTML = Array.from(new Set((r.data || []).map(function (x) { return x.marca }))).sort().map(function (m) { return '<option value="' + esc(m) + '">' }).join('')
  }
  function cambiato() { anteprimaFatta = false }
  fin.el.querySelectorAll('#vn-forn, #vn-pct, #vn-dal, #vn-al, #vn-ambito, input[name="vn-tipo"]').forEach(function (i) {
    i.addEventListener('input', cambiato); i.addEventListener('change', cambiato)
  })
  q('#vn-ambito').addEventListener('change', campoValore)
  q('#vn-forn').addEventListener('change', function () { if (q('#vn-ambito').value === 'marca') caricaMarche() })
  campoValore()

  q('#vn-ai').addEventListener('click', async function () {
    var testo = q('#vn-mail').value.trim()
    if (!testo) return html(q('#vn-ai-msg'), banner('warn', 'Incolla prima il testo della mail.'))
    var b = q('#vn-ai'); b.disabled = true
    html(q('#vn-ai-msg'), banner('info', '⏳ L\'AI legge la mail…'))
    try {
      var j = await chiamaWorker({ compito: 'variazione', testo: testo, oggi: RFC.oggiISO(),
        fornitori: RF.fornitori.filter(function (f) { return f.contatto }).map(function (f) { return f.nome }),
        categorie: RF.categorie.map(function (c) { return c.nome }) })
      var d = j.dati
      if (!d.trovata) { html(q('#vn-ai-msg'), banner('warn', 'Nella mail non trovo nessuna variazione di prezzo. ' + esc(d.spiegazione || ''))); return }
      var f = indovinaFornitore(d.fornitore, null)
      if (f) q('#vn-forn').value = f.contatto.id
      q('input[name="vn-tipo"][value="' + d.tipo + '"]').checked = true
      if (d.percentuale != null) q('#vn-pct').value = String(d.percentuale)
      if (RFC.dataISO(d.dal)) q('#vn-dal').value = RFC.dataISO(d.dal)
      q('#vn-al').value = RFC.dataISO(d.al) || ''
      q('#vn-ambito').value = d.ambito
      campoValore()
      if (d.ambito === 'categoria' && d.ambito_valore) {
        var cat = RF.categorie.filter(function (c) { return RFC.perRicerca(c.nome) === RFC.perRicerca(d.ambito_valore) })[0]
        if (cat) q('#vn-cat').value = cat.id
      }
      if (d.ambito === 'marca' && d.ambito_valore) q('#vn-marca').value = d.ambito_valore
      html(q('#vn-ai-msg'), banner('ok', '🤖 ' + esc(d.spiegazione) + (f ? '' : ' — <strong>scegli tu il fornitore</strong>: nella mail non si capisce.') +
        '<br><span class="piccolo">Controlla i campi qui sotto, poi «Anteprima». Costo: ' + RFC.fmt(costoCHF(j.uso.costo_usd), 3) + ' CHF.</span>'))
      cambiato()
    } catch (e) {
      html(q('#vn-ai-msg'), banner('err', esc(spiegaErrore(e))))
    } finally { b.disabled = false }
  })

  function dati() {
    var amb = q('#vn-ambito').value
    var d = {
      tipo: q('input[name="vn-tipo"]:checked').value,
      percentuale: RFC.numero(q('#vn-pct').value),
      ambito: amb, dal: q('#vn-dal').value, al: q('#vn-al').value || null,
      ambito_categoria_id: amb === 'categoria' && q('#vn-cat') ? Number(q('#vn-cat').value) || null : null,
      ambito_marca: amb === 'marca' && q('#vn-marca') ? q('#vn-marca').value.trim() || null : null,
      ambito_articoli: amb === 'articoli' ? articoliScelti.slice() : null
    }
    var errore = ''
    if (!q('#vn-forn').value) errore = 'Scegli il fornitore.'
    else if (d.percentuale == null) errore = 'Scrivi la percentuale.'
    else if (d.tipo === 'sconto' && (d.percentuale < 0 || d.percentuale >= 100)) errore = 'Lo sconto va da 0 a 99.'
    else if (d.percentuale <= -100 || d.percentuale >= 100) errore = 'Percentuale fuori misura.'
    else if (!d.dal) errore = 'Scrivi la data «dal».'
    else if (d.al && d.al < d.dal) errore = 'La data «al» è prima di «dal».'
    else if (amb === 'categoria' && !d.ambito_categoria_id) errore = 'Scegli la categoria.'
    else if (amb === 'marca' && !d.ambito_marca) errore = 'Scrivi la marca.'
    else if (amb === 'articoli' && !d.ambito_articoli.length) errore = 'Scegli almeno un articolo.'
    return { d: d, errore: errore }
  }

  q('#vn-anteprima').addEventListener('click', anteprima)
  async function anteprima() {
    var x = dati()
    if (x.errore) return html(q('#vn-esito'), banner('warn', esc(x.errore)))
    html(q('#vn-esito'), banner('info', '⏳ Calcolo l\'anteprima…'))
    try {
      var fid = await assicuraFornitoreRadar(q('#vn-forn').value)
      var r = await sb.rpc('rf_anteprima_variazione', { p_fornitore_id: fid, p_variazione: x.d })
      if (r.error) throw r.error
      var righe = r.data || []
      var toccati = righe.filter(function (p) { return p.toccato })
      var altri = righe.length - toccati.length
      html(q('#vn-esito'),
        (toccati.length ? banner('info', '👁️ <strong>' + toccati.length + (toccati.length === 1 ? ' prezzo toccato' : ' prezzi toccati') + '</strong>' +
          (altri ? ' · ' + altri + ' prezzi di questo fornitore non cambiano' : '') + '. Calcolo al ' + RFC.fmtData(x.d.dal > RFC.oggiISO() ? x.d.dal : RFC.oggiISO()) + '.')
          : banner('warn', 'Nessun prezzo toccato. Controlla fornitore, ambito e date (i prezzi più recenti del «dal» contengono già la variazione).')) +
        (toccati.length ? '<div class="tabella-wrap"><table class="tab a-schede"><thead><tr><th>Articolo</th><th>Marca</th><th class="num">Vecchio</th><th class="num">Nuovo</th><th class="num">Variazione</th><th>Nota</th></tr></thead><tbody>' +
          toccati.map(function (p) {
            return '<tr><td data-et="Articolo"><span class="mono">' + esc(p.codice) + '</span><br>' + esc(p.descrizione) + '</td>' +
              '<td data-et="Marca">' + esc(p.marca || '–') + '</td>' +
              '<td data-et="Vecchio" class="num">' + prezzoTesto(p.netto_prima, p.valuta) + '</td>' +
              '<td data-et="Nuovo" class="num"><strong>' + prezzoTesto(p.netto_dopo, p.valuta) + '</strong></td>' +
              '<td data-et="Variazione" class="num">' + RFC.fmtPct(RFC.variazionePct(Number(p.netto_prima), Number(p.netto_dopo))) + '</td>' +
              '<td data-et="Nota">' + (p.nota ? tag('warn', '⚠️', p.nota) : '') + '</td></tr>'
          }).join('') + '</tbody></table></div>' : ''))
      anteprimaFatta = true
    } catch (e) {
      html(q('#vn-esito'), banner('err', esc('Anteprima non riuscita: ' + spiegaErrore(e))))
    }
  }

  async function salva(f, b) {
    var x = dati()
    if (x.errore) return html(q('#vn-esito'), banner('warn', esc(x.errore)))
    if (!anteprimaFatta) { await anteprima(); if (!anteprimaFatta) return; return toast('Controlla l\'anteprima, poi premi di nuovo «Salva variazione».') }
    b.disabled = true
    try {
      if (!(await sessioneValida())) return
      var fid = await assicuraFornitoreRadar(q('#vn-forn').value)
      var testo = q('#vn-mail').value.trim()
      var docId = null
      if (testo) {
        var d = await sb.rpc('rf_salva_import', { p: { documento: { fornitore_id: fid, tipo: 'mail_variazione', data_documento: RFC.oggiISO(), testo: testo }, prezzi: [] } })
        if (d.error) throw d.error
        docId = d.data.documento_id
      }
      var ins = await sb.from('rf_variazioni').insert(Object.assign({ fornitore_id: fid, documento_id: docId, testo: testo || null }, x.d))
      if (ins.error) throw ins.error
      f.chiudi()
      await caricaArticoli(true)
      toast('💾 Variazione salvata')
      disegnaVariazioni()
    } catch (e) {
      b.disabled = false
      html(q('#vn-esito'), banner('err', esc('Non salvata: ' + spiegaErrore(e))))
    }
  }
}
