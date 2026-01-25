import { FluentBundle, FluentResource } from "@fluent/bundle";

const ftlContent = `
# General messages
welcome = 👋 Hallo! Um deine Anfrage abzuschließen, antworte bitte mit einer kurzen Begründung (mind. { $minWords } Wörter), warum du beitreten möchtest.
invalid-input = ⚠️ Bitte sende eine Textnachricht mit deiner Begründung.
error-generic = ⚠️ Entschuldigung, ich habe keine gültige Textnachricht erhalten. Bitte versuche es erneut.
thank-you = Danke! Deine Anfrage wurde zur Überprüfung eingereicht. 📨
dm-failed = ⚠️ Konnte keine DM senden. Überprüfe deine Privatsphäre-Einstellungen oder starte den Bot neu.

# Validation errors
reason-too-short = ⚠️ Deine Begründung ist zu kurz. Bitte schreibe mindestens { $minWords } Wörter, damit wir wissen, wer du bist.
reason-too-long = ⚠️ Deine Begründung ist zu lang (max. { $maxChars } Zeichen).
message-empty = ⚠️ Nachricht darf nicht leer sein.
message-too-long = ⚠️ Nachricht ist zu lang (max. 500 Zeichen).

# Callback / Status messages
approved-user = ✅ Glückwunsch! Deine Beitrittsanfrage wurde genehmigt! 🎉
declined-user = ❌ Deine Beitrittsanfrage wurde leider abgelehnt.
request-processed = ⚠️ Diese Anfrage wurde bereits bearbeitet.
request-not-found = ⚠️ Anfrage nicht gefunden oder abgelaufen.
not-authorized = ⛔️ Nicht autorisiert.
action-success-approved = Anfrage genehmigt!
action-success-declined = Anfrage abgelehnt!
error-approving = Fehler beim Genehmigen der Anfrage.
error-declining = Fehler beim Ablehnen der Anfrage.
msg-added = ✅ Nachricht hinzugefügt. Die Admins wurden benachrichtigt.
error-adding-msg = ⚠️ Fehler beim Hinzufügen der Nachricht.
`;

let bundle: FluentBundle | null = null;

export function getMessage(key: string, args?: Record<string, any>): string {
    if (!bundle) {
        try {
            const resource = new FluentResource(ftlContent);
            bundle = new FluentBundle("de", { useIsolating: false });
            const errors = bundle.addResource(resource);
            if (errors.length > 0) {
                console.error("[Messages] Fluent parsing errors:", errors);
            }
        } catch (error) {
            console.error("[Messages] Error loading Fluent template:", error);
            return key;
        }
    }

    const message = bundle.getMessage(key);
    if (!message || !message.value) {
        console.warn(`[Messages] Missing translation for key: ${key}`);
        return key;
    }

    return bundle.formatPattern(message.value, args);
}
