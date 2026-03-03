param(
    [string]$Host = "89.111.154.242",
    [string]$User = "root",
    [string[]]$Services = @("gptishka-bot", "gptishka-admin")
)

foreach ($svc in $Services) {
    $state = (ssh "$User@$Host" "systemctl is-active $svc" 2>$null).Trim()
    if ($state -eq "active") {
        Write-Output "[$svc] active"
    } else {
        Write-Output "[$svc] inactive -> starting"
        ssh "$User@$Host" "systemctl start $svc"
    }
}

Write-Output "Done."
