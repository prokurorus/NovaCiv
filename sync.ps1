param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"

git status --porcelain | Out-Null

git add -A

if ($Message -eq "") {
  $Message = "auto-sync $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
}

# если нет изменений  не коммитим
if ((git diff --cached --name-only).Length -eq 0) {
  Write-Host " No changes to commit"
  exit 0
}

git commit -m "$Message"
git push

Write-Host " Synced to GitHub"
