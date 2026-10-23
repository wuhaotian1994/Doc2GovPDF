param([string]$QA='build/qa/system-fonts')
$ErrorActionPreference='Stop'
$folder=(Resolve-Path $QA).Path
$file=Join-Path $folder 'configured.docx'
$before=(Get-FileHash -LiteralPath $file).Hash
$word=$null;$doc=$null
try{
  $word=New-Object -ComObject Word.Application
  $word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3
  $doc=$word.Documents.Open($file,$false,$true,$false)
  $doc.Repaginate();$range=$doc.Content.Duplicate
  if(!$range.Find.Execute('第1段正文')){throw 'Expected synthetic body absent in Word'}
  if([double]$range.Font.Size -ne 16){throw 'Unexpected body font size'}
  $family=[string]$range.Font.NameFarEast
  if($family -notmatch 'FangSong|仿宋'){throw "Unexpected declared body font: $family"}
  $pages=$doc.ComputeStatistics(2)
  $doc.ExportAsFixedFormat((Join-Path $folder 'configured.word.pdf'),17)
  [ordered]@{wordVersion=$word.Version;pages=$pages;bodyFont=$family;bodySizePt=[double]$range.Font.Size;sourceSHA256=$before;boundary='Website-provided fonts embedded in DOCX; real Word read-only rendering checked. Not a complete national-standard conformance claim.'}|ConvertTo-Json|Set-Content (Join-Path $folder 'word-native.json')
  $doc.Close(0);$doc=$null
  if((Get-FileHash -LiteralPath $file).Hash -ne $before){throw 'Original DOCX changed during read-only verification'}
  Write-Output "PASS Word $pages pages, body $family 16pt; original unchanged"
}finally{if($doc){$doc.Close(0)};if($word){$word.Quit()}}
