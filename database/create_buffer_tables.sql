-- 缓冲区分析结果表
CREATE TABLE IF NOT EXISTS buffer_result (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    target_type VARCHAR(50) NOT NULL, -- poi, road, event
    target_id INTEGER,
    buffer_distance DECIMAL(10, 2) NOT NULL, -- 缓冲区距离（米）
    buffer_geom GEOMETRY(POLYGON, 4326), -- 缓冲区几何形状
    analysis_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 缓冲区分析结果详情表
CREATE TABLE IF NOT EXISTS buffer_analysis_result (
    id SERIAL PRIMARY KEY,
    buffer_result_id INTEGER REFERENCES buffer_result(id),
    element_type VARCHAR(50) NOT NULL, -- poi, road, event
    element_id INTEGER,
    element_name VARCHAR(255),
    element_category VARCHAR(100),
    distance_to_target DECIMAL(10, 2), -- 到目标的距离（米）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建空间索引
CREATE INDEX IF NOT EXISTS idx_buffer_result_geom ON buffer_result USING GIST(buffer_geom);
CREATE INDEX IF NOT EXISTS idx_buffer_result_target ON buffer_result(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_buffer_analysis_result_buffer ON buffer_analysis_result(buffer_result_id);

-- 插入测试数据
INSERT INTO buffer_result (target_type, target_id, buffer_distance, buffer_geom)
VALUES 
    ('poi', 1, 500, ST_Buffer(ST_SetSRID(ST_MakePoint(114.935, 25.845), 4326)::geography, 500)::geometry),
    ('road', 1, 1000, ST_Buffer(ST_SetSRID(ST_MakeLine(ST_MakePoint(114.935, 25.845), ST_MakePoint(114.945, 25.855)), 4326)::geography, 1000)::geometry);
