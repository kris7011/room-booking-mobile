# Fase 4A: Skift mellem lokal og hostet API under udvikling

Room Booking skal kunne bruges igen lokalt, selv hvis en betalt API-hosting
bliver opsagt. Backendens backup- og gendannelsesguide findes i
[meeting-room-booking/docs/local-portability.md](https://github.com/kris7011/meeting-room-booking/blob/feature/phase4a-portable-local-backup/docs/local-portability.md).

**Dette script er til Expo development builds og Metro.**
Den installerede Android-release har endnu ikke valg af server inde i appen:
`EXPO_PUBLIC_API_URL` læses ved bundling. En release-app skal derfor
genbygges til en anden URL, indtil der tilføjes et sikkert runtime-servervalg.

## Skift til lokal .NET API

Start først API'et fra backend-repository med `scripts/Start-Local.ps1`
og kontroller `http://localhost:5003/health`.

Kør fra mobilprojektets rodmappe:

```powershell
cd C:\Users\krisr\source\repos\room-booking-mobile-entra
.\scripts\Set-ApiTarget.ps1 -Mode Local

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb reverse tcp:5003 tcp:5003
& $adb reverse tcp:8081 tcp:8081
npx expo start --dev-client --clear --port 8081
```

Det kræver USB-tilslutning på din fysiske Samsung-telefon.
Bearer-tokens sendes kun over lokal development-HTTP via localhost/ADB,
ikke ubeskyttet HTTP på Wi-Fi. Microsoft-login kræver stadig internet.

## Skift til en HTTPS-hostet API

Når hosting er sat op og API'et kan nås med et gyldigt certifikat:

```powershell
.\scripts\Set-ApiTarget.ps1 -Mode Hosted -HostedUrl "https://api.example.com"
npx expo start --dev-client --clear --port 8081
```

Erstat eksemplets URL med din rigtige HTTPS-adresse. Scriptet afviser
HTTP-hosting og URL'er med brugeroplysninger, query eller fragment.

Scriptet ændrer kun `EXPO_PUBLIC_API_URL` i `.env.local`: Entra
client ID, scope og andre værdier bevares. Det ændrer ikke databasen og
flytter ikke nogen data.

## Før hostingen opsiges

1. Stop alle skrivninger på den hostede API.
2. Eksportér en **verificeret SQLite-backup**, og opbevar en kopi uden for
   hostingkontoen. Der er endnu ingen automatisk synkronisering.
3. Gendan den til en **ny databasefil** på PC'en med backendens restore-script.
4. Start API'et med den gendannede database og kontroller mødelokaler,
   bookinger og medlemsroller.
5. Skift denne udviklingsapp til `-Mode Local` og test på Samsung.
6. Opsig først hosting, når den lokale gendannelsestest er bestået.

**Vigtigt:** Hvis hostingen senere bruger PostgreSQL frem for SQLite, kræver
flytningen en særskilt eksport-/importfunktion. Backupværktøjet til SQLite
kan ikke direkte åbne en PostgreSQL-dump.

**Status:** Dette er skift af udviklingsmiljø, ikke en løsning til at lade
en almindelig distribueret Android-release vælge URL uden opdatering.
