review-card =
  📋 Neue Beitrittsanfrage - Bitte prüfen

  👤 Nutzer: { $userName }{ $username ->
      *[none] ""
       [some]  (@{ $usernameValue })
  }
  🆔 ID: { $userId }
  🕐 Zeitpunkt: { $formattedDate }

  📝 Begründung:
  { $reason }
  { $additionalMessagesValue }

review-card-updated =
  { $status ->
      [approved] ✅ GENEHMIGT
     *[declined] ❌ ABGELEHNT
  }

  👤 Nutzer: { $userName }{ $username ->
      *[none] ""
       [some]  (@{ $usernameValue })
  }
  🆔 ID: { $userId }

  📝 Begründung:
  { $reason }

  ---
  { $status ->
      [approved] GENEHMIGT von: { $adminName }
     *[declined] ABGELEHNT von: { $adminName }
  }
