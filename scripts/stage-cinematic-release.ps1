$ErrorActionPreference='Stop'
$cinematicSource=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$cinematicDeploy=Join-Path (Split-Path -Parent $cinematicSource) 'multi server'
$cinematicBackup=Join-Path $cinematicDeploy '.work\cinematic-20261106-before'
New-Item -ItemType Directory -Path $cinematicBackup -Force | Out-Null
foreach($name in @('avatar-cinematic.js','avatar-cinematic.css','avatar-renderer.js','avatar-shop.js','friend-card.js','room-residents.js','styles.css')){
  $target=Join-Path $cinematicDeploy ('apps\study\web\'+$name)
  if((Test-Path -LiteralPath $target) -and -not(Test-Path -LiteralPath (Join-Path $cinematicBackup $name))){Copy-Item -LiteralPath $target -Destination (Join-Path $cinematicBackup $name)}
  Copy-Item -LiteralPath (Join-Path $cinematicSource $name) -Destination $target -Force
}
$catalog=Join-Path $cinematicDeploy 'apps\study\backend\avatar-catalog.js'
if(-not(Test-Path -LiteralPath (Join-Path $cinematicBackup 'avatar-catalog.js'))){Copy-Item -LiteralPath $catalog -Destination (Join-Path $cinematicBackup 'avatar-catalog.js')}
Copy-Item -LiteralPath (Join-Path $cinematicSource 'functions\avatar-catalog.js') -Destination $catalog -Force
$testTarget=Join-Path $cinematicDeploy 'tests\avatar-rpg.test.mjs'
if(-not(Test-Path -LiteralPath (Join-Path $cinematicBackup 'avatar-rpg.test.mjs'))){Copy-Item -LiteralPath $testTarget -Destination (Join-Path $cinematicBackup 'avatar-rpg.test.mjs')}
$testText=[IO.File]::ReadAllText((Join-Path $cinematicSource 'tests\avatar-rpg.test.mjs')).Replace('../functions/','../apps/study/backend/').Replace('../avatar-','../apps/study/web/avatar-')
[IO.File]::WriteAllText($testTarget,$testText,(New-Object Text.UTF8Encoding($false)))
& node (Join-Path $cinematicDeploy 'scripts\prepare-study-web.mjs')
if($LASTEXITCODE -ne 0){throw 'Browser helper preparation failed'}
Write-Output 'Staged only cinematic effect modules, rendering/shop integration, catalog and matching test; originals preserved.'
