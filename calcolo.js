// CT Radar Fornitori — calcolo.js
// Funzioni PURE (niente pagina, niente database): calcolo del netto, sconti,
// arrotondamenti, codici, unità, testi. Si provano da sole con
// test/prova_calcolo.js (node).
//
// Il netto lo calcola SEMPRE il programma, mai l'AI:
//   netto = listino × (1 − sconto1) × (1 − sconto2) × (1 + rincaro) + extra
// Il database fa lo stesso conto (colonna netto_base): questo file serve per
// mostrare il prezzo nuovo PRIMA di salvarlo.

'use strict'

var RFC = (function () {

  // ── Arrotondamento decimale esatto ─────────────────────────────────────────
  // 3.525 in virgola mobile è 3.52499999…: toFixed(2) darebbe 3.52. Qui si
  // sposta la virgola con la notazione esponenziale, che è esatta.
  function arrotonda(x, decimali) {
    if (x == null || !isFinite(x)) return null
    var d = decimali == null ? 2 : decimali
    var segno = x < 0 ? -1 : 1
    var v = Math.round(Number(Math.abs(x) + 'e' + d))
    return segno * Number(v + 'e-' + d)
  }

  // ── Numeri scritti come capita: 1'390.00 · 22,75 · 1.234,56 · "32.50" ─────
  function numero(s) {
    if (s == null || s === '') return null
    if (typeof s === 'number') return isFinite(s) ? s : null
    var t = String(s).trim().replace(/[\s'’`]/g, '').replace(/^(chf|eur|fr\.?|€)/i, '').replace(/(chf|eur|fr\.?|€|%)$/i, '')
    if (!t) return null
    var neg = /^\(.*\)$/.test(t)               // (37.75) → 37.75 (variante, non negativo)
    t = t.replace(/^\(|\)$/g, '')
    var haVirgola = t.indexOf(',') >= 0, haPunto = t.indexOf('.') >= 0
    if (haVirgola && haPunto) {
      // l'ultimo dei due è il separatore decimale
      if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.')
      else t = t.replace(/,/g, '')
    } else if (haVirgola) {
      t = t.replace(',', '.')
    }
    var n = Number(t)
    if (!isFinite(n)) return null
    return neg ? Math.abs(n) : n
  }

  // ── Il netto ───────────────────────────────────────────────────────────────
  function nettoBase(listino, sconto1, sconto2, rincaro, extra) {
    var l = Number(listino) || 0
    var v = l * (1 - (Number(sconto1) || 0) / 100) * (1 - (Number(sconto2) || 0) / 100) *
            (1 + (Number(rincaro) || 0) / 100) + (Number(extra) || 0)
    return arrotonda(v, 4)
  }

  // Dalla lista «modifiche» dell'AI (sconti e supplementi nell'ordine scritto)
  // ai tre campi del prezzo:
  //   1° sconto → sconto1; dal 2° in poi → sconto2 (composti: 1−(1−a)(1−b));
  //   supplementi → rincaro (composti: (1+a)(1+b)−1).
  function modificheInCampi(modifiche) {
    var sconti = [], suppl = []
    ;(modifiche || []).forEach(function (m) {
      var p = Number(m && m.percentuale)
      if (!isFinite(p) || p === 0) return
      if (m.tipo === 'sconto') sconti.push(Math.abs(p))
      else suppl.push(p)
    })
    var s1 = sconti.length ? sconti[0] : 0
    var resto = sconti.slice(1).reduce(function (acc, s) { return acc * (1 - s / 100) }, 1)
    var s2 = arrotonda((1 - resto) * 100, 4)
    var r = arrotonda((suppl.reduce(function (acc, s) { return acc * (1 + s / 100) }, 1) - 1) * 100, 4)
    return { sconto1: s1, sconto2: s2, rincaro: r }
  }

  // «Il netto del fornitore non torna»: differenza oltre 0.02 E oltre lo 0.5%.
  // Il fornitore può dichiarare il netto con o senza l'extra (es. Edilgroup
  // scrive la tassa CO2 su una riga a parte): va bene se torna uno dei due.
  function nettoNonTorna(dichiarato, calcolato, extra) {
    if (dichiarato == null || calcolato == null) return false
    function lontano(a, b) { return Math.abs(a - b) > 0.02 && Math.abs(a - b) > Math.abs(b) * 0.005 }
    var e = Number(extra) || 0
    if (!lontano(dichiarato, calcolato)) return false
    if (e !== 0 && !lontano(dichiarato, calcolato - e)) return false
    return true
  }

  function variazionePct(vecchio, nuovo) {
    if (vecchio == null || nuovo == null || !isFinite(vecchio) || !isFinite(nuovo) || vecchio === 0) return null
    return (nuovo - vecchio) / vecchio * 100
  }

  // ── Testi ──────────────────────────────────────────────────────────────────
  function senzaAccenti(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  }
  // Per la ricerca: «3strati_abete_19mm_BC» → «3strati abete 19mm bc».
  function perRicerca(s) {
    return senzaAccenti(s).toLowerCase().replace(/[_/\\+]/g, ' ').replace(/[^a-z0-9.,\- ]+/g, ' ')
      .replace(/\s+/g, ' ').trim()
  }
  // «abete 19» trova «3strati_abete_19mm_BC»: ogni parola cercata deve esserci.
  function corrisponde(testoNorm, ricerca) {
    var parole = perRicerca(ricerca).split(' ').filter(Boolean)
    for (var i = 0; i < parole.length; i++) if (testoNorm.indexOf(parole[i]) < 0) return false
    return true
  }
  // Per la memoria degli abbinamenti: minuscolo, solo lettere e numeri.
  function descrizioneNorm(s) {
    return senzaAccenti(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
  }
  // Nome di una ditta per il confronto (come nei file SQL 01/02).
  function nomeNorm(s) {
    var t = ' ' + senzaAccenti(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' '
    for (var k = 0; k < 2; k++) {
      t = t.replace(/ (sagl|sa|ag|gmbh|srl|s r l|spa|s p a|snc|sas|ltd|sarl|kg|inc|bv) /g, ' ')
    }
    return t.replace(/\s+/g, '')
  }

  // ── Codici articolo ────────────────────────────────────────────────────────
  // Parti separate da _, solo lettere, numeri, punto e trattino.
  var RE_CODICE = /^[A-Za-z0-9.-]+(_[A-Za-z0-9.-]+)*$/
  function codiceValido(c) { return RE_CODICE.test(String(c || '')) }
  function perchéCodiceNonValido(c) {
    var s = String(c || '')
    if (!s) return 'Il codice è vuoto.'
    if (/\s/.test(s)) return 'Niente spazi: usa _ fra le parti.'
    if (/[àèéìòùÀÈÉÌÒÙçñ]/.test(s)) return 'Niente lettere accentate.'
    if (/[\/+]/.test(s)) return 'Niente / e niente +.'
    if (/^_|_$|__/.test(s)) return 'Il _ separa due parti: non all\'inizio, non alla fine, non doppio.'
    if (!RE_CODICE.test(s)) return 'Solo lettere, numeri, punto, trattino e _.'
    return ''
  }
  // Proposta di codice da una descrizione: «3 strati abete 19 B/C» → «3strati_abete_19_BC».
  function proponiCodice(descrizione) {
    var t = senzaAccenti(descrizione).replace(/\//g, '').replace(/\+/g, '').replace(/[^A-Za-z0-9.\- ]+/g, ' ')
    var parti = t.split(/\s+/).filter(Boolean).slice(0, 7)
    // «3 strati» → «3strati»: un numero da solo si unisce alla parola dopo
    var out = []
    for (var i = 0; i < parti.length; i++) {
      if (/^\d+$/.test(parti[i]) && parti[i + 1] && /^[a-z]/i.test(parti[i + 1]) && out.length === 0) {
        out.push(parti[i] + parti[i + 1]); i++
      } else out.push(parti[i])
    }
    return out.join('_').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60)
  }

  // ── Unità di misura ────────────────────────────────────────────────────────
  // L'unità scritta dal fornitore → la sigla del Radar (rf_unita), se si capisce.
  var UNITA = [
    [/^(m2|mq|m²|qm|sqm|metri? quadr\w*)$/, 'm²'],
    [/^(m3|mc|m³|metri? cub\w*)$/, 'm³'],
    [/^(m|m1|ml|mt|lfm|metri? line\w*|metro)$/, 'ml'],
    [/^(pz|pz\.|pc|pce|pcs|st|stk|stück|n|nr|no|pezz\w*|cad|cad\.)$/, 'pz'],
    [/^(kg|kilo|chil\w*)$/, 'kg'],
    [/^(100 ?kg|q|quintale)$/, '100 kg'],
    [/^(t|to|ton|tonn\w*)$/, 't'],
    [/^(l|lt|litr\w*)$/, 'l'],
    [/^(h|ora|ore|std)$/, 'ora'],
    [/^(gg|giorn\w*|g)$/, 'giorno'],
    [/^(mese|mesi)$/, 'mese'],
    [/^(viaggi\w*|corsa)$/, 'viaggio'],
    [/^(a ?corpo|ac|forfait|pauschal|corpo)$/, 'a corpo'],
    [/^(pac|pacc\w*|pack|pa|confezione|conf)$/, 'pacco'],
    [/^(rot|rotol\w*|roll|rl)$/, 'rotolo'],
    [/^(sa|sacc\w*|sack)$/, 'sacco'],
    [/^(scat\w*|box|ct|cartone)$/, 'scatola'],
    [/^(set|kit)$/, 'set'],
    [/^(paio|paia|pa\.)$/, 'paio']
  ]
  function siglaUnita(u) {
    var t = String(u == null ? '' : u).trim().toLowerCase().replace(/\s+/g, ' ')
    if (!t) return null
    for (var i = 0; i < UNITA.length; i++) if (UNITA[i][0].test(t)) return UNITA[i][1]
    return null
  }

  // ── Righe dell'AI → righe del programma (regole fisse) ─────────────────────
  var RE_TASSA = /(tassa|contributo|tax).{0,20}(co2|ambient|smaltim|raee|vrg)|(co2|ambient).{0,10}(tassa|contributo)/i

  // righeAI: come le restituisce il Worker. Ritorna righe con:
  //   codice, descrizione, marca, unita, quantita, listino, sconto1, sconto2,
  //   rincaro, extra, sconto_noto, netto_dichiarato, netto, variante, nota,
  //   avvisi[] (testo), unita_sigla
  function preparaRighe(righeAI) {
    var out = []
    ;(righeAI || []).forEach(function (r) {
      var desc = String(r.descrizione || '').replace(/\s+/g, ' ').trim()
      var eTassa = r.tassa === true || RE_TASSA.test(desc)
      if (eTassa && out.length) {
        // La tassa CO2 / Ambiente si somma come extra alla riga sopra.
        var sopra = out[out.length - 1]
        var importo = numero(r.listino != null ? r.listino : r.netto_dichiarato)
        if (importo != null) {
          sopra.extra = arrotonda((sopra.extra || 0) + importo, 4)
          sopra.netto = nettoBase(sopra.listino, sopra.sconto1, sopra.sconto2, sopra.rincaro, sopra.extra)
          sopra.info.push('Tassa aggiunta come extra: ' + desc + ' ' + fmt(importo))
        }
        return
      }
      var listino = numero(r.listino)
      var dich = numero(r.netto_dichiarato)
      var campi = modificheInCampi(r.modifiche)
      var scontoNoto = true
      var avvisi = []
      if (listino == null && dich != null) {
        // Solo il netto: listino = netto, sconto 0, «sconto non noto».
        listino = dich
        campi = { sconto1: 0, sconto2: 0, rincaro: 0 }
        scontoNoto = false
        avvisi.push('Sconto non noto: il documento dà solo il netto')
      }
      if (listino == null) return                       // nessun prezzo: la riga non entra
      var extra = numero(r.extra) || 0
      var netto = nettoBase(listino, campi.sconto1, campi.sconto2, campi.rincaro, extra)
      var codice = r.codice ? String(r.codice).replace(/^\[|\]$/g, '').trim() : null
      var variante = r.variante === true || /^VAR\b/i.test(codice || '') || /^VAR\b/i.test(desc)
      if (codice && /^VAR$/i.test(codice)) codice = null
      out.push({
        codice: codice || null,
        descrizione: desc,
        marca: r.marca ? String(r.marca).trim() : null,
        unita: r.unita ? String(r.unita).trim() : null,
        unita_sigla: siglaUnita(r.unita),
        quantita: numero(r.quantita),
        listino: listino,
        sconto1: campi.sconto1, sconto2: campi.sconto2, rincaro: campi.rincaro,
        extra: extra,
        sconto_noto: scontoNoto,
        netto_dichiarato: scontoNoto ? dich : null,
        netto: netto,
        variante: variante,
        nota: r.nota || null,
        codice_ct: r.codice_ct || null,      // solo dalla nostra scheda di richiesta
        avvisi: avvisi,                      // avvisi veri: bloccano «Conferma tutte»
        info: []                             // informazioni (es. tassa sommata)
      })
    })
    // il controllo del netto dichiarato si fa DOPO aver sommato le tasse
    out.forEach(function (x) {
      if (x.sconto_noto && nettoNonTorna(x.netto_dichiarato, x.netto, x.extra)) {
        x.avvisi.push('Il netto del fornitore non torna: lui scrive ' + fmt(x.netto_dichiarato) +
                      ', il calcolo dà ' + fmt(x.netto))
        x.netto_non_torna = true
      }
    })
    return out
  }

  // ── Formati svizzeri ───────────────────────────────────────────────────────
  // 1234.5 → «1'234.50»
  function fmt(n, decimali) {
    if (n == null || n === '' || !isFinite(n)) return '–'
    var d = decimali == null ? 2 : decimali
    var v = arrotonda(Number(n), d)
    var parti = Math.abs(v).toFixed(d).split('.')
    parti[0] = parti[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'")
    return (v < 0 ? '−' : '') + parti.join('.')
  }
  function fmtPct(n, decimali) {
    if (n == null || !isFinite(n)) return '–'
    var v = arrotonda(n, decimali == null ? 1 : decimali)
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(decimali == null ? 1 : decimali) + '%'
  }
  // Data e ora a Bellinzona, qualunque sia il fuso del telefono.
  function partiData(ts) {
    var d = ts instanceof Date ? ts : new Date(ts)
    if (isNaN(d)) return null
    var f = new Intl.DateTimeFormat('it-CH', {
      timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d)
    var o = {}
    f.forEach(function (p) { o[p.type] = p.value })
    return o
  }
  // «2026-10-08» → «08.10.26»
  function fmtData(s) {
    if (!s) return '–'
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s))
    if (m && String(s).length <= 10) return m[3] + '.' + m[2] + '.' + m[1].slice(2)
    var o = partiData(s)
    return o ? o.day + '.' + o.month + '.' + o.year : '–'
  }
  // «UF · 08.10.26 14:08»
  function timbro(iniziali, ts) {
    var o = partiData(ts)
    if (!o) return iniziali || ''
    return (iniziali || '??') + ' · ' + o.day + '.' + o.month + '.' + o.year + ' ' + o.hour + ':' + o.minute
  }
  // Oggi in formato AAAA-MM-GG (fuso di Bellinzona)
  function oggiISO() {
    var f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' })
    return f.format(new Date())
  }
  // «08.10.2026» / «8.10.26» / «2026-10-08» → «2026-10-08»
  function dataISO(s) {
    if (!s) return null
    var t = String(s).trim()
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0')
    m = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/.exec(t)
    if (m) {
      var y = m[3].length === 2 ? '20' + m[3] : m[3]
      return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0')
    }
    return null
  }

  return {
    arrotonda: arrotonda, numero: numero, nettoBase: nettoBase, modificheInCampi: modificheInCampi,
    nettoNonTorna: nettoNonTorna, variazionePct: variazionePct,
    senzaAccenti: senzaAccenti, perRicerca: perRicerca, corrisponde: corrisponde,
    descrizioneNorm: descrizioneNorm, nomeNorm: nomeNorm,
    codiceValido: codiceValido, perchéCodiceNonValido: perchéCodiceNonValido, proponiCodice: proponiCodice,
    siglaUnita: siglaUnita, preparaRighe: preparaRighe,
    fmt: fmt, fmtPct: fmtPct, fmtData: fmtData, timbro: timbro, oggiISO: oggiISO, dataISO: dataISO
  }
})()

if (typeof module !== 'undefined' && module.exports) module.exports = RFC
