$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$files=@('build/qa/extended-audit/word-comments/document.docx','build/qa/upstream-parity/go-messy-reviewed.docx')
$word=$null;$results=@()
try {
 $word=New-Object -ComObject Word.Application
 $word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3
 foreach($file in $files){
	Write-Output ("Opening "+$file)
  $absolute=(Resolve-Path -LiteralPath $file).Path;$before=(Get-FileHash -LiteralPath $absolute).Hash;$doc=$null
  try{$doc=$word.Documents.Open($absolute,$false,$true,$false);$comments=$doc.Comments.Count;$revisions=$doc.Revisions.Count;if($comments -lt 2){throw "Expected numeric review comments in $file"};if($file.Contains('messy') -and $revisions -lt 3){throw 'Tracked edits missing'};$results += [ordered]@{file=$file;comments=$comments;revisions=$revisions;wordVersion=$word.Version;wordBuild=$word.Build;readOnly=$doc.ReadOnly}}
  finally{if($doc){$doc.Close(0);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc)}}
  if((Get-FileHash -LiteralPath $absolute).Hash -ne $before){throw 'Read-only verification modified DOCX'}
 }
}finally{if($word){$word.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)}}
$results | ConvertTo-Json -Depth 4 | Set-Content build/qa/word-annotation-verification.json
Write-Output 'PASS: hidden Word recognizes comments and tracked revisions; source files unchanged.'
