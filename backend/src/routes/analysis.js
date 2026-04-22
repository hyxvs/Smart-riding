const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { auth, optionalAuth } = require('../middleware/auth');

// 服务范围分析（等时圈计算）
router.post('/isochrone', optionalAuth, async (req, res) => {
  try {
    const startTime = Date.now();
    const {
      startLng, startLat,
      timeLimits = [5, 10, 15, 30],
      mode = 'cycling'
    } = req.body;

    if (!startLng || !startLat) {
      return res.status(400).json({ code: 400, message: '起点坐标不能为空' });
    }

    const startPoint = `ST_SetSRID(ST_MakePoint(${startLng}, ${startLat}), 4326)`;
    const results = [];

    // 为每个时间限制计算等时圈
    for (const timeLimit of timeLimits) {
      // 计算最大搜索距离（基于平均骑行速度 15km/h）
      const maxDistance = (15 / 60) * timeLimit; // km

      // 使用 pgRouting 计算可达区域
      const isochroneResult = await query(`
        WITH 
        -- 找到最近的道路顶点
        start_vertex AS (
          SELECT id, the_geom
          FROM road_vertices_pgr
          ORDER BY the_geom <-> ${startPoint}
          LIMIT 1
        ),
        -- 使用 pgr_drivingDistance 计算可达距离
        driving_distance AS (
          SELECT 
            node, 
            edge, 
            cost, 
            agg_cost
          FROM pgr_drivingDistance(
            'SELECT id, source, target, CASE WHEN length_km IS NULL THEN 0 ELSE length_km / (15.0 / 60.0) END as cost FROM road WHERE source IS NOT NULL AND target IS NOT NULL',
            (SELECT id FROM start_vertex),
            ${timeLimit}, -- 时间限制（分钟）
            false
          )
        ),
        -- 获取可达顶点的几何位置
        reachable_vertices AS (
          SELECT 
            v.id, 
            v.the_geom,
            d.agg_cost
          FROM road_vertices_pgr v
          JOIN driving_distance d ON v.id = d.node
        ),
        -- 构建等时圈（使用Voronoi图和缓冲区）
        isochrone_polygon AS (
          SELECT ST_ConvexHull(ST_Collect(the_geom)) as geom
          FROM reachable_vertices
          WHERE agg_cost <= ${timeLimit}
        )
        SELECT 
          ST_AsGeoJSON(geom)::json as isochrone_geom,
          ${timeLimit} as time_limit,
          (SELECT COUNT(*) FROM reachable_vertices) as node_count
        FROM isochrone_polygon
      `);

      if (isochroneResult.rows.length > 0 && isochroneResult.rows[0].isochrone_geom) {
        // 保存等时圈结果到数据库
        const saveResult = await query(`
          INSERT INTO isochrone_result 
            (user_id, start_point, time_limit, isochrone_geom, calculation_time)
          VALUES 
            ($1, ${startPoint}, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4)
          RETURNING id
        `, [req.userId, timeLimit, JSON.stringify(isochroneResult.rows[0].isochrone_geom), Date.now() - startTime]);

        // 分析等时圈内的POI
        const poiResult = await query(`
          SELECT 
            p.id, 
            p.name, 
            p.category, 
            ST_AsGeoJSON(p.geom)::json as location,
            ST_Distance(p.geom::geography, ${startPoint}::geography) / 1000 as distance_km
          FROM poi p
          WHERE ST_Contains(
            ST_SetSRID(ST_GeomFromGeoJSON($1), 4326),
            p.geom
          ) AND p.status = 'normal'
        `, [JSON.stringify(isochroneResult.rows[0].isochrone_geom)]);

        // 保存POI可达性结果
        for (const poi of poiResult.rows) {
          const travelTime = Math.round((poi.distance_km / 15) * 60); // 基于15km/h计算时间
          await query(`
            INSERT INTO accessibility_result 
              (isochrone_id, poi_id, distance, travel_time, is_accessible)
            VALUES 
              ($1, $2, $3, $4, $5)
          `, [saveResult.rows[0].id, poi.id, poi.distance_km, travelTime, travelTime <= timeLimit]);
        }

        results.push({
          timeLimit,
          isochrone: isochroneResult.rows[0].isochrone_geom,
          poiCount: poiResult.rows.length,
          pois: poiResult.rows
        });
      }
    }

    res.json({
      code: 200,
      data: {
        startPoint: { lng: startLng, lat: startLat },
        results
      }
    });
  } catch (error) {
    console.error('服务范围分析失败:', error);
    res.status(500).json({ code: 500, message: '服务范围分析失败' });
  }
});

// 获取服务范围分析历史
router.get('/isochrone/history', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await query(`
      SELECT 
        id, 
        time_limit, 
        ST_AsGeoJSON(start_point)::json as start_point,
        ST_AsGeoJSON(isochrone_geom)::json as isochrone_geom,
        calculation_time, 
        created_at
      FROM isochrone_result
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.userId, limit, offset]);

    res.json({
      code: 200,
      data: {
        list: result.rows,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取分析历史失败:', error);
    res.status(500).json({ code: 500, message: '获取分析历史失败' });
  }
});

module.exports = router;
