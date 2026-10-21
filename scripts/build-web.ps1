param([string]$Output='dist/web')
$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$env:GOMODCACHE="$PWD/tmp/gomod";$env:GOCACHE="$PWD/tmp/gocache"
New-Item -ItemType Directory -Force -Path $Output | Out-Null
Copy-Item -Path web/* -Destination $Output -Recurse -Force
Copy-Item -LiteralPath web/index.html -Destination (Join-Path $Output 'advanced.html') -Force
Copy-Item -LiteralPath web/write.html -Destination (Join-Path $Output 'index.html') -Force
$writerHTML=Get-Content -LiteralPath web/write.html -Raw
$writerBoot=Get-Content -LiteralPath web/write-boot.js -Raw
$writerHTML=$writerHTML.Replace('<script src="write-boot.js"></script>',"<script>$writerBoot</script>")
[IO.File]::WriteAllText((Join-Path (Resolve-Path $Output).Path 'index.html'),$writerHTML,[Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath frontend/vendor -Destination $Output -Recurse -Force
Copy-Item -LiteralPath frontend/vendor/pdfjs/pdf.mjs -Destination (Join-Path $Output 'vendor/pdfjs/pdf.js') -Force
Copy-Item -LiteralPath frontend/vendor/pdfjs/pdf.worker.mjs -Destination (Join-Path $Output 'vendor/pdfjs/pdf.worker.js') -Force
Copy-Item -LiteralPath THIRD_PARTY_NOTICES.txt -Destination (Join-Path $Output 'THIRD_PARTY_NOTICES.txt')
$goRoot=(go env GOROOT).Trim()
Copy-Item -LiteralPath (Join-Path $goRoot 'lib/wasm/wasm_exec.js') -Destination (Join-Path $Output 'wasm_exec.js')
$oldOS=$env:GOOS;$oldArch=$env:GOARCH
try{$env:GOOS='js';$env:GOARCH='wasm';go build -trimpath -ldflags '-s -w' -o (Join-Path $Output 'document-engine.wasm') ./cmd/web;if($LASTEXITCODE -ne 0){throw 'WebAssembly build failed'}}finally{$env:GOOS=$oldOS;$env:GOARCH=$oldArch}
$wasm=Join-Path $Output 'document-engine.wasm'
$compressed=[IO.File]::Create($wasm+'.gz')
try{$gzip=[IO.Compression.GZipStream]::new($compressed,[IO.Compression.CompressionLevel]::SmallestSize);try{$gzip.Write([IO.File]::ReadAllBytes($wasm))}finally{$gzip.Dispose()}}finally{$compressed.Dispose()}
$assets=Get-ChildItem -LiteralPath $Output -File -Recurse | Where-Object { $_.Name -ne 'sw.js' -and $_.Extension -ne '.gz' } | Sort-Object FullName
$files=@('./')+@($assets | Where-Object {$_.FullName -ne (Join-Path (Resolve-Path $Output).Path 'index.html')} | ForEach-Object { './'+[IO.Path]::GetRelativePath((Resolve-Path $Output).Path,$_.FullName).Replace('\','/') })
$list=ConvertTo-Json -InputObject @($files) -Compress
$allHashes=($assets | ForEach-Object {(Get-FileHash -LiteralPath $_.FullName).Hash}) -join ''
$cache='gongwen-web-v2-'+[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($allHashes))).Substring(0,16)
@"
const CACHE='$cache',FILES=$list;
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(async()=>{if((await caches.keys()).some(k=>k.startsWith('gongwen-web-')&&!k.startsWith('gongwen-web-v2-')))await self.skipWaiting()})));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gongwen-web-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;e.respondWith(caches.open(CACHE).then(async c=>{const cached=(await c.match(e.request))||(e.request.mode==='navigate'?await c.match('./'):null);if(cached&&e.request.mode==='navigate'&&cached.redirected)return new Response(cached.body,{status:cached.status,statusText:cached.statusText,headers:cached.headers});return cached||fetch(e.request)}))});
"@ | Set-Content -LiteralPath (Join-Path $Output 'sw.js') -Encoding utf8
Write-Output "Static browser application built at $Output. No document server required."
