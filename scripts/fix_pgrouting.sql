-- 修复 pgRouting 拓扑函数
-- 这个脚本用于手动创建 pgRouting 拓扑

-- 1. 确保 pgRouting 扩展已安装
CREATE EXTENSION IF NOT EXISTS pgrouting;

-- 2. 检查 road 表结构
ALTER TABLE road 
ADD COLUMN IF NOT EXISTS source INTEGER,
ADD COLUMN IF NOT EXISTS target INTEGER;

-- 3. 创建顶点表（如果不存在）
CREATE TABLE IF NOT EXISTS road_vertices_pgr (
    id SERIAL PRIMARY KEY,
    cnt INTEGER,
    chk INTEGER,
    ein INTEGER,
    eout INTEGER,
    the_geom GEOMETRY(Point, 4326)
);

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS road_vertices_pgr_geom_idx ON road_vertices_pgr USING GIST(the_geom);

-- 5. 手动创建拓扑关系
-- 首先清空现有拓扑
DELETE FROM road_vertices_pgr;
UPDATE road SET source = NULL, target = NULL;

-- 6. 为每条道路创建顶点和连接关系
-- 提取所有端点
WITH all_points AS (
    SELECT 
        id,
        ST_StartPoint(geom) as start_point,
        ST_EndPoint(geom) as end_point
    FROM road
),
-- 为每个唯一的端点创建顶点
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
-- 插入顶点到顶点表
INSERT INTO road_vertices_pgr (id, the_geom)
SELECT vertex_id, the_geom FROM unique_vertices;

-- 7. 更新 road 表的 source 和 target
UPDATE road r
SET source = v.id
FROM road_vertices_pgr v
WHERE ST_Equals(ST_StartPoint(r.geom), v.the_geom);

UPDATE road r
SET target = v.id
FROM road_vertices_pgr v
WHERE ST_Equals(ST_EndPoint(r.geom), v.the_geom);

-- 8. 验证结果
SELECT '顶点数量' as info, COUNT(*) as count FROM road_vertices_pgr
UNION ALL
SELECT '已连接的道路', COUNT(*) FROM road WHERE source IS NOT NULL AND target IS NOT NULL
UNION ALL
SELECT '总道路数', COUNT(*) FROM road;
