param([string]$QA='build/qa/assembly/chrome')
$ErrorActionPreference='Stop';$dest=(Resolve-Path $QA).Path;$word=$null;$doc=$null;$rows=@()
try{
 $word=New-Object -ComObject Word.Application;$word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3
 foreach($name in @('safe','mixed','annex')){
  try{$file=Join-Path $dest ($name+'.docx');$doc=$word.Documents.Open($file,$false,$true,$false);$doc.Repaginate();$logical=[regex]::Replace($doc.Content.Text,'[\s\x07]','');$positions=@()
   foreach($text in @('模拟办公室',$(if($name -eq 'mixed'){'2022年10月22日'}else{'2026年10月22日'}),'说明：空白由接收方填写。')){$find=$doc.Content.Duplicate;if(!$find.Find.Execute($text)){throw ('Missing actual Word text: '+$text)};$positions+=@{text=$text;page=$find.Information(3)}}
   $rows+=[ordered]@{file=$name;wordVersion=$word.Version;sourceSHA256=(Get-FileHash -LiteralPath $file).Hash.ToLower();pages=$doc.ComputeStatistics(2);tables=$doc.Tables.Count;positions=$positions;logicalTextSHA256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($logical))).ToLower()};$doc.ExportAsFixedFormat((Join-Path $dest ($name+'.word.pdf')),17);$rows|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $dest 'word-native.json') -Encoding utf8;Write-Output ($name+' '+$doc.ComputeStatistics(2)+' actual Word pages')
  }finally{if($doc){$doc.Close(0);$doc=$null}}
 }
}finally{if($word){$word.Quit()}}
