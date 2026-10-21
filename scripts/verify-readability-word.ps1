param([string]$Folder='build/qa/readability')
$ErrorActionPreference='Stop';$qa=(Resolve-Path -LiteralPath $Folder).Path;$rows=@();$word=$null
function Find-Page($doc,[string]$text){$range=$doc.Content.Duplicate;$range.Find.ClearFormatting();$range.Find.Text=$text;$range.Find.Forward=$true;$range.Find.Wrap=0;$range.Find.MatchWildcards=$false;if(!$range.Find.Execute()){throw 'Expected source text not found by native Word'};$range.Collapse(1);return [int]$range.Information(3)}
try{$word=New-Object -ComObject Word.Application;$word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3;$version=$word.Version
 foreach($phase in @('before','after')){foreach($name in @('education','composite')){$doc=$null;try{$file=Join-Path $qa ('word/'+$phase+'-'+$name+'.docx');$model=Get-Content -LiteralPath (Join-Path $qa ('before/'+$name+'/model.json')) -Raw | ConvertFrom-Json;$doc=$word.Documents.Open($file,$false,$true,$false);$doc.Repaginate();$checks=@()
  if($name -eq 'education'){
   $map=[ordered]@{mainHeading=(Find-Page $doc '三、活动要求');firstBody=(Find-Page $doc '（一）认真组织领导。');date=(Find-Page $doc '2024年6月28日');publicNote=(Find-Page $doc '（此件公开发布）')}
   if($phase -eq 'after' -and ($map.mainHeading -ne $map.firstBody -or $map.date -ne $map.publicNote)){throw 'Native Word heading/body or date/note still split'}
  }else{
   for($i=0;$i -lt $model.blocks.Count;$i++){$paragraph=$model.blocks[$i].paragraph;if($paragraph -and $paragraph.role -eq 'heading'){$next=$model.blocks[$i+1].paragraph.text.Trim();$headPage=Find-Page $doc $paragraph.text.Trim();$bodyPage=Find-Page $doc $next.Substring(0,[Math]::Min(24,$next.Length));$checks += [ordered]@{heading=$paragraph.text.Trim();headingPage=$headPage;contentPage=$bodyPage};if($phase -eq 'after' -and $headPage -ne $bodyPage){throw 'Native Word section heading still orphaned'}}};$map=[ordered]@{sections=$checks}
  }
  $logical=[regex]::Replace($doc.Content.Text,'[\s\x07]','');$logicalHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($logical)));$rows += [ordered]@{logicalCharacters=$logical.Length;logicalTextSHA256=$logicalHash;file=($phase+'-'+$name+'.docx');wordVersion=$version;pages=$doc.ComputeStatistics(2);sourceSHA256=(Get-FileHash -LiteralPath $file).Hash;pageMap=$map};$rows | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $qa 'word/native-pagination.json');Write-Output ($phase+' '+$name+' native positions verified')
 }finally{if($doc){try{$doc.Close(0)}catch{Write-Output ('Document cleanup: '+$_.Exception.Message)}}}}}
}finally{if($word){try{$word.Quit()}catch{Write-Output ('Word cleanup: '+$_.Exception.Message)}}}
