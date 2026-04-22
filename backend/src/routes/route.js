const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { auth, optionalAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const createEmptySlopeStats = () => ({
  flat: 0,
  moderate: 0,
  steep: 0,
  verySteep: 0,
  maxSlope: 0,
  avgSlope: 0,
  totalElevationGain: 0
});

const createEmptySlopeFactors = () => ({
  dataSource: 'DEM',
  routeLengthMeters: 0,
  sampleCount: 0,
  coveredSampleCount: 0,
  coveredSegmentCount: 0,
  startElevation: null,
  endElevation: null,
  minElevation: null,
  maxElevation: null,
  uphillDistanceMeters: 0,
  downhillDistanceMeters: 0
});

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
};

const calculateDemSlopeAnalysis = async (routeGeom) => {
  try {
    const result = await query(`
      WITH route_line AS (
        SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
      ),
      route_meta AS (
        SELECT
          geom,
          ST_Length(geom::geography) AS route_length_m,
          GREATEST(8, LEAST(120, CEIL(ST_Length(geom::geography) / 30.0)::integer)) AS sample_segments
        FROM route_line
      ),
      samples AS (
        SELECT
          gs AS idx,
          ST_LineInterpolatePoint(r.geom, gs::double precision / r.sample_segments) AS geom
        FROM route_meta r
        CROSS JOIN LATERAL generate_series(0, r.sample_segments) AS gs
      ),
      sampled_points AS (
        SELECT
          s.idx,
          s.geom,
          (
            SELECT ST_Value(d.rast, s.geom)
            FROM dem d
            WHERE ST_Intersects(d.rast, s.geom)
            LIMIT 1
          ) AS elevation
        FROM samples s
      ),
      segments AS (
        SELECT
          p1.idx,
          ST_Distance(p1.geom::geography, p2.geom::geography) AS distance_m,
          p1.elevation AS elevation_start,
          p2.elevation AS elevation_end,
          CASE
            WHEN ST_Distance(p1.geom::geography, p2.geom::geography) > 0
              AND p1.elevation IS NOT NULL
              AND p2.elevation IS NOT NULL
            THEN ABS((p2.elevation - p1.elevation) / ST_Distance(p1.geom::geography, p2.geom::geography)) * 100
            ELSE 0
          END AS slope_percent,
          GREATEST(COALESCE(p2.elevation - p1.elevation, 0), 0) AS uphill_gain,
          GREATEST(COALESCE(p1.elevation - p2.elevation, 0), 0) AS downhill_drop
        FROM sampled_points p1
        JOIN sampled_points p2 ON p2.idx = p1.idx + 1
      ),
      segment_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL) AS covered_segment_count,
          COUNT(*) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL AND slope_percent < 3) AS flat,
          COUNT(*) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL AND slope_percent >= 3 AND slope_percent < 8) AS moderate,
          COUNT(*) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL AND slope_percent >= 8 AND slope_percent < 15) AS steep,
          COUNT(*) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL AND slope_percent >= 15) AS very_steep,
          COALESCE(MAX(slope_percent), 0) AS max_slope,
          COALESCE(AVG(slope_percent) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL), 0) AS avg_slope,
          COALESCE(SUM(uphill_gain), 0) AS total_elevation_gain,
          COALESCE(SUM(distance_m) FILTER (WHERE elevation_end > elevation_start), 0) AS uphill_distance_m,
          COALESCE(SUM(distance_m) FILTER (WHERE elevation_end < elevation_start), 0) AS downhill_distance_m
        FROM segments
      ),
      elevation_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE elevation IS NOT NULL) AS covered_sample_count,
          (SELECT elevation FROM sampled_points WHERE elevation IS NOT NULL ORDER BY idx ASC LIMIT 1) AS start_elevation,
          (SELECT elevation FROM sampled_points WHERE elevation IS NOT NULL ORDER BY idx DESC LIMIT 1) AS end_elevation,
          MIN(elevation) AS min_elevation,
          MAX(elevation) AS max_elevation
        FROM sampled_points
      )
      SELECT
        json_build_object(
          'flat', COALESCE(segment_stats.flat, 0),
          'moderate', COALESCE(segment_stats.moderate, 0),
          'steep', COALESCE(segment_stats.steep, 0),
          'verySteep', COALESCE(segment_stats.very_steep, 0),
          'maxSlope', ROUND(COALESCE(segment_stats.max_slope, 0)::numeric, 2),
          'avgSlope', ROUND(COALESCE(segment_stats.avg_slope, 0)::numeric, 2),
          'totalElevationGain', ROUND(COALESCE(segment_stats.total_elevation_gain, 0)::numeric, 2)
        ) AS slope_stats,
        json_build_object(
          'dataSource', 'DEM',
          'routeLengthMeters', ROUND(route_meta.route_length_m::numeric, 2),
          'sampleCount', route_meta.sample_segments + 1,
          'coveredSampleCount', COALESCE(elevation_stats.covered_sample_count, 0),
          'coveredSegmentCount', COALESCE(segment_stats.covered_segment_count, 0),
          'startElevation', ROUND(elevation_stats.start_elevation::numeric, 2),
          'endElevation', ROUND(elevation_stats.end_elevation::numeric, 2),
          'minElevation', ROUND(elevation_stats.min_elevation::numeric, 2),
          'maxElevation', ROUND(elevation_stats.max_elevation::numeric, 2),
          'uphillDistanceMeters', ROUND(COALESCE(segment_stats.uphill_distance_m, 0)::numeric, 2),
          'downhillDistanceMeters', ROUND(COALESCE(segment_stats.downhill_distance_m, 0)::numeric, 2)
        ) AS slope_factors
      FROM route_meta, segment_stats, elevation_stats
    `, [JSON.stringify(routeGeom)]);

    const row = result.rows[0] || {};
    const slopeStats = row.slope_stats || createEmptySlopeStats();
    const slopeFactors = row.slope_factors || createEmptySlopeFactors();
    const coveredSegments = Number(slopeFactors.coveredSegmentCount || 0);

    return {
      slopeStats,
      slopeFactors,
      slopeAvailable: coveredSegments > 0
    };
  } catch (error) {
    console.error('DEM坡度分析计算失败:', error.message);
    return {
      slopeStats: createEmptySlopeStats(),
      slopeFactors: createEmptySlopeFactors(),
      slopeAvailable: false
    };
  }
};

router.post('/plan', auth, async (req, res) => {
  try {
    const {
      startLng, startLat, startName,
      endLng, endLat, endName,
      mode = 'fastest',
      waypoints = [],
      avoidCongestion = false,
      avoidSlope = false
    } = req.body;

    if (!startLng || !startLat || !endLng || !endLat) {
      return res.status(400).json({ code: 400, message: '起点和终点坐标不能为空' });
    }

    // 尝试使用 pgRouting 进行路线规划
    try {
      const start = `ST_SetSRID(ST_MakePoint(${startLng}, ${startLat}), 4326)`;
      const end = `ST_SetSRID(ST_MakePoint(${endLng}, ${endLat}), 4326)`;

      // 只使用最短模式：距离最短
      const costColumn = 'length_km';
      const reverseCostColumn = costColumn;

      // 构建坡度成本条件
      let slopeCondition = '';
      if (avoidSlope) {
        slopeCondition = ' AND (avg_slope IS NULL OR avg_slope < 8)';
      }

      const routeResult = await query(`
        WITH start_vertex AS (
          SELECT id, the_geom
          FROM road_vertices_pgr
          ORDER BY the_geom <-> ${start}
          LIMIT 1
        ),
        end_vertex AS (
          SELECT id, the_geom
          FROM road_vertices_pgr
          ORDER BY the_geom <-> ${end}
          LIMIT 1
        ),
        route_path AS (
          SELECT 
            path.seq,
            path.edge,
            r.id as road_id,
            r.name as road_name,
            r.geom,
            r.length_km,
            r.speed_limit,
            r.avg_slope,
            r.max_slope,
            r.slope_category,
            r.elevation_start,
            r.elevation_end
          FROM pgr_dijkstra(
            'SELECT id, source, target, ${costColumn} as cost, ${reverseCostColumn} as reverse_cost FROM road WHERE source IS NOT NULL AND target IS NOT NULL${slopeCondition}',
            (SELECT id FROM start_vertex),
            (SELECT id FROM end_vertex),
            false
          ) AS path
          JOIN road r ON path.edge = r.id
        )
        SELECT 
          ST_AsGeoJSON(ST_MakeLine(geom))::json as route_geom,
          SUM(length_km) as total_distance,
          SUM(length_km / NULLIF(speed_limit, 0) * 60) as total_time,
          json_agg(json_build_object(
            'id', road_id,
            'name', road_name,
            'length', length_km,
            'avgSlope', COALESCE(avg_slope, 0),
            'maxSlope', COALESCE(max_slope, 0),
            'slopeCategory', COALESCE(slope_category, '平缓'),
            'elevationStart', elevation_start,
            'elevationEnd', elevation_end
          ) ORDER BY seq) as road_segments
        FROM route_path
      `);

      if (routeResult.rows.length === 0 || !routeResult.rows[0].route_geom) {
        return res.status(404).json({ code: 404, message: '无法找到可行路线' });
      }

      const route = routeResult.rows[0];
      const totalDistance = parseFloat(route.total_distance) || 0;
      const totalTime = parseInt(route.total_time) || Math.ceil(totalDistance * 3);
      const calories = Math.round(totalDistance * 30);

      // 计算坡度统计
      const roadSegments = route.road_segments || [];
      const roadSlopeStats = {
        flat: roadSegments.filter(r => r.slopeCategory === '平缓').length,
        moderate: roadSegments.filter(r => r.slopeCategory === '中等').length,
        steep: roadSegments.filter(r => r.slopeCategory === '较陡').length,
        verySteep: roadSegments.filter(r => r.slopeCategory === '陡峭').length,
        maxSlope: Math.max(...roadSegments.map(r => r.maxSlope || 0), 0),
        avgSlope: roadSegments.length > 0 
          ? (roadSegments.reduce((sum, r) => sum + (r.avgSlope || 0), 0) / roadSegments.length).toFixed(2)
          : 0,
        totalElevationGain: roadSegments.reduce((sum, r) => {
          const gain = (r.elevationEnd || 0) - (r.elevationStart || 0);
          return sum + (gain > 0 ? gain : 0);
        }, 0)
      };
      const demSlopeAnalysis = await calculateDemSlopeAnalysis(route.route_geom);

      let redSpots = [];
      if (mode === 'red') {
        const redResult = await query(`
          SELECT id, name, description, 
                 ST_AsGeoJSON(geom)::json as location,
                 ST_Distance(geom, ST_GeomFromGeoJSON('${JSON.stringify(route.route_geom)}')) as distance
          FROM poi
          WHERE is_red_spot = true
          ORDER BY geom <-> ST_GeomFromGeoJSON('${JSON.stringify(route.route_geom)}')
          LIMIT 5
        `);
        redSpots = redResult.rows;
      }

      const nearbyPois = await query(`
        SELECT id, name, category, 
               ST_AsGeoJSON(geom)::json as location,
               ST_Distance(geom::geography, 
                 ST_GeomFromGeoJSON('${JSON.stringify(route.route_geom)}')::geography) as distance
        FROM poi
        WHERE ST_DWithin(
          geom::geography,
          ST_GeomFromGeoJSON('${JSON.stringify(route.route_geom)}')::geography,
          200
        )
        ORDER BY distance
        LIMIT 10
      `);

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
        req.userId, mode, startLng, startLat, endLng, endLat,
        startName || '起点', endName || '终点',
        JSON.stringify(route.route_geom), totalDistance, totalTime, calories,
        JSON.stringify(redSpots)
      ]);

      res.json({
        code: 200,
        data: {
          id: result.rows[0].id,
          routeGeom: route.route_geom,
          totalDistance,
          totalTime,
          calories,
          redSpots,
          nearbyPois: nearbyPois.rows,
          roadSegments,
          roadSlopeStats,
          slopeStats: demSlopeAnalysis.slopeAvailable ? demSlopeAnalysis.slopeStats : roadSlopeStats,
          slopeFactors: demSlopeAnalysis.slopeFactors,
          slopeAvailable: demSlopeAnalysis.slopeAvailable || roadSegments.length > 0,
          slopeSource: demSlopeAnalysis.slopeAvailable ? 'dem' : 'road'
        }
      });
    } catch (pgError) {
      console.error('pgRouting 规划失败，使用模拟路线:', pgError.message);
      console.error('错误详情:', pgError);
      
      // 生成模拟路线（直线）
      const dx = endLng - startLng;
      const dy = endLat - startLat;
      const distance = Math.sqrt(dx * dx + dy * dy) * 111; // 简单计算距离（公里）
      const time = Math.ceil(distance * 3); // 估算时间（分钟）
      const calories = Math.round(distance * 30);
      
      // 生成模拟的路线几何
      const routeGeom = {
        type: 'LineString',
        coordinates: [
          [startLng, startLat],
          [startLng + dx * 0.33, startLat + dy * 0.33],
          [startLng + dx * 0.66, startLat + dy * 0.66],
          [endLng, endLat]
        ]
      };
      
      // 红色景点
      const redSpots = [];
      const demSlopeAnalysis = await calculateDemSlopeAnalysis(routeGeom);
      
      res.json({
        code: 200,
        data: {
          id: Date.now(),
          routeGeom: routeGeom,
          totalDistance: distance.toFixed(2),
          totalTime: time,
          calories: calories,
          redSpots: redSpots,
          nearbyPois: [],
          roadSegments: [],
          roadSlopeStats: createEmptySlopeStats(),
          slopeStats: demSlopeAnalysis.slopeStats,
          slopeFactors: demSlopeAnalysis.slopeFactors,
          slopeAvailable: demSlopeAnalysis.slopeAvailable,
          slopeSource: demSlopeAnalysis.slopeAvailable ? 'dem' : 'none'
        },
        message: '使用模拟路线（实际道路网络未配置）'
      });
    }
  } catch (error) {
    console.error('路线规划失败:', error);
    res.status(500).json({ code: 500, message: '路线规划失败', error: error.message });
  }
});

router.post('/save', auth, async (req, res) => {
  try {
    const { 
      routeName, routeGeom, 
      startLng, startLat, startName,
      endLng, endLat, endName,
      totalDistance, totalTime
    } = req.body;

    const shareCode = uuidv4().substring(0, 8).toUpperCase();

    const result = await query(`
      INSERT INTO user_route 
        (user_id, route_name, route_geom, start_point, end_point, 
         start_name, end_name, total_distance, total_time, share_code)
      VALUES 
        ($1, $2, ST_GeomFromGeoJSON($3), 
         ST_SetSRID(ST_MakePoint($4, $5), 4326),
         ST_SetSRID(ST_MakePoint($6, $7), 4326),
         $8, $9, $10, $11, $12)
      RETURNING id, share_code
    `, [
      req.userId, routeName || '我的路线', JSON.stringify(routeGeom),
      startLng, startLat, endLng, endLat,
      startName || '起点', endName || '终点',
      totalDistance, totalTime, shareCode
    ]);

    res.json({
      code: 200,
      message: '路线保存成功',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('保存路线失败:', error);
    res.status(500).json({ code: 500, message: '保存路线失败' });
  }
});

router.get('/list', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT id, route_name, start_name, end_name, total_distance, total_time,
              is_favorite, share_code, share_count, created_at
       FROM user_route 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );

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

// 获取道路数据（用于显示在地图上）- 必须放在 /:id 路由之前
router.get('/roads', optionalAuth, async (req, res) => {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(toPositiveInt(req.query.limit, 1000), 2000);
    const offset = (page - 1) * limit;
    const { bounds, keyword, roadType, status } = req.query;
    const bikeOnly = toBoolean(req.query.bikeOnly);
    
    const whereClauses = ['1=1'];
    const params = [];
    
    if (keyword) {
      params.push(`%${keyword}%`);
      whereClauses.push(`name ILIKE $${params.length}`);
    }

    if (roadType) {
      params.push(roadType);
      whereClauses.push(`road_type = $${params.length}`);
    }

    if (status) {
      params.push(status);
      whereClauses.push(`status = $${params.length}`);
    }

    if (bikeOnly === true) {
      whereClauses.push('is_bike_lane = true');
    }

    if (bounds) {
      // 解析边界框参数 (minLng, minLat, maxLng, maxLat)
      const [minLng, minLat, maxLng, maxLat] = bounds.split(',').map(Number);
      if ([minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
        params.push(minLng, minLat, maxLng, maxLat);
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
    
    const whereSql = whereClauses.join(' AND ');
    const listParams = [...params, limit, offset];
    const [result, countResult, statsResult] = await Promise.all([
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
          ST_AsGeoJSON(geom)::json AS geometry
        FROM road
        WHERE ${whereSql}
        ORDER BY length_km DESC NULLS LAST, id DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `, listParams),
      query(`
        SELECT COUNT(*)::int AS total
        FROM road
        WHERE ${whereSql}
      `, params),
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
        roads: result.rows,
        total: countResult.rows[0]?.total || 0,
        page,
        limit,
        stats: statsResult.rows[0] || {
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

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, route_name, start_name, end_name, total_distance, total_time,
              is_favorite, share_code, share_count, created_at,
              ST_AsGeoJSON(route_geom)::json as route_geom,
              ST_AsGeoJSON(start_point)::json as start_point,
              ST_AsGeoJSON(end_point)::json as end_point
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

router.post('/:id/favorite', auth, async (req, res) => {
  try {
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

router.get('/share/:code', async (req, res) => {
  try {
    const result = await query(
      `SELECT ur.id, ur.route_name, ur.start_name, ur.end_name, 
              ur.total_distance, ur.total_time, ur.created_at,
              ur.share_count,
              ST_AsGeoJSON(ur.route_geom)::json as route_geom,
              u.nickname as creator_name
       FROM user_route ur
       JOIN "user" u ON ur.user_id = u.id
       WHERE ur.share_code = $1`,
      [req.params.code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '路线不存在' });
    }

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
