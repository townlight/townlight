$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or -not $env:ImageOS -or -not $env:GITHUB_REPOSITORY) { throw 'Unsafe host' }
$target = 'C:\Program Files\Microsoft Visual Studio\18'
$parent = 'C:\Program Files\Microsoft Visual Studio'
if ((Split-Path -Parent $target) -ne $parent) { throw 'Parent mismatch' }
$free = { ([IO.DriveInfo]::new('C:\')).AvailableFreeSpace }
$before = & $free
Write-Host "C: available before: $before bytes"
if ($before -ge 42GB) { Write-Host 'Already sufficient'; exit 0 }
$p = $target
while ($p) { $i = Get-Item -LiteralPath $p -Force; if (($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Reparse point: $p" }; $p = Split-Path -Parent $p }
$removed=0; $skipped=0
$stack=[Collections.Generic.Stack[string]]::new()
$stack.Push($target)
while($stack.Count -gt 0 -and [double](& $free) -lt 42GB){
  $dir=$stack.Pop()
  try{
    $a=[IO.File]::GetAttributes($dir)
    if(($a -band [IO.FileAttributes]::ReparsePoint) -or -not ($a -band [IO.FileAttributes]::Directory)){$skipped++;continue}
  }catch{$skipped++;continue}
  try{
    foreach($p in [IO.Directory]::EnumerateFileSystemEntries($dir)){
      try{
        $e=[IO.File]::GetAttributes($p)
        if($e -band [IO.FileAttributes]::ReparsePoint){$skipped++;continue}
        if($e -band [IO.FileAttributes]::Directory){$stack.Push($p)}
        else{
          try{[IO.File]::Delete($p);$removed++}catch{$skipped++}
        }
      }catch{$skipped++}
    }
  }catch{$skipped++}
}
Write-Host "removed=$removed skipped=$skipped freeBytes=$([double](& $free))"
$after = & $free
Write-Host "C: available after: $after bytes"
if ($after -lt 42GB) { throw "Insufficient C: available: $after bytes" }
