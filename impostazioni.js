// CT Radar Fornitori — impostazioni.js
// Solo il titolare (il database lo controlla con app_e_titolare()).
// Cambio EUR→CHF, soglie, testo della lettera, indirizzo del Worker,
// unità di misura, categorie, spazio dello Storage, costo delle letture AI,
// elementi archiviati.

'use strict'

async function disegnaImpostazioni() {
  if (!RF.titolare) { vai('cerca'); return }
  if (!(await caricaBase(true)) || !(await caricaArticoli()) || !(await caricaFornitori())) return
  var i = RF.imp
  var v = el('vista-impostazioni')
  v.innerHTML = '<h1>⚙️ Impostazioni</h1>' +
    '<div class="scheda"><h2>💱 Cambio e soglie</h2><div class="griglia">' +
      '<div><label for="im-cambio">Cambio EUR → CHF</label><input id="im-cambio" inputmode="decimal" value="' + esc(i.cambio_eur_chf) + '"></div>' +
      '<div><label for="im-cambio-data">Data del cambio</label><input id="im-cambio-data" type="date" value="' + esc(dataInput(i.cambio_data)) + '"></div>' +
      '<div><label for="im-usd">Cambio USD → CHF (solo costo AI)</label><input id="im-usd" inputmode="decimal" value="' + esc(i.cambio_usd_chf) + '"></div>' +
      '<div><label for="im-mesi">Prezzo vecchio dopo (mesi)</label><input id="im-mesi" inputmode="numeric" value="' + esc(i.soglia_mesi) + '"></div>' +
      '<div><label for="im-soglia">Variazione da segnalare (%)</label><input id="im-soglia" inputmode="decimal" value="' + esc(i.soglia_variazione_pct) + '"></div>' +
      '<div><label for="im-luogo">Trasporto franco (lettera)</label><input id="im-luogo" value="' + esc(i.luogo_franco) + '"></div>' +
    '</div>' +
    '<label for="im-lettera">Testo della lettera di richiesta d\'offerta</label>' +
    '<textarea id="im-lettera" rows="14">' + esc(i.testo_lettera) + '</textarea>' +
    '<div class="aiuto">Segnaposto: [riferimento] · [luogo] · [data] (il termine).</div>' +
    '<h2 style="margin-top:20px">🤖 Lettura con l\'AI</h2>' +
    '<label for="im-worker">Indirizzo del Worker ct-lettura-offerte</label>' +
    '<input id="im-worker" placeholder="https://ct-lettura-offerte.….workers.dev" value="' + esc(i.worker_url || '') + '">' +
    '<div class="gruppo-btn" style="margin-top:8px"><button type="button" class="btn" id="im-prova">🔌 Prova il Worker</button></div>' +
    '<div id="im-prova-esito" aria-live="polite" style="margin-top:8px"></div>' +
    '<p class="aiuto">Modificato: ' + esc(RFC.timbro(i.modificato_iniziali, i.modificato_il)) + '</p>' +
    '<div id="im-err"></div>' +
    '<div class="gruppo-btn"><div class="spazio"></div><button type="button" class="btn btn-primario" id="im-salva">💾 Salva impostazioni</button></div></div>' +

    '<div class="scheda"><h2>📏 Unità di misura</h2><div id="im-unita"></div>' +
      '<div class="griglia"><div><label for="im-u-sigla">Sigla nuova</label><input id="im-u-sigla"></div><div><label for="im-u-nome">Nome</label><input id="im-u-nome"></div></div>' +
      '<div class="gruppo-btn" style="margin-top:8px"><button type="button" class="btn" id="im-u-agg">＋ Aggiungi unità</button></div></div>' +

    '<div class="scheda"><h2>🗂️ Categorie</h2><div id="im-cat"></div>' +
      '<div class="griglia"><div><label for="im-c-nome">Categoria nuova</label><input id="im-c-nome"></div>' +
        '<div><label for="im-c-gruppo">Gruppo</label><select id="im-c-gruppo"><option>Materiali</option><option>Servizi</option></select></div></div>' +
      '<div class="gruppo-btn" style="margin-top:8px"><button type="button" class="btn" id="im-c-agg">＋ Aggiungi categoria</button></div></div>' +

    '<div class="scheda"><h2>💾 Spazio usato (piano gratuito: 1 GB)</h2><div id="im-spazio" class="caricamento">⏳</div></div>' +
    '<div class="scheda"><h2>🤖 Costo delle letture AI</h2><div id="im-costi" class="caricamento">⏳</div></div>' +
    '<div class="scheda"><h2>📦 Archiviati</h2><div id="im-arch"></div></div>'

  el('im-salva').addEventListener('click', salvaImpostazioni)
  el('im-prova').addEventListener('click', async function () {
    var url = el('im-worker').value.trim()
    if (!url) return html('im-prova-esito', banner('warn', 'Scrivi l\'indirizzo del Worker.'))
    var vecchio = RF.imp.worker_url
    RF.imp.worker_url = url
    html('im-prova-esito', banner('info', '⏳ Provo…'))
    try {
      var j = await chiamaWorker({ compito: 'prova' })
      html('im-prova-esito', banner('ok', 'Il Worker risponde (versione ' + esc(j.versione_worker) + ', modello ' + esc(j.modello) + '). Ricordati di salvare.'))
    } catch (e) {
      html('im-prova-esito', banner('err', esc(e.message)))
    } finally { RF.imp.worker_url = vecchio }
  })
  disegnaUnitaCat()
  el('im-u-agg').addEventListener('click', async function () {
    var s = el('im-u-sigla').value.trim(), n = el('im-u-nome').value.trim()
    if (!s || !n) return toast('Scrivi sigla e nome.')
    var r = await sb.from('rf_unita').insert({ sigla: s, nome: n, ordine: (RF.unita.length + 1) * 10 })
    if (r.error) return avvisa('err', esc('Non aggiunta: ' + spiegaErrore(r.error)))
    el('im-u-sigla').value = ''; el('im-u-nome').value = ''
    await caricaBase(true); disegnaUnitaCat(); toast('＋ Unità aggiunta')
  })
  el('im-c-agg').addEventListener('click', async function () {
    var n = el('im-c-nome').value.trim()
    if (!n) return toast('Scrivi il nome della categoria.')
    var r = await sb.from('rf_categorie').insert({ nome: n, gruppo: el('im-c-gruppo').value, ordine: (RF.categorie.length + 1) * 10 })
    if (r.error) return avvisa('err', esc('Non aggiunta: ' + spiegaErrore(r.error)))
    el('im-c-nome').value = ''
    await caricaBase(true); disegnaUnitaCat(); toast('＋ Categoria aggiunta')
  })
  spazio(); costi(); archiviati()
}

async function salvaImpostazioni() {
  var d = {
    cambio_eur_chf: RFC.numero(el('im-cambio').value), cambio_data: el('im-cambio-data').value,
    cambio_usd_chf: RFC.numero(el('im-usd').value), soglia_mesi: parseInt(el('im-mesi').value, 10),
    soglia_variazione_pct: RFC.numero(el('im-soglia').value), luogo_franco: el('im-luogo').value.trim(),
    testo_lettera: el('im-lettera').value, worker_url: el('im-worker').value.trim() || null
  }
  if (!(d.cambio_eur_chf > 0) || !(d.cambio_usd_chf > 0)) return html('im-err', banner('err', 'Il cambio deve essere un numero più grande di 0.'))
  if (!d.cambio_data) return html('im-err', banner('err', 'Scrivi la data del cambio.'))
  if (!(d.soglia_mesi >= 1 && d.soglia_mesi <= 60)) return html('im-err', banner('err', 'Mesi: da 1 a 60.'))
  if (!(d.soglia_variazione_pct > 0)) return html('im-err', banner('err', 'La soglia di variazione deve essere più di 0.'))
  if (d.worker_url && !/^https:\/\//.test(d.worker_url)) return html('im-err', banner('err', 'L\'indirizzo del Worker deve iniziare con https://'))
  if (!(await sessioneValida())) return
  var r = await sb.from('rf_impostazioni').update(d).eq('id', 1).select('id')
  if (r.error) return html('im-err', banner('err', esc('Non salvate: ' + spiegaErrore(r.error))))
  if (!r.data || !r.data.length) return html('im-err', banner('err', 'Non salvate: solo il titolare può cambiare le impostazioni.'))
  await caricaBase(true); await caricaArticoli(true)
  toast('💾 Impostazioni salvate')
  disegnaImpostazioni()
}

function disegnaUnitaCat() {
  html('im-unita', '<div class="tabella-wrap"><table class="tab a-schede"><thead><tr><th>Sigla</th><th>Nome</th><th>Stato</th><th></th></tr></thead><tbody>' +
    RF.unita.map(function (u) {
      return '<tr><td data-et="Sigla"><strong>' + esc(u.sigla) + '</strong></td>' +
        '<td data-et="Nome"><input data-unome="' + esc(u.sigla) + '" value="' + esc(u.nome) + '" aria-label="Nome di ' + esc(u.sigla) + '"></td>' +
        '<td data-et="Stato">' + (u.archiviata ? tag('', '📦', 'Archiviata') : tag('ok', '✔️', 'In uso')) + '</td>' +
        '<td><button type="button" class="btn btn-piccolo" data-uarch="' + esc(u.sigla) + '">' + (u.archiviata ? '↩️ Ripristina' : '📦 Archivia') + '</button></td></tr>'
    }).join('') + '</tbody></table></div>')
  html('im-cat', '<div class="tabella-wrap"><table class="tab a-schede"><thead><tr><th>Nome</th><th>Gruppo</th><th>Ordine</th><th>Stato</th><th></th></tr></thead><tbody>' +
    RF.categorie.map(function (c) {
      return '<tr><td data-et="Nome"><input data-cnome="' + c.id + '" value="' + esc(c.nome) + '" aria-label="Nome categoria"></td>' +
        '<td data-et="Gruppo"><select data-cgruppo="' + c.id + '" aria-label="Gruppo"><option' + (c.gruppo === 'Materiali' ? ' selected' : '') + '>Materiali</option><option' + (c.gruppo === 'Servizi' ? ' selected' : '') + '>Servizi</option></select></td>' +
        '<td data-et="Ordine"><input data-cordine="' + c.id + '" value="' + c.ordine + '" inputmode="numeric" style="max-width:90px" aria-label="Ordine"></td>' +
        '<td data-et="Stato">' + (c.archiviata ? tag('', '📦', 'Archiviata') : tag('ok', '✔️', 'In uso')) + '</td>' +
        '<td><button type="button" class="btn btn-piccolo" data-carch="' + c.id + '">' + (c.archiviata ? '↩️ Ripristina' : '📦 Archivia') + '</button></td></tr>'
    }).join('') + '</tbody></table></div>')
  async function agg(tab, chiave, valore, dati) {
    var r = await sb.from(tab).update(dati).eq(chiave, valore).select(chiave)
    if (r.error || !r.data || !r.data.length) return avvisa('err', esc('Non salvato: ' + spiegaErrore(r.error || 'nessuna riga')))
    await caricaBase(true); disegnaUnitaCat(); toast('💾 Salvato')
  }
  document.querySelectorAll('[data-unome]').forEach(function (i) { i.addEventListener('change', function () { agg('rf_unita', 'sigla', i.dataset.unome, { nome: i.value.trim() }) }) })
  document.querySelectorAll('[data-uarch]').forEach(function (b) { b.addEventListener('click', function () {
    var u = RF.unita.filter(function (x) { return x.sigla === b.dataset.uarch })[0]; agg('rf_unita', 'sigla', u.sigla, { archiviata: !u.archiviata }) }) })
  document.querySelectorAll('[data-cnome]').forEach(function (i) { i.addEventListener('change', function () { agg('rf_categorie', 'id', i.dataset.cnome, { nome: i.value.trim() }) }) })
  document.querySelectorAll('[data-cgruppo]').forEach(function (i) { i.addEventListener('change', function () { agg('rf_categorie', 'id', i.dataset.cgruppo, { gruppo: i.value }) }) })
  document.querySelectorAll('[data-cordine]').forEach(function (i) { i.addEventListener('change', function () { agg('rf_categorie', 'id', i.dataset.cordine, { ordine: parseInt(i.value, 10) || 0 }) }) })
  document.querySelectorAll('[data-carch]').forEach(function (b) { b.addEventListener('click', function () {
    var c = categoriaDaId(Number(b.dataset.carch)); agg('rf_categorie', 'id', c.id, { archiviata: !c.archiviata }) }) })
}

async function spazio() {
  var r = await sb.rpc('rf_spazio_storage')
  if (r.error) return html('im-spazio', banner('err', esc(spiegaErrore(r.error))))
  var righe = r.data || []
  var tot = righe.reduce(function (s, x) { return s + Number(x.byte) }, 0)
  var mb = function (b) { return RFC.fmt(Number(b) / 1048576, 1) + ' MB' }
  var pct = Math.min(100, tot / (1024 * 1048576) * 100)
  html('im-spazio', '<p><strong>' + mb(tot) + '</strong> usati su 1 GB (' + RFC.fmt(pct, 1) + '%)</p>' +
    '<div class="barra-spazio" role="img" aria-label="' + RFC.fmt(pct, 1) + '% usato"><div style="width:' + pct + '%"></div></div>' +
    (pct > 80 ? banner('warn', 'Lo spazio sta finendo: oltre 1 GB serve il piano a pagamento di Supabase.') : '') +
    '<div class="tabella-wrap" style="margin-top:10px"><table class="tab"><thead><tr><th>Bucket</th><th class="num">File</th><th class="num">Spazio</th></tr></thead><tbody>' +
    righe.map(function (x) {
      return '<tr><td>' + esc(x.bucket) + (/^rf-/.test(x.bucket) ? ' ' + tag('info', '📡', 'Radar') : '') + '</td><td class="num">' + x.file + '</td><td class="num">' + mb(x.byte) + '</td></tr>'
    }).join('') + '</tbody></table></div>')
  el('im-spazio').classList.remove('caricamento')
}

async function costi() {
  var da = new Date(Date.now() - 90 * 86400000).toISOString()
  var r = await sb.from('rf_letture_ai').select('compito,costo_usd,creato_il').gte('creato_il', da).limit(10000)
  if (r.error) return html('im-costi', banner('err', esc(spiegaErrore(r.error))))
  var mesi = {}
  ;(r.data || []).forEach(function (x) {
    var m = String(x.creato_il).slice(0, 7)
    mesi[m] = mesi[m] || { n: 0, usd: 0 }
    mesi[m].n++; mesi[m].usd += Number(x.costo_usd) || 0
  })
  var chiavi = Object.keys(mesi).sort().reverse()
  html('im-costi', chiavi.length ? '<table class="tab"><thead><tr><th>Mese</th><th class="num">Letture</th><th class="num">Costo</th></tr></thead><tbody>' +
    chiavi.map(function (m) {
      return '<tr><td>' + m.slice(5) + '.' + m.slice(0, 4) + '</td><td class="num">' + mesi[m].n + '</td><td class="num">' +
        RFC.fmt(costoCHF(mesi[m].usd)) + ' CHF (' + RFC.fmt(mesi[m].usd) + ' $)</td></tr>'
    }).join('') + '</tbody></table><p class="aiuto">Il Worker si ferma da solo oltre 300 letture o 15 $ al giorno.</p>' : '<div class="dim">Nessuna lettura negli ultimi 3 mesi.</div>')
  el('im-costi').classList.remove('caricamento')
}

function archiviati() {
  var art = RF.articoli.filter(function (a) { return a.archiviato })
  var forn = RF.fornitori.filter(function (f) { return f.radar && f.radar.archiviato })
  html('im-arch', (art.length || forn.length)
    ? '<p>Articoli: ' + (art.map(function (a) { return '<a href="#articolo=' + a.id + '">' + esc(a.codice) + '</a>' }).join(' · ') || '–') + '</p>' +
      '<p>Fornitori: ' + (forn.map(function (f) { return '<a href="#fornitore=r:' + f.id + '">' + esc(f.nome) + '</a>' }).join(' · ') || '–') + '</p>' +
      '<p class="aiuto">Apri la scheda e premi «↩️ Ripristina».</p>'
    : '<div class="dim">Niente di archiviato.</div>')
}
