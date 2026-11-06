$ErrorActionPreference='Stop'
$stationerySource=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stationeryDeploy=Join-Path (Split-Path -Parent $stationerySource) 'multi server'
$stationeryBackup=Join-Path $stationeryDeploy '.work\stationery-20261106-before'
New-Item -ItemType Directory -Path $stationeryBackup -Force | Out-Null
foreach($name in @('avatar-accessories.js','avatar-stationery.js')){
  $target=Join-Path $stationeryDeploy ('apps\study\web\'+$name)
  if((Test-Path -LiteralPath $target) -and -not(Test-Path -LiteralPath (Join-Path $stationeryBackup $name))){Copy-Item -LiteralPath $target -Destination (Join-Path $stationeryBackup $name)}
  Copy-Item -LiteralPath (Join-Path $stationerySource $name) -Destination $target -Force
}
foreach($name in @('avatar-catalog.js','focus-bonus.js')){
  $target=Join-Path $stationeryDeploy ('apps\study\backend\'+$name)
  if(-not(Test-Path -LiteralPath (Join-Path $stationeryBackup ('backend-'+$name)))){Copy-Item -LiteralPath $target -Destination (Join-Path $stationeryBackup ('backend-'+$name))}
  Copy-Item -LiteralPath (Join-Path $stationerySource ('functions\'+$name)) -Destination $target -Force
}
foreach($name in @('avatar-rpg.test.mjs','focus-bonus.test.mjs')){
  $target=Join-Path $stationeryDeploy ('tests\'+$name)
  if((Test-Path -LiteralPath $target) -and -not(Test-Path -LiteralPath (Join-Path $stationeryBackup $name))){Copy-Item -LiteralPath $target -Destination (Join-Path $stationeryBackup $name)}
  # Deployment tests use the same source with only repository-relative imports adapted.
  $text=[IO.File]::ReadAllText((Join-Path $stationerySource ('tests\'+$name)))
  $text=$text.Replace('../functions/','../apps/study/backend/').Replace('../avatar-','../apps/study/web/avatar-')
  [IO.File]::WriteAllText($target,$text,(New-Object Text.UTF8Encoding($false)))
}
& node (Join-Path $stationeryDeploy 'scripts\prepare-study-web.mjs')
if($LASTEXITCODE -ne 0){throw 'Browser helper preparation failed'}
Write-Output 'Staged stationery modules, catalog, operator bonus validation and matching tests; originals backed up.'
