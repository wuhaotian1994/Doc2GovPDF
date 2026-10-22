param([string]$QA='build/qa/native-format',[switch]$ReuseVerified)
$ErrorActionPreference='Stop'
$dest=(Resolve-Path $QA).Path;$results=@();$word=$null
if($ReuseVerified -and (Test-Path (Join-Path $dest 'word-native.json'))){$results=@(Get-Content (Join-Path $dest 'word-native.json') -Raw | ConvertFrom-Json)}
try{
 $word=New-Object -ComObject Word.Application;$word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3
 foreach($relative in @('chrome/untouched','before/edited','chrome/edited','chrome/legacy-restored','chrome/saved-new-admissions')){
  if($ReuseVerified){$prior=$results|Where-Object {$_.file -eq $relative};if($prior -and $prior.sourceSHA256 -eq (Get-FileHash -LiteralPath (Join-Path $dest ($relative+'.docx'))).Hash.ToLower() -and (Test-Path (Join-Path $dest ($relative+'.word.pdf')))){Write-Output ($relative+' exact source unchanged; kept existing native evidence');continue}}
  $results=@($results|Where-Object {$_.file -ne $relative})
  $doc=$null
  try{
   $file=Join-Path $dest ($relative+'.docx');$doc=$word.Documents.Open($file,$false,$true,$false);$doc.Repaginate()
   $logical=[regex]::Replace($doc.Content.Text,'[\s\x07]','')
   $sample=$null
   if($relative -like '*edited' -or $relative -like '*legacy-restored'){
    $range=$doc.Content.Duplicate;$found=$range.Find.Execute('模拟待核')
    if(!$found){throw 'Word cannot find inserted text'}
    $sample=[ordered]@{text=$range.Text;requestedFontFarEast=[string]$range.Font.NameFarEast;sizePt=[double]$range.Font.Size;page=[int]$range.Information(3);paragraphAlignment=[int]$range.ParagraphFormat.Alignment;firstLineIndentPt=[double]$range.ParagraphFormat.FirstLineIndent;lineSpacingRule=[int]$range.ParagraphFormat.LineSpacingRule;lineSpacingPt=[double]$range.ParagraphFormat.LineSpacing}
   }
   $empty=$null
   if($relative -eq 'chrome/untouched'){$cell=$doc.Tables.Item(1).Cell(4,5).Range;$empty=@{font=[string]$cell.Font.NameFarEast;sizePt=[double]$cell.Font.Size;text=$cell.Text}}
   $sections=@();foreach($section in $doc.Sections){$sections+=@{orientation=[int]$section.PageSetup.Orientation;width=[double]$section.PageSetup.PageWidth;height=[double]$section.PageSetup.PageHeight}}
   $results+=[ordered]@{file=$relative;wordVersion=$word.Version;sourceSHA256=(Get-FileHash -LiteralPath $file).Hash.ToLower();pages=$doc.ComputeStatistics(2);tables=$doc.Tables.Count;sections=$sections;sample=$sample;originalEmptyCell=$empty;logicalCharacters=$logical.Length;logicalTextSHA256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($logical))).ToLower()}
   $doc.ExportAsFixedFormat((Join-Path $dest ($relative+'.word.pdf')),17)
   ConvertTo-Json -InputObject @($results) -Depth 7|Set-Content -LiteralPath (Join-Path $dest 'word-native.json') -Encoding utf8
   Write-Output ($relative+' '+$doc.ComputeStatistics(2)+' native Word pages')
  }finally{if($doc){$doc.Close(0)}}
 }
}finally{if($word){$word.Quit()}}
