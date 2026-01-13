# Test script for ops-run-now function
# Usage: .\test-ops-run-now.ps1

$url = "https://novaciv.space/.netlify/functions/ops-run-now?dry=1"

Write-Host "Testing ops-run-now function..." -ForegroundColor Cyan
Write-Host "URL: $url" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing
    
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Status Description: $($response.StatusDescription)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response Headers:" -ForegroundColor Yellow
    $response.Headers | Format-Table
    Write-Host ""
    Write-Host "Response Body:" -ForegroundColor Yellow
    Write-Host $response.Content
    
    if ($response.StatusCode -eq 200) {
        Write-Host ""
        Write-Host "✓ SUCCESS: Function is working correctly" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "✗ WARNING: Unexpected status code" -ForegroundColor Yellow
    }
} catch {
    Write-Host ""
    Write-Host "✗ ERROR: Request failed" -ForegroundColor Red
    Write-Host "Error Message: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "HTTP Status: $statusCode" -ForegroundColor Red
        
        if ($statusCode -eq 502) {
            Write-Host ""
            Write-Host "502 Bad Gateway detected!" -ForegroundColor Red
            Write-Host "This suggests:" -ForegroundColor Yellow
            Write-Host "  1. Function syntax error (check Netlify deploy logs)" -ForegroundColor Yellow
            Write-Host "  2. Stale/cached bundle (clear cache and redeploy)" -ForegroundColor Yellow
            Write-Host "  3. Bundling issue (check esbuild output in deploy log)" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "Full Error:" -ForegroundColor Red
    Write-Host $_.Exception
}
