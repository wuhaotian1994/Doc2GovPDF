$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$env:GOMODCACHE = Join-Path (Get-Location) 'tmp/gomod'
$env:GOCACHE = Join-Path (Get-Location) 'tmp/gocache'
New-Item -ItemType Directory -Force -Path 'tmp' | Out-Null
Set-Content -LiteralPath 'tmp/go.mod' -Value 'module doc2govpdf-cache'
go run github.com/wailsapp/wails/v2/cmd/wails@v2.15.0 build -clean -s -webview2 error
if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed' }
& (Join-Path $PSScriptRoot 'write-notices.ps1')
Copy-Item -LiteralPath 'THIRD_PARTY_NOTICES.txt' -Destination 'build/bin/THIRD_PARTY_NOTICES.txt'
