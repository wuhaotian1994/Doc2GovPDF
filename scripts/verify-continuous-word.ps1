param([string]$QA='build/qa/continuous/chrome')
$ErrorActionPreference='Stop';$dest=(Resolve-Path $QA).Path;$results=@();$word=$null
try{
 $word=New-Object -ComObject Word.Application;$word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3
 foreach($name in @('clinic','admissions','native-untouched','native-edited')){
  $doc=$null
  try{
   Write-Output ('Opening verified download: '+$name)
   $file=Join-Path $dest ($name+'.docx');$doc=$word.Documents.Open($file,$false,$true,$false);$doc.Repaginate();$logical=[regex]::Replace($doc.Content.Text,'[\s\x07]','');$sample=$null
   if($name -eq 'native-edited'){$range=$doc.Content.Duplicate;if(!$range.Find.Execute('模拟待核')){throw 'Inserted text missing in native Word'};$sample=@{text=$range.Text;font=[string]$range.Font.NameFarEast;sizePt=[double]$range.Font.Size;page=[int]$range.Information(3)}}
   $sections=@();foreach($section in $doc.Sections){$sections+=@{orientation=[int]$section.PageSetup.Orientation;width=[double]$section.PageSetup.PageWidth;height=[double]$section.PageSetup.PageHeight}}
   $results+=[ordered]@{file=$name;wordVersion=$word.Version;sourceSHA256=(Get-FileHash -LiteralPath $file).Hash.ToLower();pages=$doc.ComputeStatistics(2);tables=$doc.Tables.Count;sections=$sections;sample=$sample;logicalCharacters=$logical.Length;logicalTextSHA256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($logical))).ToLower()}
   $doc.ExportAsFixedFormat((Join-Path $dest ($name+'.word.pdf')),17);ConvertTo-Json -InputObject @($results) -Depth 6|Set-Content -LiteralPath (Join-Path $dest 'word-native.json') -Encoding utf8;Write-Output ($name+' '+$doc.ComputeStatistics(2)+' native Word pages')
  }finally{if($doc){$doc.Close(0)}}
 }
}finally{if($word){$word.Quit()}}
