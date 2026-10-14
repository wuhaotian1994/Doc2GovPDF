param([string]$Version='0.2.0',[string]$UpdateUrl='',[string]$PublicKey='',[switch]$Release,[switch]$LocalRelease)
$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version' }
if ($UpdateUrl -and ($UpdateUrl -notmatch '^https://\S+$')) { throw 'Update URL must use HTTPS' }
if ($PublicKey -and $PublicKey -notmatch '^[A-Za-z0-9+/]{43}=$') { throw 'Invalid Ed25519 public key' }
if ($Release -and (-not $UpdateUrl -or -not $PublicKey)) { throw 'Public release requires a production update URL and signing public key.' }
if ($LocalRelease -and ($Release -or $UpdateUrl -or $PublicKey)) { throw 'Local-only releases must not configure a public update endpoint.' }
$config=Get-Content -LiteralPath wails.json -Raw | ConvertFrom-Json
$config.info.productVersion=$Version
$config | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath wails.json
$env:GOMODCACHE=Join-Path (Get-Location) 'tmp/gomod'
$env:GOCACHE=Join-Path (Get-Location) 'tmp/gocache'
$flags="-X doc2govpdf/internal/release.Version=$Version"
if ($LocalRelease) { $flags += ' -X doc2govpdf/internal/release.Channel=local' }
if ($Release) { $flags += ' -X doc2govpdf/internal/release.Channel=public' }
if ($UpdateUrl) { $flags += " -X doc2govpdf/internal/release.UpdateURL=$UpdateUrl" }
if ($PublicKey) { $flags += " -X doc2govpdf/internal/release.PublicKey=$PublicKey" }
go run github.com/wailsapp/wails/v2/cmd/wails@v2.15.0 build -s -webview2 error -ldflags $flags
if ($LASTEXITCODE -ne 0) { throw 'App build failed' }
foreach ($name in @('launcher','maintenance','updater')) {
    go build -trimpath -ldflags "-H windowsgui -s -w $flags" -o "build/bin/Doc2GovPDF-$name.exe" "./cmd/$name"
    if ($LASTEXITCODE -ne 0) { throw "Build failed: $name" }
}
& (Join-Path $PSScriptRoot 'write-notices.ps1')
Copy-Item -LiteralPath THIRD_PARTY_NOTICES.txt -Destination build/bin/THIRD_PARTY_NOTICES.txt
Copy-Item -LiteralPath assets/fonts/OFL.txt -Destination build/bin/OFL.txt
Copy-Item -LiteralPath internal/office/data/LICENSE -Destination build/bin/GONGWEN-KIT-LICENSE.txt
$files=@('Doc2GovPDF.exe','Doc2GovPDF-launcher.exe','Doc2GovPDF-maintenance.exe','Doc2GovPDF-updater.exe','THIRD_PARTY_NOTICES.txt','OFL.txt','GONGWEN-KIT-LICENSE.txt') | ForEach-Object { Join-Path 'build/bin' $_ }
Compress-Archive -LiteralPath $files -DestinationPath cmd/setup/payload/app.zip -Force
$runtimePath='tmp/tooling/MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
if (-not(Test-Path -LiteralPath $runtimePath)) { throw 'Verified offline WebView2 installer is required' }
$signature=Get-AuthenticodeSignature -LiteralPath $runtimePath
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') { throw 'WebView2 signature validation failed' }
Copy-Item -LiteralPath $runtimePath -Destination cmd/setup/payload/MicrosoftEdgeWebView2RuntimeInstallerX64.exe
New-Item -ItemType Directory -Force -Path dist | Out-Null
go build -trimpath -ldflags "-H windowsgui -s -w $flags" -o "dist/Doc2GovPDF-$Version-setup.exe" ./cmd/setup
if ($LASTEXITCODE -ne 0) { throw 'Installer build failed' }
Copy-Item -LiteralPath THIRD_PARTY_NOTICES.txt -Destination dist/THIRD_PARTY_NOTICES.txt
Get-FileHash -LiteralPath "dist/Doc2GovPDF-$Version-setup.exe" -Algorithm SHA256 | Format-List
Write-Output 'Installer generated. This does not confirm publication, code signing, or a configured update service.'
