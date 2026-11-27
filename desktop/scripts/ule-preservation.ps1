function Get-UlePreservationManifest {
  param([Parameter(Mandatory=$true)][string]$ProfileRoot)
  $root = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $ProfileRoot -ErrorAction Stop).ProviderPath)
  $prefix = $root.TrimEnd([char[]]'\/') + [IO.Path]::DirectorySeparatorChar
  $rootItem = Get-Item -LiteralPath $root -Force -ErrorAction Stop
  if (-not $rootItem.PSIsContainer -or ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Preservation profile must be a real directory.'
  }
  $files = [Collections.Generic.List[object]]::new()
  foreach ($name in @('Data', 'config')) {
    $start = Get-Item -LiteralPath (Join-Path $root $name) -Force -ErrorAction Stop
    if (-not $start.PSIsContainer -or ($start.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw "Preservation tree must be a real directory: $name"
    }
    $before = $files.Count
    $pending = [Collections.Generic.Queue[string]]::new()
    $pending.Enqueue($start.FullName)
    while ($pending.Count -gt 0) {
      foreach ($item in @(Get-ChildItem -LiteralPath $pending.Dequeue() -Force -ErrorAction Stop)) {
        $full = [IO.Path]::GetFullPath($item.FullName)
        if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
          throw "Preservation path escaped profile: $full"
        }
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
          throw "Preservation cannot follow a reparse point: $full"
        }
        if ($item.PSIsContainer) {
          if ($item.Name -notin @('WebView', 'cache', 'caches', 'logs')) { $pending.Enqueue($full) }
        } else {
          $files.Add([pscustomobject]@{
            path = $full.Substring($prefix.Length).Replace('\', '/')
            size = [int64]$item.Length
            sha256 = (Get-FileHash -LiteralPath $full -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
          })
        }
      }
    }
    if ($files.Count -eq $before) { throw "Preservation tree has no authoritative files: $name" }
  }
  [pscustomobject]@{ profile_root = $root; files = @($files | Sort-Object path) }
}

function Assert-UlePreservationManifest {
  param([Parameter(Mandatory=$true)][string]$ProfileRoot, [Parameter(Mandatory=$true)]$Expected)
  $actual = Get-UlePreservationManifest -ProfileRoot $ProfileRoot
  if (-not [string]::Equals($actual.profile_root, [string]$Expected.profile_root, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Preservation manifest belongs to a different profile.'
  }
  $prior = @($Expected.files)
  if ($actual.files.Count -ne $prior.Count) { throw 'Preservation file count changed (missing or extra file).' }
  for ($index = 0; $index -lt $prior.Count; $index++) {
    $current = $actual.files[$index]
    $saved = $prior[$index]
    if ($current.path -cne $saved.path -or $current.size -ne [int64]$saved.size -or $current.sha256 -cne $saved.sha256) {
      throw "Preservation file changed: $($saved.path)"
    }
  }
  $actual
}
