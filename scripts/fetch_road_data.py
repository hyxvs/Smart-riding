#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 OpenStreetMap 爬取赣州章贡区道路数据
"""

import os
import json
import psycopg2
from psycopg2.extras import execute_values
import osmnx as ox
import geopandas as gpd
from shapely.geometry import LineString
import logging

# 配置日志
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

# 赣州章贡区的大致边界
# 经度: 114.89 - 114.98
# 纬度: 25.80 - 25.88
GANZHOU_BOUNDS = {
    'north': 25.88,
    'south': 25.80,
    'east': 114.98,
    'west': 114.89
}


def fetch_road_network_from_osm():
    """
    从 OpenStreetMap 获取道路网络数据
    """
    logger.info("开始从 OpenStreetMap 获取道路数据...")
    logger.info(f"区域范围: 经度 {GANZHOU_BOUNDS['west']}-{GANZHOU_BOUNDS['east']}, "
                f"纬度 {GANZHOU_BOUNDS['south']}-{GANZHOU_BOUNDS['north']}")
    
    # 获取道路网络
    # network_type='bike' 获取适合骑行的道路
    # osmnx 2.x 使用 bbox 元组 (west, south, east, north)
    bbox = (
        GANZHOU_BOUNDS['west'],
        GANZHOU_BOUNDS['south'],
        GANZHOU_BOUNDS['east'],
        GANZHOU_BOUNDS['north']
    )
    
    G = ox.graph_from_bbox(
        bbox,
        network_type='bike',  # 适合骑行的道路
        simplify=True,  # 简化道路网络
        retain_all=False  # 只保留主网络
    )
    
    logger.info(f"获取到 {len(G.nodes)} 个节点, {len(G.edges)} 条道路")
    
    return G


def convert_graph_to_roads(G):
    """
    将 NetworkX 图转换为道路数据列表
    """
    logger.info("转换道路数据格式...")
    
    roads = []
    
    for u, v, key, data in G.edges(keys=True, data=True):
        # 获取起点和终点的坐标
        u_node = G.nodes[u]
        v_node = G.nodes[v]
        
        # 创建线几何
        coords = [(u_node['x'], u_node['y']), (v_node['x'], v_node['y'])]
        
        # 如果有几何信息，使用它
        if 'geometry' in data:
            geom = data['geometry']
            coords = list(geom.coords)
        
        # 确定道路类型
        highway_type = data.get('highway', 'unclassified')
        road_type = map_highway_to_road_type(highway_type)
        
        # 确定道路名称
        name = data.get('name', f"{road_type}_{len(roads)}")
        
        # 获取限速（如果有）
        speed_limit = parse_speed_limit(data.get('maxspeed', '30'))
        
        # 判断是否自行车道
        is_bike_lane = is_bicycle_friendly(data, highway_type)
        
        # 计算长度（公里）
        length_km = data.get('length', 0) / 1000 if 'length' in data else None
        
        road = {
            'name': name,
            'road_type': road_type,
            'highway_type': highway_type,
            'coordinates': coords,
            'length_km': length_km,
            'speed_limit': speed_limit,
            'is_bike_lane': is_bike_lane,
            'status': 'normal',
            'source_node': u,
            'target_node': v
        }
        
        roads.append(road)
    
    logger.info(f"转换完成，共 {len(roads)} 条道路")
    return roads


def map_highway_to_road_type(highway_type):
    """
    将 OSM highway 类型映射到我们的道路类型
    """
    type_mapping = {
        'motorway': '高速公路',
        'motorway_link': '高速公路',
        'trunk': '主干道',
        'trunk_link': '主干道',
        'primary': '主干道',
        'primary_link': '主干道',
        'secondary': '次干道',
        'secondary_link': '次干道',
        'tertiary': '次干道',
        'tertiary_link': '次干道',
        'residential': '支路',
        'living_street': '支路',
        'service': '支路',
        'pedestrian': '步行道',
        'footway': '步行道',
        'cycleway': '自行车道',
        'path': '小路',
        'track': '小路',
        'unclassified': '未分类',
        'road': '未分类'
    }
    
    if isinstance(highway_type, list):
        highway_type = highway_type[0]
    
    return type_mapping.get(highway_type, '未分类')


def parse_speed_limit(maxspeed):
    """
    解析限速值
    """
    if maxspeed is None:
        return 30
    
    if isinstance(maxspeed, (int, float)):
        return int(maxspeed)
    
    # 处理字符串格式，如 "50", "50 km/h"
    maxspeed_str = str(maxspeed).lower().replace('km/h', '').replace('kmh', '').strip()
    
    try:
        return int(float(maxspeed_str))
    except (ValueError, TypeError):
        return 30  # 默认限速


def is_bicycle_friendly(data, highway_type):
    """
    判断道路是否适合自行车通行
    """
    # 明确标记为自行车道
    if highway_type == 'cycleway':
        return True
    
    # 检查自行车通行标记
    bicycle = data.get('bicycle', '')
    if bicycle in ['yes', 'designated', 'permissive']:
        return True
    
    # 检查是否有自行车道标记
    cycleway = data.get('cycleway', '')
    if cycleway:
        return True
    
    # 住宅区和支路通常适合自行车
    if highway_type in ['residential', 'living_street', 'service', 'path', 'track']:
        return True
    
    return False


def save_to_geojson(roads, output_file='ganzhou_roads.geojson'):
    """
    将道路数据保存为 GeoJSON 文件
    """
    logger.info(f"保存道路数据到 {output_file}...")
    
    features = []
    for i, road in enumerate(roads):
        feature = {
            'type': 'Feature',
            'properties': {
                'id': i + 1,
                'name': road['name'],
                'road_type': road['road_type'],
                'highway_type': road['highway_type'],
                'length_km': road['length_km'],
                'speed_limit': road['speed_limit'],
                'is_bike_lane': road['is_bike_lane'],
                'status': road['status']
            },
            'geometry': {
                'type': 'LineString',
                'coordinates': road['coordinates']
            }
        }
        features.append(feature)
    
    geojson = {
        'type': 'FeatureCollection',
        'features': features
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
    
    logger.info(f"已保存 {len(features)} 条道路到 {output_file}")


def import_to_database(roads):
    """
    将道路数据导入 PostgreSQL 数据库
    """
    logger.info("开始导入数据到 PostgreSQL...")
    
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # 清空现有道路数据
        cursor.execute("TRUNCATE TABLE road RESTART IDENTITY CASCADE;")
        logger.info("已清空现有道路数据")
        
        # 准备插入数据
        road_values = []
        for road in roads:
            # 创建 WKT 格式的几何
            coords_wkt = ','.join([f"{lon} {lat}" for lon, lat in road['coordinates']])
            geom_wkt = f"LINESTRING({coords_wkt})"
            
            # 确保数值类型正确转换
            length_km = float(road['length_km']) if road['length_km'] is not None else 0.0
            speed_limit = int(road['speed_limit']) if road['speed_limit'] is not None else 30
            is_bike_lane = bool(road['is_bike_lane'])
            
            road_values.append((
                road['name'],
                road['road_type'],
                geom_wkt,
                length_km,
                speed_limit,
                is_bike_lane,
                road['status']
            ))
        
        # 批量插入
        insert_query = """
            INSERT INTO road (name, road_type, geom, length_km, speed_limit, is_bike_lane, status)
            VALUES %s
        """
        
        execute_values(
            cursor,
            insert_query,
            road_values,
            template="(%s, %s, ST_SetSRID(ST_GeomFromText(%s), 4326), %s, %s, %s, %s)"
        )
        
        conn.commit()
        logger.info(f"成功导入 {len(road_values)} 条道路到数据库")
        
        # 更新统计信息
        cursor.execute("SELECT COUNT(*) FROM road;")
        count = cursor.fetchone()[0]
        logger.info(f"数据库中共有 {count} 条道路")
        
    except Exception as e:
        logger.error(f"导入数据库失败: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


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
        
        # 检查 pgRouting 扩展
        cursor.execute("SELECT * FROM pg_extension WHERE extname = 'pgrouting';")
        if not cursor.fetchone():
            logger.info("启用 pgRouting 扩展...")
            cursor.execute("CREATE EXTENSION IF NOT EXISTS pgrouting;")
        
        # 生成拓扑
        # pgRouting 4.0 使用 pgr_createtopology (小写，无下划线)
        logger.info("创建道路网络拓扑...")
        cursor.execute("SELECT pgr_createtopology('road', 0.00001, 'geom', 'id', 'source', 'target');")
        
        conn.commit()
        
        # 验证拓扑
        cursor.execute("SELECT COUNT(*) FROM road_vertices_pgr;")
        vertex_count = cursor.fetchone()[0]
        logger.info(f"拓扑生成成功！顶点数量: {vertex_count}")
        
        cursor.execute("SELECT COUNT(*) FROM road WHERE source IS NOT NULL AND target IS NOT NULL;")
        connected_count = cursor.fetchone()[0]
        logger.info(f"已连接的道路数量: {connected_count}")
        
    except Exception as e:
        logger.error(f"生成拓扑失败: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def main():
    """
    主函数
    """
    logger.info("=" * 60)
    logger.info("开始爬取赣州章贡区道路数据")
    logger.info("=" * 60)
    
    try:
        # 1. 从 OSM 获取道路网络
        G = fetch_road_network_from_osm()
        
        # 2. 转换为道路数据
        roads = convert_graph_to_roads(G)
        
        # 3. 保存为 GeoJSON（备份）
        save_to_geojson(roads, 'ganzhou_roads.geojson')
        
        # 4. 导入到数据库
        import_to_database(roads)
        
        # 5. 生成 pgRouting 拓扑
        generate_pgrouting_topology()
        
        logger.info("=" * 60)
        logger.info("道路数据爬取和导入完成！")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"程序执行失败: {e}")
        raise


if __name__ == '__main__':
    main()
