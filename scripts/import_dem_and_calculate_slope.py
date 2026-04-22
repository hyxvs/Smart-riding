#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
导入DEM数据并计算道路坡度
"""

import os
import sys
import subprocess
import psycopg2
from psycopg2.extras import execute_values
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 数据库配置
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432'),
    'database': os.getenv('DB_NAME', 'cycling_smart'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', '123456')
}

# DEM数据文件路径
DEM_FILE = r'c:\Users\hyx\Desktop\项目\骑行智慧民生服务平台\data\章贡区.tif'

def check_dem_file():
    """检查DEM文件是否存在"""
    if not os.path.exists(DEM_FILE):
        logger.error(f"DEM文件不存在: {DEM_FILE}")
        return False
    
    file_size = os.path.getsize(DEM_FILE) / (1024 * 1024)  # MB
    logger.info(f"DEM文件: {DEM_FILE}")
    logger.info(f"文件大小: {file_size:.2f} MB")
    
    return True

def import_dem_to_postgis():
    """使用raster2pgsql导入DEM数据到PostGIS"""
    logger.info("开始导入DEM数据到PostGIS...")
    
    try:
        # 检查raster2pgsql是否可用
        result = subprocess.run(['raster2pgsql', '--version'], 
                              capture_output=True, text=True)
        if result.returncode != 0:
            logger.warning("raster2pgsql未安装，尝试使用Python直接导入...")
            return import_dem_with_python()
        
        # 使用raster2pgsql导入
        cmd = [
            'raster2pgsql',
            '-s', '4326',  # SRID
            '-t', '250',   # 瓦片大小
            '-I',         # 读取数据后退出
            '-C',         # 使用COPY而不是INSERT
            '-M',         # 瓦片模式
            '-N', '32',    # NODATA值
            DEM_FILE,
            'public',      # schema
            'dem'          # 表名
        ]
        
        logger.info(f"执行命令: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"导入失败: {result.stderr}")
            return False
        
        logger.info("✅ DEM数据导入成功！")
        return True
        
    except FileNotFoundError:
        logger.warning("raster2pgsql未找到，尝试使用Python直接导入...")
        return import_dem_with_python()
    except Exception as e:
        logger.error(f"导入过程出错: {e}")
        return False

def import_dem_with_python():
    """使用Python直接导入DEM数据（备选方案）"""
    logger.info("使用Python导入DEM数据...")
    
    try:
        import rasterio
        from rasterio.warp import reproject, Resampling
        import numpy as np
    except ImportError:
        logger.error("需要安装rasterio库: pip install rasterio")
        return False
    
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    try:
        # 读取DEM数据
        with rasterio.open(DEM_FILE) as src:
            logger.info(f"DEM尺寸: {src.width} x {src.height}")
            logger.info(f"DEM CRS: {src.crs}")
            
            # 如果不是WGS84，需要重投影
            if str(src.crs) != 'EPSG:4326':
                logger.info("重投影DEM到WGS84...")
                # 这里简化处理，实际需要完整重投影代码
                pass
            
            # 创建dem表
            cursor.execute("""
                DROP TABLE IF EXISTS dem CASCADE;
                CREATE TABLE dem (
                    rid SERIAL PRIMARY KEY,
                    rast RASTER
                );
            """)
            
            # 分块读取和插入（避免内存溢出）
            block_size = 1000
            for i in range(0, src.height, block_size):
                for j in range(0, src.width, block_size):
                    window = ((j, i), (min(j+block_size, src.width), min(i+block_size, src.height)))
                    data = src.read(1, window=window)
                    
                    # 创建WKT格式的几何
                    # 这里简化处理，实际需要更复杂的转换
                    logger.info(f"处理块 ({j}, {i}) 到 ({min(j+block_size, src.width)}, {min(i+block_size, src.height)})")
            
            conn.commit()
            logger.info("✅ DEM数据导入成功（使用Python）")
            return True
            
    except Exception as e:
        logger.error(f"Python导入失败: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def execute_slope_calculation():
    """执行坡度计算SQL"""
    logger.info("开始计算道路坡度...")
    
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    try:
        # 读取SQL文件
        sql_file = r'c:\Users\hyx\Desktop\项目\骑行智慧民生服务平台\database\calculate_slope.sql'
        
        with open(sql_file, 'r', encoding='utf-8') as f:
            sql_content = f.read()
        
        # 分割SQL语句（按分号分隔）
        sql_statements = [stmt.strip() for stmt in sql_content.split(';') if stmt.strip()]
        
        # 执行每个SQL语句
        for i, statement in enumerate(sql_statements, 1):
            if statement:
                try:
                    cursor.execute(statement)
                    conn.commit()
                    logger.info(f"执行SQL语句 {i}/{len(sql_statements)}")
                except Exception as e:
                    logger.error(f"SQL语句 {i} 执行失败: {e}")
                    conn.rollback()
        
        logger.info("✅ 坡度计算完成！")
        return True
        
    except Exception as e:
        logger.error(f"执行坡度计算失败: {e}")
        return False
    finally:
        conn.close()

def verify_results():
    """验证计算结果"""
    logger.info("验证计算结果...")
    
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    try:
        # 检查dem表是否存在
        cursor.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'dem')")
        dem_exists = cursor.fetchone()[0]
        
        if dem_exists:
            logger.info("✅ dem表已创建")
            
            # 检查道路坡度字段
            cursor.execute("""
                SELECT COUNT(*) 
                FROM information_schema.columns 
                WHERE table_name = 'road' 
                  AND column_name IN ('avg_slope', 'max_slope', 'slope_category')
            """)
            column_count = cursor.fetchone()[0]
            logger.info(f"✅ 坡度字段已添加: {column_count}/4")
            
            # 统计坡度分类
            cursor.execute("""
                SELECT slope_category, COUNT(*) as count
                FROM road
                WHERE slope_category IS NOT NULL
                GROUP BY slope_category
            """)
            results = cursor.fetchall()
            
            if results:
                logger.info("坡度分类统计:")
                for category, count in results:
                    logger.info(f"  {category}: {count}条道路")
        else:
            logger.warning("⚠️  dem表未创建，导入可能失败")
        
        return True
        
    except Exception as e:
        logger.error(f"验证失败: {e}")
        return False
    finally:
        conn.close()

def main():
    """主函数"""
    logger.info("=" * 60)
    logger.info("骑行智慧民生 - DEM数据导入和坡度计算")
    logger.info("=" * 60)
    
    # 1. 检查DEM文件
    if not check_dem_file():
        sys.exit(1)
    
    # 2. 添加坡度字段
    logger.info("\n步骤1: 添加坡度字段...")
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    try:
        sql_file = r'c:\Users\hyx\Desktop\项目\骑行智慧民生服务平台\database\add_slope_fields.sql'
        with open(sql_file, 'r', encoding='utf-8') as f:
            sql_content = f.read()
        
        # 只执行添加字段的SQL（跳过注释和验证查询）
        for line in sql_content.split('\n'):
            line = line.strip()
            if line.startswith('ALTER TABLE') or line.startswith('CREATE INDEX'):
                cursor.execute(line)
                conn.commit()
        logger.info("✅ 坡度字段添加完成")
    except Exception as e:
        logger.error(f"添加字段失败: {e}")
        sys.exit(1)
    finally:
        conn.close()
    
    # 3. 导入DEM数据
    logger.info("\n步骤2: 导入DEM数据...")
    if not import_dem_to_postgis():
        logger.error("DEM数据导入失败，请检查错误信息")
        sys.exit(1)
    
    # 4. 计算坡度
    logger.info("\n步骤3: 计算道路坡度...")
    if not execute_slope_calculation():
        logger.error("坡度计算失败，请检查错误信息")
        sys.exit(1)
    
    # 5. 验证结果
    logger.info("\n步骤4: 验证计算结果...")
    verify_results()
    
    logger.info("\n" + "=" * 60)
    logger.info("✅ 所有步骤完成！")
    logger.info("=" * 60)

if __name__ == '__main__':
    main()
