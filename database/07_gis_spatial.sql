-- =============================================
-- ⚠️ 仅用于新数据库初始化
-- GIS空间分析 - 数据库表结构
-- 执行顺序: 7
-- =============================================

-- 1. 等时圈结果表
CREATE TABLE IF NOT EXISTS isochrone_result (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE SET NULL,
    start_point GEOMETRY(POINT, 4326),
    time_limit INT,
    isochrone_geom GEOMETRY(POLYGON, 4326),
    calculation_time INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_isochrone_geom ON isochrone_result USING GIST(isochrone_geom);
CREATE INDEX IF NOT EXISTS idx_isochrone_user ON isochrone_result(user_id);

-- 2. 可达性分析结果表
CREATE TABLE IF NOT EXISTS accessibility_result (
    id SERIAL PRIMARY KEY,
    isochrone_id INT REFERENCES isochrone_result(id) ON DELETE CASCADE,
    poi_id INT REFERENCES poi(id),
    distance DECIMAL(10,2),
    travel_time INT,
    is_accessible BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_accessibility_isochrone ON accessibility_result(isochrone_id);
CREATE INDEX IF NOT EXISTS idx_accessibility_poi ON accessibility_result(poi_id);

-- 3. 缓冲区分析结果表
CREATE TABLE IF NOT EXISTS buffer_result (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE CASCADE,
    target_type VARCHAR(50) NOT NULL,
    target_id INT,
    buffer_distance DECIMAL(10, 2) NOT NULL,
    buffer_geom GEOMETRY(POLYGON, 4326),
    analysis_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_buffer_result_geom ON buffer_result USING GIST(buffer_geom);
CREATE INDEX IF NOT EXISTS idx_buffer_result_target ON buffer_result(target_type, target_id);

-- 4. 缓冲区分析结果详情表
CREATE TABLE IF NOT EXISTS buffer_analysis_result (
    id SERIAL PRIMARY KEY,
    buffer_result_id INT REFERENCES buffer_result(id) ON DELETE CASCADE,
    element_type VARCHAR(50) NOT NULL,
    element_id INT,
    element_name VARCHAR(255),
    element_category VARCHAR(100),
    distance_to_target DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_buffer_analysis_result_buffer ON buffer_analysis_result(buffer_result_id);

-- 5. POI聚类结果表
DROP TABLE IF EXISTS poi_cluster_result CASCADE;
CREATE TABLE poi_cluster_result (
    id SERIAL PRIMARY KEY,
    cluster_id INT,
    poi_id INT REFERENCES poi(id),
    centroid GEOMETRY(POINT, 4326),
    member_count INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_cluster_poi ON poi_cluster_result(cluster_id);
CREATE INDEX idx_cluster_centroid ON poi_cluster_result USING GIST(centroid);

-- 6. 道路交叉口表
DROP TABLE IF EXISTS road_intersection CASCADE;
CREATE TABLE road_intersection (
    id SERIAL PRIMARY KEY,
    geom GEOMETRY(POINT, 4326),
    road1_id INT REFERENCES road(id),
    road2_id INT REFERENCES road(id),
    intersection_type VARCHAR(50),
    safety_rating DECIMAL(2, 1),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_intersection_geom ON road_intersection USING GIST(geom);

-- 7. 轨迹相似度记录表
DROP TABLE IF EXISTS trajectory_similarity CASCADE;
CREATE TABLE trajectory_similarity (
    id SERIAL PRIMARY KEY,
    trajectory1_id INT REFERENCES ride_diary(id),
    trajectory2_id INT REFERENCES ride_diary(id),
    similarity_score DECIMAL(5, 4),
    length_ratio DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sim_traj1 ON trajectory_similarity(trajectory1_id);
CREATE INDEX idx_sim_traj2 ON trajectory_similarity(trajectory2_id);

-- 8. POI方向分布表
DROP TABLE IF EXISTS poi_direction_distribution CASCADE;
CREATE TABLE poi_direction_distribution (
    id SERIAL PRIMARY KEY,
    direction_range VARCHAR(20),
    direction_start DECIMAL(5, 2),
    direction_end DECIMAL(5, 2),
    poi_count INT DEFAULT 0,
    avg_safety DECIMAL(2, 1),
    avg_scenery DECIMAL(2, 1),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_direction_range ON poi_direction_distribution(direction_range);

-- 9. 道路连通分量表
DROP TABLE IF EXISTS road_connected_component CASCADE;
CREATE TABLE road_connected_component (
    id SERIAL PRIMARY KEY,
    component_id INT,
    road_count INT DEFAULT 0,
    total_length DECIMAL(12, 2) DEFAULT 0,
    centroid GEOMETRY(POINT, 4326),
    is_main_component BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_component_centroid ON road_connected_component USING GIST(centroid);

-- 10. 民情事件空间分布表
DROP TABLE IF EXISTS event_spatial_distribution CASCADE;
CREATE TABLE event_spatial_distribution (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50),
    centroid GEOMETRY(POINT, 4326),
    event_count INT DEFAULT 0,
    density DECIMAL(10, 4),
    avg_severity DECIMAL(3, 1),
    bbox GEOMETRY(POLYGON, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_event_spatial_geom ON event_spatial_distribution USING GIST(centroid);

-- 插入测试数据
INSERT INTO buffer_result (target_type, target_id, buffer_distance, buffer_geom)
VALUES 
    ('poi', 1, 500, ST_Buffer(ST_SetSRID(ST_MakePoint(114.935, 25.845), 4326)::geography, 500)::geometry),
    ('road', 1, 1000, ST_Buffer(ST_SetSRID(ST_MakeLine(ST_MakePoint(114.935, 25.845), ST_MakePoint(114.945, 25.855)), 4326)::geography, 1000)::geometry);
