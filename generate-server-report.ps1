# NovaCiv Server Report Generator (PowerShell) - hardened version

$ErrorActionPreference = "Continue"
$TS  = (Get-Date).ToUniversalTime().ToString("yyyyMMdd_HHmmss")
$OUT = Join-Path $HOME "novaciv_server_report_${TS}.txt"

$Report = New-Object System.Collections.Generic.List[string]

function Add-Line($s="") { [void]$Report.Add($s) }
function Add-Block($title) { Add-Line ""; Add-Line $title }

Add-Line "=== NovaCiv Server Report ==="
Add-Line ("UTC time: " + (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss 'UTC'"))
Add-Line ("Host: " + $env:COMPUTERNAME)
Add-Line ("User: " + $env:USERNAME)
Add-Line ""

Add-Line "## System"
try {
  $os = Get-CimInstance Win32_OperatingSystem
  Add-Line ("OS: " + $os.Caption)
  Add-Line ("Version: " + $os.Version)
  Add-Line ("Architecture: " + $os.OSArchitecture)
} catch { Add-Line ("OS info unavailable: " + $_) }

Add-Line ""
try {
  Add-Line "Uptime:"
  $bootTime = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
  $uptime = (Get-Date) - $bootTime
  Add-Line ("  Last boot: " + $bootTime)
  Add-Line ("  Days up: {0:N2}, Hours: {1:N2}" -f $uptime.TotalDays, $uptime.TotalHours)
} catch { Add-Line ("Uptime unavailable: " + $_) }

Add-Line ""
Add-Line "Disk:"
try {
  Get-CimInstance Win32_LogicalDisk | ForEach-Object {
    if ($_.Size -and $_.FreeSpace) {
      $SizeGB = [math]::Round($_.Size / 1GB, 2)
      $FreeGB = [math]::Round($_.FreeSpace / 1GB, 2)
      $UsedGB = [math]::Round(($_.Size - $_.FreeSpace) / 1GB, 2)
      $Percent = [math]::Round((($_.Size - $_.FreeSpace) / $_.Size) * 100, 1)
      Add-Line ("  {0} {1} GB total, {2} GB used ({3}%), {4} GB free" -f $_.DeviceID, $SizeGB, $UsedGB, $Percent, $FreeGB)
    }
  }
} catch { Add-Line ("Disk info unavailable: " + $_) }

Add-Line ""
Add-Line "Memory:"
try {
  $TotalRAM = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 2)
  $FreeRAM  = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB, 2)
  $UsedRAM  = $TotalRAM - $FreeRAM
  Add-Line ("  Total: {0} GB, Used: {1} GB, Free: {2} GB" -f $TotalRAM, $UsedRAM, $FreeRAM)
} catch { Add-Line ("Memory info unavailable: " + $_) }

Add-Line ""
Add-Line "Top processes (CPU):"
try {
  Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 Id,ProcessName,CPU,WorkingSet64 | ForEach-Object {
    $WSMB = [math]::Round($_.WorkingSet64 / 1MB, 2)
    Add-Line ("  PID {0} {1} CPU: {2} WS: {3} MB" -f $_.Id, $_.ProcessName, $_.CPU, $WSMB)
  }
} catch { Add-Line ("Process info unavailable: " + $_) }

Add-Line ""
Add-Line "## Network"
try {
  Add-Line "Network Adapters (IPv4):"
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -and $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    ForEach-Object { Add-Line ("  {0} ({1})" -f $_.IPAddress, $_.InterfaceAlias) }
} catch { Add-Line ("Network info unavailable: " + $_) }

Add-Line ""
Add-Line "Listening ports (first 30):"
try {
  Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Select-Object LocalAddress,LocalPort,OwningProcess |
    Sort-Object LocalPort -Unique |
    Select-Object -First 30 |
    ForEach-Object {
      $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
      $ProcName = if ($p) { $p.ProcessName } else { "?" }
      Add-Line ("  {0}:{1} (PID: {2}, {3})" -f $_.LocalAddress, $_.LocalPort, $_.OwningProcess, $ProcName)
    }
} catch { Add-Line ("Port info unavailable: " + $_) }

Add-Line ""
Add-Line "## Node / PM2"
function Try-Run($cmd, $args) {
  try {
    $c = Get-Command $cmd -ErrorAction SilentlyContinue
    if (-not $c) { return "not found" }
    $out = & $cmd @args 2>&1
    if ($out) { return ($out | Out-String).Trim() }
    return "ok"
  } catch { return "failed: $_" }
}

$nodeVersion = Try-Run node @("-v")
$npmVersion  = Try-Run npm  @("-v")
$pnpmVersion = Try-Run pnpm @("-v")
$pm2Exists   = [bool](Get-Command pm2 -ErrorAction SilentlyContinue)
$pm2Version  = if ($pm2Exists) { (Try-Run pm2 @("-v")) } else { "not found" }

Add-Line ("node: " + $nodeVersion)
Add-Line ("npm:  " + $npmVersion)
Add-Line ("pnpm: " + $pnpmVersion)
Add-Line ("pm2:  " + $pm2Version)
Add-Line ""

if ($pm2Exists) {
  try {
    Add-Line "-- pm2 list --"
    (pm2 list 2>&1) | ForEach-Object { Add-Line ("  " + $_) }
    Add-Line ""

    $pm2Raw = (pm2 jlist 2>&1 | Out-String)
    $pm2Json = $pm2Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($pm2Json) {
      Add-Line "-- pm2 describe (all) --"
      foreach ($proc in $pm2Json) {
        Add-Line ("### pm2 describe " + $proc.name)
        (pm2 describe $proc.name 2>&1) | ForEach-Object { Add-Line ("  " + $_) }
        Add-Line ""
      }
    } else {
      Add-Line "pm2 jlist returned non-JSON output (cannot enumerate processes)."
      Add-Line $pm2Raw
      Add-Line ""
    }
  } catch {
    Add-Line ("PM2 commands failed: " + $_)
  }
} else {
  Add-Line "PM2 not installed."
}
Add-Line ""

Add-Line "## Repo / Project folders"
Add-Line ("PWD: " + (Get-Location))
Add-Line ""

Add-Line ("-- Candidates in {0} (NovaCiv-ish) --" -f $HOME)
try {
  Get-ChildItem $HOME -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "novaciv|NovaCiv|nova" -or $_.Name -in @("app","www","site") } |
    ForEach-Object { Add-Line ("  " + $_.FullName) }
} catch { Add-Line ("Directory listing failed: " + $_) }

Add-Line ""
$guessDir = $null
$candidates = @(
  (Join-Path $HOME "NovaCiv"),
  (Join-Path $HOME "novaciv"),
  (Join-Path $HOME "NovaCiv-media-lab"),
  (Join-Path $HOME "nova"),
  (Join-Path $HOME "app"),
  (Join-Path $HOME "www"),
  (Join-Path $HOME "site"),
  "C:\NovaCiv\NovaCiv"
)

foreach ($d in $candidates) { if (Test-Path $d -PathType Container) { $guessDir = $d; break } }

if ($guessDir) {
  Add-Line ("Using project dir: " + $guessDir)
  Add-Line ""
  Push-Location $guessDir

  if (Get-Command git -ErrorAction SilentlyContinue -and (Test-Path ".git")) {
    Add-Line "-- git status --"
    (git status -sb 2>&1) | ForEach-Object { Add-Line ("  " + $_) }
    Add-Line ""

    Add-Line "-- git remote -v --"
    (git remote -v 2>&1) | ForEach-Object { Add-Line ("  " + $_) }
    Add-Line ""

    Add-Line "-- last 10 commits --"
    (git --no-pager log -10 --oneline --decorate 2>&1) | ForEach-Object { Add-Line ("  " + $_) }
    Add-Line ""
  } else {
    Add-Line "No git repo detected in project dir."
    Add-Line ""
  }

  Add-Line "-- env files presence (names only) --"
  try {
    Get-ChildItem -Path . -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -in @(".env",".env.local",".env.production",".env.example","env.example") } |
      Select-Object -First 200 |
      ForEach-Object { Add-Line ("  " + $_.FullName) }
  } catch { Add-Line ("  Error finding env files: " + $_) }
  Add-Line ""

  Add-Line "-- netlify.toml (if exists) --"
  if (Test-Path "netlify.toml") {
    (Get-Content "netlify.toml" -TotalCount 220) | ForEach-Object { Add-Line ("  " + $_) }
  } else { Add-Line "netlify.toml not found" }
  Add-Line ""

  Add-Line "-- package.json (scripts + deps brief) --"
  if (Test-Path "package.json") {
    try {
      $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
      Add-Line ("name: " + $pkg.name)
      Add-Line ("scripts: " + (($pkg.scripts.PSObject.Properties.Name) -join ", "))
      $depNames = if ($pkg.dependencies) { $pkg.dependencies.PSObject.Properties.Name | Select-Object -First 40 } else { @() }
      $devDepNames = if ($pkg.devDependencies) { $pkg.devDependencies.PSObject.Properties.Name | Select-Object -First 40 } else { @() }
      Add-Line ("deps (first 40): " + ($depNames -join ", "))
      Add-Line ("devDeps (first 40): " + ($devDepNames -join ", "))
    } catch {
      (Get-Content "package.json" -TotalCount 160) | ForEach-Object { Add-Line ("  " + $_) }
    }
  } else { Add-Line "package.json not found" }
  Add-Line ""

  Pop-Location
} else {
  Add-Line "No obvious project directory found."
  Add-Line ""
}

Add-Line "## Secrets safety check (presence only)"
$vars = @(
  "FIREBASE_SERVICE_ACCOUNT_JSON","FIREBASE_DB_URL","FIREBASE_DATABASE_URL",
  "TELEGRAM_BOT_TOKEN","TELEGRAM_CHAT_ID",
  "YOUTUBE_CLIENT_ID","YOUTUBE_CLIENT_SECRET","YOUTUBE_REFRESH_TOKEN",
  "OPENAI_API_KEY","CRON_SECRET","NETLIFY_SITE_ID"
)

foreach ($v in $vars) {
  $value = [Environment]::GetEnvironmentVariable($v,"Process")
  if (-not $value) { $value = [Environment]::GetEnvironmentVariable($v,"User") }
  if (-not $value) { $value = [Environment]::GetEnvironmentVariable($v,"Machine") }
  Add-Line ("  {0} = {1}" -f $v, ($(if ($value) { "(set)" } else { "(not set)" })))
}

Add-Line ""
Add-Line "## Recent logs (best-effort, last 200 lines each)"
if ($pm2Exists) {
  try {
    $pm2Raw = (pm2 jlist 2>&1 | Out-String)
    $pm2Json = $pm2Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($pm2Json) {
      foreach ($proc in $pm2Json) {
        Add-Line ("### pm2 logs --nostream --lines 200 " + $proc.name)
        (pm2 logs --nostream --lines 200 $proc.name 2>&1) | ForEach-Object { Add-Line ("  " + $_) }
        Add-Line ""
      }
    } else {
      Add-Line "pm2 jlist returned non-JSON output; cannot pull logs per-process."
      Add-Line $pm2Raw
      Add-Line ""
    }
  } catch { Add-Line ("PM2 logs unavailable: " + $_) }
}

Add-Line ""
Add-Line "## Done."

$Report | Out-File -FilePath $OUT -Encoding UTF8
Write-Host "✅ Report saved to: $OUT" -ForegroundColor Green
Write-Host "➡️ Show first 60 lines:" -ForegroundColor Cyan
Get-Content $OUT -TotalCount 60
