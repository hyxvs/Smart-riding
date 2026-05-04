@echo off
chcp 65001
echo =============================================
echo 骑行智慧民生 - 坡度分析数据导入
echo =============================================
echo.

REM 设置数据库连接信息
set DB_HOST=localhost
set DB_PORT=5432
set DB_NAME=cycling_smart
set DB_USER=postgres
set DB_PASSWORD=%DB_PASSWORD%

REM 设置文件路径
set DEM_FILE=c:\Users\hyx\Desktop\项目\骑行智慧民生服务平台\data\章贡区.tif
set SQL_DIR=c:\Users\hyx\Desktop\项目\骑行智慧民生服务平台\database

echo.
echo 步骤1: 检查DEM文件...
if not exist "%DEM_FILE%" (
    echo [错误] DEM文件不存在: %DEM_FILE%
    pause
    exit /b 1
)

for %%I in ("%DEM_FILE%") do set FILE_SIZE=%%~zI
set /a FILE_SIZE_MB=%FILE_SIZE% / 1048576
echo [信息] DEM文件: %DEM_FILE%
echo [信息] 文件大小: %FILE_SIZE_MB% MB
echo.

echo 步骤2: 添加坡度字段到road表...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f "%SQL_DIR%\add_slope_fields.sql"
if %errorlevel% neq 0 (
    echo [错误] 添加坡度字段失败
    pause
    exit /b 1
)
echo [成功] 坡度字段添加完成
echo.

echo 步骤3: 导入DEM数据到PostgreSQL...
echo [提示] 需要raster2pgsql工具，如果未安装会跳过
where raster2pgsql >nul 2>nul
if %errorlevel% equ 0 (
    echo [信息] 找到raster2pgsql，开始导入DEM...
    raster2pgsql -s 4326 -t 250 -I -C -M -N 32 "%DEM_FILE%" public dem
    if %errorlevel% neq 0 (
        echo [错误] DEM导入失败
        pause
        exit /b 1
    )
    echo [成功] DEM数据导入完成
) else (
    echo [警告] 未找到raster2pgsql，跳过DEM导入
    echo [提示] 请手动导入DEM数据，然后继续执行坡度计算
    echo [提示] 可以使用: psql -h localhost -U postgres -d cycling_smart -f database\calculate_slope_simple.sql
    pause
    exit /b 0
)
echo.

echo 步骤4: 计算道路坡度...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f "%SQL_DIR%\calculate_slope_simple.sql"
if %errorlevel% neq 0 (
    echo [错误] 坡度计算失败
    pause
    exit /b 1
)
echo [成功] 坡度计算完成
echo.

echo =============================================
echo 所有步骤完成！
echo =============================================
echo.
echo 坡度分类统计已显示在上方
echo 按任意键退出...
pause
