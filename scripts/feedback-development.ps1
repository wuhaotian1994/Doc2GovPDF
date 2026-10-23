param(
 [string]$PostgresBin='C:/Program Files/PostgreSQL/13/bin',
 [int]$DatabasePort=55439,
 [int]$ServicePort=4187,
 [string]$StaticDir='dist/local-preview',
 [switch]$TestOnly,
 [switch]$Stop
)
$ErrorActionPreference='Stop'
$feedbackRoot=Split-Path -Parent $PSScriptRoot
$feedbackLocal=Join-Path $feedbackRoot 'tmp/feedback-development'
$feedbackData=Join-Path $feedbackLocal 'pg-data'
$feedbackPid=Join-Path $feedbackLocal 'feedbackd.pid'
New-Item -ItemType Directory -Force $feedbackLocal | Out-Null
$feedbackFull=[IO.Path]::GetFullPath($feedbackData)
if (-not $feedbackFull.StartsWith([IO.Path]::GetFullPath((Join-Path $feedbackRoot 'tmp'))+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Development data must remain in this workspace tmp directory'}
if ($Stop) {
 if(Test-Path -LiteralPath $feedbackPid){$feedbackServiceId=[int](Get-Content -LiteralPath $feedbackPid);$feedbackProc=Get-CimInstance Win32_Process -Filter "ProcessId=$feedbackServiceId";if($feedbackProc -and $feedbackProc.ExecutablePath -eq (Join-Path $feedbackLocal 'feedbackd.exe')){Stop-Process -Id $feedbackServiceId};Remove-Item -LiteralPath $feedbackPid}
 if(Test-Path -LiteralPath (Join-Path $feedbackData 'PG_VERSION')){& (Join-Path $PostgresBin 'pg_ctl.exe') -D $feedbackData -m fast -w stop}
 exit
}
foreach($feedbackProgram in @('initdb.exe','pg_ctl.exe','pg_isready.exe','createdb.exe','psql.exe')){if(-not(Test-Path -LiteralPath (Join-Path $PostgresBin $feedbackProgram))){throw "PostgreSQL program missing: $feedbackProgram"}}
if(-not(Test-Path -LiteralPath (Join-Path $feedbackData 'PG_VERSION'))){
 # This dedicated cluster accepts only local fictitious development material. Never use this trust profile for production.
 & (Join-Path $PostgresBin 'initdb.exe') -D $feedbackData -U feedback_dev --auth=trust --no-locale --encoding=UTF8
 if($LASTEXITCODE -ne 0){throw 'initdb failed'}
}
& (Join-Path $PostgresBin 'pg_isready.exe') -h 127.0.0.1 -p $DatabasePort -U feedback_dev -d postgres *> $null
if($LASTEXITCODE -ne 0){
 # Do not -Wait for pg_ctl: on Windows that can wait for the descendant server indefinitely.
 Start-Process -FilePath (Join-Path $PostgresBin 'pg_ctl.exe') -ArgumentList "-D `"$feedbackData`" -o `"-h 127.0.0.1 -p $DatabasePort`" -l `"$feedbackLocal/postgres.log`" -w start" -WindowStyle Hidden | Out-Null
 for($feedbackAttempt=0;$feedbackAttempt -lt 30;$feedbackAttempt++){Start-Sleep -Milliseconds 300;& (Join-Path $PostgresBin 'pg_isready.exe') -h 127.0.0.1 -p $DatabasePort -U feedback_dev -d postgres *> $null;if($LASTEXITCODE -eq 0){break}}
 if($LASTEXITCODE -ne 0){throw 'Isolated PostgreSQL failed to start'}
}
$feedbackActual=& (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p $DatabasePort -U feedback_dev -d postgres -At -c 'SHOW data_directory;'
if($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($feedbackActual.Trim()) -ne $feedbackFull){throw 'Port belongs to another PostgreSQL cluster; choose an unused port rather than changing it'}
foreach($feedbackDatabase in @('feedback_local','feedback_backend_test')){
 $feedbackExists=& (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p $DatabasePort -U feedback_dev -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname='$feedbackDatabase';"
 if($feedbackExists -ne '1'){& (Join-Path $PostgresBin 'createdb.exe') -h 127.0.0.1 -p $DatabasePort -U feedback_dev $feedbackDatabase;if($LASTEXITCODE -ne 0){throw 'Development database creation failed'}}
}
$env:GOMODCACHE=Join-Path $feedbackRoot 'tmp/gomod'
$env:GOCACHE=Join-Path $feedbackRoot 'tmp/gocache'
$env:FEEDBACK_TEST_DATABASE_URL="postgres://feedback_dev@127.0.0.1:$DatabasePort/feedback_backend_test?sslmode=disable"
Push-Location $feedbackRoot
try{
 go test -count=1 -v ./internal/feedback ./cmd/feedbackd
 if($LASTEXITCODE -ne 0){throw 'Feedback PostgreSQL tests failed'}
 if($TestOnly){exit}
 if(Test-Path -LiteralPath $feedbackPid){$feedbackExisting=Get-Process -Id ([int](Get-Content -LiteralPath $feedbackPid)) -ErrorAction SilentlyContinue;if($feedbackExisting){throw 'Feedback service already has a recorded process; stop it explicitly before rebuilding'}}
 go build -o (Join-Path $feedbackLocal 'feedbackd.exe') ./cmd/feedbackd
 if($LASTEXITCODE -ne 0){throw 'Feedback service build failed'}
 $feedbackTokenPath=Join-Path $feedbackLocal 'admin-token.txt'
 if(-not(Test-Path -LiteralPath $feedbackTokenPath)){$feedbackRandom=[byte[]]::new(32);$feedbackRng=[Security.Cryptography.RandomNumberGenerator]::Create();try{$feedbackRng.GetBytes($feedbackRandom)}finally{$feedbackRng.Dispose()};[Convert]::ToBase64String($feedbackRandom).TrimEnd('=').Replace('+','-').Replace('/','_') | Set-Content -LiteralPath $feedbackTokenPath -NoNewline}
 $env:FEEDBACK_DATABASE_URL="postgres://feedback_dev@127.0.0.1:$DatabasePort/feedback_local?sslmode=disable"
 $env:FEEDBACK_ADMIN_TOKEN=(Get-Content -LiteralPath $feedbackTokenPath -Raw).Trim()
 $env:FEEDBACK_ATTACHMENT_DIR=Join-Path $feedbackLocal 'private-attachments'
 $env:FEEDBACK_DEVELOPMENT='1'
 $env:FEEDBACK_ADDR="127.0.0.1:$ServicePort"
 $env:FEEDBACK_STATIC_DIR=[IO.Path]::GetFullPath((Join-Path $feedbackRoot $StaticDir))
 $feedbackChild=Start-Process -FilePath (Join-Path $feedbackLocal 'feedbackd.exe') -WorkingDirectory $feedbackRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $feedbackLocal 'service-out.log') -RedirectStandardError (Join-Path $feedbackLocal 'service-error.log') -PassThru
 $feedbackChild.Id|Set-Content -LiteralPath $feedbackPid
 for($feedbackAttempt=0;$feedbackAttempt -lt 30;$feedbackAttempt++){Start-Sleep -Milliseconds 300;try{$feedbackConfig=Invoke-RestMethod "http://127.0.0.1:$ServicePort/api/feedback/config";if($feedbackConfig.development -and $feedbackConfig.enabled){Write-Output "Fictitious-material feedback development service ready on loopback port $ServicePort";exit}}catch{}}
 throw 'Feedback service did not become ready; inspect ignored local logs'
}finally{Pop-Location;Remove-Item Env:FEEDBACK_ADMIN_TOKEN -ErrorAction SilentlyContinue}
