// Materiali — documenti.js
// Archivio privato di offerte e listini (bucket rf-documenti): ogni documento è la prova dei suoi prezzi.
// I file si aprono solo con link firmati a tempo (apriDocumento in base.js).

'use strict'

var DOCUMENTI = { righe: [], testo: '' }

async function disegnaDocumenti() {
  var v = el('vista-documenti')
  v.innerHTML = '<div class="caricamento">⏳ Carico…</div>'
  if (!(await sessioneValida())) return
  var r = await sb.from('rf_v_documenti').select('*').order('creato_il', { ascending: false }).limit(1000)
  if (r.error) {
    v.innerHTML = '<div class="intestazione"><h1>📄 Documenti</h1></div>' +
      banner('err', esc('Elenco non disponibile: ' + spiegaErrore(r.error)))
    return
  }
  DOCUMENTI.righe = r.data || []
  v.innerHTML =
    '<div class="intestazione"><h1>📄 Documenti</h1></div>' +
    '<p class="aiuto">Offerte e listini dei fornitori: ogni file è la prova dei suoi prezzi. Archivio privato.</p>' +
    '<div class="barra-ricerca"><div class="campo"><span class="lente" aria-hidden="true">🔍</span>' +
      '<input id="d-testo" type="search" placeholder="Cerca fornitore, numero o nome del file" autocomplete="off" aria-label="Cerca documento" /></div></div>' +
    '<div id="d-conteggio" class="conteggio"></div>' +
    '<div id="d-elenco"></div>'
  el('d-testo').value = DOCUMENTI.testo
  el('d-testo').addEventListener('input', function () { DOCUMENTI.testo = this.value; elencoDocumenti() })
  elencoDocumenti()
}

function elencoDocumenti() {
  var cerca = RFC.perRicerca(DOCUMENTI.testo || '')
  var righe = DOCUMENTI.righe.filter(function (d) {
    return !cerca || RFC.corrisponde(RFC.perRicerca([d.fornitore_nome, d.numero, d.nome_file, d.tipo].join(' ')), DOCUMENTI.testo)
  })
  html('d-conteggio', righe.length + (righe.length === 1 ? ' documento' : ' documenti'))
  html('d-elenco', righe.length ? '<div class="tabella-wrap"><table class="tab a-schede"><thead><tr>' +
    '<th>Fornitore</th><th>Documento</th><th>Data</th><th class="num">Prezzi</th><th>Chi</th><th></th></tr></thead><tbody>' +
    righe.map(function (d) {
      var nv = Number(d.n_da_verificare) || 0
      return '<tr>' +
        '<td data-et="Fornitore"><strong>' + esc(d.fornitore_nome) + '</strong>' +
          (d.fornitore_da_valutare ? '<br>' + tag('warn', '❔', 'Ditta da valutare') : '') + '</td>' +
        '<td data-et="Documento">' + esc(d.tipo) + (d.numero ? ' ' + esc(d.numero) : '') + (d.versione > 1 ? ' · versione ' + d.versione : '') +
          (d.nome_file ? '<br><span class="dim piccolo">' + esc(d.nome_file) + '</span>' : '') + '</td>' +
        '<td data-et="Data">' + RFC.fmtData(d.data_documento) + '</td>' +
        '<td data-et="Prezzi" class="num">' + (d.nessun_prezzo ? '<span class="dim">nessun prezzo</span>' : Number(d.n_prezzi) || 0) +
          (nv ? '<br>' + tag('warn', '⚠️', nv + ' da verificare') : '') + '</td>' +
        '<td data-et="Chi" class="nowrap">' + esc(RFC.timbro(d.creato_iniziali, d.creato_il)) + '</td>' +
        '<td data-et="Azioni"><div class="gruppo-btn">' +
          (d.percorso ? '<button type="button" class="btn btn-piccolo" data-doc="' + esc(d.percorso) + '">📄 Apri</button>' : '') +
          '<button type="button" class="btn btn-piccolo" data-doc-prezzi="' + esc(d.id) + '" data-doc-nome="' + esc(d.nome_file || d.numero || d.tipo) + '">🏷️ I suoi prezzi</button>' +
        '</div></td></tr>'
    }).join('') + '</tbody></table></div>'
    : '<div class="vuoto">Nessun documento. I documenti entrano con «📥 Importa offerta».</div>')
  var box = el('d-elenco')
  collegaProve(box)
  box.querySelectorAll('[data-doc-prezzi]').forEach(function (b) {
    b.addEventListener('click', function () { finestraPrezziDocumento(b.dataset.docPrezzi, b.dataset.docNome) })
  })
}

// Da un documento ai suoi prezzi: tutte le versioni, attive e sostituite.
async function finestraPrezziDocumento(id, nome) {
  if (!(await sessioneValida())) return
  var r = await sb.from('rf_v_storico').select('*').eq('documento_id', id).order('articolo_codice')
  if (r.error) return avvisa('err', esc('Prezzi non disponibili: ' + spiegaErrore(r.error)))
  var righe = r.data || []
  var fin = apriFinestra({
    titolo: '🏷️ Prezzi di ' + (nome || 'questo documento'), larga: true,
    html: righe.length ? '<div class="tabella-wrap"><table class="tab a-schede"><thead><tr>' +
      '<th>Articolo</th><th>Voce del fornitore</th><th class="num">Netto</th><th>Data</th><th>Stato</th></tr></thead><tbody>' +
      righe.map(function (x) {
        return '<tr class="' + (x.stato === 'sostituito' ? 'sostituito' : '') + '">' +
          '<td data-et="Articolo"><button type="button" class="btn btn-piccolo" data-articolo="' + esc(x.articolo_id) + '">' + esc(x.articolo_codice) + '</button>' +
            '<br><span class="piccolo">' + esc(x.articolo_descrizione) + '</span></td>' +
          '<td data-et="Voce">' + esc(x.descrizione_fornitore || '–') + '</td>' +
          '<td data-et="Netto" class="num">' + prezzoTesto(x.netto_base, x.valuta) +
            (x.unita_fornitore ? '<span class="dim"> / ' + esc(x.unita_fornitore) + '</span>' : '') + '</td>' +
          '<td data-et="Data">' + dataPrezzoTesto(x) + '</td>' +
          '<td data-et="Stato">' + (x.stato === 'attivo' ? tag('ok', '✔️', 'Attivo') : tag('', '↪️', 'Sostituito')) +
            (x.da_verificare && x.stato === 'attivo' ? ' ' + tag('warn', '⚠️', 'Da verificare') : '') + '</td></tr>'
      }).join('') + '</tbody></table></div>'
      : '<div class="vuoto">Questo documento non ha prezzi collegati.</div>'
  })
  fin.el.querySelectorAll('[data-articolo]').forEach(function (b) {
    b.addEventListener('click', function () { fin.chiudi(); vai('articolo', b.dataset.articolo) })
  })
}
