param([Parameter(Mandatory=$true)][string]$Runner,[Parameter(Mandatory=$true)][string]$Package,[Parameter(Mandatory=$true)][string]$TrustedKey)
$ErrorActionPreference='Stop'
$testRoot=Join-Path ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\tmp'))) ('recovery-tests-'+[guid]::NewGuid().ToString('N'))
$failed='0.1.5-world-smooth-20261106-r2','0.1.5-world-smooth-20261106-r3'
function New-Fixture([string]$Name,[string]$Active='active-safe',[string]$Code='0x80070070'){
 $fixture=Join-Path $testRoot $Name
 foreach($folder in @('state','inbox','data','backups','releases\active-safe')+@($failed | ForEach-Object {"releases\$_"})){
  New-Item -ItemType Directory -Path (Join-Path $fixture $folder) -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $fixture "$folder\sentinel") -Value 'preserve'
 }
 Set-Content -LiteralPath (Join-Path $fixture 'active.json') -Value (@{version=$Active}|ConvertTo-Json -Compress)
 Set-Content -LiteralPath (Join-Path $fixture 'state\last-update.json') -Value (@{ok=$false;stage='payload-extract';errorCode=$Code}|ConvertTo-Json -Compress)
 Copy-Item -LiteralPath $Package -Destination (Join-Path $fixture 'inbox\update.msrelease')
 Copy-Item -LiteralPath $TrustedKey -Destination (Join-Path $fixture 'trusted-key.pem')
 return $fixture
}
function Invoke-Recovery([string]$Fixture){
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=[IO.Path]::GetFullPath($Runner)
 $info.Arguments='--update "'+(Join-Path $Fixture 'inbox\update.msrelease')+'"'
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.EnvironmentVariables['MULTISERVER_ROOT']=$Fixture
 $process=[Diagnostics.Process]::Start($info)
 if(-not $process.WaitForExit(30000)){throw 'Recovery test timed out'}
 return $process.ExitCode
}
$valid=New-Fixture 'valid'
if((Invoke-Recovery $valid) -ne 0){throw 'Valid recovery failed'}
foreach($version in $failed){if(Test-Path -LiteralPath (Join-Path $valid "releases\$version")){throw 'Failed release was not removed'}}
foreach($path in 'data\sentinel','backups\sentinel','releases\active-safe\sentinel'){
 if(-not(Test-Path -LiteralPath (Join-Path $valid $path))){throw "Preserved path changed: $path"}
}
if((Get-Content -LiteralPath (Join-Path $valid 'active.json') -Raw|ConvertFrom-Json).version -ne 'active-safe'){throw 'Active pointer changed'}
$active=New-Fixture 'active-guard' $failed[0]
if((Invoke-Recovery $active) -eq 0){throw 'Active target was accepted'}
foreach($version in $failed){if(-not(Test-Path -LiteralPath (Join-Path $active "releases\$version\sentinel"))){throw 'Active guard deleted a target'}}
$wrong=New-Fixture 'failure-guard' 'active-safe' '0x80070020'
if((Invoke-Recovery $wrong) -eq 0){throw 'Unrelated failure was accepted'}
foreach($version in $failed){if(-not(Test-Path -LiteralPath (Join-Path $wrong "releases\$version\sentinel"))){throw 'Failure guard deleted a target'}}
Write-Output 'PASS: failed artifacts removed; active release, data and backups preserved; active-target and unrelated-error guards reject safely.'
Write-Output "Fixtures: $testRoot"
