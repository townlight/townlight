function Start-UleOwnedDesktop {
  param([string]$Exe)
  $deadline = (Get-Date).AddSeconds(10)
  while (Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue) {
    if ((Get-Date) -ge $deadline) {
      throw 'Port 9222 is still occupied by a listener after 10 seconds.'
    }
    Start-Sleep -Milliseconds 100
  }
  $prior = [Environment]::GetEnvironmentVariable('TOWNLIGHT_SUPPRESS_OPEN_BROWSER')
  [Environment]::SetEnvironmentVariable('TOWNLIGHT_SUPPRESS_OPEN_BROWSER', '1')
  try {
    return Start-Process -FilePath $Exe -WindowStyle Hidden -PassThru
  } finally {
    [Environment]::SetEnvironmentVariable('TOWNLIGHT_SUPPRESS_OPEN_BROWSER', $prior)
  }
}