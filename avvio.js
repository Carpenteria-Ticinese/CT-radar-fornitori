// CT Radar Fornitori — avvio.js
// Collega i pulsanti fissi e decide la prima pagina (login o Radar).

'use strict'

el('login-form').addEventListener('submit', login)
el('btn-esci').addEventListener('click', esci)
el('negato-esci').addEventListener('click', esci)
document.querySelectorAll('#menu button').forEach(function (b) {
  b.addEventListener('click', function () { vai(b.dataset.vista) })
})
window.addEventListener('hashchange', vaiDaIndirizzo)

// Se la sessione finisce (logout da un'altra scheda, token scaduto), si torna al login.
sb.auth.onAuthStateChange(function (evento) {
  if (evento === 'SIGNED_OUT') {
    RF.caricato = { base: false, articoli: false, fornitori: false }
    mostraLogin('')
  }
})

;(async function () {
  var s = null
  try { s = (await sb.auth.getSession()).data.session } catch (_) { s = null }
  if (s) entra()
  else mostraLogin('')
})()
