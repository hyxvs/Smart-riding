-- =============================================
-- 修正版坡度计算脚本（修复坐标系问题）
-- =============================================

-- 说明：
-- 1. DEM数据已导入到dem表
-- 2. 使用正确的SRID (4326)
-- 3. 执行此脚本计算坡度

-- =============================================
-- 第一步：计算道路起点和终点的高程
-- =============================================

UPDATE road r
SET 
  elevation_start = (
    SELECT ST_Value(dem.rast, ST_StartPoint(r.geom))
    FROM dem
    WHERE ST_Intersects(dem.rast, ST_StartPoint(r.geom))
    LIMIT 1
  ),
  elevation_end = (
    SELECT ST_Value(dem.rast, ST_EndPoint(r.geom))
    FROM dem
    WHERE ST_Intersects(dem.rast, ST_EndPoint(r.geom))
    LIMIT 1
  )
WHERE elevation_start IS NULL OR elevation_end IS NULL;

-- =============================================
-- 第二步：计算平均坡度（百分比）
-- =============================================

UPDATE road
SET avg_slope = CASE 
  WHEN length_km > 0 
    AND elevation_start IS NOT NULL 
    AND elevation_end IS NOT NULL
  THEN ABS((elevation_end - elevation_start) / (length_km * 1000)) * 100
  ELSE 0
END;

-- =============================================
-- 第三步：计算最大坡度（简化版，使用平均坡度）
-- =============================================

UPDATE road
SET max_slope = avg_slope;

-- =============================================
-- 第四步：坡度分类
-- =============================================

UPDATE road
SET slope_category = CASE
  WHEN avg_slope < 3 THEN '平缓'
  WHEN avg_slope < 8 THEN '中等'
  WHEN avg_slope < 15 THEN '较陡'
  ELSE '陡峭'
END;

-- =============================================
-- 第五步：验证和统计
-- =============================================

-- 统计坡度分类分布
SELECT 
  slope_category,
  COUNT(*) as road_count,
  ROUND(AVG(avg_slope), 2) as avg_slope_value,
  ROUND(AVG(max_slope), 2) as avg_max_slope,
  ROUND(AVG(length_km), 2) as avg_length
FROM road
WHERE slope_category IS NOT NULL
GROUP BY slope_category
ORDER BY 
  CASE slope_category
    WHEN '平缓' THEN 1
    WHEN '中等' THEN 2
    WHEN '较陡' THEN 3
    WHEN '陡峭' THEN 4
  END;

-- 显示前10条最陡的道路
SELECT 
  id,
  name,
  road_type,
  length_km,
  elevation_start,
  elevation_end,
  avg_slope,
  max_slope,
  slope_category
FROM road
WHERE avg_slope IS NOT NULL
ORDER BY max_slope DESC
LIMIT 10;

-- 显示前10条最平缓的道路
SELECT 
  id,
  name,
  road_type,
  length_km,
  elevation_start,
  elevation_end,
  avg_slope,
  max_slope,
  slope_category
FROM road
WHERE avg_slope IS NOT NULL
ORDER BY avg_slope ASC
LIMIT 10;
