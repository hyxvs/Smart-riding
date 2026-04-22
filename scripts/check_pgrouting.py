#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检查 pgRouting 安装状态
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


def check_pgrouting():
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # 检查 pgRouting 扩展
        cursor.execute("SELECT * FROM pg_extension WHERE extname = 'pgrouting';")
        result = cursor.fetchone()
        if result:
            logger.info(f"pgRouting 扩展已安装: {result}")
        else:
            logger.warning("pgRouting 扩展未安装")
        
        # 检查所有 pgRouting 函数
        cursor.execute("""
            SELECT proname, proargtypes::regtype[] 
            FROM pg_proc 
            WHERE proname LIKE 'pgr_%'
            ORDER BY proname;
        """)
        functions = cursor.fetchall()
        logger.info(f"找到 {len(functions)} 个 pgRouting 函数")
        
        # 显示前20个函数
        for func in functions[:20]:
            logger.info(f"  {func[0]}: {func[1]}")
        
        if len(functions) > 20:
            logger.info(f"  ... 还有 {len(functions) - 20} 个函数")
        
        # 检查特定的拓扑函数
        topology_functions = [
            'pgr_createtopology',
            'pgr_create_topology',
            'pgr_droptopology',
            'pgr_drop_topology'
        ]
        
        logger.info("\n检查拓扑相关函数:")
        for func_name in topology_functions:
            cursor.execute("""
                SELECT proname, proargtypes::regtype[] 
                FROM pg_proc 
                WHERE proname = %s;
            """, (func_name,))
            result = cursor.fetchone()
            if result:
                logger.info(f"  ✓ {func_name}: {result[1]}")
            else:
                logger.info(f"  ✗ {func_name}: 不存在")
        
        # 检查 pgr_dijkstra 函数（用于最短路径）
        cursor.execute("""
            SELECT proname, proargtypes::regtype[] 
            FROM pg_proc 
            WHERE proname = 'pgr_dijkstra';
        """)
        result = cursor.fetchone()
        if result:
            logger.info(f"\n✓ pgr_dijkstra 函数存在: {result[1]}")
        else:
            logger.warning("\n✗ pgr_dijkstra 函数不存在")
        
    except Exception as e:
        logger.error(f"检查失败: {e}")
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    check_pgrouting()
