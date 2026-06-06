# Genere ZLAN_Regie.streamDeckProfile sur le bureau
# Modifie $SCENES ou $SERVER si besoin, puis relance.

$SERVER = "http://localhost:3456"
$SCENES = @("Jeu", "Transition", "Interlude", "BRB")

# Layout Stream Deck Mini (3 colonnes x 2 lignes) :
#   [0,0 Jeu]  [0,1 Transition]  [0,2 Interlude]
#   [1,0 BRB]  [1,1 POV Toggle]  [1,2 Score Z+1]

Add-Type -AssemblyName System.IO.Compression.FileSystem

$srcFile = "C:\Users\PA\Documents\projetsVSCode\zlan-regie\test.streamDeckProfile"
$outFile = "$env:USERPROFILE\Desktop\ZLAN_Regie.streamDeckProfile"

# ── Lecture du profil existant ────────────────────────────────────────────────
$zipIn = [System.IO.Compression.ZipFile]::OpenRead($srcFile)

$rootEntry = $zipIn.Entries | Where-Object { $_.FullName -match "^[^/]+\.sdProfile/manifest\.json$" } | Select-Object -First 1
$pageEntry = $zipIn.Entries | Where-Object { $_.FullName -match "\.sdProfile/Profiles/[^/]+/manifest\.json$" } | Select-Object -First 1

$r = New-Object System.IO.StreamReader($rootEntry.Open(), [System.Text.Encoding]::UTF8)
$rootJson = $r.ReadToEnd(); $r.Dispose()

$pageSubDir = $pageEntry.FullName -replace '^.+/Profiles/([^/]+)/manifest\.json$', '$1'
$zipIn.Dispose()

# ── Nouveau UUID + mise a jour du nom ─────────────────────────────────────────
$newUUID  = [System.Guid]::NewGuid().ToString().ToUpper()
$sdFolder = "$newUUID.sdProfile"

$newRootJson = $rootJson -replace '"Name"\s*:\s*"[^"]*"', '"Name":"ZLAN Regie 2026"'

# ── Construction des actions de page ──────────────────────────────────────────
function New-Action($name, $actionUUID, $settings, $title) {
    return [ordered]@{
        ActionID    = [System.Guid]::NewGuid().ToString()
        LinkedTitle = $false
        Name        = $name
        Settings    = $settings
        State       = 0
        States      = @([ordered]@{ Title = $title })
        UUID        = $actionUUID
    }
}

$OBS = "com.elgato.obsstudio.scene.switch"
$WEB = "com.elgato.streamdeck.system.website"

$actions = [ordered]@{
    "0,0" = New-Action $SCENES[0] $OBS @{ scene = $SCENES[0] } $SCENES[0]
    "0,1" = New-Action $SCENES[1] $OBS @{ scene = $SCENES[1] } $SCENES[1]
    "0,2" = New-Action $SCENES[2] $OBS @{ scene = $SCENES[2] } $SCENES[2]
    "1,0" = New-Action $SCENES[3] $OBS @{ scene = $SCENES[3] } $SCENES[3]
    "1,1" = New-Action "POV Toggle" $WEB @{ openInBrowser = $true; path = "$SERVER/sd/pov/toggle"   } "POV Toggle"
    "1,2" = New-Action "Score Z+1"  $WEB @{ openInBrowser = $true; path = "$SERVER/sd/score/us/up" } "Score Z+1"
}

$newPageJson = [ordered]@{
    Controllers = @([ordered]@{ Actions = $actions; Type = "Keypad" })
} | ConvertTo-Json -Depth 20

# ── Creation du ZIP avec separateurs forward-slash (standard ZIP) ──────────────
$utf8 = New-Object System.Text.UTF8Encoding($false)

if (Test-Path $outFile) { Remove-Item $outFile -Force }

$stream  = [System.IO.File]::Open($outFile, [System.IO.FileMode]::Create)
$archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create)

function Add-ZipEntry($archive, $entryName, $content, $encoding) {
    $entry  = $archive.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
    $writer = New-Object System.IO.StreamWriter($entry.Open(), $encoding)
    $writer.Write($content)
    $writer.Dispose()
}

Add-ZipEntry $archive "$sdFolder/manifest.json"                              $newRootJson $utf8
Add-ZipEntry $archive "$sdFolder/Profiles/$pageSubDir/manifest.json"         $newPageJson $utf8

$archive.Dispose()
$stream.Dispose()

Write-Host ""
Write-Host "  Profil genere : $outFile" -ForegroundColor Green
Write-Host "  Scenes : $($SCENES -join ' / ')" -ForegroundColor Cyan
Write-Host "  Import : Stream Deck > clic droit sur le profil > Importer" -ForegroundColor Cyan
Write-Host ""
