# 创建 Chrome 扩展 zip 包
$source = "D:\MyProject\steam-epic-badge"
$destination = "D:\MyProject\steam-epic-badge\steam-epic-badge-v1.0.2.zip"
$tempDir = "D:\MyProject\steam-epic-badge\temp_zip"

# 删除旧文件
Remove-Item -Path $destination -ErrorAction SilentlyContinue
Remove-Item -Path $tempDir -Recurse -ErrorAction SilentlyContinue

# 创建临时目录
New-Item -ItemType Directory -Path $tempDir

# 复制文件
Copy-Item -Path "$source\manifest.json" -Destination $tempDir
Copy-Item -Path "$source\background.js" -Destination $tempDir
Copy-Item -Path "$source\content.js" -Destination $tempDir
Copy-Item -Path "$source\content.css" -Destination $tempDir
Copy-Item -Path "$source\data" -Destination $tempDir -Recurse
Copy-Item -Path "$source\icons" -Destination $tempDir -Recurse
Copy-Item -Path "$source\utils" -Destination $tempDir -Recurse

# 创建 zip
Compress-Archive -Path "$tempDir\*" -DestinationPath $destination -Force

# 清理
Remove-Item -Path $tempDir -Recurse

Write-Host "Done!"
Get-Item $destination | Select-Object FullName, Length
