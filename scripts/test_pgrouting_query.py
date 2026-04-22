#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试 pgRouting 查询
"""

import os
import psycopg2
import json
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


def test_pgrouting():
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # 测试坐标（赣州章贡区）
        start_lng, start_lat = 114.935, 25.845
        end_lng, end_lat = 114.945, 25.855
        
        logger.info(f"测试路线规划: ({start_lng}, {start_lat}) -> ({end_lng}, {end_lat})")
        
        # 1. 查找最近的顶点
        logger.info("查找起点最近的顶点...")
        cursor.execute("""
            SELECT id, the_geom
            FROM road_vertices_pgr
            ORDER BY the_geom <-> ST_SetSRID(ST_MakePoint(%s, %s), 4326)
            LIMIT 1;
        """, (start_lng, start_lat))
        
        start_vertex = cursor.fetchone()
        if not start_vertex:
            logger.error("未找到起点附近的顶点")
            return
        
        start_id = start_vertex[0]
        logger.info(f"起点最近顶点 ID: {start_id}")
        
        logger.info("查找终点最近的顶点...")
        cursor.execute("""
            SELECT id, the_geom
            FROM road_vertices_pgr
            ORDER BY the_geom <-> ST_SetSRID(ST_MakePoint(%s, %s), 4326)
            LIMIT 1;
        """, (end_lng, end_lat))
        
        end_vertex = cursor.fetchone()
        if not end_vertex:
            logger.error("未找到终点附近的顶点")
            return
        
        end_id = end_vertex[0]
        logger.info(f"终点最近顶点 ID: {end_id}")
        
        # 2. 使用 pgr_dijkstra 计算最短路径
        logger.info("计算最短路径...")
        try:
            cursor.execute("""
                SELECT 
                    path.seq,
                    path.node,
                    path.edge,
                    path.cost,
                    r.name,
                    r.length_km,
                    ST_AsGeoJSON(r.geom)::json as geom
                FROM pgr_dijkstra(
                    'SELECT id, source, target, length_km as cost FROM road WHERE source IS NOT NULL AND target IS NOT NULL',
                    %s, %s, false
                ) AS path
                LEFT JOIN road r ON path.edge = r.id
                ORDER BY path.seq;
            """, (start_id, end_id))
            
            results = cursor.fetchall()
            
            if results:
                logger.info(f"✓ 找到路径，包含 {len(results)} 个路段")
                
                total_distance = sum(row[5] for row in results if row[5] is not None)
                logger.info(f"✓ 总距离: {total_distance:.3f} km")
                
                # 显示前5个路段
                logger.info("\n路径详情（前5个路段）:")
                for i, row in enumerate(results[:5]):
                    logger.info(f"  {i+1}. 节点 {row[1]} -> 边 {row[2]}, 成本: {row[3]:.3f}, 道路: {row[4]}, 长度: {row[5]:.3f}km")
                
                # 3. 生成路线几何
                logger.info("\n生成路线几何...")
                cursor.execute("""
                    SELECT 
                        ST_AsGeoJSON(ST_MakeLine(r.geom))::json as route_geom,
                        SUM(r.length_km) as total_distance,
                        SUM(r.length_km / NULLIF(r.speed_limit, 0) * 60) as total_time
                    FROM pgr_dijkstra(
                        'SELECT id, source, target, length_km as cost FROM road WHERE source IS NOT NULL AND target IS NOT NULL',
                        %s, %s, false
                    ) AS path
                    JOIN road r ON path.edge = r.id;
                """, (start_id, end_id))
                
                route_result = cursor.fetchone()
                if route_result and route_result[0]:
                    route_geom = route_result[0]
                    total_distance = route_result[1] or 0
                    total_time = route_result[2] or 0
                    
                    logger.info(f"✓ 路线几何生成成功")
                    logger.info(f"✓ 总距离: {total_distance:.3f} km")
                    logger.info(f"✓ 预计时间: {total_time:.1f} 分钟")
                    logger.info(f"✓ 坐标点数: {len(route_geom.get('coordinates', []))}")
                else:
                    logger.warning("路线几何为空")
            else:
                logger.warning("未找到路径")
                
        except Exception as e:
            logger.error(f"pgr_dijkstra 查询失败: {e}")
        
    except Exception as e:
        logger.error(f"测试失败: {e}")
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    test_pgrouting()
