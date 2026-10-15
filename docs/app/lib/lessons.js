// Short exercises on the shared process language. Each answer explains why, right or wrong.
// Every exercise exists with a university example and an optional pizzeria example.

export const glossary = {
  trigger: {term: 'Auslöser', text: 'Ein Ereignis, das den Prozess startet. Er beschreibt einen Zustand («Antrag ist eingegangen»), kein Tun.'},
  activity: {term: 'Tätigkeit', text: 'Arbeit, die eine Rolle ausführt und die etwas verändert. Am besten Verb und Gegenstand: «Belege prüfen».'},
  decision: {term: 'Entscheidung', text: 'Eine Frage mit mehreren Ausgängen («Vollständig?»). Sie erledigt keine Arbeit, sondern wählt den weiteren Weg.'},
  role: {term: 'Rolle', text: 'Wer eine Tätigkeit ausführt: eine Funktion oder ein Team, nicht eine Privatperson.'},
  handover: {term: 'Übergabe', text: 'Die Arbeit wechselt von einer Rolle zur nächsten. Hier gehen oft Informationen oder Verantwortung verloren.'},
  outcome: {term: 'Ergebnis', text: 'Der Zustand am Ende, an dem man erkennt, dass der Prozess abgeschlossen ist.'},
  exception: {term: 'Ausnahme', text: 'Ein Fall, der vom üblichen Weg abweicht. Ausnahmen gehören zum Ist-Prozess, auch wenn sie selten sind.'}
};

export const exercises = [
  {
    concept: 'trigger',
    uni: {scenario: 'Im Sekretariat beginnt die Arbeit an einer Spesenabrechnung.', question: 'Was ist hier der Auslöser?', options: [
      {text: 'Abrechnung prüfen', correct: false, why: 'Prüfen ist Arbeit – eine Tätigkeit. Ein Auslöser ist das Ereignis, das diese Arbeit erst anstösst.'},
      {text: 'Abrechnung ist eingegangen', correct: true, why: 'Genau: ein Ereignis, ein Zustand. Er sagt, wann der Prozess beginnt, ohne schon Arbeit zu beschreiben.'},
      {text: 'Sekretariat', correct: false, why: 'Das ist eine Rolle. Sie sagt, wer arbeitet, aber nicht, wann der Prozess startet.'}
    ]},
    pizza: {scenario: 'In Pietros Pizzeria beginnt ein neuer Auftrag.', question: 'Was ist der Auslöser?', options: [
      {text: 'Ofen vorheizen', correct: false, why: 'Vorheizen braucht Arbeit – eine Tätigkeit. Sie folgt erst auf den Auslöser.'},
      {text: 'Bestellung ist eingegangen', correct: true, why: 'Richtig: Ein Ereignis löst den Ablauf aus. Danach beginnt die Arbeit.'}
    ]}
  },
  {
    concept: 'activity',
    uni: {scenario: 'Du beschreibst einen Schritt in der Aufnahme neuer Mitarbeitender.', question: 'Welche Formulierung beschreibt eine Tätigkeit gut?', options: [
      {text: 'HR-System', correct: false, why: 'Das ist ein Werkzeug. Es gehört als System zum Schritt, beschreibt aber nicht, was getan wird.'},
      {text: 'Stammdaten im HR-System erfassen', correct: true, why: 'Verb und Gegenstand: Man sieht, welche Arbeit geschieht und was sich danach verändert hat.'},
      {text: 'Daten', correct: false, why: 'Zu unbestimmt. Was passiert mit den Daten – werden sie gesammelt, geprüft, erfasst?'}
    ]},
    pizza: {scenario: 'In der Küche geht es weiter.', question: 'Welche Formulierung ist eine Tätigkeit?', options: [
      {text: 'Teig', correct: false, why: 'Ein Gegenstand allein sagt nicht, was getan wird.'},
      {text: 'Teig ausrollen', correct: true, why: 'Verb und Gegenstand: Hier verändert jemand etwas.'}
    ]}
  },
  {
    concept: 'decision',
    uni: {scenario: 'Die Forschungsadministration schaut einen Förderantrag an. Danach geht es entweder zur Unterschrift oder zurück an die Forschenden.', question: 'Welche Angabe ist die Entscheidung?', options: [
      {text: 'Unterlagen prüfen', correct: false, why: 'Prüfen ist Arbeit, die Zeit braucht – eine Tätigkeit. Erst ihr Ergebnis bestimmt, wie es weitergeht. Die Entscheidung ist der Verzweigungspunkt danach.'},
      {text: 'Unterlagen vollständig?', correct: true, why: 'Genau: eine Frage mit zwei Ausgängen. Eine Entscheidung erledigt keine Arbeit, sie teilt den Weg. Beide Antworten – Ja und Nein – brauchen eine Fortsetzung.'}
    ]},
    pizza: {scenario: 'Pietro liest die Bestellung.', question: 'Was ist die Entscheidung?', options: [
      {text: 'Sonderwunsch klären', correct: false, why: 'Klären ist eine Tätigkeit. Sie gehört auf einen der Wege nach der Entscheidung.'},
      {text: 'Sonderwunsch vorhanden?', correct: true, why: 'Richtig: Eine Frage teilt den Weg. Mit Sonderwunsch wird geklärt, ohne geht es direkt weiter.'}
    ]}
  },
  {
    concept: 'role',
    uni: {scenario: 'Wer ist für einen Schritt im Prozess einzutragen?', question: 'Welche Angabe ist eine gute Rolle?', options: [
      {text: 'Andrea Muster', correct: false, why: 'Eine Person wechselt Stellen oder ist abwesend. Eine Rolle beschreibt die Funktion, die die Arbeit übernimmt – auch in der Vertretung.'},
      {text: 'HR-Administration', correct: true, why: 'Eine Funktion oder ein Team. So bleibt der Prozess verständlich, auch wenn Personen wechseln.'},
      {text: 'Alle', correct: false, why: 'Wenn alle zuständig sind, fühlt sich oft niemand verantwortlich. Wer macht es tatsächlich?'}
    ]},
    pizza: {scenario: 'Wer backt die Pizza?', question: 'Was gehört ins Rollenfeld?', options: [
      {text: 'Küche', correct: true, why: 'Eine Rolle: Wer in der Küche arbeitet, übernimmt diesen Schritt.'},
      {text: 'Der Ofen', correct: false, why: 'Der Ofen ist ein Werkzeug, keine Rolle.'}
    ]}
  },
  {
    concept: 'handover',
    uni: {scenario: 'Die Organisation stellt Angaben zu einer Veranstaltung zusammen; danach erstellt die Kommunikation die Ankündigung.', question: 'Wo entsteht eine Übergabe?', options: [
      {text: 'Zwischen «Angaben zusammenstellen» und «Ankündigung erstellen»', correct: true, why: 'Hier wechselt die Rolle. An solchen Stellen ist wichtig, was genau übergeben wird und woran die Kommunikation erkennt, dass sie übernehmen soll.'},
      {text: 'Innerhalb von «Ankündigung erstellen»', correct: false, why: 'Innerhalb eines Schritts bleibt die Rolle gleich. Eine Übergabe entsteht beim Wechsel zwischen Rollen.'}
    ]},
    pizza: {scenario: 'Der Service nimmt die Bestellung auf, die Küche bereitet zu.', question: 'Wo ist die Übergabe?', options: [
      {text: 'Wenn der Bon vom Service an die Küche geht', correct: true, why: 'Genau: Die Rolle wechselt. Fehlt auf dem Bon der Sonderwunsch, merkt es die Küche erst beim Belegen.'},
      {text: 'Wenn die Pizza im Ofen ist', correct: false, why: 'Die Küche bleibt zuständig; hier wechselt keine Rolle.'}
    ]}
  },
  {
    concept: 'outcome',
    uni: {scenario: 'Ein Förderantrag wird vorbereitet.', question: 'Welches Ergebnis grenzt den Prozess klar ab?', options: [
      {text: 'Antrag ist fristgerecht eingereicht', correct: true, why: 'Ein prüfbarer Zustand am Ende. Daran lässt sich auch messen, ob eine Verbesserung wirkt.'},
      {text: 'Forschung ist gefördert', correct: false, why: 'Darauf hat der Prozess keinen direkten Einfluss; die Entscheidung trifft die Förderorganisation. Wähle ein Ergebnis, das ihr selbst erreicht.'},
      {text: 'Antrag schreiben', correct: false, why: 'Das ist eine Tätigkeit, kein Zustand am Ende.'}
    ]},
    pizza: {scenario: 'Wann ist Pietros Auftrag erledigt?', question: 'Was ist das Ergebnis?', options: [
      {text: 'Pizza ist übergeben', correct: true, why: 'Ein klarer Endzustand.'},
      {text: 'Pizza backen', correct: false, why: 'Das ist eine Tätigkeit auf dem Weg zum Ergebnis.'}
    ]}
  },
  {
    concept: 'exception',
    uni: {scenario: 'Bei der Aufnahme neuer Mitarbeitender fehlt in einem von zehn Fällen eine Arbeitsbewilligung.', question: 'Gehört dieser Fall auf die Karte?', options: [
      {text: 'Nein, er ist selten', correct: false, why: 'Gerade seltene Fälle kosten oft viel Zeit und sind schlecht bekannt. Wenn sie zum Ist-Ablauf gehören, gehören sie auf die Karte.'},
      {text: 'Ja, als eigener Weg nach einer Entscheidung', correct: true, why: 'Eine Ausnahme ist ein anderer Weg nach einer Entscheidung. So bleibt sichtbar, was in diesem Fall geschieht und wer handelt.'}
    ]},
    pizza: {scenario: 'Ein Gast bestellt glutenfrei.', question: 'Wie gehört das in den Ablauf?', options: [
      {text: 'Als Weg nach «Sonderwunsch vorhanden?»', correct: true, why: 'Richtig: Die Ausnahme bekommt einen eigenen Weg.'},
      {text: 'Gar nicht, das ist Pietros Problem', correct: false, why: 'Was nicht auf der Karte steht, wird bei Übergaben leicht vergessen.'}
    ]}
  }
];
