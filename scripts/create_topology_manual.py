#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
手动创建 pgRouting 拓扑（不使用 pgr_createTopology 函数）
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


def create_topology_manual():
    """
    手动创建道路网络拓扑
    """
    logger.info("开始手动创建道路网络拓扑...")
    
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # 1. 确保 pgRouting 扩展已安装
        cursor.execute("CREATE EXTENSION IF NOT EXISTS pgrouting;")
        logger.info("✓ pgRouting 扩展已安装")
        
        # 2. 添加 source 和 target 字段
        cursor.execute("""
            ALTER TABLE road 
            ADD COLUMN IF NOT EXISTS source INTEGER,
            ADD COLUMN IF NOT EXISTS target INTEGER;
        """)
        logger.info("✓ 已添加 source 和 target 字段")
        
        # 3. 创建顶点表（如果不存在）
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS road_vertices_pgr (
                id SERIAL PRIMARY KEY,
                cnt INTEGER,
                chk INTEGER,
                ein INTEGER,
                eout INTEGER,
                the_geom GEOMETRY(Point, 4326)
            );
        """)
        logger.info("✓ 顶点表已创建")
        
        # 4. 创建索引
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS road_vertices_pgr_geom_idx 
            ON road_vertices_pgr USING GIST(the_geom);
        """)
        logger.info("✓ 空间索引已创建")
        
        # 5. 清空现有拓扑
        cursor.execute("DELETE FROM road_vertices_pgr;")
        cursor.execute("UPDATE road SET source = NULL, target = NULL;")
        logger.info("✓ 已清空现有拓扑数据")
        
        # 6. 提取所有唯一的端点并创建顶点
        logger.info("正在提取道路端点...")
        cursor.execute("""
            WITH all_points AS (
                SELECT 
                    id,
                    ST_StartPoint(geom) as start_point,
                    ST_EndPoint(geom) as end_point
                FROM road
            ),
            unique_vertices AS (
                SELECT DISTINCT ON (ST_AsText(the_geom))
                    the_geom,
                    ROW_NUMBER() OVER (ORDER BY ST_AsText(the_geom)) as vertex_id
                FROM (
                    SELECT start_point as the_geom FROM all_points
                    UNION
                    SELECT end_point as the_geom FROM all_points
                ) points
            )
            INSERT INTO road_vertices_pgr (id, the_geom)
            SELECT vertex_id, the_geom FROM unique_vertices;
        """)
        
        cursor.execute("SELECT COUNT(*) FROM road_vertices_pgr;")
        vertex_count = cursor.fetchone()[0]
        logger.info(f"✓ 已创建 {vertex_count} 个顶点")
        
        # 7. 更新 road 表的 source
        logger.info("正在更新 source 字段...")
        cursor.execute("""
            UPDATE road r
            SET source = v.id
            FROM road_vertices_pgr v
            WHERE ST_Equals(ST_StartPoint(r.geom), v.the_geom);
        """)
        
        # 8. 更新 road 表的 target
        logger.info("正在更新 target 字段...")
        cursor.execute("""
            UPDATE road r
            SET target = v.id
            FROM road_vertices_pgr v
            WHERE ST_Equals(ST_EndPoint(r.geom), v.the_geom);
        """)
        
        # 9. 验证结果
        cursor.execute("""
            SELECT 
                COUNT(*) as total_roads,
                COUNT(*) FILTER (WHERE source IS NOT NULL AND target IS NOT NULL) as connected_roads
            FROM road;
        """)
        result = cursor.fetchone()
        total_roads = result[0]
        connected_roads = result[1]
        
        logger.info(f"✓ 总道路数: {total_roads}")
        logger.info(f"✓ 已连接道路数: {connected_roads}")
        
        if connected_roads < total_roads:
            logger.warning(f"⚠ 有 {total_roads - connected_roads} 条道路未正确连接")
        
        conn.commit()
        
        logger.info("=" * 60)
        logger.info("道路网络拓扑创建完成！")
        logger.info("=" * 60)
        
        # 10. 显示一些示例数据
        cursor.execute("""
            SELECT id, name, road_type, source, target, length_km 
            FROM road 
            WHERE source IS NOT NULL AND target IS NOT NULL
            LIMIT 5;
        """)
        logger.info("\n示例道路数据:")
        for row in cursor.fetchall():
            logger.info(f"  ID={row[0]}, 名称={row[1]}, 类型={row[2]}, source={row[3]}, target={row[4]}, 长度={row[5]:.3f}km")
        
    except Exception as e:
        logger.error(f"创建拓扑失败: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def test_shortest_path():
    """
    测试最短路径功能
    """
    logger.info("\n测试最短路径功能...")
    
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # 获取两个顶点进行测试
        cursor.execute("SELECT id FROM road_vertices_pgr LIMIT 2;")
        vertices = cursor.fetchall()
        
        if len(vertices) < 2:
            logger.warning("顶点数量不足，无法测试最短路径")
            return
        
        start_id = vertices[0][0]
        end_id = vertices[1][0]
        
        logger.info(f"测试从顶点 {start_id} 到顶点 {end_id} 的最短路径...")
        
        # 使用 pgr_dijkstra 计算最短路径
        cursor.execute("""
            SELECT * FROM pgr_dijkstra(
                'SELECT id, source, target, length_km as cost FROM road WHERE source IS NOT NULL AND target IS NOT NULL',
                %s, %s, false
            );
        """, (start_id, end_id))
        
        results = cursor.fetchall()
        
        if results:
            logger.info(f"✓ 找到路径，包含 {len(results)} 个路段")
            total_cost = sum(row[4] for row in results if row[4] is not None)
            logger.info(f"✓ 总距离: {total_cost:.3f} km")
        else:
            logger.warning("未找到路径")
        
    except Exception as e:
        logger.error(f"测试最短路径失败: {e}")
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    create_topology_manual()
    test_shortest_path()
