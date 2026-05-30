/**
 * 路线规划路由模块
 * 本模块负责处理所有与路线规划相关的API请求
 * 包括：路线规划、路线保存、路线列表查询、路线详情、删除路线、收藏路线、分享路线等功能
 * 核心技术：pgRouting最短路径算法、Dijkstra算法、DEM坡度分析、PostGIS空间查询
 */

const express = require('express');
const router = express.Router();
const { query, transaction } = require('../../config/database');
const { auth, optionalAuth } = require('../../middleware/auth');
const { v4: uuidv4 } = require('uuid');
// uuidv4 生成随机UUID ，用于唯一标识路线 ， 用于在数据库中唯一标识每条路线

/**
 * 创建空的坡度统计数据对象
 * 用于在无法计算坡度时返回默认的空数据结构
 * @returns {Object} 包含平缓、中等、较陡、陡峭坡段数量及最大/平均坡度
 */
const createEmptySlopeStats = () => ({
  flat: 0,           // 平缓坡段数量（坡度 < 3%）
  moderate: 0,        // 中等坡段数量（3% <= 坡度 < 8%）
  steep: 0,           // 较陡坡段数量（8% <= 坡度 < 15%）
  verySteep: 0,      // 陡峭坡段数量（坡度 >= 15%）
  maxSlope: 0,       // 最大坡度百分比
  avgSlope: 0,       // 平均坡度百分比
  totalElevationGain: 0  // 总爬升高程（米）
});

/**
 * 创建空的坡度因素数据对象
 * 用于在无法计算坡度因素时返回默认的空数据结构
 * @returns {Object} 包含数据源、路线长度、样本数、高程信息等
 */
const createEmptySlopeFactors = () => ({
  dataSource: 'DEM',           // 数据来源
  routeLengthMeters: 0,        // 路线长度（米）
  sampleCount: 0,               // 采样点总数
  coveredSampleCount: 0,       // 有高程数据的采样点数量
  coveredSegmentCount: 0,       // 有坡度数据的路段数量
  startElevation: null,         // 起点高程（米）
  endElevation: null,           // 终点高程（米）
  minElevation: null,          // 最低高程（米）
  maxElevation: null,          // 最高高程（米）
  uphillDistanceMeters: 0,     // 上坡距离（米）
  downhillDistanceMeters: 0    // 下坡距离（米）
});

/**
 * 将值转换为正整数
 * 如果值无效或小于等于0，则返回默认值
 * @param {any} value - 要转换的值
 * @param {number} fallback - 默认值
 * @returns {number} 正整数或默认值
 */
const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * 将值转换为布尔值
 * 支持布尔值和字符串 'true'/'false'
 * @param {any} value - 要转换的值
 * @returns {boolean|null} 布尔值或null
 */
const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
};

/**
 * 使用DEM数据进行路线坡度分析
 * 通过将路线与数字高程模型（DEM）进行空间分析，计算出沿线的高程变化和坡度信息
 *
 * 分析流程：
 * 1. 将路线几何转换为线段
 * 2. 根据路线长度生成等距采样点
 * 3. 从DEM中提取每个采样点的高程值
 * 4. 计算相邻采样点之间的坡度
 * 5. 统计各类坡度的路段数量
 *
 * @param {Object} routeGeom - GeoJSON格式的路线几何对象
 * @returns {Object} 包含坡度统计和坡度因素的详细分析结果
 */
const calculateDemSlopeAnalysis = async (routeGeom) => {
  try {
    /**
     * SQL查询解析：
     *
     * 1. route_line: 将输入的GeoJSON转换为PostGIS几何对象
     * 2. route_meta: 计算路线总长度，并根据长度确定采样点数量
     *    - 路线越长，采样点越多（每30米一个采样点，上限120个）
     * 3. samples: 使用generate_series生成等距采样点
     *    - 使用ST_LineInterpolatePoint沿路线插入点
     * 4. sampled_points: 从DEM栅格中提取每个采样点的高程值
     *    - 使用ST_Value从DEM中获取高程
     * 5. segments: 计算相邻采样点之间的坡度
     *    - 坡度 = 高程差 / 水平距离 * 100%
     * 6. segment_stats: 统计各类坡度的路段数量
     *    - flat: < 3% (平缓)
     *    - moderate: 3-8% (中等)
     *    - steep: 8-15% (较陡)
     *    - very_steep: >= 15% (陡峭)
     * 7. elevation_stats: 计算高程统计信息
     */
    const result = await query(`
      WITH route_line AS (
        -- 将GeoJSON格式的路线几何转换为PostGIS几何对象，并设置SRID为WGS84 (4326)
        SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
      ),
      -- 计算路由元数据，包括路线长度和采样点数量
      -- 采样点数量 = max(8, min(120, ceil(路线长度米 / 30)))
      route_meta AS (
        SELECT
          geom,
          -- 计算路线的地理长度（米）
          ST_Length(geom::geography) AS route_length_m,
          -- 根据路线长度动态计算采样点数量：
          -- 路线越短采样点越少（最少8个），越长越多（最多120个）
          -- 这样可以保证短路线不会采样过多，长路线不会采样过少
          GREATEST(8, LEAST(120, CEIL(ST_Length(geom::geography) / 30.0)::integer)) AS sample_segments
        FROM route_line
      ),
      -- 生成沿路线均匀分布的采样点
      -- generate_series生成从0到sample_segments的序列
      -- ST_LineInterpolatePoint沿路线按比例插入点
      samples AS (
        SELECT
          gs AS idx,  -- 采样点索引
          ST_LineInterpolatePoint(r.geom, gs::double precision / r.sample_segments) AS geom  -- 采样点位置
        FROM route_meta r
        CROSS JOIN LATERAL generate_series(0, r.sample_segments) AS gs
      ),
      -- 从DEM栅格数据中提取每个采样点的高程值
      -- ST_Value函数从栅格中获取指定位置的值
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
      -- 计算相邻采样点之间的坡度
      -- 坡度 = 高程差 / 水平距离 * 100%
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
            ELSE 0
          END AS slope_percent,  -- 坡度百分比
          -- 计算爬升高度（只计算上升的）
          GREATEST(COALESCE(p2.elevation - p1.elevation, 0), 0) AS uphill_gain,
          -- 计算下降高度（只计算下降的）
          GREATEST(COALESCE(p1.elevation - p2.elevation, 0), 0) AS downhill_drop
        FROM sampled_points p1
        JOIN sampled_points p2 ON p2.idx = p1.idx + 1  -- 关联相邻采样点
      ),
      -- 统计各类坡度的路段数量
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
      -- 计算高程统计信息
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
      )
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
    `, [JSON.stringify(routeGeom)]);

    // 提取查询结果
    const row = result.rows[0] || {};
    const slopeStats = row.slope_stats || createEmptySlopeStats();
    const slopeFactors = row.slope_factors || createEmptySlopeFactors();
    // 有数据的路段数量，用于判断坡度分析是否可用
    const coveredSegments = Number(slopeFactors.coveredSegmentCount || 0);

    return {
      slopeStats,      // 坡度统计数据
      slopeFactors,    // 坡度因素数据
      slopeAvailable: coveredSegments > 0  // 是否可以提供坡度分析
    };
  } catch (error) {
    // 如果DEM分析失败，返回空数据并标记为不可用
    console.error('DEM坡度分析计算失败:', error.message);
    return {
      slopeStats: createEmptySlopeStats(),
      slopeFactors: createEmptySlopeFactors(),
      slopeAvailable: false
    };
  }
};

/**
 * POST /route/plan
 * 路线规划API - 计算两个点之间的最短路径
 *
 * 请求参数：
 * - startLng, startLat: 起点经纬度
 * - endLng, endLat: 终点经纬度
 * - startName, endName: 起终点名称（可选）
 * - mode: 规划模式（fastest最快/red红色等）
 * - waypoints: 途经点数组（可选）
 * - avoidCongestion: 是否避让拥堵（可选）
 * - avoidSlope: 是否避让陡坡（可选）
 *
 * 返回数据：
 * - routeGeom: GeoJSON格式的路线几何
 * - totalDistance: 总距离（公里）
 * - totalTime: 总时间（分钟）
 * - calories: 预计消耗热量（卡路里）
 * - roadSegments: 路段详细信息数组
 * - slopeStats/slopeFactors: 坡度统计分析
 * - nearbyPois: 附近POI兴趣点
 * - redSpots: 红色景点（红色研学模式）
 */
router.post('/plan', auth, async (req, res) => {
  try {
    // 解析请求参数
    const {
      startLng, startLat, startName,        // 起点信息
      endLng, endLat, endName,              // 终点信息
      mode = 'fastest',                     // 规划模式：fastest最快/red红色/bike骑行等
      waypoints = [],                        // 途经点（预留）
      avoidCongestion = false,               // 避让拥堵（预留）
      avoidSlope = false                     // 避让陡坡
    } = req.body;

    // 参数验证：起终点坐标必须提供
    if (!startLng || !startLat || !endLng || !endLat) {
      return res.status(400).json({ code: 400, message: '起点和终点坐标不能为空' });
    }

    // 尝试使用 pgRouting 进行真实路线规划
    try {
      // 将经纬度转换为PostGIS点几何对象
      // ST_SetSRID设置坐标系为WGS84 (SRID 4326)
      // ST_MakePoint根据经纬度创建点
      const start = `ST_SetSRID(ST_MakePoint(${startLng}, ${startLat}), 4326)`;
      const end = `ST_SetSRID(ST_MakePoint(${endLng}, ${endLat}), 4326)`;

      // 定义成本列：使用length_km作为路径成本，即距离最短
      // reverseCostColumn用于处理双向道路的可通行成本
      const costColumn = 'length_km';
      const reverseCostColumn = costColumn;

      // 如果用户选择避让陡坡，添加坡度过滤条件
      // avg_slope < 8 表示平均坡度小于8%
      let slopeCondition = '';
      if (avoidSlope) {
        slopeCondition = ' AND (avg_slope IS NULL OR avg_slope < 8)';
      }

      /**
       * pgRouting最短路径查询解析：
       *
       * 1. start_vertex: 查找距离起点最近的拓扑顶点
       *    - road_vertices_pgr表存储道路网络的拓扑顶点
       *    - ORDER BY the_geom <-> start 按距离排序
       *    - LIMIT 1 取最近的顶点
       *
       * 2. end_vertex: 查找距离终点最近的拓扑顶点（同上）
       *
       * 3. route_path: 使用Dijkstra算法计算最短路径
       *    - pgr_dijkstra是pgRouting的核心函数
       *    - 参数1: 边查询SQL，包含边的ID、起点、终点、成本、反向成本
       *    - 参数2: 起点顶点ID
       *    - 参数3: 终点顶点ID
       *    - 参数4: directed=false表示无向图（道路双向通行）
       *    - 函数返回路径序列，包含每个路段的seq和edge
       *
       * 4. 最终SELECT:
       *    - ST_MakeLine(geom): 将所有路段几何合并成一条完整路线
       *    - SUM(length_km): 计算路线总长度
       *    - json_agg: 收集所有路段的详细信息
       */
      const routeResult = await query(`
        WITH start_vertex AS (
          -- 查找距离起点最近的拓扑顶点
          SELECT id, the_geom
          FROM road_vertices_pgr
          ORDER BY the_geom <-> ${start}  -- <-> 是PostGIS的距离操作符
          LIMIT 1
        ),
        end_vertex AS (
          -- 查找距离终点最近的拓扑顶点
          SELECT id, the_geom
          FROM road_vertices_pgr
          ORDER BY the_geom <-> ${end}
          LIMIT 1
        ),
        route_path AS (
          SELECT
            path.seq,      -- 路径序列号（用于排序）
            path.edge,     -- 边ID
            r.id as road_id,           -- 道路ID
            r.name as road_name,       -- 道路名称
             r.geom,                    -- 道路几何
             r.road_type,               -- 道路类型
             r.length_km,               -- 道路长度
             r.speed_limit,             -- 限速
             r.avg_slope,               -- 平均坡度
            r.max_slope,               -- 最大坡度
            r.slope_category,         -- 坡度分类
            r.elevation_start,         -- 道路起点高程
            r.elevation_end            -- 道路终点高程
          FROM pgr_dijkstra(
            -- 边查询：返回所有有效的道路边
            -- source/target是边的起点和终点顶点ID
            -- cost是沿边的通行成本（这里用长度）
            -- reverse_cost是反向通行成本（用于双向道路）
            'SELECT id, source, target, ${costColumn} as cost, ${reverseCostColumn} as reverse_cost FROM road WHERE source IS NOT NULL AND target IS NOT NULL${slopeCondition}',
            (SELECT id FROM start_vertex),  -- 起点顶点ID
            (SELECT id FROM end_vertex),    -- 终点顶点ID
            false  -- false表示无向图，true表示有向图
          ) AS path
          JOIN road r ON path.edge = r.id  -- 关联道路表获取详细信息
        )
        SELECT
          -- 将所有路段几何合并成一条线
          ST_AsGeoJSON(ST_MakeLine(geom))::json as route_geom,
          -- 计算总距离（公里）
          SUM(length_km) as total_distance,
          -- 计算总时间（分钟）= 距离/限速 * 60
          SUM(length_km / NULLIF(speed_limit, 0) * 60) as total_time,
          -- 收集所有路段的详细信息为JSON数组
          json_agg(json_build_object(
            'id', road_id,
            'name', road_name,
            'roadType', COALESCE(road_type, '城市道路'),
            'length', length_km,
            'avgSlope', COALESCE(avg_slope, 0),
            'maxSlope', COALESCE(max_slope, 0),
            'slopeCategory', COALESCE(slope_category, '平缓'),
            'elevationStart', elevation_start,
            'elevationEnd', elevation_end,
            'geometry', ST_AsGeoJSON(geom)::json
          ) ORDER BY seq) as road_segments
        FROM route_path
      `);

      // 如果没有找到路线（道路网络未配置或起点终点相距太远）
      if (routeResult.rows.length === 0 || !routeResult.rows[0].route_geom) {
        return res.status(404).json({ code: 404, message: '无法找到可行路线' });
      }

      // 提取路线结果
      const route = routeResult.rows[0];
      const totalDistance = parseFloat(route.total_distance) || 0;
      // 计算总时间，如果限速数据有问题则用距离*3估算
      const totalTime = parseInt(route.total_time) || Math.ceil(totalDistance * 3);
      // 计算热量消耗：约每公里30卡路里
      const calories = Math.round(totalDistance * 30);

      // 从路段数据计算坡度统计
      const roadSegments = route.road_segments || [];
      const roadSlopeStats = {
        flat: roadSegments.filter(r => r.slopeCategory === '平缓').length,
        moderate: roadSegments.filter(r => r.slopeCategory === '中等').length,
        steep: roadSegments.filter(r => r.slopeCategory === '较陡').length,
        verySteep: roadSegments.filter(r => r.slopeCategory === '陡峭').length,
        // 计算最大坡度
        maxSlope: Math.max(...roadSegments.map(r => r.maxSlope || 0), 0),
        // 计算平均坡度
        avgSlope: roadSegments.length > 0
          ? (roadSegments.reduce((sum, r) => sum + (r.avgSlope || 0), 0) / roadSegments.length).toFixed(2)
          : 0,
        // 计算总爬升高度
        totalElevationGain: roadSegments.reduce((sum, r) => {
          const gain = (r.elevationEnd || 0) - (r.elevationStart || 0);
          return sum + (gain > 0 ? gain : 0);
        }, 0)
      };

      // 使用DEM数据进行更精确的坡度分析
      const demSlopeAnalysis = await calculateDemSlopeAnalysis(route.route_geom);

      // 如果是红色研学模式，查找沿途的红色景点
      let redSpots = [];
      if (mode === 'red') {
        const redResult = await query(`
          SELECT id, name, description,
                 ST_AsGeoJSON(geom)::json as location,
                 -- 计算与路线的距离
                 ST_Distance(geom, ST_GeomFromGeoJSON('${JSON.stringify(route.route_geom)}')) as distance
          FROM poi
          WHERE is_red_spot = true  -- 只查询红色景点
          ORDER BY geom <-> ST_GeomFromGeoJSON('${JSON.stringify(route.route_geom)}')  -- 按与路线距离排序
          LIMIT 5  -- 只返回最近的5个
        `);
        redSpots = redResult.rows;
      }

      // 查询路线沿途200米范围内的POI兴趣点
      const nearbyPois = await query(`
        SELECT id, name, category,
               ST_AsGeoJSON(geom)::json as location,
               -- 计算POI到路线的距离（米）
               ST_Distance(geom::geography,
                 ST_GeomFromGeoJSON('${JSON.stringify(route.route_geom)}')::geography) as distance
        FROM poi
        WHERE ST_DWithin(
          geom::geography,  -- 将POI几何转地理类型
          ST_GeomFromGeoJSON('${JSON.stringify(route.route_geom)}')::geography,  -- 路线地理几何
          200  -- 200米范围内的POI
        )
        ORDER BY distance
        LIMIT 10
      `);

      // 将路线规划结果保存到数据库
      const result = await query(`
        INSERT INTO route_plan_result
          (user_id, plan_mode, start_point, end_point, start_name, end_name,
           route_geom, total_distance, total_time, total_calories, red_spots)
        VALUES
          ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326),
           ST_SetSRID(ST_MakePoint($5, $6), 4326), $7, $8,
           ST_GeomFromGeoJSON($9), $10, $11, $12, $13)
        RETURNING id
      `, [
        req.userId, mode, startLng, startLat, endLng, endLat,  // 用户ID、模式、起终点坐标
        startName || '起点', endName || '终点',  // 起终点名称
        JSON.stringify(route.route_geom),  // 路线几何
        totalDistance, totalTime, calories,  // 总距离、时间和热量
        JSON.stringify(redSpots)  // 红色景点
      ]);

      // 返回完整的路线规划结果
      res.json({
        code: 200,
        data: {
          id: result.rows[0].id,  // 规划记录ID
          routeGeom: route.route_geom,  // 路线几何
          totalDistance,  // 总距离
          totalTime,  // 总时间
          calories,  // 热量
          redSpots,  // 红色景点
          nearbyPois: nearbyPois.rows,  // 附近POI
          roadSegments,  // 路段详情
          roadSlopeStats,  // 路段坡度统计
          // 优先使用DEM坡度数据，如果不可用则使用路段坡度数据
          slopeStats: demSlopeAnalysis.slopeAvailable ? demSlopeAnalysis.slopeStats : roadSlopeStats,
          slopeFactors: demSlopeAnalysis.slopeFactors,  // 坡度因素
          // DEM可用或有路段数据时标记为可用
          slopeAvailable: demSlopeAnalysis.slopeAvailable || roadSegments.length > 0,
          slopeSource: demSlopeAnalysis.slopeAvailable ? 'dem' : 'road'  // 数据来源
        }
      });
    } catch (pgError) {
      // pgRouting规划失败时（道路网络未配置或查询错误）
      console.error('pgRouting 规划失败，使用模拟路线:', pgError.message);
      console.error('错误详情:', pgError);

      // 生成模拟直线路线作为备选方案
      const dx = endLng - startLng;
      const dy = endLat - startLat;
      // 使用勾股定理计算直线距离（经纬度1度约111公里）
      const distance = Math.sqrt(dx * dx + dy * dy) * 111;
      // 估算时间：每公里3分钟
      const time = Math.ceil(distance * 3);
      // 估算热量
      const calories = Math.round(distance * 30);

      // 生成模拟的直线路线几何
      const routeGeom = {
        type: 'LineString',
        coordinates: [
          [startLng, startLat],  // 起点
          [startLng + dx * 0.33, startLat + dy * 0.33],  // 三分之一处
          [startLng + dx * 0.66, startLat + dy * 0.66],  // 三分之二处
          [endLng, endLat]  // 终点
        ]
      };

      // 模拟路线没有红色景点
      const redSpots = [];
      // 仍然尝试使用DEM进行坡度分析
      const demSlopeAnalysis = await calculateDemSlopeAnalysis(routeGeom);
      const fallbackMaxSlope = Number(demSlopeAnalysis.slopeStats?.maxSlope || 0);
      const fallbackAvgSlope = Number(demSlopeAnalysis.slopeStats?.avgSlope || 0);
      const fallbackSlopeCategory = fallbackMaxSlope >= 15
        ? '陡峭'
        : fallbackMaxSlope >= 8
          ? '较陡'
          : fallbackAvgSlope >= 3
            ? '中等'
            : '平缓';
      const fallbackRoadSegments = [{
        id: null,
        name: '模拟路线',
        roadType: '模拟路线',
        length: Number(distance.toFixed(2)),
        avgSlope: fallbackAvgSlope,
        maxSlope: fallbackMaxSlope,
        slopeCategory: fallbackSlopeCategory,
        elevationStart: demSlopeAnalysis.slopeFactors?.startElevation ?? null,
        elevationEnd: demSlopeAnalysis.slopeFactors?.endElevation ?? null,
        geometry: routeGeom
      }];

      // 返回模拟路线结果
      res.json({
        code: 200,
        data: {
          id: Date.now(),  // 使用时间戳作为临时ID
          routeGeom: routeGeom,
          totalDistance: distance.toFixed(2),
          totalTime: time,
          calories: calories,
          redSpots: redSpots,
          nearbyPois: [],
          roadSegments: fallbackRoadSegments,
          roadSlopeStats: createEmptySlopeStats(),
          slopeStats: demSlopeAnalysis.slopeStats,
          slopeFactors: demSlopeAnalysis.slopeFactors,
          slopeAvailable: demSlopeAnalysis.slopeAvailable,
          slopeSource: demSlopeAnalysis.slopeAvailable ? 'dem' : 'none'
        },
        message: '使用模拟路线（实际道路网络未配置）'  // 提示用户这是模拟数据
      });
    }
  } catch (error) {
    // 捕获所有错误
    console.error('路线规划失败:', error);
    res.status(500).json({ code: 500, message: '路线规划失败', error: error.message });
  }
});

/**
 * POST /route/save
 * 保存用户路线到数据库
 * 用户规划的路线可以保存到个人账户中，方便后续查看和使用
 *
 * 请求参数：
 * - routeName: 路线名称
 * - routeGeom: GeoJSON格式的路线几何
 * - startLng, startLat: 起点坐标
 * - endLng, endLat: 终点坐标
 * - startName, endName: 起终点名称
 * - totalDistance: 总距离
 * - totalTime: 总时间
 *
 * 返回数据：
 * - id: 保存的路线ID
 * - share_code: 分享码（用于分享给他人）
 */
router.post('/save', auth, async (req, res) => {
  try {
    const {
      routeName, routeGeom,          // 路线名称和几何
      startLng, startLat, startName, // 起点信息
      endLng, endLat, endName,       // 终点信息
      totalDistance, totalTime        // 总距离和时间
    } = req.body;

    // 生成8位随机分享码（大写字母和数字）
    const shareCode = uuidv4().substring(0, 8).toUpperCase();

    // 将路线保存到数据库
    const result = await query(`
      INSERT INTO user_route
        (user_id, route_name, route_geom, start_point, end_point,
         start_name, end_name, total_distance, total_time, share_code)
      VALUES
        ($1, $2, ST_GeomFromJSON($3),  -- 将GeoJSON转PostGIS几何
         ST_SetSRID(ST_MakePoint($4, $5), 4326),  -- 起点
         ST_SetSRID(ST_MakePoint($6, $7), 4326),  -- 终点
         $8, $9, $10, $11, $12)
      RETURNING id, share_code
    `, [
      req.userId,                       // 用户ID
      routeName || '我的路线',           // 路线名称，默认"我的路线"
      JSON.stringify(routeGeom),        // 路线几何
      startLng, startLat,               // 起点坐标
      endLng, endLat,                   // 终点坐标
      startName || '起点', endName || '终点',  // 起终点名称
      totalDistance, totalTime,          // 总距离和时间
      shareCode                         // 分享码
    ]);

    res.json({
      code: 200,
      message: '路线保存成功',
      data: result.rows[0]  // 返回ID和分享码
    });
  } catch (error) {
    console.error('保存路线失败:', error);
    res.status(500).json({ code: 500, message: '保存路线失败' });
  }
});

/**
 * GET /route/list
 * 获取当前用户的路线列表
 * 支持分页查询，按创建时间倒序排列
 *
 * 查询参数：
 * - page: 页码（默认1）
 * - limit: 每页数量（默认10）
 *
 * 返回数据：
 * - list: 路线列表
 * - total: 总数量
 * - page: 当前页码
 * - limit: 每页数量
 */
router.get('/list', auth, async (req, res) => {
  try {
    // 解析分页参数
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;  // 计算偏移量

    // 查询用户的路线列表
    const result = await query(
      `SELECT id, route_name, start_name, end_name, total_distance, total_time,
              is_favorite, share_code, share_count, created_at  -- 选择需要的字段
       FROM user_route
       WHERE user_id = $1  -- 只查询当前用户的路线
       ORDER BY created_at DESC  -- 按创建时间倒序
       LIMIT $2 OFFSET $3`,  -- 分页
      [req.userId, limit, offset]
    );

    // 查询总数（用于分页）
    const countResult = await query(
      'SELECT COUNT(*) FROM user_route WHERE user_id = $1',
      [req.userId]
    );

    res.json({
      code: 200,
      data: {
        list: result.rows,
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取路线列表失败:', error);
    res.status(500).json({ code: 500, message: '获取路线列表失败' });
  }
});

/**
 * GET /route/roads
 * 获取道路数据（用于在地图上显示道路）
 * 这是一个公开接口，不需要登录即可访问
 *
 * 查询参数：
 * - page: 页码
 * - limit: 每页数量（最大2000）
 * - bounds: 边界框 (minLng,minLat,maxLng,maxLat)
 * - keyword: 搜索关键字（模糊匹配道路名称）
 * - roadType: 道路类型
 * - bikeOnly: 是否只返回自行车道
 * - status: 道路状态
 *
 * 返回数据：
 * - roads: 道路列表
 * - total: 总数量
 * - stats: 统计信息（道路总数、自行车道数量、总长度）
 */
router.get('/roads', optionalAuth, async (req, res) => {
  try {
    // 解析分页参数，带默认值和上限
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(toPositiveInt(req.query.limit, 1000), 2000);  // 最多2000条
    const offset = (page - 1) * limit;

    // 解析筛选参数
    const { bounds, keyword, roadType, status } = req.query;
    const bikeOnly = toBoolean(req.query.bikeOnly);  // 转换为布尔值

    // 构建WHERE子句
    const whereClauses = ['1=1'];  // 始终为true的条件，作为AND的起始
    const params = [];  // 参数数组

    // 关键字搜索：模糊匹配道路名称
    if (keyword) {
      params.push(`%${keyword}%`);
      whereClauses.push(`name ILIKE $${params.length}`);
    }

    // 道路类型筛选
    if (roadType) {
      params.push(roadType);
      whereClauses.push(`road_type = $${params.length}`);
    }

    // 道路状态筛选
    if (status) {
      params.push(status);
      whereClauses.push(`status = $${params.length}`);
    }

    // 只返回自行车道
    if (bikeOnly === true) {
      whereClauses.push('is_bike_lane = true');
    }

    // 边界框筛选：只返回在指定范围内的道路
    if (bounds) {
      // bounds格式: "minLng,minLat,maxLng,maxLat"
      const [minLng, minLat, maxLng, maxLat] = bounds.split(',').map(Number);
      if ([minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
        params.push(minLng, minLat, maxLng, maxLat);
        // ST_MakeEnvelope创建矩形边界框
        // ST_Intersects判断道路几何是否与边界框相交
        whereClauses.push(`
          ST_Intersects(
            geom,
            ST_MakeEnvelope(
              $${params.length - 3},
              $${params.length - 2},
              $${params.length - 1},
              $${params.length},
              4326
            )
          )
        `);
      }
    }

    // 组合WHERE子句
    const whereSql = whereClauses.join(' AND ');
    const listParams = [...params, limit, offset];

    // 并行执行三个查询：列表、总数、统计
    const [result, countResult, statsResult] = await Promise.all([
      // 查询道路列表
      query(`
        SELECT
          id,
          name,
          road_type,
          length_km,
          speed_limit,
          is_bike_lane,
          status,
          avg_slope,
          max_slope,
          slope_category,
          ST_AsGeoJSON(geom)::json AS geometry  -- 转换为GeoJSON
        FROM road
        WHERE ${whereSql}
        ORDER BY length_km DESC NULLS LAST, id DESC  -- 按长度降序
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `, listParams),
      // 查询总数
      query(`
        SELECT COUNT(*)::int AS total
        FROM road
        WHERE ${whereSql}
      `, params),
      // 查询统计信息
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE is_bike_lane = true)::int AS bike_lane_count,
          ROUND(COALESCE(SUM(length_km), 0)::numeric, 2) AS total_length_km
        FROM road
        WHERE ${whereSql}
      `, params)
    ]);

    res.json({
      code: 200,
      data: {
        roads: result.rows,  // 道路列表
        total: countResult.rows[0]?.total || 0,  // 总数
        page,
        limit,
        stats: statsResult.rows[0] || {  // 统计信息
          total: 0,
          bike_lane_count: 0,
          total_length_km: 0
        }
      }
    });
  } catch (error) {
    console.error('获取道路数据失败:', error);
    res.status(500).json({ code: 500, message: '获取道路数据失败' });
  }
});

/**
 * GET /route/:id
 * 获取路线详情
 * 根据路线ID查询路线的完整信息
 * 公开接口，但需要提供有效的路线ID
 *
 * 返回数据：
 * - 路线基本信息
 * - 路线几何（GeoJSON格式）
 * - 起终点坐标
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, route_name, start_name, end_name, total_distance, total_time,
              is_favorite, share_code, share_count, created_at,
              ST_AsGeoJSON(route_geom)::json as route_geom,  -- 路线几何
              ST_AsGeoJSON(start_point)::json as start_point,  -- 起点坐标
              ST_AsGeoJSON(end_point)::json as end_point  -- 终点坐标
       FROM user_route
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '路线不存在' });
    }

    res.json({ code: 200, data: result.rows[0] });
  } catch (error) {
    console.error('获取路线详情失败:', error);
    res.status(500).json({ code: 500, message: '获取路线详情失败' });
  }
});

/**
 * DELETE /route/:id
 * 删除路线
 * 用户只能删除自己的路线
 *
 * 返回：删除成功/路线不存在或无权删除
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM user_route WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '路线不存在或无权删除' });
    }

    res.json({ code: 200, message: '删除成功' });
  } catch (error) {
    console.error('删除路线失败:', error);
    res.status(500).json({ code: 500, message: '删除路线失败' });
  }
});

/**
 * POST /route/:id/favorite
 * 切换路线收藏状态
 * 如果当前未收藏，则标记为收藏；如果已收藏，则取消收藏
 */
router.post('/:id/favorite', auth, async (req, res) => {
  try {
    // NOT is_favorite 实现切换逻辑
    await query(
      'UPDATE user_route SET is_favorite = NOT is_favorite WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    res.json({ code: 200, message: '操作成功' });
  } catch (error) {
    console.error('收藏操作失败:', error);
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});

/**
 * GET /route/share/:code
 * 通过分享码获取路线
 * 用户可以通过分享码查看他人分享的路线
 * 这是一个公开接口
 *
 * 返回数据：
 * - 路线基本信息
 * - 路线几何
 * - 创建者昵称
 *
 * 同时会自动增加分享次数
 */
router.get('/share/:code', async (req, res) => {
  try {
    // 通过分享码查询路线
    const result = await query(
      `SELECT ur.id, ur.route_name, ur.start_name, ur.end_name,
              ur.total_distance, ur.total_time, ur.created_at,
              ur.share_count,
              ST_AsGeoJSON(ur.route_geom)::json as route_geom,
              u.nickname as creator_name  -- 关联查询创建者昵称
       FROM user_route ur
       JOIN "user" u ON ur.user_id = u.id  -- JOIN用户表获取昵称
       WHERE ur.share_code = $1`,
      [req.params.code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '路线不存在' });
    }

    // 增加分享次数
    await query(
      'UPDATE user_route SET share_count = share_count + 1 WHERE share_code = $1',
      [req.params.code]
    );

    res.json({ code: 200, data: result.rows[0] });
  } catch (error) {
    console.error('获取分享路线失败:', error);
    res.status(500).json({ code: 500, message: '获取分享路线失败' });
  }
});

module.exports = router;
