# Scripts to sync SQLite database and Zalo sessions from local to VPS

# 1. Load environment variables from local .env file
if (Test-Path ".env") {
    Get-Content .env | ForEach-Object {
        $line = $_.Trim()
        if ($line -and !$line.StartsWith("#") -and $line.Contains("=")) {
            $key, $value = $line.Split("=", 2)
            $key = $key.Trim()
            $value = $value.Trim().Trim('"').Trim("'")
            [System.Environment]::SetEnvironmentVariable($key, $value)
        }
    }
}

$hostIp = [System.Environment]::GetEnvironmentVariable("SERVER_HOST")
$user = [System.Environment]::GetEnvironmentVariable("SERVER_USER")
$port = [System.Environment]::GetEnvironmentVariable("SERVER_PORT")

if (!$port) { $port = "22" }
if (!$user) { $user = "root" }

if (!$hostIp) {
    Write-Host "Error: SERVER_HOST is not configured in .env file." -ForegroundColor Red
    Write-Host "Please copy .env.example to .env and configure your VPS IP." -ForegroundColor Yellow
    Exit
}

Write-Host "=============================================" -ForegroundColor Yellow
Write-Host ">>> Starting data sync to VPS aaPanel..." -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Yellow

# 2. Sync database data.db
if (Test-Path "data.db") {
    Write-Host ">>> Uploading data.db to VPS..." -ForegroundColor Cyan
    scp -P $port data.db "${user}@${hostIp}:/www/wwwroot/Timdanhsachdisan/data/data.db"
} else {
    Write-Host "Warning: Local data.db file not found. Skipping." -ForegroundColor Yellow
}

# 3. Sync zalo_user_data directory
if (Test-Path "zalo_user_data") {
    Write-Host ">>> Syncing Zalo session directory (zalo_user_data)..." -ForegroundColor Cyan
    # Ensure targets directory exists on host first
    ssh -p $port "${user}@${hostIp}" "mkdir -p /www/wwwroot/Timdanhsachdisan/zalo_user_data"
    scp -P $port -r zalo_user_data/* "${user}@${hostIp}:/www/wwwroot/Timdanhsachdisan/zalo_user_data/"
} else {
    Write-Host "Warning: Local zalo_user_data directory not found. Skipping." -ForegroundColor Yellow
}

# 4. SSH to VPS and restart docker-compose
Write-Host ">>> Restarting Docker container on VPS..." -ForegroundColor Cyan
ssh -p $port "${user}@${hostIp}" "cd /www/wwwroot/Timdanhsachdisan && docker-compose -p timdanhsachdisan -f docker-compose.prod.yml restart"

Write-Host "=============================================" -ForegroundColor Green
Write-Host ">>> Sync and Zalo Session restore completed successfully!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
