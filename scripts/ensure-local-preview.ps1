#requires -Version 7.0
param([ValidateRange(1,65535)][int]$Port=4173, [switch]$RefreshAssets)
$ErrorActionPreference='Stop'
$previewRoot=Split-Path -Parent $PSScriptRoot
$previewRuntime=Join-Path $previewRoot 'tmp/local-preview'
$previewAssets=Join-Path $previewRoot 'dist/local-preview'
$previewBinary=Join-Path $previewRuntime 'webserve.exe'
$previewURL="http://127.0.0.1:$Port"
New-Item -ItemType Directory -Path $previewRuntime -Force | Out-Null
Push-Location $previewRoot
try {
    if($RefreshAssets){ & (Join-Path $PSScriptRoot 'build-web.ps1') -Output $previewAssets; if($LASTEXITCODE -ne 0){throw 'Local preview build failed'} }
    if(!(Test-Path -LiteralPath (Join-Path $previewAssets 'index.html'))){throw 'No verified preview assets. Run this script with -RefreshAssets after validation.'}
    $previewListener=Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
    if($previewListener){
        $previewProcess=Get-Process -Id $previewListener.OwningProcess
        if($previewProcess.Path -ne $previewBinary -or $previewListener.LocalAddress -ne '127.0.0.1'){throw "Port $Port belongs to another process or listener; it was left untouched."}
    } else {
        if(!(Test-Path -LiteralPath $previewBinary)){
            $env:GOMODCACHE=Join-Path $previewRoot 'tmp/gomod';$env:GOCACHE=Join-Path $previewRoot 'tmp/gocache'
            & go build -o $previewBinary ./cmd/webserve
            if($LASTEXITCODE -ne 0){throw 'Local preview server build failed'}
        }
        $previewProcess=Start-Process -FilePath $previewBinary -ArgumentList @('-listen',"127.0.0.1:$Port",'-dir',('"'+$previewAssets+'"')) -WorkingDirectory $previewRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $previewRuntime 'stdout.log') -RedirectStandardError (Join-Path $previewRuntime 'stderr.log') -PassThru
    }
    $previewResponse=$null
    for($previewAttempt=0;$previewAttempt -lt 10;$previewAttempt++){
        try{$previewResponse=Invoke-WebRequest -Uri ($previewURL+'/') -NoProxy -TimeoutSec 3;break}catch{if($previewAttempt -eq 9){throw};Start-Sleep -Milliseconds 200}
    }
    if($previewResponse.StatusCode -ne 200){throw 'Local preview is not healthy'}
    $previewState=[ordered]@{url=$previewURL;pid=$previewProcess.Id;startedAt=$previewProcess.StartTime.ToUniversalTime().ToString('o');binary=$previewBinary;assets=$previewAssets;headAtCheck=(& git rev-parse HEAD);writeJSSHA256=(Get-FileHash -LiteralPath (Join-Path $previewAssets 'write.js')).Hash;engineWASMSHA256=(Get-FileHash -LiteralPath (Join-Path $previewAssets 'document-engine.wasm')).Hash;checkedAt=[DateTime]::UtcNow.ToString('o')}
    $previewState | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $previewRuntime 'state.json')
    Write-Output "Local preview ready: $previewURL (PID $($previewProcess.Id))"
} finally { Pop-Location }
