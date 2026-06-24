/* global Office, window */

const CONTACT_EMAIL = "niklas@gordonsregister.com";

/**
 * Ribbon-Button „E-Mail": öffnet das Standard-Mailprogramm mit einer vorbereiteten
 * Nachricht an die Gordon-Kontaktadresse.
 */
function sendEmail(event: Office.AddinCommands.Event): void {
  const url = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Support-Anfrage Gordon")}`;
  try {
    window.open(url, "_blank");
  } catch {
    /* ignore – Mail-Client nicht verfügbar */
  }
  event.completed();
}

Office.onReady(() => {
  Office.actions.associate("sendEmail", sendEmail);
});
