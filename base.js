// CT Radar Fornitori — base.js
// Configurazione, login, ruolo, caricamento dei dati, attrezzi comuni
// (finestre, avvisi, menu con ricerca, Worker, foto, file).
//
// Stack: HTML/JS vanilla + Supabase JS v2. Stesso progetto Supabase delle
// altre app. I fornitori vengono dalla Rubrica (tm_contatti) in SOLA LETTURA.

'use strict'

// ─── Configurazione ──────────────────────────────────────────────────────────
var SUPABASE_URL = 'https://wgidgbauhivdctdxfjnk.supabase.co'
var SUPABASE_KEY = 'sb_publishable_Ke7MTQGHPYVXvKInfOrUQQ_Ys6qKJvD'
var URL_RUBRICA  = 'https://carpenteria-ticinese.github.io/CT-rubrica/'
var BUCKET_FOTO  = 'rf-foto'
var BUCKET_DOC   = 'rf-documenti'
var LIMITE_FILE_MB = 10
var APP_VERSIONE = 1

var LIBRERIE = {
  xlsx:  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  pdf:   'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfw:  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js'
}

var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
})

// ─── Stato ───────────────────────────────────────────────────────────────────
var RF = {
  utente: null, ruolo: null, titolare: false,
  categorie: [], unita: [], imp: null,
  articoli: [],            // righe di rf_v_articoli
  fornitori: [],           // fornitori della Rubrica + dati Radar (vedi caricaFornitori)
  ditte: [],               // «Ditte da valutare»: NON fornitori, senza contatto in Rubrica
  caricato: { base: false, articoli: false, fornitori: false },
  vista: 'cerca'
}

// ─── Attrezzi per la pagina ──────────────────────────────────────────────────
function el(id) { return document.getElementById(id) }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}
function html(id, testo) { var e = typeof id === 'string' ? el(id) : id; if (e) e.innerHTML = testo }
function banner(tipo, testo) {
  var icone = { ok: '✅', warn: '⚠️', err: '❌', info: 'ℹ️' }
  return '<div class="banner ' + tipo + '" role="' + (tipo === 'err' ? 'alert' : 'status') + '">' +
         (icone[tipo] || '') + ' ' + testo + '</div>'
}
function avvisa(tipo, testo) {
  html('banner-globale', testo ? banner(tipo, testo) : '')
  if (testo) window.scrollTo({ top: 0, behavior: 'smooth' })
}
var _toastTimer = null
function toast(testo) {
  var t = el('toast')
  t.textContent = testo
  t.hidden = false
  clearTimeout(_toastTimer)
  _toastTimer = setTimeout(function () { t.hidden = true }, 3500)
}
// Etichetta di avviso: SEMPRE icona + testo
function tag(tipo, icona, testo) {
  return '<span class="tag ' + (tipo || '') + '">' + icona + ' ' + esc(testo) + '</span>'
}
function spiegaErrore(e) {
  var m = String((e && (e.message || e.error_description || e.details)) || e || 'errore sconosciuto')
  if (/JWT|jwt expired|invalid claim/i.test(m)) return 'la sessione è scaduta: esci e rientra.'
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'non riesco a raggiungere il server: controlla la connessione.'
  if (/row-level security|permission denied|insufficient_privilege/i.test(m)) return 'non hai il permesso per questa operazione.'
  if (/duplicate key/i.test(m)) return 'esiste già (valore doppio).'
  return m
}
function oraISO() { return new Date().toISOString() }
// Valore per <input type="date">: sempre AAAA-MM-GG
function dataInput(x) {
  if (!x) return ''
  if (x instanceof Date) return isNaN(x) ? '' : x.toISOString().slice(0, 10)
  return String(x).slice(0, 10)
}

// ─── Sessione: la prima cosa di ogni caricamento ─────────────────────────────
// Con le RLS un accesso negato NON dà errore: restituisce zero righe. Quindi
// prima di caricare qualunque cosa si controlla che la sessione esista; se non
// c'è si mostra «Accedi» e la cache NON viene segnata come caricata.
async function sessioneValida() {
  var s = null
  try { s = (await sb.auth.getSession()).data.session } catch (_) { s = null }
  if (!s) {
    RF.caricato = { base: false, articoli: false, fornitori: false }
    mostraLogin('Sessione scaduta: accedi di nuovo.')
    return null
  }
  return s
}

function mostraPagina(nome) {
  ['login', 'negato', 'app'].forEach(function (p) { el('pagina-' + p).hidden = (p !== nome) })
}
function mostraLogin(msg) {
  mostraPagina('login')
  html('login-banner', msg ? banner('info', esc(msg)) : '')
}

async function login(ev) {
  ev.preventDefault()
  var btn = el('login-btn')
  btn.disabled = true; btn.textContent = 'Accesso…'
  html('login-banner', '')
  try {
    var r = await sb.auth.signInWithPassword({ email: el('login-email').value.trim(), password: el('login-password').value })
    if (r.error) throw r.error
    el('login-password').value = ''
    await entra()
  } catch (e) {
    var m = String(e && e.message || '')
    html('login-banner', banner('err', /invalid login|invalid_credentials/i.test(m)
      ? 'Email o password non corretti.' : esc('Accesso non riuscito: ' + spiegaErrore(e))))
  } finally {
    btn.disabled = false; btn.textContent = 'Accedi'
  }
}

async function esci() {
  try { await sb.auth.signOut() } catch (_) { /* si esce comunque */ }
  RF.utente = null; RF.ruolo = null; RF.titolare = false
  RF.articoli = []; RF.fornitori = []
  RF.caricato = { base: false, articoli: false, fornitori: false }
  mostraLogin('')
}

// Dopo il login: ruolo, poi dati.
async function entra() {
  var s = await sessioneValida()
  if (!s) return
  RF.utente = s.user
  var r = await sb.rpc('app_ruolo')
  RF.ruolo = r.error ? null : r.data
  if (RF.ruolo !== 'titolare' && RF.ruolo !== 'responsabile') {
    mostraPagina('negato')
    html('negato-dettaglio', esc('Utente: ' + (s.user.email || '') +
      (RF.ruolo ? ' · ruolo: ' + RF.ruolo : ' · ruolo non trovato in profili')))
    return
  }
  RF.titolare = RF.ruolo === 'titolare'
  el('menu-impostazioni').hidden = !RF.titolare
  el('topbar-utente').textContent = (s.user.email || '') + ' · ' + RF.ruolo
  mostraPagina('app')
  html('vista-cerca', '<div class="caricamento">⏳ Carico il Radar…</div>')
  try {
    await caricaBase()
    await Promise.all([caricaArticoli(), caricaFornitori()])
  } catch (e) {
    avvisa('err', esc('Non riesco a caricare i dati: ' + spiegaErrore(e)))
  }
  vaiDaIndirizzo()
}

// ─── Caricamento dei dati ────────────────────────────────────────────────────
async function caricaBase(forza) {
  if (RF.caricato.base && !forza) return true
  if (!(await sessioneValida())) return false
  var r = await Promise.all([
    sb.from('rf_categorie').select('*').order('ordine'),
    sb.from('rf_unita').select('*').order('ordine'),
    sb.from('rf_impostazioni').select('*').eq('id', 1).maybeSingle()
  ])
  r.forEach(function (x) { if (x.error) throw x.error })
  RF.categorie = r[0].data || []
  RF.unita = r[1].data || []
  RF.imp = r[2].data
  if (!RF.categorie.length || !RF.imp) {
    throw new Error('le tabelle del Radar sono vuote: sono stati lanciati i file SQL 03 e 04?')
  }
  RF.caricato.base = true
  return true
}

async function caricaArticoli(forza) {
  if (RF.caricato.articoli && !forza) return true
  if (!(await sessioneValida())) return false
  var tutti = [], da = 0, PAGINA = 1000
  for (;;) {
    var r = await sb.from('rf_v_articoli').select('*').order('codice').range(da, da + PAGINA - 1)
    if (r.error) throw r.error
    tutti = tutti.concat(r.data || [])
    if (!r.data || r.data.length < PAGINA) break
    da += PAGINA
  }
  tutti.forEach(function (a) {
    a._cerca = RFC.perRicerca([a.codice, a.descrizione, a.categoria, a.preferito_nome, a.note].join(' '))
  })
  RF.articoli = tutti
  RF.caricato.articoli = true
  return true
}

// Un contatto è fornitore se: categorie contiene 'fornitori' OPPURE
// e_fornitore = true OPPURE categoria = 'fornitore'.
function eFornitore(k) {
  return (Array.isArray(k.categorie) && k.categorie.indexOf('fornitori') >= 0) ||
         k.e_fornitore === true || k.categoria === 'fornitore'
}
function nomeContatto(k) {
  if (!k) return ''
  return (k.ragione_sociale && k.ragione_sociale.trim()) ||
         [k.nome, k.cognome].filter(Boolean).join(' ').trim() || '(senza nome)'
}

async function caricaFornitori(forza) {
  if (RF.caricato.fornitori && !forza) return true
  if (!(await sessioneValida())) return false
  var r = await Promise.all([
    sb.from('tm_contatti').select('*'),           // Rubrica: SOLA LETTURA
    sb.from('rf_v_fornitori').select('*')
  ])
  if (r[0].error) throw r[0].error
  if (r[1].error) throw r[1].error
  // Le «Ditte da valutare» (fiere, ricerca INSULA, vecchio Radar) NON sono
  // fornitori: stanno in RF.ditte e non compaiono in elenchi, import,
  // confronti e richieste. Le ditte già unite a un fornitore non si mostrano.
  var radar = {}, ditte = []
  ;(r[1].data || []).forEach(function (f) {
    if (f.unita_in) return
    if (f.da_valutare || !f.contatto_id) {
      ditte.push({ contatto: null, radar: f, nome: f.nome_ditta || f.nome, id: f.id, ditta: true,
                   _cerca: RFC.perRicerca([f.nome_ditta, f.luogo, f.origine, (f.specialita || []).join(' ')].join(' ')) })
      return
    }
    radar[f.contatto_id] = f
  })
  ditte.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'it') })
  RF.ditte = ditte
  var out = []
  ;(r[0].data || []).forEach(function (k) {
    var f = radar[k.id] || null
    if (!eFornitore(k) && !f) return
    out.push({ contatto: k, radar: f, nome: nomeContatto(k), id: f ? f.id : null,
               _cerca: RFC.perRicerca(nomeContatto(k) + ' ' + (k.citta || '') + ' ' + ((f && f.attivita) || []).join(' ')),
               _norm: RFC.nomeNorm(nomeContatto(k)) })
    delete radar[k.id]
  })
  // schede Radar il cui contatto non si legge (es. utente non collegato all'azienda)
  Object.keys(radar).forEach(function (cid) {
    var f = radar[cid]
    out.push({ contatto: null, radar: f, nome: f.nome, id: f.id, _cerca: RFC.perRicerca(f.nome), _norm: RFC.nomeNorm(f.nome) })
  })
  out.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'it') })
  RF.fornitori = out
  RF.rubricaVuota = !(r[0].data || []).length
  RF.caricato.fornitori = true
  return true
}

function fornitoreDaId(idRadar) {
  for (var i = 0; i < RF.fornitori.length; i++) if (RF.fornitori[i].id === idRadar) return RF.fornitori[i]
  return null
}
function dittaDaId(idRadar) {
  for (var i = 0; i < (RF.ditte || []).length; i++) if (RF.ditte[i].id === idRadar) return RF.ditte[i]
  return null
}
function fornitoreDaContatto(contattoId) {
  for (var i = 0; i < RF.fornitori.length; i++) {
    if (RF.fornitori[i].contatto && RF.fornitori[i].contatto.id === contattoId) return RF.fornitori[i]
  }
  return null
}
function articoloDaId(id) {
  for (var i = 0; i < RF.articoli.length; i++) if (RF.articoli[i].id === id) return RF.articoli[i]
  return null
}
function articoloDaCodice(c) {
  var t = String(c || '').toLowerCase()
  for (var i = 0; i < RF.articoli.length; i++) if (RF.articoli[i].codice.toLowerCase() === t) return RF.articoli[i]
  return null
}
function categoriaDaId(id) {
  for (var i = 0; i < RF.categorie.length; i++) if (RF.categorie[i].id === id) return RF.categorie[i]
  return null
}

// La scheda Radar del fornitore: se non c'è ancora, si crea (solo dati Radar;
// il contatto in Rubrica non si tocca).
async function assicuraFornitoreRadar(contattoId) {
  var f = fornitoreDaContatto(contattoId)
  if (f && f.id) return f.id
  var k = f && f.contatto
  var paese = k && k.paese ? String(k.paese).toUpperCase() : 'CH'
  var r = await sb.from('rf_fornitori').insert({
    contatto_id: contattoId, paese: paese, valuta: (paese === 'CH' || paese === 'LI') ? 'CHF' : 'EUR'
  }).select('id').single()
  if (r.error) {
    // creata nel frattempo da qualcun altro: si rilegge
    if (!/duplicate/i.test(r.error.message || '')) throw r.error
  }
  await caricaFornitori(true)
  var g = fornitoreDaContatto(contattoId)
  if (!g || !g.id) throw new Error('scheda Radar del fornitore non creata')
  return g.id
}

// ─── Navigazione (#cerca, #importa, #articolo=ID, #fornitore=ID …) ───────────
var VISTE = ['cerca', 'articolo', 'importa', 'variazioni', 'fornitori', 'fornitore', 'richieste', 'impostazioni']
var MENU_DI = { articolo: 'cerca', fornitore: 'fornitori' }

function vai(vista, param) {
  var h = '#' + vista + (param ? '=' + encodeURIComponent(param) : '')
  if (location.hash === h) vaiDaIndirizzo()
  else location.hash = h
}
function vaiDaIndirizzo() {
  if (el('pagina-app').hidden) return
  var m = /^#([a-z]+)(?:=(.*))?$/.exec(location.hash || '')
  var vista = m && VISTE.indexOf(m[1]) >= 0 ? m[1] : 'cerca'
  var param = m && m[2] ? decodeURIComponent(m[2]) : null
  if (vista === 'impostazioni' && !RF.titolare) vista = 'cerca'
  mostraVista(vista, param)
}
function mostraVista(vista, param) {
  RF.vista = vista
  VISTE.forEach(function (v) { el('vista-' + v).hidden = (v !== vista) })
  var menu = MENU_DI[vista] || vista
  document.querySelectorAll('#menu button').forEach(function (b) {
    if (b.dataset.vista === menu) b.setAttribute('aria-current', 'page')
    else b.removeAttribute('aria-current')
  })
  avvisa('', '')
  var f = {
    cerca: disegnaCerca, articolo: disegnaArticolo, importa: disegnaImporta,
    variazioni: disegnaVariazioni, fornitori: disegnaFornitori, fornitore: disegnaFornitore,
    richieste: disegnaRichieste, impostazioni: disegnaImpostazioni
  }[vista]
  Promise.resolve(f(param)).catch(function (e) {
    console.error(e)
    avvisa('err', esc('Errore: ' + spiegaErrore(e)))
  })
  window.scrollTo(0, 0)
}

// ─── Finestre (dialog) ───────────────────────────────────────────────────────
// pulsanti: [{ testo, classe, azione(fin) , sinistra:true }]
// L'azione principale va per ultima: finisce in basso a destra.
function apriFinestra(o) {
  var sfondo = document.createElement('div')
  sfondo.className = 'finestra-sfondo'
  var id = 'fin-' + Math.random().toString(36).slice(2)
  sfondo.innerHTML =
    '<div class="finestra' + (o.larga ? ' larga' : '') + '" role="dialog" aria-modal="true" aria-labelledby="' + id + '">' +
      '<header><h2 id="' + id + '">' + esc(o.titolo || '') + '</h2>' +
        '<button type="button" class="btn btn-piccolo" data-chiudi>✕ Chiudi</button></header>' +
      '<div class="contenuto">' + (o.html || '') + '</div>' +
      '<footer></footer>' +
    '</div>'
  var fin = {
    el: sfondo,
    contenuto: sfondo.querySelector('.contenuto'),
    chiudi: function () {
      sfondo.remove()
      document.removeEventListener('keydown', tasti)
      if (o.allaChiusura) o.allaChiusura()
    },
    q: function (sel) { return sfondo.querySelector(sel) }
  }
  var piede = sfondo.querySelector('footer')
  var pulsanti = o.pulsanti || [{ testo: 'Chiudi', azione: function (f) { f.chiudi() } }]
  var sinistra = pulsanti.filter(function (p) { return p.sinistra })
  var destra = pulsanti.filter(function (p) { return !p.sinistra })
  sinistra.forEach(function (p) { piede.appendChild(bottone(p)) })
  var sp = document.createElement('div'); sp.className = 'spazio'; piede.appendChild(sp)
  destra.forEach(function (p) { piede.appendChild(bottone(p)) })
  function bottone(p) {
    var b = document.createElement('button')
    b.type = 'button'; b.className = 'btn ' + (p.classe || ''); b.textContent = p.testo
    if (p.id) b.id = p.id
    b.addEventListener('click', function () { p.azione(fin, b) })
    return b
  }
  function tasti(ev) { if (ev.key === 'Escape') fin.chiudi() }
  document.addEventListener('keydown', tasti)
  sfondo.querySelector('[data-chiudi]').addEventListener('click', fin.chiudi)
  el('finestre').appendChild(sfondo)
  var primo = sfondo.querySelector('.contenuto input, .contenuto select, .contenuto textarea, footer .btn-primario')
  if (primo) setTimeout(function () { primo.focus() }, 30)
  return fin
}

function conferma(titolo, testo, testoSi, pericolo) {
  return new Promise(function (ok) {
    apriFinestra({
      titolo: titolo, html: '<p>' + testo + '</p>',
      pulsanti: [
        { testo: 'Annulla', sinistra: true, azione: function (f) { f.chiudi(); ok(false) } },
        { testo: testoSi || 'Sì', classe: pericolo ? 'btn-pericolo' : 'btn-primario', azione: function (f) { f.chiudi(); ok(true) } }
      ]
    })
  })
}

// ─── Menu con ricerca per scegliere un articolo ──────────────────────────────
// contenitore: elemento dove disegnarlo. o.valore = id iniziale; o.alCambio(id)
function menuArticolo(contenitore, o) {
  var scelto = o.valore ? articoloDaId(o.valore) : null
  contenitore.classList.add('cerca-art')
  contenitore.innerHTML =
    '<input type="search" autocomplete="off" aria-label="' + esc(o.etichetta || 'Mio articolo') + '" placeholder="Cerca articolo (codice o descrizione)…" />' +
    '<div class="lista" hidden role="listbox"></div>'
  var inp = contenitore.querySelector('input'), lista = contenitore.querySelector('.lista')
  function scrivi() { inp.value = scelto ? scelto.codice + ' — ' + scelto.descrizione : '' }
  scrivi()
  function mostra() {
    var t = inp.value
    if (scelto && t === scelto.codice + ' — ' + scelto.descrizione) t = ''
    var trovati = RF.articoli.filter(function (a) { return !a.archiviato && (!t || RFC.corrisponde(a._cerca, t)) }).slice(0, 40)
    lista.innerHTML = trovati.map(function (a) {
      return '<button type="button" role="option" data-id="' + a.id + '"><span class="mono">' + esc(a.codice) + '</span><br>' +
             esc(a.descrizione) + ' <span class="dim">· ' + esc(a.unita) + '</span></button>'
    }).join('') || '<div class="caricamento">Nessun articolo trovato.</div>'
    lista.hidden = false
  }
  inp.addEventListener('focus', function () { inp.select(); mostra() })
  inp.addEventListener('input', mostra)
  inp.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); var b = lista.querySelector('button'); if (b) b.click() }
    if (ev.key === 'Escape') { lista.hidden = true; scrivi() }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); var p = lista.querySelector('button'); if (p) p.focus() }
  })
  lista.addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowDown' && document.activeElement.nextElementSibling) { ev.preventDefault(); document.activeElement.nextElementSibling.focus() }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); var pr = document.activeElement.previousElementSibling; (pr || inp).focus() }
  })
  lista.addEventListener('mousedown', function (ev) { ev.preventDefault() })
  lista.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-id]')
    if (!b) return
    scelto = articoloDaId(b.dataset.id)
    lista.hidden = true
    scrivi()
    if (o.alCambio) o.alCambio(scelto ? scelto.id : null)
  })
  inp.addEventListener('blur', function () { setTimeout(function () { if (!contenitore.contains(document.activeElement)) { lista.hidden = true; scrivi() } }, 150) })
  return { imposta: function (id) { scelto = id ? articoloDaId(id) : null; scrivi() }, valore: function () { return scelto ? scelto.id : null } }
}

// <select> dei fornitori (dalla Rubrica)
function opzioniFornitori(selezionato, conVuoto) {
  var s = conVuoto ? '<option value="">— scegli il fornitore —</option>' : ''
  return s + RF.fornitori.filter(function (f) { return f.contatto && f.contatto.attivo !== false && !(f.radar && f.radar.archiviato) })
    .map(function (f) {
      return '<option value="' + f.contatto.id + '"' + (f.contatto.id === selezionato ? ' selected' : '') + '>' + esc(f.nome) + '</option>'
    }).join('')
}
function opzioniCategorie(selezionata, conVuoto) {
  var s = conVuoto ? '<option value="">— scegli —</option>' : ''
  ;['Materiali', 'Servizi'].forEach(function (g) {
    s += '<optgroup label="' + g + '">' + RF.categorie.filter(function (c) { return c.gruppo === g && !c.archiviata }).map(function (c) {
      return '<option value="' + c.id + '"' + (String(c.id) === String(selezionata) ? ' selected' : '') + '>' + esc(c.nome) + '</option>'
    }).join('') + '</optgroup>'
  })
  return s
}
function opzioniUnita(selezionata) {
  return RF.unita.filter(function (u) { return !u.archiviata || u.sigla === selezionata }).map(function (u) {
    return '<option value="' + esc(u.sigla) + '"' + (u.sigla === selezionata ? ' selected' : '') + '>' + esc(u.sigla + ' — ' + u.nome) + '</option>'
  }).join('')
}

// ─── Librerie caricate solo quando servono ───────────────────────────────────
var _librerie = {}
function caricaLibreria(nome) {
  if (_librerie[nome]) return _librerie[nome]
  _librerie[nome] = new Promise(function (ok, ko) {
    var s = document.createElement('script')
    s.src = LIBRERIE[nome]
    s.onload = function () {
      if (nome === 'pdf' && window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIBRERIE.pdfw
      ok()
    }
    s.onerror = function () { _librerie[nome] = null; ko(new Error('non riesco a caricare ' + nome + ' (connessione?)')) }
    document.head.appendChild(s)
  })
  return _librerie[nome]
}

// ─── Il Worker (lettura con l'AI) ────────────────────────────────────────────
async function chiamaWorker(corpo) {
  var url = RF.imp && RF.imp.worker_url ? String(RF.imp.worker_url).trim() : ''
  if (!url) throw new Error('Lettura con l\'AI non attiva: il titolare deve scrivere l\'indirizzo del Worker in Impostazioni.')
  var s = await sessioneValida()
  if (!s) throw new Error('Sessione scaduta: accedi di nuovo.')
  var r
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token },
      body: JSON.stringify(corpo)
    })
  } catch (e) {
    throw new Error('Il Worker non risponde (indirizzo giusto? connessione?).')
  }
  var j = null
  try { j = await r.json() } catch (_) { j = null }
  if (!j) throw new Error('Il Worker ha risposto in modo illeggibile (codice ' + r.status + ').')
  if (!j.ok) throw new Error(j.errore || ('errore ' + r.status))
  return j
}
// Costo in CHF da dollari, col cambio delle Impostazioni
function costoCHF(usd) { return (Number(usd) || 0) * (RF.imp ? Number(RF.imp.cambio_usd_chf) || 0.8 : 0.8) }

// ─── File ────────────────────────────────────────────────────────────────────
async function impronta(buffer) {
  var h = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(h)).map(function (b) { return b.toString(16).padStart(2, '0') }).join('')
}
function leggiBuffer(file) {
  return new Promise(function (ok, ko) {
    var r = new FileReader()
    r.onload = function () { ok(r.result) }
    r.onerror = function () { ko(new Error('file illeggibile')) }
    r.readAsArrayBuffer(file)
  })
}
function blobInBase64(blob) {
  return new Promise(function (ok, ko) {
    var r = new FileReader()
    r.onload = function () { ok(String(r.result).split(',')[1] || '') }
    r.onerror = function () { ko(new Error('file illeggibile')) }
    r.readAsDataURL(blob)
  })
}
// Foto: ridotta nel browser (lato lungo max 1600 px, JPEG ~80%).
async function comprimiFoto(file, latoMax, qualita) {
  var max = latoMax || 1600, q = qualita || 0.8
  var img
  try {
    img = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (_) {
    img = await new Promise(function (ok, ko) {
      var i = new Image()
      i.onload = function () { ok(i) }
      i.onerror = function () { ko(new Error('Questa immagine non si apre (formato HEIC? scegli «Più compatibile» nelle impostazioni della fotocamera).')) }
      i.src = URL.createObjectURL(file)
    })
  }
  var w = img.width, h = img.height
  var k = Math.min(1, max / Math.max(w, h))
  var c = document.createElement('canvas')
  c.width = Math.round(w * k); c.height = Math.round(h * k)
  var ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(img, 0, 0, c.width, c.height)
  var blob = await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', q) })
  return { blob: blob, larghezza: c.width, altezza: c.height }
}

// Link firmati (temporanei) per mostrare i file privati, con una piccola cache.
var _firmati = {}
async function linkFirmati(bucket, percorsi) {
  var mancano = percorsi.filter(function (p) { return p && !(_firmati[bucket + p] && _firmati[bucket + p].scade > Date.now()) })
  if (mancano.length) {
    var r = await sb.storage.from(bucket).createSignedUrls(mancano, 3600)
    if (!r.error) (r.data || []).forEach(function (x) {
      if (x.signedUrl) _firmati[bucket + x.path] = { url: x.signedUrl, scade: Date.now() + 50 * 60 * 1000 }
    })
  }
  var out = {}
  percorsi.forEach(function (p) { if (p && _firmati[bucket + p]) out[p] = _firmati[bucket + p].url })
  return out
}
async function apriDocumento(percorso) {
  var l = await linkFirmati(BUCKET_DOC, [percorso])
  if (l[percorso]) window.open(l[percorso], '_blank', 'noopener')
  else toast('Documento non disponibile.')
}

// Scarica un file generato dal programma (Excel ecc.)
function scaricaBlob(blob, nome) {
  var a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nome
  document.body.appendChild(a)
  a.click()
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove() }, 1000)
}
async function copiaTesto(t) {
  try { await navigator.clipboard.writeText(t); toast('📋 Testo copiato') }
  catch (_) {
    var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select()
    try { document.execCommand('copy'); toast('📋 Testo copiato') } catch (e) { toast('Copia non riuscita: seleziona il testo a mano.') }
    ta.remove()
  }
}

// ─── Avvisi di un prezzo (icona + scritta) ───────────────────────────────────
function avvisiPrezzo(p, fornitore) {
  var out = []
  if (p.scaduto) out.push(tag('warn', '⏰', 'Offerta scaduta'))
  if (p.vecchio) out.push(tag('warn', '🕰️', 'Prezzo più vecchio di ' + (RF.imp ? RF.imp.soglia_mesi : 6) + ' mesi'))
  if (p.sconto_noto === false) out.push(tag('warn', '❔', 'Sconto non noto'))
  if (p.sconto_non_applicato) out.push(tag('warn', '❔', 'Nuovo sconto non applicato (sconto non noto)'))
  if (p.senza_fattore) out.push(tag('err', '📏', 'Unità diversa senza fattore di conversione'))
  if (p.solo_pacchi_interi) out.push(tag('info', '📦', 'Solo pacchi interi: prezzo grandi quantità'))
  if (p.ordine_minimo) out.push(tag('info', '🧾', 'Ordine minimo: ' + p.ordine_minimo))
  if (p.netto_non_torna) out.push(tag('err', '🧮', 'Il netto del fornitore non torna'))
  if (p.variante) out.push(tag('', '🔀', 'Variante'))
  var nv = Number(p.n_variazioni) || 0
  if (nv > 0) out.push(tag('info', '📈', nv + (nv === 1 ? ' variazione applicata' : ' variazioni applicate')))
  return out.join(' ')
}
function prezzoTesto(valore, valuta) {
  if (valore == null) return '–'
  return RFC.fmt(valore) + ' ' + (valuta || 'CHF')
}
