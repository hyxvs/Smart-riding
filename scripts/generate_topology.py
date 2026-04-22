#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 pgRouting 拓扑
"""

import os
import psycopg2
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432'),
    'database': os.getenv('DB_NAME', 'cycling_smart'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', '123456')
}


def generate_pgrouting_topology():
    """
    生成 pgRouting 拓扑
    """
    logger.info("开始生成 pgRouting 拓扑...")
    
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # 添加 source 和 target 字段（如果不存在）
        cursor.execute("""
            ALTER TABLE road 
            ADD COLUMN IF NOT EXISTS source INTEGER,
            ADD COLUMN IF NOT EXISTS target INTEGER;
        """)
        logger.info("已添加 source 和 target 字段")
        
        # 检查 pgRouting 扩展
        cursor.execute("SELECT * FROM pg_extension WHERE extname = 'pgrouting';")
        if not cursor.fetchone():
            logger.info("启用 pgRouting 扩展...")
            cursor.execute("CREATE EXTENSION IF NOT EXISTS pgrouting;")
        else:
            logger.info("pgRouting 扩展已存在")
        
        # 检查可用的 pgRouting 函数
        cursor.execute("""
            SELECT proname 
            FROM pg_proc 
            WHERE proname LIKE 'pgr_%topology%' 
            OR proname LIKE 'pgr_createtopology%'
            OR proname LIKE 'pgr_create_topology%';
        """)
        functions = cursor.fetchall()
        logger.info(f"可用的拓扑函数: {[f[0] for f in functions]}")
        
        # 生成拓扑 - 尝试不同的函数名
        try:
            # 尝试 pgRouting 4.0 格式
            logger.info("尝试 pgr_createtopology...")
            cursor.execute("SELECT pgr_createtopology('road', 0.00001, 'geom', 'id', 'source', 'target');")
        except Exception as e1:
            logger.warning(f"pgr_createtopology 失败: {e1}")
            try:
                # 尝试旧版本格式
                logger.info("尝试 pgr_create_topology...")
                cursor.execute("SELECT pgr_create_topology('road', 0.00001, 'geom', 'id', 'source', 'target');")
            except Exception as e2:
                logger.error(f"pgr_create_topology 也失败: {e2}")
                raise
        
        conn.commit()
        
        # 验证拓扑
        cursor.execute("SELECT COUNT(*) FROM road_vertices_pgr;")
        vertex_count = cursor.fetchone()[0]
        logger.info(f"拓扑生成成功！顶点数量: {vertex_count}")
        
        cursor.execute("SELECT COUNT(*) FROM road WHERE source IS NOT NULL AND target IS NOT NULL;")
        connected_count = cursor.fetchone()[0]
        logger.info(f"已连接的道路数量: {connected_count}")
        
        # 显示一些示例数据
        cursor.execute("""
            SELECT id, name, road_type, length_km, speed_limit, is_bike_lane, source, target 
            FROM road 
            LIMIT 5;
        """)
        logger.info("示例道路数据:")
        for row in cursor.fetchall():
            logger.info(f"  {row}")
        
        logger.info("=" * 60)
        logger.info("pgRouting 拓扑生成完成！")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"生成拓扑失败: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    generate_pgrouting_topology()
