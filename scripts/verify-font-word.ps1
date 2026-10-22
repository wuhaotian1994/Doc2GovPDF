param([string]$QA='')
if(!$QA){$QA=if($env:FONT_ACCESS_OUTPUT){$env:FONT_ACCESS_OUTPUT}else{'build/qa/font-access'}}
$ErrorActionPreference='Stop';$dest=(Resolve-Path $QA).Path;$word=$null;$doc=$null;$records=@()
try{
 $word=New-Object -ComObject Word.Application;$word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3
 foreach($sample in @(@{name='chrome';expected='Noto Serif SC Black'},@{name='chrome-restored';expected='Noto Serif SC Black'},@{name='chrome-reopened';expected='Noto Serif SC Black'},@{name='chrome-fallback';expected='Doc2GovPDF Serif SC 3429e'})){
  $file=Join-Path $dest ($sample.name+'.docx');$beforeHash=(Get-FileHash -LiteralPath $file).Hash.ToLower();$doc=$word.Documents.Open($file,$false,$true,$false);$doc.Repaginate();$target=$doc.Content.Duplicate
  if(!$target.Find.Execute('请各科室核对库存12箱，编号A-17。')){throw 'Current body absent in actual Word'}
  if([double]$target.Font.Size -ne 16){throw 'Actual Word body size changed'}
  $result=[ordered]@{sample=$sample.name;wordVersion=$word.Version;sourceSHA256=$beforeHash;pages=$doc.ComputeStatistics(2);bodyText=$target.Text;declaredFarEastFont=[string]$target.Font.NameFarEast;bodySizePt=[double]$target.Font.Size;expectedDeclaration=$sample.expected;boundary='This is the Word font declaration, not proof of actual rendering identity. Builtin Word fallback uses an independently verified derived OFL family with PRC charset; selected NotoBlack declaration remains the real selected legacy ID1 and is not renamed. No user-font payload embedding is inferred. Other unavailable receiving fonts may substitute. No glyph equality or conformance claim.'}
  if($result.declaredFarEastFont -ne $sample.expected){throw ('Word reported an unexpected requested family for '+$sample.name)}
  $doc.ExportAsFixedFormat((Join-Path $dest ($sample.name+'.word.pdf')),17);$records+=$result;$doc.Close(0);$doc=$null
  if((Get-FileHash -LiteralPath $file).Hash.ToLower() -ne $beforeHash){throw ('Read-only Word open/export changed source bytes for '+$sample.name)}
  Write-Output ('Opened actual Word sample '+$sample.name+', '+$result.pages+' pages; declared body font '+$result.declaredFarEastFont)
 }
 [ordered]@{wordVersion=$word.Version;samples=$records;boundary='DOCX declaration and actual Word opening only. Inspect rendered PDF font resources and pages independently to report substitution.'}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $dest 'word-native.json') -Encoding utf8
}finally{if($doc){$doc.Close(0)};if($word){$word.Quit()}}
