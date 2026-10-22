param([string]$QA='build/qa/font-access')
$ErrorActionPreference='Stop';$dest=(Resolve-Path $QA).Path;$word=$null;$doc=$null
try{
 $word=New-Object -ComObject Word.Application;$word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3
 $file=Join-Path $dest 'chrome.docx';$doc=$word.Documents.Open($file,$false,$true,$false);$doc.Repaginate();$target=$doc.Content.Duplicate
 if(!$target.Find.Execute('请各科室核对库存12箱，编号A-17。')){throw 'Current body absent in actual Word'}
 $result=[ordered]@{wordVersion=$word.Version;sourceSHA256=(Get-FileHash -LiteralPath $file).Hash.ToLower();pages=$doc.ComputeStatistics(2);bodyText=$target.Text;declaredFarEastFont=[string]$target.Font.NameFarEast;bodySizePt=[double]$target.Font.Size;boundary='Custom browser font is not embedded; actual Word depends on receiving environment. Not claiming equivalent glyphs or conformance.'}
 $doc.ExportAsFixedFormat((Join-Path $dest 'chrome.word.pdf'),17);$result|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $dest 'word-native.json') -Encoding utf8
 Write-Output ('Opened actual Word '+$result.pages+' pages; declared body font '+$result.declaredFarEastFont)
}finally{if($doc){$doc.Close(0)};if($word){$word.Quit()}}
