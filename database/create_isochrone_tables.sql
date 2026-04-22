-- 创建等时圈结果表
CREATE TABLE IF NOT EXISTS isochrone_result (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "user"(id) ON DELETE SET NULL,
    start_point GEOMETRY(POINT, 4326),
    time_limit INT,
    isochrone_geom GEOMETRY(POLYGON, 4326),
    calculation_time INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建空间索引
CREATE INDEX IF NOT EXISTS idx_isochrone_geom ON isochrone_result USING GIST(isochrone_geom);
CREATE INDEX IF NOT EXISTS idx_isochrone_user ON isochrone_result(user_id);

-- 创建可达性分析结果表
CREATE TABLE IF NOT EXISTS accessibility_result (
    id SERIAL PRIMARY KEY,
    isochrone_id INT REFERENCES isochrone_result(id) ON DELETE CASCADE,
    poi_id INT REFERENCES poi(id),
    distance DECIMAL(10,2),
    travel_time INT,
    is_accessible BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_accessibility_isochrone ON accessibility_result(isochrone_id);
CREATE INDEX IF NOT EXISTS idx_accessibility_poi ON accessibility_result(poi_id);
