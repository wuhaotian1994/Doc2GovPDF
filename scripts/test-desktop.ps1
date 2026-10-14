$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$env:GOMODCACHE = Join-Path (Get-Location) 'tmp/gomod'
$env:GOCACHE = Join-Path (Get-Location) 'tmp/gocache'
New-Item -ItemType Directory -Force -Path 'tmp' | Out-Null
Set-Content -LiteralPath 'tmp/go.mod' -Value 'module doc2govpdf-cache'
go test ./...
if ($LASTEXITCODE -ne 0) { throw 'Go tests failed' }
go vet ./...
if ($LASTEXITCODE -ne 0) { throw 'Go vet failed' }
go run github.com/wailsapp/wails/v2/cmd/wails@v2.15.0 build -s -tags uitest -o Doc2GovPDF-test.exe -webview2 error
if ($LASTEXITCODE -ne 0) { throw 'Desktop test build failed' }
node scripts/smoke-desktop.mjs
if ($LASTEXITCODE -ne 0) { throw 'Desktop smoke tests failed' }
