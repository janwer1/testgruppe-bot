type MessageKey =
  | "welcome"
  | "invalid-input"
  | "error-generic"
  | "thank-you"
  | "dm-failed"
  | "reason-too-short"
  | "reason-too-long"
  | "message-empty"
  | "message-too-long"
  | "approved-user"
  | "declined-user"
  | "request-processed"
  | "request-not-found"
  | "not-authorized"
  | "action-success-approved"
  | "action-success-declined"
  | "error-approving"
  | "error-declining"
  | "already-approved"
  | "already-declined"
  | "msg-added"
  | "error-adding-msg";

// biome-ignore lint/suspicious/noExplicitAny: generic message arguments
const messages: Record<MessageKey, string | ((args: any) => string)> = {
  // General messages
  welcome: (args: { minWords: number; maxChars: number }) =>
    `👋 Hallo! Um deine Anfrage abzuschließen, antworte bitte mit einer kurzen Begründung (mind. ${args.minWords} Wörter, max. ${args.maxChars} Zeichen), warum du beitreten möchtest.`,
  "invalid-input": "⚠️ Bitte sende eine Textnachricht mit deiner Begründung.",
  "error-generic": "⚠️ Entschuldigung, ich habe keine gültige Textnachricht erhalten. Bitte versuche es erneut.",
  "thank-you": "Danke! Deine Anfrage wurde zur Überprüfung eingereicht. 📨",
  "dm-failed": "⚠️ Konnte keine DM senden. Überprüfe deine Privatsphäre-Einstellungen oder starte den Bot neu.",

  // Validation errors
  "reason-too-short": (args: { minWords: number }) =>
    `⚠️ Deine Begründung ist zu kurz. Bitte schreibe mindestens ${args.minWords} Wörter, damit wir wissen, wer du bist.`,
  "reason-too-long": (args: { maxChars: number }) => `⚠️ Deine Begründung ist zu lang (max. ${args.maxChars} Zeichen).`,
  "message-empty": "⚠️ Nachricht darf nicht leer sein.",
  "message-too-long": (args: { maxChars: number }) => `⚠️ Nachricht ist zu lang (max. ${args.maxChars} Zeichen).`,

  // Callback / Status messages
  "approved-user": "✅ Glückwunsch! Deine Beitrittsanfrage wurde genehmigt! 🎉",
  "declined-user": "❌ Deine Beitrittsanfrage wurde leider abgelehnt.",
  "request-processed": "⚠️ Diese Anfrage wurde bereits bearbeitet.",
  "request-not-found": "⚠️ Anfrage nicht gefunden oder abgelaufen.",
  "not-authorized": "⛔️ Nicht autorisiert.",
  "action-success-approved": "Anfrage genehmigt!",
  "action-success-declined": "Anfrage abgelehnt!",
  "error-approving": "Fehler beim Genehmigen der Anfrage.",
  "error-declining": "Fehler beim Ablehnen der Anfrage.",
  "already-approved": "✅ Benutzer ist bereits in der Gruppe. Status wurde synchronisiert.",
  "already-declined": "✅ Benutzer ist bereits nicht mehr in der Gruppe. Status wurde synchronisiert.",
  "msg-added": "✅ Nachricht hinzugefügt. Die Admins wurden benachrichtigt.",
  "error-adding-msg": "⚠️ Fehler beim Hinzufügen der Nachricht.",
};

// biome-ignore lint/suspicious/noExplicitAny: generic message arguments
export function getMessage(key: MessageKey, args?: Record<string, any>): string {
  const msg = messages[key];
  if (!msg) {
    console.warn(`[Messages] Missing translation for key: ${key}`);
    return key;
  }

  if (typeof msg === "function") {
    return msg(args);
  }

  return msg;
}
