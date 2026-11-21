param([Parameter(Mandatory=$true)][string]$Checkout)
$ErrorActionPreference='Stop'
$script=Join-Path $Checkout 'desktop/scripts/test-installed-maintenance.ps1'
$text=[IO.File]::ReadAllText($script)
if(!$text.Contains('townlight-windows-v1.8.1.1') -or !$text.Contains('9e9363ec5119a2ee4c0d69b4dd40b21a535571a11eb3750d57b8a24d4472a5da')){throw 'Pinned installed harness no longer matches'}
$text=$text.Replace('1.8.1.1','1.8.2.1').Replace('9e9363ec5119a2ee4c0d69b4dd40b21a535571a11eb3750d57b8a24d4472a5da','b14b8dff9164f216fa4785a55df38c8a47e829837c0619220807602946d58f4b')
[IO.File]::WriteAllText($script,$text)
$test=Join-Path $Checkout 'desktop/tests/installed/maintenance.mjs'
$text=[IO.File]::ReadAllText($test)
$needle="  let recording;"
if(!$text.Contains($needle)){throw 'Harness backup anchor missing'}
$backup=@"
  if (mode==='seed') {
    accepted(await native('supervisor_action',{action:'backup',serviceId:null}));
    await save('seed-backup',{passed:true,before_upgrade:true});
  }
"@
$installedReadback=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'installed-readback.mjs'))
[IO.File]::WriteAllText($test,$text.Replace($needle,$installedReadback+"`n"+$backup+"`n"+$needle))
node --check $test
if($LASTEXITCODE){throw 'Patched acceptance harness has invalid syntax'}
