param([Parameter(Mandatory=$true)][string]$Folder,[switch]$SkipCurrent)
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath $Folder).Path
$results=@();$word=$null
try {
    $word=New-Object -ComObject Word.Application
    $word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3
    foreach ($file in (Get-ChildItem -LiteralPath $root -Filter '*.docx' -Recurse)) {
        $pdf=Join-Path $file.DirectoryName 'word.pdf'
        $digest=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
        $stamp=Join-Path $file.DirectoryName '.word-source.sha256'
        if ($SkipCurrent -and (Test-Path -LiteralPath $pdf) -and (Test-Path -LiteralPath $stamp) -and (Get-Content -LiteralPath $stamp -Raw).Trim() -eq $digest) { continue }
        $doc=$null
        try {
            $doc=$word.Documents.Open($file.FullName,$false,$true,$false)
            $doc.ExportAsFixedFormat($pdf,17)
            Set-Content -LiteralPath $stamp -Value $digest
            $results += [ordered]@{file=$file.FullName;pdf=$pdf;pages=$doc.ComputeStatistics(2);wordVersion=$word.Version}
            Write-Output ("Rendered "+$file.Directory.Name+" ("+$doc.ComputeStatistics(2)+" pages)")
        } finally {if($doc){$doc.Close(0);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc)}}
    }
} finally {if($word){$word.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)}}
$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $root 'word-render.json')
Write-Output "Rendered $($results.Count) DOCX files with hidden Word. No input automation used."
