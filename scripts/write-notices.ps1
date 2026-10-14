$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$notice = [System.Text.StringBuilder]::new()
[void]$notice.AppendLine('Doc2GovPDF third-party notices')
[void]$notice.AppendLine('This file records licenses for the Go packages linked into the desktop application.')
[void]$notice.AppendLine('The development-only Impeccable skill has its own LICENSE and NOTICE.md under .agents/skills/impeccable.')
$modules = go list -deps -tags production -f '{{with .Module}}{{.Path}}|{{.Version}}|{{.Dir}}{{end}}' . | Where-Object { $_ } | Sort-Object -Unique
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve dependency license locations' }
foreach ($entry in $modules) {
    $parts = $entry -split '\|', 3
    if ($parts[0] -eq 'doc2govpdf') { continue }
    if ($parts.Count -ne 3 -or -not $parts[2]) { throw "Missing module source for $($parts[0])" }
    $licenses = Get-ChildItem -LiteralPath $parts[2] -File | Where-Object { $_.Name -match '^(LICENSE|COPYING|NOTICE)([.\-_].*)?$' }
    if (-not $licenses) { throw "Missing license for $($parts[0])" }
    [void]$notice.AppendLine("`n===== $($parts[0]) $($parts[1]) =====")
    foreach ($license in $licenses) { [void]$notice.AppendLine((Get-Content -LiteralPath $license.FullName -Raw)) }
}
$goRoot = go env GOROOT
foreach ($extra in @('frontend/vendor/pdfjs/LICENSE','assets/fonts/OFL.txt','internal/office/data/LICENSE')) {
    [void]$notice.AppendLine("`n===== $extra =====")
    [void]$notice.AppendLine((Get-Content -LiteralPath $extra -Raw))
}
[void]$notice.AppendLine("`n===== Go standard library =====")
[void]$notice.AppendLine((Get-Content -LiteralPath (Join-Path $goRoot 'LICENSE') -Raw))
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'THIRD_PARTY_NOTICES.txt'), $notice.ToString(), [System.Text.UTF8Encoding]::new($false))
