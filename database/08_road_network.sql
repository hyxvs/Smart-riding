-- =============================================
-- ⚠️ 仅用于新数据库初始化
-- 道路网络和 pgRouting 配置
-- 执行顺序: 8
-- =============================================

-- 1. 确保 road 表有必要的字段用于 pgRouting
ALTER TABLE road ADD COLUMN IF NOT EXISTS source INTEGER;
ALTER TABLE road ADD COLUMN IF NOT EXISTS target INTEGER;

-- 2. 使用 pgRouting 函数生成顶点表
SELECT pgr_create_topology('road', 0.00001, 'geom', 'id', 'source', 'target');

-- 验证函数是否存在
SELECT proname FROM pg_proc WHERE proname LIKE 'pgr_%topology%';

-- 3. 计算道路长度（如果不存在）
UPDATE road SET length_km = ST_Length(geom::geography) / 1000 WHERE length_km IS NULL OR length_km = 0;

-- 4. 插入示例道路数据
INSERT INTO road (name, road_type, geom, length_km, speed_limit, is_bike_lane, status)
VALUES
('长征大道', '主干道', ST_SetSRID(ST_MakeLine(
    ST_MakePoint(114.925, 25.845),
    ST_MakePoint(114.945, 25.845)
), 4326), 2.0, 40, true, 'normal'),

('兴国路', '主干道', ST_SetSRID(ST_MakeLine(
    ST_MakePoint(114.935, 25.835),
    ST_MakePoint(114.935, 25.855)
), 4326), 2.0, 40, true, 'normal'),

('瑞金路', '次干道', ST_SetSRID(ST_MakeLine(
    ST_MakePoint(114.925, 25.835),
    ST_MakePoint(114.945, 25.855)
), 4326), 2.8, 30, true, 'normal'),

('于都路', '次干道', ST_SetSRID(ST_MakeLine(
    ST_MakePoint(114.945, 25.835),
    ST_MakePoint(114.925, 25.855)
), 4326), 2.8, 30, true, 'normal');

-- 5. 重新生成拓扑（因为添加了新数据）
SELECT pgr_drop_topology('road');
SELECT pgr_create_topology('road', 0.00001, 'geom', 'id', 'source', 'target');

-- 6. 验证顶点表是否创建成功
SELECT COUNT(*) FROM road_vertices_pgr;

-- 7. 验证道路数据
SELECT id, name, ST_AsText(geom) FROM road;
