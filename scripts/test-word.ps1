$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$folder=(Resolve-Path -LiteralPath 'build/qa/templates').Path
$out=Join-Path $folder 'word'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$word=$null
$results=@()
try {
    $word=New-Object -ComObject Word.Application
    $word.Visible=$false
    $word.DisplayAlerts=0
    $word.AutomationSecurity=3
    foreach ($file in (Get-ChildItem -LiteralPath $folder -Filter '*.docx')) {
        $doc=$null
        try {
            $doc=$word.Documents.Open($file.FullName,$false,$true,$false)
            $doc.ExportAsFixedFormat((Join-Path $out ($file.BaseName+'.pdf')),17)
            $results += [ordered]@{file=$file.Name;opened=$true;pages=$doc.ComputeStatistics(2);wordVersion=$word.Version}
        } finally { if ($doc) { $doc.Close(0); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc) } }
    }
} finally { if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) } }
$results | ConvertTo-Json | Set-Content -LiteralPath build/qa/word-validation.json
Write-Output "PASS: $($results.Count) generated documents opened and rendered by Microsoft Word."
