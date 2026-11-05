/*
 * REGOLA DEL PREZZO D'ACQUISTO — bocca unica per Preventivi e Materiali (decisioni di Umberto, 5.11.2026).
 * File SENZA dipendenze: Materiali lo copia identico (stesso testo, stessa prova). Gira in Node e nel browser (window.CTRegolaPrezzo).
 *
 * Righe = i prezzi di UN articolo come li dà la vista rf_v_prezzi_attuali:
 *   { fornitore_id, fornitore_nome, arrivato_chf (netto + costo di arrivo), netto_chf, data_prezzo, preferito, da_verificare,
 *     variante, articolo_archiviato, fornitore_archiviato, fornitore_fuori, id }
 *
 * Regola:
 *   1. Righe utili: niente varianti, niente articoli o fornitori archiviati, con il prezzo arrivato (fattore dell'unità presente).
 *   2. Si usano SOLO i prezzi confermati (non «da verificare», fornitore non «fuori»). Se non ce n'è nessuno, valgono quelli
 *      «da verificare» (anche di un fornitore da valutare) e il risultato porta daVerificare = true: l'offerta mostra un avviso
 *      sulla voce, a schermo; niente sul PDF del cliente.
 *   3. Dentro il gruppo: il PREFERITO, se c'è. Se il preferito ha più prezzi: il più recente (data ignota = il più vecchio; a parità il più basso).
 *      Senza preferito: il più conveniente arrivato (a parità il più recente). Solo «da verificare»: il più recente (è l'ultimo documento letto).
 *
 * Ritorna { riga, daVerificare, motivo } — riga null = nessun prezzo usabile, motivo in italiano.
 */
(function (root) {
  'use strict';
  const DATA_IGNOTA = '0000-00-00';                       // data mancante = la più vecchia
  const num = x => (typeof x === 'number' ? x : typeof x === 'string' && x !== '' ? Number(x) : NaN);
  const haPrezzo = r => isFinite(num(r.arrivato_chf));
  const data = r => (r.data_prezzo ? String(r.data_prezzo).slice(0, 10) : DATA_IGNOTA);
  const piuRecente = (a, b) => (data(a) > data(b) ? -1 : data(a) < data(b) ? 1 : num(a.arrivato_chf) - num(b.arrivato_chf));
  const piuConveniente = (a, b) => num(a.arrivato_chf) - num(b.arrivato_chf) || (data(a) > data(b) ? -1 : data(a) < data(b) ? 1 : 0);

  function scegli(righe) {
    const tutte = righe || [];
    if (!tutte.length) return { riga: null, daVerificare: false, motivo: 'articolo non trovato in Materiali' };
    const utili = tutte.filter(r => !r.variante && !r.articolo_archiviato && !r.fornitore_archiviato);
    if (!utili.length) return { riga: null, daVerificare: false, motivo: 'in Materiali solo varianti o fornitori archiviati' };
    const conPrezzo = utili.filter(haPrezzo);
    if (!conPrezzo.length) return { riga: null, daVerificare: false, motivo: 'in Materiali manca la conversione dell\'unità (fattore)' };
    const confermati = conPrezzo.filter(r => !r.da_verificare && !r.fornitore_fuori);
    if (confermati.length) {
      const pref = confermati.filter(r => r.preferito);
      const gruppo = pref.length ? pref.slice().sort(piuRecente) : confermati.slice().sort(piuConveniente);
      return { riga: gruppo[0], daVerificare: false, motivo: null };
    }
    const daVer = conPrezzo.filter(r => r.da_verificare);
    if (!daVer.length) return { riga: null, daVerificare: false, motivo: 'in Materiali solo fornitori da valutare' };
    const pref = daVer.filter(r => r.preferito);
    const gruppo = (pref.length ? pref : daVer).slice().sort(piuRecente);
    return { riga: gruppo[0], daVerificare: true, motivo: null };
  }

  const API = { scegli, DATA_IGNOTA };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.CTRegolaPrezzo = API;
})(typeof window !== 'undefined' ? window : globalThis);
