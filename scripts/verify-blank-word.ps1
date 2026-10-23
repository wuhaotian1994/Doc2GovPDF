param([string]$QA='build/qa/blank-range/chrome')
$ErrorActionPreference='Stop';$dest=(Resolve-Path $QA).Path;$word=$null;$doc=$null
try{
 $word=New-Object -ComObject Word.Application;$word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3;$file=Join-Path $dest 'kept-blanks.docx';$doc=$word.Documents.Open($file,$false,$true,$false);$doc.Repaginate();$positions=@()
 foreach($text in @('模拟核对安排','说明：模拟记录只用于本地核验','接收方回执','注：未填写的事实由接收方补充')){$find=$doc.Content.Duplicate;if(!$find.Find.Execute($text)){throw ('Missing text '+$text)};$positions+=@{text=$text;page=$find.Information(3)}}
 $data=[ordered]@{wordVersion=$word.Version;sourceSHA256=(Get-FileHash -LiteralPath $file).Hash.ToLower();pages=$doc.ComputeStatistics(2);tables=$doc.Tables.Count;positions=$positions;logicalTextSHA256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes(([regex]::Replace($doc.Content.Text,'[\s\x07]',''))))).ToLower()}
 $doc.ExportAsFixedFormat((Join-Path $dest 'kept-blanks.word.pdf'),17);$data|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $dest 'word-native.json') -Encoding utf8;Write-Output ('Verified current Word '+$data.pages+' pages, two real tables')
}finally{if($doc){$doc.Close(0)};if($word){$word.Quit()}}
