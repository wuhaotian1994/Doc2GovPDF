param([Parameter(Mandatory=$true)][string]$Folder)
$ErrorActionPreference='Stop'
$auditRoot=(Resolve-Path -LiteralPath $Folder).Path
$auditResults=@()
$auditWord=$null
try {
    $auditWord=New-Object -ComObject Word.Application
    $auditWord.Visible=$false
    $auditWord.DisplayAlerts=0
    $auditWord.AutomationSecurity=3
    foreach($auditFile in Get-ChildItem -LiteralPath $auditRoot -Filter '*.docx') {
        $auditDocument=$null
        try {
            $auditDocument=$auditWord.Documents.Open($auditFile.FullName,$false,$true,$false)
            $auditPDF=Join-Path $auditRoot ($auditFile.BaseName+'.word.pdf')
            $auditDocument.ExportAsFixedFormat($auditPDF,17)
            $auditResults += [ordered]@{file=$auditFile.Name;pdf=$auditPDF;pages=$auditDocument.ComputeStatistics(2);wordVersion=$auditWord.Version;sha256=(Get-FileHash -LiteralPath $auditFile.FullName).Hash}
        } finally {
            if($auditDocument){$auditDocument.Close(0);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($auditDocument)}
        }
    }
} finally {
    if($auditWord){$auditWord.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($auditWord)}
}
$auditResults | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $auditRoot 'word-render.json')
Write-Output "Verified $($auditResults.Count) DOCX files with hidden Word."
