-- =============================================
-- 计算道路坡度（需要先导入DEM数据）
-- =============================================

-- 说明：
-- 1. 需要先创建dem表并导入DEM数据
-- 2. 使用raster2pgsql导入：raster2pgsql -s 4326 -t 250 dem.tif public.dem
-- 3. 执行此脚本计算坡度

-- =============================================
-- 第一步：计算道路起点和终点的高程
-- =============================================

UPDATE road r
SET 
  elevation_start = (
    SELECT ST_Value(dem.rast, ST_Transform(ST_StartPoint(r.geom), 3857))
    FROM dem
    LIMIT 1
  ),
  elevation_end = (
    SELECT ST_Value(dem.rast, ST_Transform(ST_EndPoint(r.geom), 3857))
    FROM dem
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
  THEN ABS((elevation_end - elevation_start) / length_km) * 100
  ELSE 0
END;

-- =============================================
-- 第三步：计算最大坡度（分段计算）
-- =============================================

-- 创建临时表存储道路分段坡度
DROP TABLE IF EXISTS temp_road_segments;
CREATE TEMP TABLE temp_road_segments AS
SELECT 
  r.id as road_id,
  (ST_DumpPoints(r.geom)).geom as point_geom,
  ST_Value(dem.rast, ST_Transform((ST_DumpPoints(r.geom)).geom, 3857)) as elevation
FROM road r
CROSS JOIN dem ON ST_Intersects(r.geom, dem.rast)
WHERE r.id % 100 = 0;  -- 先处理部分道路，避免内存溢出

-- 计算相邻点之间的坡度
DROP TABLE IF EXISTS temp_segment_slopes;
CREATE TEMP TABLE temp_segment_slopes AS
SELECT 
  road_id,
  ABS((lead_elevation - elevation) / 
        ST_Distance_Sphere(
          point_geom, 
          lead_point_geom
        ) * 100000) * 100 as segment_slope
FROM (
  SELECT 
    road_id,
    point_geom,
    elevation,
    LEAD(point_geom) OVER (PARTITION BY road_id ORDER BY point_geom <-> point_geom) as lead_point_geom,
    LEAD(elevation) OVER (PARTITION BY road_id ORDER BY point_geom <-> point_geom) as lead_elevation
  FROM temp_road_segments
  WHERE elevation IS NOT NULL
) sub
WHERE lead_elevation IS NOT NULL;

-- 计算每条道路的最大坡度
UPDATE road r
SET max_slope = COALESCE((
  SELECT MAX(ABS(segment_slope))
  FROM temp_segment_slopes
  WHERE road_id = r.id
), 0);

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
