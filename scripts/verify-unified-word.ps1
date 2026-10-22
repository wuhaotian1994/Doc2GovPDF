param([string]$QA='build/qa/unified-word/chrome')
$ErrorActionPreference='Stop'
$dest=(Resolve-Path $QA).Path;$results=@();$word=$null
try{
 $word=New-Object -ComObject Word.Application;$word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3
 foreach($name in @('blank-table','official-untouched','official-edited','legacy-resumed','legacy-compose')){
  $doc=$null
  try{
   $file=Join-Path $dest ($name+'.docx');$doc=$word.Documents.Open($file,$false,$true,$false);$doc.Repaginate()
   $sections=@();foreach($section in $doc.Sections){$sections+=@{orientation=[int]$section.PageSetup.Orientation;width=[double]$section.PageSetup.PageWidth;height=[double]$section.PageSetup.PageHeight}}
   $logical=[regex]::Replace($doc.Content.Text,'[\s\x07]','')
   $results+=[ordered]@{file=$name;wordVersion=$word.Version;sourceSHA256=(Get-FileHash -LiteralPath $file).Hash;pages=$doc.ComputeStatistics(2);tables=$doc.Tables.Count;sections=$sections;logicalCharacters=$logical.Length;logicalTextSHA256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($logical)))}
   $doc.ExportAsFixedFormat((Join-Path $dest ($name+'.word.pdf')),17)
   ConvertTo-Json -InputObject @($results) -Depth 6|Set-Content -LiteralPath (Join-Path $dest 'word-native.json')
   Write-Output ($name+' '+$doc.ComputeStatistics(2)+' native Word pages, '+$doc.Tables.Count+' tables')
  }finally{if($doc){$doc.Close(0)}}
 }
}finally{if($word){$word.Quit()}}
