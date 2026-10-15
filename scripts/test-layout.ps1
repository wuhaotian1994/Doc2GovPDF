param([string]$Python='python',[string]$Folder='build/qa/layout-audit/final')
$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
New-Item -ItemType Directory -Force -Path $Folder | Out-Null
$auditRoot=(Resolve-Path -LiteralPath $Folder).Path
$env:GOMODCACHE=Join-Path (Get-Location) 'tmp/gomod'
$env:GOCACHE=Join-Path (Get-Location) 'tmp/gocache'
$savedAudit=$env:DOC2GOVPDF_VISUAL_AUDIT
$savedRender=$env:DOC2GOVPDF_RENDER_TEST
try {
    $env:DOC2GOVPDF_VISUAL_AUDIT=$auditRoot
    $env:DOC2GOVPDF_RENDER_TEST='1'
    go test ./internal/office -run 'TestVisualAuditCases|TestRenderUpstreamCorpus' -count=1
    if ($LASTEXITCODE -ne 0) { throw 'Document generation failed' }
} finally {
    $env:DOC2GOVPDF_VISUAL_AUDIT=$savedAudit
    $env:DOC2GOVPDF_RENDER_TEST=$savedRender
}
foreach ($doc in Get-ChildItem -LiteralPath 'testdata/upstream/gongwen-kit/docx' -Filter '*.docx') {
    $case=Join-Path $auditRoot ('source-'+$doc.BaseName)
    New-Item -ItemType Directory -Force -Path $case | Out-Null
    Copy-Item -LiteralPath $doc.FullName -Destination (Join-Path $case 'document.docx')
    Copy-Item -LiteralPath (Join-Path 'testdata/upstream/gongwen-kit/pdf' ($doc.BaseName+'.pdf')) -Destination (Join-Path $case 'reference.pdf')
    Copy-Item -LiteralPath (Join-Path 'build/qa/pdf' ($doc.BaseName+'.pdf')) -Destination (Join-Path $case 'go.pdf')
}
foreach ($item in (Get-Content -LiteralPath (Join-Path $auditRoot 'manifest.json') -Raw | ConvertFrom-Json)) {
    Copy-Item -LiteralPath (Join-Path 'testdata/upstream/gongwen-kit/pdf' ($item.reference+'.pdf')) -Destination (Join-Path (Join-Path $auditRoot $item.case) 'reference.pdf')
}
& (Join-Path $PSScriptRoot 'render-audit-word.ps1') -Folder $auditRoot -SkipCurrent
& $Python (Join-Path $PSScriptRoot 'audit-layout.py') $auditRoot
if ($LASTEXITCODE -ne 0) { throw 'Independent rendering failed' }
& $Python (Join-Path $PSScriptRoot 'layout-review-boards.py') $auditRoot
if ($LASTEXITCODE -ne 0) { throw 'Review boards failed' }
& $Python (Join-Path $PSScriptRoot 'verify-layout-audit.py') $auditRoot
if ($LASTEXITCODE -ne 0) { throw 'Content verification failed' }
& $Python (Join-Path $PSScriptRoot 'measure-layout.py') $auditRoot
if ($LASTEXITCODE -ne 0) { throw 'Geometry measurement failed' }
Write-Output 'Artifacts ready for every-page visual review. Script success is not visual acceptance.'
