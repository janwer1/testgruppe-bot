import { logger } from "../shared/logger";

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
  | "approved-user-intro"
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

// biome-ignore lint/suspicious/noExplicitAny: Message functions take dynamic arguments
let MESSAGE_MAP: Record<string, string | ((args: any) => string)> | null = null;

function initMessages() {
  if (MESSAGE_MAP) return MESSAGE_MAP;

  MESSAGE_MAP = {
    // General messages
    welcome: (args: { minWords: number; maxChars: number }) =>
      `👋 Hallo! Um deine Anfrage abzuschließen, antworte bitte mit einer kurzen Begründung (mind. ${args.minWords} Wörter, max. ${args.maxChars} Zeichen), warum du beitreten möchtest.`,
    "invalid-input": "⚠️ Bitte sende eine Textnachricht mit deiner Begründung.",
    "error-generic": "⚠️ Entschuldigung, ich habe keine gültige Textnachricht erhalten. Bitte versuche es erneut.",
    "thank-you": "Danke! Deine Anfrage wurde zur Überprüfung eingereicht. 📨",
    "dm-failed": "⚠️ Konnte keine DM senden. Überprüfe deine Privatsphäre-Einstellungen oder starte den Bot neu.",

    // Validation errors
    "reason-too-short": (args: { minWords: number }) =>
      `⚠️ Deine Begründung ist zu kurz. Bitte schreibe mindestens ${args.minWords} Wörter, damit wir wissen wer du bist.`,
    "reason-too-long": (args: { maxChars: number }) =>
      `⚠️ Deine Begründung ist zu lang (max. ${args.maxChars} Zeichen).`,
    "message-empty": "⚠️ Nachricht darf nicht leer sein.",
    "message-too-long": (args: { maxChars: number }) => `⚠️ Nachricht ist zu lang (max. ${args.maxChars} Zeichen).`,

    // Callback / Status messages
    "approved-user": "✅ Glückwunsch! Deine Beitrittsanfrage wurde genehmigt! 🎉",
    "approved-user-intro":
      "Wir würden uns freuen, wenn du dich kurz im Kanal #General vorstellst – einfach ein bis zwei Sätze zu dir und was dich besonders interessiert - Kraftsport, PEDs, HGH ... 💪",
    "declined-user": "❌ Deine Beitrittsanfrage wurde leider abgelehnt.",
    "request-processed": "⚠️ Diese Anfrage wurde bereits bearbeitet.",
    "request-not-found": "⚠️ Anfrage nicht gefunden oder abgelaufen.",
    "not-authorized": "⛔️ Nicht autorisiert.",
    "action-success-approved": "Anfrage genehmigt!",
    "action-success-declined": "Anfrage abgelehnt!",
    "error-approving": "Fehler beim Genehmigen der Anfrage.",
    "error-declining": "Fehler beim Ablehnen der Anfrage.",
    "already-approved": "✅ Anfrage wurde bereits genehmigt.",
    "already-declined": "✅ Anfrage wurde bereits abgelehnt.",
    "msg-added": "✅ Nachricht hinzugefügt. Die Admins wurden benachrichtigt.",
    "error-adding-msg": "⚠️ Fehler beim Hinzufügen der Nachricht.",
  };
  return MESSAGE_MAP;
}

// biome-ignore lint/suspicious/noExplicitAny: generic message arguments
export function getMessage(key: MessageKey, args?: Record<string, any>): string {
  const map = initMessages();
  const msg = map[key];
  if (!msg) {
    try {
      logger.warn({ key }, "Missing translation for key");
    } catch {
      console.warn(`[Messages] Missing translation for key: ${key}`);
    }
    return key;
  }

  if (typeof msg === "function") {
    return msg(args);
  }

  return msg;
}
