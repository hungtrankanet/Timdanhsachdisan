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
    Write-Host "Lỗi: Chưa cấu hình SERVER_HOST trong file .env" -ForegroundColor Red
    Write-Host "Vui lòng copy file .env.example thành .env và điền thông tin IP VPS của bạn." -ForegroundColor Yellow
    Exit
}

Write-Host "=============================================" -ForegroundColor Yellow
Write-Host "🚀 Bắt đầu đồng bộ dữ liệu lên VPS aaPanel..." -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Yellow

# 2. Sync database data.db
if (Test-Path "data.db") {
    Write-Host "📦 Đang tải file data.db lên VPS..." -ForegroundColor Cyan
    scp -P $port data.db "${user}@${hostIp}:/www/wwwroot/Timdanhsachdisan/data/data.db"
} else {
    Write-Host "Cảnh báo: Không tìm thấy file data.db cục bộ để đồng bộ." -ForegroundColor Yellow
}

# 3. Sync zalo_user_data directory
if (Test-Path "zalo_user_data") {
    Write-Host "🔑 Đang đồng bộ thư mục session Zalo (zalo_user_data)..." -ForegroundColor Cyan
    # Ensure targets directory exists on host first
    ssh -p $port "${user}@${hostIp}" "mkdir -p /www/wwwroot/Timdanhsachdisan/zalo_user_data"
    scp -P $port -r zalo_user_data/* "${user}@${hostIp}:/www/wwwroot/Timdanhsachdisan/zalo_user_data/"
} else {
    Write-Host "Cảnh báo: Không tìm thấy thư mục zalo_user_data cục bộ." -ForegroundColor Yellow
}

# 4. SSH to VPS and restart docker-compose
Write-Host "⚡ Đang khởi động lại Docker container trên VPS..." -ForegroundColor Cyan
ssh -p $port "${user}@${hostIp}" "cd /www/wwwroot/Timdanhsachdisan && docker-compose -p timdanhsachdisan -f docker-compose.prod.yml restart"

Write-Host "=============================================" -ForegroundColor Green
Write-Host "🎉 Đồng bộ dữ liệu và khôi phục Zalo Session thành công!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
