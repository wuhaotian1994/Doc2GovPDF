param([string]$Installer='dist/Doc2GovPDF-0.2.0-setup.exe',[string]$CrashProbe='build/bin/Doc2GovPDF-upgradeprobe.exe')
$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$workspaceRoot=(Get-Location).Path
$testRoot=Join-Path $workspaceRoot ('tmp/install-tests/测试 安装-'+[Guid]::NewGuid().ToString('N'))
$installRoot=Join-Path $testRoot 'app'
$profile=Join-Path $testRoot 'profile'
if (-not ([IO.Path]::GetFullPath($testRoot)).StartsWith($workspaceRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Test path outside workspace' }
New-Item -ItemType Directory -Force -Path $testRoot,$profile | Out-Null
$installerPath=(Resolve-Path -LiteralPath $Installer).Path
function Install-TestApp {
    $errorLog=Join-Path $testRoot 'installer-stderr.txt'
    $p=Start-Process -FilePath $installerPath -ArgumentList "--silent --no-register --target `"$installRoot`"" -WindowStyle Hidden -Wait -PassThru -RedirectStandardError $errorLog
    if ($p.ExitCode -ne 0) { throw "Installer exit $($p.ExitCode): $(Get-Content -LiteralPath $errorLog -Raw)" }
}
function Test-AppRunning {
    $appPath=Join-Path $installRoot 'Doc2GovPDF.exe'
    return @(Get-CimInstance Win32_Process -Filter "Name='Doc2GovPDF.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.Equals($appPath,[StringComparison]::OrdinalIgnoreCase) }).Count -gt 0
}
function Stop-TestApp {
    $appPath=Join-Path $installRoot 'Doc2GovPDF.exe'
    Get-CimInstance Win32_Process -Filter "Name='Doc2GovPDF.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.Equals($appPath,[StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Wait-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
}
function Wait-Condition([scriptblock]$Condition,[string]$Message) {
    $deadline=[DateTime]::UtcNow.AddSeconds(25)
    while ([DateTime]::UtcNow -lt $deadline) { if (& $Condition) { return }; Start-Sleep -Milliseconds 150 }
    throw $Message
}
$previousData=$env:DOC2GOVPDF_DATA_DIR
$previousMode=$env:DOC2GOVPDF_TEST_MODE
try {
    $env:DOC2GOVPDF_DATA_DIR=$profile
    $env:DOC2GOVPDF_TEST_MODE='1'
    Install-TestApp
    $marker=Join-Path $installRoot '.doc2govpdf-install.json'
    $state=Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
    foreach ($file in $state.files.PSObject.Properties) { if ((Get-FileHash -LiteralPath (Join-Path $installRoot $file.Name)).Hash.ToLowerInvariant() -ne $file.Value) { throw 'Installed file digest mismatch' } }
    Set-Content -LiteralPath (Join-Path $installRoot '用户文档.txt') -Value '必须保留'
    if (Test-Path -LiteralPath build/qa/ui-fixture.json) {
        $fixture=Get-Content -LiteralPath build/qa/ui-fixture.json -Raw | ConvertFrom-Json
        [ordered]@{schema=1;name='升级前原始草稿';document=$fixture.model;ignored=@();actions=@()} | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $profile 'workspace.json')
    }
    Install-TestApp
    $launcher=Join-Path $installRoot 'Doc2GovPDF-launcher.exe'
    Start-Process -FilePath $launcher -WindowStyle Hidden | Out-Null
    Wait-Condition { -not (Test-Path -LiteralPath (Join-Path $installRoot '.pending-health')) } 'Upgrade health check did not complete'
    Stop-TestApp
    Install-TestApp
    [IO.File]::WriteAllBytes((Join-Path $installRoot 'Doc2GovPDF.exe'),[Text.Encoding]::ASCII.GetBytes('MZ-corrupt-test'))
    Start-Process -FilePath $launcher -WindowStyle Hidden | Out-Null
    Wait-Condition { -not (Test-Path -LiteralPath (Join-Path $installRoot '.pending-health')) } 'Failed launch did not roll back'
    if ((Get-FileHash -LiteralPath (Join-Path $installRoot 'Doc2GovPDF.exe')).Hash.ToLowerInvariant() -ne $state.files.'Doc2GovPDF.exe') { throw 'Rollback restored wrong application' }
    Wait-Condition { Test-AppRunning } 'Restored application did not restart'
    Stop-TestApp
    if (Test-Path -LiteralPath $CrashProbe) {
        Install-TestApp
        Copy-Item -LiteralPath $CrashProbe -Destination (Join-Path $installRoot 'Doc2GovPDF.exe') -Force
        Start-Process -FilePath $launcher -WindowStyle Hidden | Out-Null
        Wait-Condition { -not (Test-Path -LiteralPath (Join-Path $installRoot '.pending-health')) } 'Data-migration failure did not roll back'
        $restored=Get-Content -LiteralPath (Join-Path $profile 'workspace.json') -Raw | ConvertFrom-Json
        if ($restored.schema -ne 1 -or $restored.name -ne '升级前原始草稿') { throw 'Original user draft was not restored' }
        Wait-Condition { Test-AppRunning } 'Restored application did not restart after data recovery'
        Stop-TestApp
    }
    Start-Process -FilePath (Join-Path $installRoot 'Doc2GovPDF-maintenance.exe') -ArgumentList '--uninstall --silent --no-register' -WindowStyle Hidden -Wait | Out-Null
    Wait-Condition { -not (Test-Path -LiteralPath $marker) } 'Uninstall did not complete'
    if (-not (Test-Path -LiteralPath (Join-Path $installRoot '用户文档.txt'))) { throw 'Uninstall removed user document' }
    New-Item -ItemType Directory -Force -Path build/qa | Out-Null
    [ordered]@{passed=$true;testRoot=$testRoot;environment='Windows 11 host with existing WebView2; not a clean VM';dataRollbackTested=(Test-Path -LiteralPath $CrashProbe);checks=@('packaged installation','Chinese and space-containing path','installed file hashes','same-version reinstall','startup health check','failed-start rollback','user-data recovery when probe present','uninstall','user document retention')} | ConvertTo-Json | Set-Content -LiteralPath build/qa/install-result.json
    Write-Output 'PASS: installation, health check, rollback, uninstall and user-document retention.'
} finally {
    Stop-TestApp
    $env:DOC2GOVPDF_DATA_DIR=$previousData
    $env:DOC2GOVPDF_TEST_MODE=$previousMode
}
