-- =============================================
-- 为 road 表添加坡度分析相关字段
-- =============================================

-- 1. 添加高程字段
ALTER TABLE road 
ADD COLUMN IF NOT EXISTS elevation_start NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS elevation_end NUMERIC(10, 2);

-- 2. 添加坡度字段
ALTER TABLE road 
ADD COLUMN IF NOT EXISTS avg_slope NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS max_slope NUMERIC(5, 2);

-- 3. 添加坡度分类字段
ALTER TABLE road 
ADD COLUMN IF NOT EXISTS slope_category VARCHAR(20);

-- 4. 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_road_slope_category ON road(slope_category);
CREATE INDEX IF NOT EXISTS idx_road_avg_slope ON road(avg_slope);

-- =============================================
-- 注意：以下SQL需要先导入DEM数据后才能执行
-- =============================================

-- 5. 计算道路起点和终点的高程（需要dem表存在）
-- UPDATE road r
-- SET 
--   elevation_start = (SELECT ST_Value(rast, ST_Transform(ST_StartPoint(r.geom), 3857)) FROM dem LIMIT 1),
--   elevation_end = (SELECT ST_Value(rast, ST_Transform(ST_EndPoint(r.geom), 3857)) FROM dem LIMIT 1);

-- 6. 计算平均坡度（百分比）
-- UPDATE road
-- SET avg_slope = CASE 
--   WHEN length_km > 0 AND elevation_start IS NOT NULL AND elevation_end IS NOT NULL
--   THEN ABS((elevation_end - elevation_start) / length_km) * 100
--   ELSE 0
-- END;

-- 7. 计算最大坡度（需要更精细的分段计算）
-- UPDATE road
-- SET max_slope = avg_slope;

-- 8. 坡度分类
-- UPDATE road
-- SET slope_category = CASE
--   WHEN avg_slope < 3 THEN '平缓'
--   WHEN avg_slope < 8 THEN '中等'
--   WHEN avg_slope < 15 THEN '较陡'
--   ELSE '陡峭'
-- END;

-- =============================================
-- 验证字段添加结果
-- =============================================

SELECT 
  column_name,
  data_type,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'road' 
  AND column_name IN ('elevation_start', 'elevation_end', 'avg_slope', 'max_slope', 'slope_category')
ORDER BY ordinal_position;
