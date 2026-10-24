param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Local', 'Hosted')]
    [string]$Mode,

    [string]$HostedUrl
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$file = Join-Path $root '.env.local'

if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw 'Missing .env.local. Copy .env.example to .env.local and configure Microsoft Entra first.'
}

if ($Mode -eq 'Hosted') {
    $parsed = $null
    if ([string]::IsNullOrWhiteSpace($HostedUrl) -or
        -not [System.Uri]::TryCreate($HostedUrl, [System.UriKind]::Absolute, [ref]$parsed) -or
        $parsed.Scheme -ne 'https' -or
        $parsed.UserInfo -or
        $parsed.Query -or
        $parsed.Fragment) {
        throw 'HostedUrl must be an HTTPS API base URL without credentials, query or fragment.'
    }
    $target = $HostedUrl.Trim().TrimEnd('/')
}
else {
    if ($HostedUrl) { throw 'Do not supply -HostedUrl in Local mode.' }
    # For the physical Samsung device with USB adb reverse tcp:5003 tcp:5003.
    $target = 'http://localhost:5003'
}

# Preserve the existing Microsoft Entra client ID, scope and other settings.
# EXPO_PUBLIC_ values are NOT secrets; do not put passwords in .env.local.
$lines = [System.IO.File]::ReadAllLines($file)
$found = 0
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^\s*EXPO_PUBLIC_API_URL\s*=') {
        $lines[$i] = 'EXPO_PUBLIC_API_URL=' + $target
        $found++
    }
}
if ($found -gt 1) { throw 'More than one EXPO_PUBLIC_API_URL found in .env.local. Fix duplicates first.' }
if ($found -eq 0) { $lines = @($lines) + ('EXPO_PUBLIC_API_URL=' + $target) }
[System.IO.File]::WriteAllLines($file, $lines, [System.Text.UTF8Encoding]::new($false))

Write-Host "Room Booking API target ($Mode): $target"
Write-Host 'Restart Metro with: npx expo start --dev-client --clear --port 8081'
Write-Host 'This is a development setting. A released Android build requires a rebuild for a different API URL.'
