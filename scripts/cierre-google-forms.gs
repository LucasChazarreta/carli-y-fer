// Paste into the Apps Script project BOUND TO the wedding Google Form.
// Run instalarCierreAlbum once and authorize it. Not executed by this repository.
const CIERRE_ALBUM = '2026-11-02T00:00:00-03:00';
function instalarCierreAlbum() {
  const form = FormApp.getActiveForm();
  if (!form) throw new Error('Abrí Apps Script desde el formulario de la boda.');
  const closeAt = new Date(CIERRE_ALBUM);
  if (closeAt <= new Date()) throw new Error('La fecha de cierre ya pasó. Revisá antes de continuar.');
  // Only replace this script's own closure trigger, not unrelated automations.
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'cerrarAlbumBoda')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('cerrarAlbumBoda').timeBased().at(closeAt).create();
  console.log('Cierre programado. Google puede ejecutar el disparador con demora.');
}
function cerrarAlbumBoda() {
  const form = FormApp.getActiveForm();
  if (!form) throw new Error('No se encontró el formulario vinculado.');
  form.setCustomClosedFormMessage('El plazo para compartir recuerdos finalizó. ¡Gracias por acompañarnos! Carli y Fer.');
  form.setAcceptingResponses(false);
}
