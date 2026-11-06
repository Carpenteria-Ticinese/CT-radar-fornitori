/*
 * REGOLA DEL PREZZO D'ACQUISTO — bocca unica per Preventivi e Materiali (decisioni di Umberto, 5.11.2026; falla 10 del settimo giro).
 * File SENZA dipendenze: Materiali lo copia identico (stesso testo, stessa prova). Gira in Node e nel browser (window.CTRegolaPrezzo).
 *
 * Righe = i prezzi di UN articolo come li dà la vista rf_v_prezzi_attuali:
 *   { fornitore_id, fornitore_nome, arrivato_chf (netto + costo di arrivo), netto_chf, data_prezzo, preferito, da_verificare,
 *     variante, articolo_archiviato, fornitore_archiviato, fornitore_fuori, id }
 *
 * Regola:
 *   1. Righe utili: niente varianti, niente articoli o fornitori archiviati, con il prezzo arrivato (fattore dell'unità presente).
 *   2. Un prezzo 0 o negativo NON VALE MAI: è un errore di Materiali, si scarta sempre (non vince come «più conveniente»).
 *   3. Si usano SOLO i prezzi confermati (non «da verificare», fornitore non «fuori»). Se non ce n'è nessuno, valgono quelli
 *      «da verificare» (anche di un fornitore da valutare) e il risultato porta daVerificare = true: l'offerta mostra un avviso
 *      sulla voce, a schermo; niente sul PDF del cliente.
 *   4. Per ogni fornitore conta SOLO il suo prezzo più recente (data ignota = il più vecchio; a parità di data il più basso):
 *      un prezzo vecchio di un fornitore che ne ha uno più nuovo non conta più.
 *   5. Dentro il gruppo: il PREFERITO, se c'è, col suo prezzo più recente. Senza preferito: il più basso fra i prezzi più recenti
 *      dei fornitori (a parità il più recente). Vale uguale per i confermati e per i «da verificare».
 *
 * Ritorna { riga, daVerificare, motivo } — riga null = nessun prezzo usabile, motivo in italiano.
 */
(function (root) {
  'use strict';
  const DATA_IGNOTA = '0000-00-00';                       // data mancante = la più vecchia
  const num = x => (typeof x === 'number' ? x : typeof x === 'string' && x !== '' ? Number(x) : NaN);
  const haPrezzo = r => isFinite(num(r.arrivato_chf));
  const positivo = r => num(r.arrivato_chf) > 0;
  const data = r => (r.data_prezzo ? String(r.data_prezzo).slice(0, 10) : DATA_IGNOTA);
  const piuRecente = (a, b) => (data(a) > data(b) ? -1 : data(a) < data(b) ? 1 : num(a.arrivato_chf) - num(b.arrivato_chf));
  const piuConveniente = (a, b) => num(a.arrivato_chf) - num(b.arrivato_chf) || (data(a) > data(b) ? -1 : data(a) < data(b) ? 1 : 0);
  const fornitoreDi = r => (r.fornitore_id != null ? 'id:' + r.fornitore_id : 'nome:' + (r.fornitore_nome || ''));

  // per ogni fornitore solo il suo prezzo più recente (regola 4)
  function recentiPerFornitore(righe) {
    const m = new Map();
    for (const r of righe) { const k = fornitoreDi(r); const c = m.get(k); if (!c || piuRecente(r, c) < 0) m.set(k, r); }
    return Array.from(m.values());
  }
  // regola 5 dentro un gruppo (confermati o da verificare)
  function migliore(gruppo) {
    const pref = gruppo.filter(r => r.preferito);
    if (pref.length) return pref.slice().sort(piuRecente)[0];
    return recentiPerFornitore(gruppo).sort(piuConveniente)[0];
  }

  function scegli(righe) {
    const tutte = righe || [];
    if (!tutte.length) return { riga: null, daVerificare: false, motivo: 'articolo non trovato in Materiali' };
    const utili = tutte.filter(r => !r.variante && !r.articolo_archiviato && !r.fornitore_archiviato);
    if (!utili.length) return { riga: null, daVerificare: false, motivo: 'in Materiali solo varianti o fornitori archiviati' };
    const conPrezzo = utili.filter(haPrezzo);
    if (!conPrezzo.length) return { riga: null, daVerificare: false, motivo: 'in Materiali manca la conversione dell\'unità (fattore)' };
    const validi = conPrezzo.filter(positivo);
    if (!validi.length) return { riga: null, daVerificare: false, motivo: 'in Materiali solo prezzi a 0 o negativi: errore da correggere' };
    const confermati = validi.filter(r => !r.da_verificare && !r.fornitore_fuori);
    if (confermati.length) return { riga: migliore(confermati), daVerificare: false, motivo: null };
    const daVer = validi.filter(r => r.da_verificare);
    if (!daVer.length) return { riga: null, daVerificare: false, motivo: 'in Materiali solo fornitori da valutare' };
    return { riga: migliore(daVer), daVerificare: true, motivo: null };
  }

  const API = { scegli, recentiPerFornitore, DATA_IGNOTA };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.CTRegolaPrezzo = API;
})(typeof window !== 'undefined' ? window : globalThis);
