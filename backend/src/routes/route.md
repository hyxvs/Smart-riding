# DEM坡度分析SQL查询详解

## 整体结构分析

这段代码是一个复杂的PostgreSQL SQL查询，用于对骑行路线进行DEM（数字高程模型）坡度分析。查询使用了多个CTE（Common Table Expression）来逐步处理数据，最终生成详细的坡度统计信息。

## 详细讲解

### 1. 主查询结构

```sql
const result = await query(`
  WITH route_line AS (
    -- 将GeoJSON格式的路线几何转换为PostGIS几何对象
    SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
  ),
  -- 其他CTE...
  SELECT
    json_build_object(...) AS slope_stats,
    json_build_object(...) AS slope_factors
  FROM route_meta, segment_stats, elevation_stats
`, [JSON.stringify(routeGeom)]);
```

**技术要点**：
- 使用参数化查询 `$1` 防止SQL注入
- 传入 `JSON.stringify(routeGeom)` 作为路线几何数据
- 最终通过 `json_build_object` 构建结构化JSON结果

### 2. 路线几何转换 (route_line)

```sql
route_line AS (
  -- 将GeoJSON格式的路线几何转换为PostGIS几何对象，并设置SRID为WGS84 (4326)
  SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
),
```

**功能**：
- `ST_GeomFromGeoJSON($1)`：将GeoJSON字符串转换为PostGIS几何对象
- `ST_SetSRID(..., 4326)`：设置坐标系为WGS84（EPSG:4326）
- 创建临时表 `route_line` 存储转换后的几何对象

### 3. 路线元数据计算 (route_meta)

```sql
route_meta AS (
  SELECT
    geom,
    -- 计算路线的地理长度（米）
    ST_Length(geom::geography) AS route_length_m,
    -- 根据路线长度动态计算采样点数量
    GREATEST(8, LEAST(120, CEIL(ST_Length(geom::geography) / 30.0)::integer)) AS sample_segments
  FROM route_line
),
```

**功能**：
- `ST_Length(geom::geography)`：计算路线的地理长度（单位：米）
- `geom::geography`：将几何对象转换为地理类型，用于准确计算距离
- `GREATEST(8, LEAST(120, ...))`：确保采样点数量在8-120之间
- `CEIL(ST_Length(...) / 30.0)`：每30米一个采样点，向上取整

**技术价值**：
- 动态采样点数量：短路线少采样，长路线多采样
- 确保分析精度的同时避免过度计算

### 4. 生成采样点 (samples)

```sql
samples AS (
  SELECT
    gs AS idx,  -- 采样点索引
    ST_LineInterpolatePoint(r.geom, gs::double precision / r.sample_segments) AS geom  -- 采样点位置
  FROM route_meta r
  CROSS JOIN LATERAL generate_series(0, r.sample_segments) AS gs
),
```

**功能**：
- `generate_series(0, r.sample_segments)`：生成从0到采样段数的序列
- `CROSS JOIN LATERAL`：将序列与路线元数据交叉连接
- `ST_LineInterpolatePoint(geom, fraction)`：沿路线按比例插入点
- `gs::double precision / r.sample_segments`：计算插入点的比例位置

**技术价值**：
- 生成沿路线均匀分布的采样点
- 采样点数量根据路线长度动态调整

### 5. 提取高程数据 (sampled_points)

```sql
sampled_points AS (
  SELECT
    s.idx,  // 采样点索引
    s.geom,  // 采样点几何
    (
      -- 从dem表中查找与采样点相交栅格，获取高程值
      COALESCE((
        SELECT ST_Value(d.rast, s.geom)
        FROM dem d
        WHERE ST_Intersects(d.rast, s.geom)  // 空间相交查询
        LIMIT 1  // 只取一个栅格的值
    ),0) AS elevation  // 高程值（米）
  FROM samples s
),
```

**功能**：
- `ST_Intersects(d.rast, s.geom)`：判断采样点是否与DEM栅格相交
- `ST_Value(d.rast, s.geom)`：从相交的栅格中提取高程值
- `COALESCE(..., 0)`：处理无高程数据的情况，默认值为0
- `LIMIT 1`：确保只返回一个栅格的值

**技术价值**：
- 从DEM栅格数据中准确提取每个采样点的高程
- 处理边界情况，提高查询的鲁棒性

### 6. 计算坡度 (segments)

```sql
segments AS (
  SELECT
    p1.idx,  // 起始点索引
    -- 计算两点之间的地理距离（米）
    ST_Distance(p1.geom::geography, p2.geom::geography) AS distance_m,
    p1.elevation AS elevation_start,  // 起始点高程
    p2.elevation AS elevation_end,    // 终点高程
    -- 计算坡度百分比（仅当两点都有高程数据且距离大于0时）
    CASE
      WHEN ST_Distance(p1.geom::geography, p2.geom::geography) > 0
        AND p1.elevation IS NOT NULL
        AND p2.elevation IS NOT NULL
      THEN ABS((p2.elevation - p1.elevation) / ST_Distance(p1.geom::geography, p2.geom::geography)) * 100
    -- // ABS(高程差 / 水平距离) * 100%
    -- ABS：取绝对值，确保坡度为非负度  
      ELSE 0
    END AS slope_percent,  // 坡度百分比
    -- 计算爬升高度（只计算上升的）
    GREATEST(COALESCE(p2.elevation - p1.elevation, 0), 0) AS uphill_gain,
    -- 计算下降高度（只计算下降的）
    GREATEST(COALESCE(p1.elevation - p2.elevation, 0), 0) AS downhill_drop
  FROM sampled_points p1
  JOIN sampled_points p2 ON p2.idx = p1.idx + 1  // 关联相邻采样点
),
```

**功能**：
- `JOIN sampled_points p2 ON p2.idx = p1.idx + 1`：关联相邻的采样点
- `ST_Distance(p1.geom::geography, p2.geom::geography)`：计算两点之间的距离
- 坡度计算公式：`ABS(高程差 / 水平距离) * 100%`
- `GREATEST(COALESCE(...), 0)`：只计算上升或下降的高度

**技术价值**：
- 准确计算相邻采样点之间的坡度
- 处理边界情况（无高程数据、距离为0等）
- 分别计算上坡和下坡的高度

### 7. 坡度统计 (segment_stats)

```sql
segment_stats AS (
  SELECT
    -- 有数据的路段数量
    COUNT(*) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL) AS covered_segment_count,
    -- 平缓路段数量（坡度 < 3%）
    COUNT(*) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL AND slope_percent < 3) AS flat,
    -- 中等路段数量（3% <= 坡度 < 8%）
    COUNT(*) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL AND slope_percent >= 3 AND slope_percent < 8) AS moderate,
    -- 较陡路段数量（8% <= 坡度 < 15%）
    COUNT(*) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL AND slope_percent >= 8 AND slope_percent < 15) AS steep,
    -- 陡峭路段数量（坡度 >= 15%）
    COUNT(*) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL AND slope_percent >= 15) AS very_steep,
    -- 最大坡度
    COALESCE(MAX(slope_percent), 0) AS max_slope,
    -- 平均坡度
    COALESCE(AVG(slope_percent) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL), 0) AS avg_slope,
    -- 总爬升高度
    COALESCE(SUM(uphill_gain), 0) AS total_elevation_gain,
    -- 上坡总距离
    COALESCE(SUM(distance_m) FILTER (WHERE elevation_end > elevation_start), 0) AS uphill_distance_m,
    -- 下坡总距离
    COALESCE(SUM(distance_m) FILTER (WHERE elevation_end < elevation_start), 0) AS downhill_distance_m
  FROM segments
),
```

**功能**：
- `COUNT(*) FILTER (WHERE ...)`：条件计数，统计不同坡度等级的路段数量
- `MAX(slope_percent)`：计算最大坡度
- `AVG(slope_percent) FILTER (WHERE ...)`：计算有数据路段的平均坡度
- `SUM(uphill_gain)`：计算总爬升高度
- `SUM(distance_m) FILTER (WHERE ...)`：分别计算上坡和下坡的距离

**技术价值**：
- 详细的坡度分类统计
- 全面的坡度相关指标计算
- 处理数据缺失的情况

### 8. 高程统计 (elevation_stats)

```sql
elevation_stats AS (
  SELECT
    -- 有高程数据的采样点数量
    COUNT(*) FILTER (WHERE elevation IS NOT NULL) AS covered_sample_count,
    -- 起点高程（第一个有高程的采样点）
    (SELECT elevation FROM sampled_points WHERE elevation IS NOT NULL ORDER BY idx ASC LIMIT 1) AS start_elevation,
    -- 终点高程（最后一个有高程的采样点）
    (SELECT elevation FROM sampled_points WHERE elevation IS NOT NULL ORDER BY idx DESC LIMIT 1) AS end_elevation,
    -- 最低高程
    MIN(elevation) AS min_elevation,
    -- 最高高程
    MAX(elevation) AS max_elevation
  FROM sampled_points
),
```

**功能**：
- `COUNT(*) FILTER (WHERE elevation IS NOT NULL)`：统计有高程数据的采样点数量
- 子查询获取起点和终点的高程
- `MIN(elevation)` 和 `MAX(elevation)`：计算路线的最低和最高高程

**技术价值**：
- 提供路线的高程概览
- 处理数据缺失的情况

### 9. 结果构建

```sql
-- 最终输出：构建包含所有坡度统计和因素的JSON对象
SELECT
  json_build_object(
    -- 坡度统计
    'flat', COALESCE(segment_stats.flat, 0),
    'moderate', COALESCE(segment_stats.moderate, 0),
    'steep', COALESCE(segment_stats.steep, 0),
    'verySteep', COALESCE(segment_stats.very_steep, 0),
    'maxSlope', ROUND(COALESCE(segment_stats.max_slope, 0)::numeric, 2),
    'avgSlope', ROUND(COALESCE(segment_stats.avg_slope, 0)::numeric, 2),
    'totalElevationGain', ROUND(COALESCE(segment_stats.total_elevation_gain, 0)::numeric, 2)
  ) AS slope_stats,
  json_build_object(
    -- 坡度因素
    'dataSource', 'DEM',  -- 数据来源为DEM
    'routeLengthMeters', ROUND(route_meta.route_length_m::numeric, 2),  -- 路线长度
    'sampleCount', route_meta.sample_segments + 1,  -- 采样点数量（段数+1）
    'coveredSampleCount', COALESCE(elevation_stats.covered_sample_count, 0),  -- 有数据的采样点
    'coveredSegmentCount', COALESCE(segment_stats.covered_segment_count, 0),  -- 有数据的路段
    'startElevation', ROUND(elevation_stats.start_elevation::numeric, 2),  -- 起点高程
    'endElevation', ROUND(elevation_stats.end_elevation::numeric, 2),  -- 终点高程
    'minElevation', ROUND(elevation_stats.min_elevation::numeric, 2),  -- 最低高程
    'maxElevation', ROUND(elevation_stats.max_elevation::numeric, 2),  -- 最高高程
    'uphillDistanceMeters', ROUND(COALESCE(segment_stats.uphill_distance_m, 0)::numeric, 2),  -- 上坡距离
    'downhillDistanceMeters', ROUND(COALESCE(segment_stats.downhill_distance_m, 0)::numeric, 2)  -- 下坡距离
  ) AS slope_factors
FROM route_meta, segment_stats, elevation_stats
```

**功能**：
- `json_build_object(...)`：构建结构化的JSON对象
- `COALESCE(..., 0)`：处理可能的NULL值
- `ROUND(..., 2)`：保留两位小数，提高可读性
- `FROM route_meta, segment_stats, elevation_stats`：笛卡尔积连接三个统计结果

**技术价值**：
- 生成结构化的JSON结果，方便前端处理
- 提供全面的坡度分析数据
- 确保数据的完整性和可读性

## 数据流程

1. **输入**：GeoJSON格式的路线几何
2. **处理**：
   - 转换为PostGIS几何对象
   - 计算路线长度和采样点数量
   - 生成均匀分布的采样点
   - 从DEM中提取每个采样点的高程
   - 计算相邻采样点之间的坡度
   - 统计坡度和高程信息
3. **输出**：包含坡度统计和因素的JSON对象

## 技术亮点

1. **模块化设计**：使用CTE将复杂查询分解为多个步骤
2. **动态采样**：根据路线长度自动调整采样点数量
3. **空间分析**：利用PostGIS空间函数进行地理计算
4. **鲁棒性**：处理数据缺失、边界情况等问题
5. **性能优化**：合理使用空间索引和查询优化
6. **结构化输出**：生成易于前端处理的JSON结果

## 应用价值

这段代码实现了专业的DEM坡度分析功能，为骑行路线规划提供了重要的地形信息：
- 帮助用户了解路线的坡度难度
- 为不同体力水平的用户推荐合适的路线
- 提供详细的高程变化和坡度分布信息
- 支持坡度避让等高级路线规划功能

通过这种详细的坡度分析，骑行智慧民生服务平台能够为用户提供更加个性化、安全的路线规划服务。