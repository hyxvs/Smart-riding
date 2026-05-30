const express = require('express');
const router = express.Router();
const { query, transaction } = require('../../config/database');
const { auth, optionalAuth } = require('../../middleware/auth');

router.post('/cluster/poi', optionalAuth, async (req, res) => {
  try {
    const { eps = 500, minPoints = 3, category } = req.body;
    let whereClause = 'WHERE status = $1';
    const params = ['normal'];
    let paramIndex = 2;

    if (category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    const sql = `
      WITH clustered AS (
        SELECT
          id, name, category, geom,
          ST_ClusterDBSCAN(geom, ${eps}, ${minPoints}) OVER() as cluster_id
        FROM poi ${whereClause}
      )
      SELECT
        cluster_id,
        COUNT(*) as member_count,
        ST_AsGeoJSON(ST_Centroid(ST_Collect(geom)))::json as centroid,
        array_agg(DISTINCT category) as categories,
        array_agg(id) as poi_ids
      FROM clustered
      WHERE cluster_id IS NOT NULL
      GROUP BY cluster_id
      ORDER BY member_count DESC
    `;

    const result = await query(sql, params);

    const clusters = result.rows.map(row => ({
      clusterId: row.cluster_id,
      memberCount: row.member_count,
      centroid: row.centroid,
      categories: row.categories,
      poiIds: row.poi_ids
    }));

    res.json({
      code: 200,
      data: {
        totalClusters: clusters.length,
        clusters
      }
    });
  } catch (error) {
    console.error('POI聚类分析失败:', error);
    res.status(500).json({ code: 500, message: 'POI聚类分析失败' });
  }
});

router.get('/intersection/roads', optionalAuth, async (req, res) => {
  try {
    const { minSafety } = req.query;

    let whereClause = '';
    const params = [];
    if (minSafety) {
      whereClause = 'WHERE safety_rating < $1';
      params.push(parseFloat(minSafety));
    }

    const sql = `
      WITH intersections AS (
        SELECT
          ST_Intersection(a.geom, b.geom) as geom,
          a.id as road1_id,
          b.id as road2_id,
          a.name as road1_name,
          b.name as road2_name,
          (COALESCE(a.safety_index, 0.5) + COALESCE(b.safety_index, 0.5)) / 2 as safety_rating
        FROM road a
        JOIN road b ON ST_Intersects(a.geom, b.geom) AND a.id < b.id
      )
      INSERT INTO road_intersection (geom, road1_id, road2_id, intersection_type, safety_rating)
      SELECT
        geom,
        road1_id,
        road2_id,
        CASE
          WHEN ST_NumPoints(geom) = 1 THEN 'T型交叉'
          WHEN ST_NumPoints(geom) = 2 THEN '十字交叉'
          ELSE '环形交叉'
        END,
        safety_rating
      FROM intersections
      ON CONFLICT DO NOTHING
      RETURNING
        id,
        ST_AsGeoJSON(geom)::json as location,
        road1_id,
        road2_id,
        road1_name,
        road2_name,
        intersection_type,
        safety_rating
    `;

    const result = await query(sql, params);

    res.json({
      code: 200,
      data: {
        totalIntersections: result.rows.length,
        intersections: result.rows
      }
    });
  } catch (error) {
    console.error('道路交叉口分析失败:', error);
    res.status(500).json({ code: 500, message: '道路交叉口分析失败' });
  }
});

router.get('/similarity/trajectory', optionalAuth, async (req, res) => {
  try {
    const { diaryId, limit = 10 } = req.query;

    if (!diaryId) {
      return res.status(400).json({ code: 400, message: '请提供轨迹ID' });
    }

    const baseTrajectory = await query(`
      SELECT id, track_geom, ST_Length(track_geom::geography) as length
      FROM ride_diary WHERE id = $1 AND track_geom IS NOT NULL
    `, [diaryId]);

    if (baseTrajectory.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '轨迹不存在' });
    }

    const baseLength = baseTrajectory.rows[0].length;

    const sql = `
      WITH similarity_calc AS (
        SELECT
          d.id,
          d.title,
          d.total_distance,
          d.avg_speed,
          ST_Length(d.track_geom::geography) as track_length,
          ST_HausdorffDistance(
            (SELECT track_geom FROM ride_diary WHERE id = $1),
            d.track_geom
          ) / NULLIF(ST_Length(d.track_geom::geography), 0) as hausdorff_ratio,
          ST_Similarity(
            (SELECT ST_Simplify(track_geom, 0.001) FROM ride_diary WHERE id = $1),
            ST_Simplify(d.track_geom, 0.001)
          ) as similarity_score
        FROM ride_diary d
        WHERE d.id != $1
          AND d.track_geom IS NOT NULL
          AND ST_NumPoints(d.track_geom) > 2
      )
      SELECT
        id,
        title,
        total_distance,
        avg_speed,
        track_length,
        (1 - COALESCE(hausdorff_ratio, 0)) as similarity_ratio,
        COALESCE(similarity_score, 0) as similarity_score
      FROM similarity_calc
      WHERE similarity_score > 0.3 OR hausdorff_ratio < 0.5
      ORDER BY similarity_score DESC, similarity_ratio DESC
      LIMIT $2
    `;

    const result = await query(sql, [diaryId, parseInt(limit)]);

    res.json({
      code: 200,
      data: {
        baseTrajectoryId: parseInt(diaryId),
        baseLength,
        similarTrajectories: result.rows
      }
    });
  } catch (error) {
    console.error('轨迹相似度分析失败:', error);
    res.status(500).json({ code: 500, message: '轨迹相似度分析失败' });
  }
});

router.get('/statistics/ride', optionalAuth, async (req, res) => {
  try {
    const { userId, timeRange, sortBy = 'total_distance', order = 'DESC', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = 'WHERE track_geom IS NOT NULL';
    const params = [];
    let paramIndex = 1;

    if (userId) {
      whereClause += ` AND user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (timeRange) {
      const days = parseInt(timeRange);
      whereClause += ` AND created_at >= NOW() - INTERVAL '${days} days'`;
    }

    const orderColumn = {
      'total_distance': 'total_distance',
      'total_time': 'total_time',
      'total_calories': 'total_calories',
      'avg_speed': 'avg_speed',
      'created_at': 'created_at'
    }[sortBy] || 'total_distance';

    const countSql = `SELECT COUNT(*) FROM ride_diary ${whereClause}`;
    const countResult = await query(countSql, params);

    const sql = `
      SELECT
        d.id,
        d.user_id,
        u.nickname,
        d.title,
        d.total_distance,
        d.total_time,
        d.avg_speed,
        d.max_speed,
        d.calories,
        ST_AsGeoJSON(d.track_geom)::json as track_geom,
        ST_Length(d.track_geom::geography) as calculated_length,
        d.created_at
      FROM ride_diary d
      LEFT JOIN "user" u ON d.user_id = u.id
      ${whereClause}
      ORDER BY ${orderColumn} ${order}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(parseInt(limit), offset);

    const result = await query(sql, params);

    const rankings = {
      totalDistance: [],
      totalTime: [],
      totalCalories: []
    };

    const distanceRankSql = `
      SELECT id, total_distance, RANK() OVER (ORDER BY total_distance DESC) as rank
      FROM ride_diary WHERE track_geom IS NOT NULL
    `;
    const distanceRank = await query(distanceRankSql);
    rankings.totalDistance = distanceRank.rows;

    res.json({
      code: 200,
      data: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        rankings,
        diaries: result.rows.map(row => ({
          ...row,
          lengthMatch: Math.abs(row.total_distance - row.calculated_length) < 100
        }))
      }
    });
  } catch (error) {
    console.error('骑行统计失败:', error);
    res.status(500).json({ code: 500, message: '骑行统计失败' });
  }
});

router.get('/distribution/poi-direction', optionalAuth, async (req, res) => {
  try {
    const { centerLng, centerLat, radius } = req.query;

    let filterClause = "WHERE status = 'normal'";
    const params = [];
    let paramIndex = 1;

    if (centerLng && centerLat && radius) {
      filterClause = `
        WHERE status = 'normal'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography,
            $${paramIndex + 2}
          )
      `;
      params.push(parseFloat(centerLng), parseFloat(centerLat), parseFloat(radius));
      paramIndex += 3;
    }

    const sql = `
      WITH poi_with_azimuth AS (
        SELECT
          id,
          name,
          category,
          geom,
          ST_Azimuth(
            ST_SetSRID(ST_MakePoint($1, $2), 4326),
            geom
          ) as azimuth
        FROM poi ${filterClause.replace('$$' + (paramIndex - 3), '$1').replace('$$' + (paramIndex - 2), '$2').replace('$$' + (paramIndex - 1), '$3')}
      ),
      direction_groups AS (
        SELECT
          CASE
            WHEN azimuth BETWEEN 0 AND PI() / 4 THEN '北'
            WHEN azimuth BETWEEN PI() / 4 AND PI() / 2 THEN '东北'
            WHEN azimuth BETWEEN PI() / 2 AND 3 * PI() / 4 THEN '东'
            WHEN azimuth BETWEEN 3 * PI() / 4 AND PI() THEN '东南'
            WHEN azimuth BETWEEN -PI() AND -3 * PI() / 4 THEN '西南'
            WHEN azimuth BETWEEN -3 * PI() / 4 AND -PI() / 2 THEN '南'
            WHEN azimuth BETWEEN -PI() / 2 AND -PI() / 4 THEN '西北'
            ELSE '北'
          END as direction,
          azimuth as angle,
          id,
          name,
          category,
          geom
        FROM poi_with_azimuth
      )
      SELECT
        direction,
        COUNT(*) as poi_count,
        AVG(ST_X(geom)) as avg_lng,
        AVG(ST_Y(geom)) as avg_lat,
        array_agg(DISTINCT category) as categories,
        array_agg(name ORDER BY name) as sample_names
      FROM direction_groups
      GROUP BY direction
      ORDER BY poi_count DESC
    `;

    const centerPoint = centerLng && centerLat
      ? [parseFloat(centerLng), parseFloat(centerLat)]
      : [114.935, 25.845];

    const result = await query(sql, [...centerPoint, ...params.slice(3)]);

    res.json({
      code: 200,
      data: {
        center: centerPoint,
        distributions: result.rows
      }
    });
  } catch (error) {
    console.error('POI方向分布分析失败:', error);
    res.status(500).json({ code: 500, message: 'POI方向分布分析失败' });
  }
});

router.get('/connectivity/road-network', optionalAuth, async (req, res) => {
  try {
    const sql = `
      WITH road_components AS (
        SELECT
          id,
          name,
          geom,
          source,
          target,
          length_km,
          safety_index,
          (SELECT COUNT(*) FROM road_vertices_pgr) as total_vertices,
          pgr_connectedComponents(
            'SELECT id, source, target, length_km FROM road WHERE source IS NOT NULL AND target IS NOT NULL',
            2
          ) OVER(PARTITION BY 1) as component_id
        FROM road
        WHERE source IS NOT NULL AND target IS NOT NULL
      ),
      component_stats AS (
        SELECT
          component_id,
          COUNT(*) as road_count,
          SUM(length_km) as total_length,
          ST_AsGeoJSON(ST_Centroid(ST_Union(geom)))::json as centroid,
          array_agg(id) as road_ids
        FROM road_components
        GROUP BY component_id
      )
      INSERT INTO road_connected_component (component_id, road_count, total_length, centroid, is_main_component)
      SELECT
        component_id,
        road_count,
        total_length,
        centroid,
        road_count = (SELECT MAX(road_count) FROM component_stats)
      FROM component_stats
      ON CONFLICT DO NOTHING;

      SELECT
        component_id,
        road_count,
        total_length,
        ST_AsGeoJSON(centroid)::json as centroid,
        is_main_component
      FROM road_connected_component
      ORDER BY road_count DESC
    `;

    const result = await query(sql);

    const sql2 = `
      SELECT
        component_id,
        COUNT(*) as isolated_road_count,
        SUM(length_km) as isolated_length
      FROM road
      WHERE source IS NULL OR target IS NULL
        AND NOT EXISTS (SELECT 1 FROM road_connected_component WHERE road_connected_component.component_id = -1)
      GROUP BY component_id
    `;

    const isolated = await query(sql2);

    res.json({
      code: 200,
      data: {
        totalComponents: result.rows.length,
        mainComponent: result.rows.find(r => r.is_main_component),
        otherComponents: result.rows.filter(r => !r.is_main_component),
        isolatedRoads: isolated.rows
      }
    });
  } catch (error) {
    console.error('道路连通性分析失败:', error);
    res.status(500).json({ code: 500, message: '道路连通性分析失败' });
  }
});

router.get('/distribution/event-spatial', optionalAuth, async (req, res) => {
  try {
    const { eventType, startDate, endDate, minCount = 1 } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (eventType) {
      whereClause += ` AND event_type = $${paramIndex}`;
      params.push(eventType);
      paramIndex++;
    }

    if (startDate) {
      whereClause += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    const sql = `
      WITH event_stats AS (
        SELECT
          event_type,
          COUNT(*) as event_count,
          AVG(
            CASE severity
              WHEN 'minor' THEN 1
              WHEN 'moderate' THEN 2
              WHEN 'major' THEN 3
              WHEN 'critical' THEN 4
              ELSE 2
            END
          ) as avg_severity,
          ST_Centroid(ST_Collect(geom)) as centroid,
          ST_Extent(geom) as extent
        FROM report_event
        ${whereClause}
        GROUP BY event_type
        HAVING COUNT(*) >= $${paramIndex}
      )
      INSERT INTO event_spatial_distribution (event_type, centroid, event_count, avg_severity, bbox)
      SELECT
        event_type,
        centroid,
        event_count,
        avg_severity,
        ST_MakeEnvelope(
          ST_XMin(extent),
          ST_YMin(extent),
          ST_XMax(extent),
          ST_YMax(extent),
          4326
        )::geometry
      FROM event_stats
      ON CONFLICT DO NOTHING
      RETURNING
        id,
        event_type,
        ST_AsGeoJSON(centroid)::json as centroid,
        event_count,
        avg_severity,
        ST_AsGeoJSON(bbox)::json as bbox
    `;

    params.push(parseInt(minCount));
    const result = await query(sql, params);

    const hotSpots = result.rows
      .sort((a, b) => b.event_count - a.event_count)
      .slice(0, 5);

    res.json({
      code: 200,
      data: {
        totalTypes: result.rows.length,
        distributions: result.rows,
        hotSpots
      }
    });
  } catch (error) {
    console.error('民情事件空间分布分析失败:', error);
    res.status(500).json({ code: 500, message: '民情事件空间分布分析失败' });
  }
});

router.get('/analysis/heatmap-timeline', optionalAuth, async (req, res) => {
  try {
    const { date, statType = 'hour' } = req.query;

    let groupByClause;
    let selectClause;

    if (statType === 'hour') {
      groupByClause = 'stat_hour';
      selectClause = 'stat_hour as time_unit';
    } else if (statType === 'day') {
      groupByClause = 'stat_date';
      selectClause = "stat_date as time_unit";
    } else {
      groupByClause = "TO_CHAR(stat_date, 'YYYY-MM')";
      selectClause = "TO_CHAR(stat_date, 'YYYY-MM') as time_unit";
    }

    let whereClause = '';
    const params = [];

    if (date) {
      whereClause = 'WHERE stat_date = $1';
      params.push(date);
    }

    const sql = `
      SELECT
        ${selectClause},
        SUM(ride_count) as total_rides,
        AVG(avg_speed) as avg_speed,
        COUNT(DISTINCT user_type) as user_type_count,
        ST_AsGeoJSON(ST_Union(grid_geom)) as heat_geom
      FROM heat_map
      ${whereClause}
      GROUP BY ${groupByClause}
      ORDER BY ${statType === 'hour' ? 'stat_hour' : 'time_unit'}
    `;

    const result = await query(sql, params);

    const rushHours = result.rows
      .filter(r => r.time_unit >= 7 && r.time_unit <= 9 || r.time_unit >= 17 && r.time_unit <= 19)
      .sort((a, b) => b.total_rides - a.total_rides);

    res.json({
      code: 200,
      data: {
        timeline: result.rows,
        rushHours: rushHours.slice(0, 3),
        peakTime: result.rows.length > 0
          ? result.rows.reduce((max, r) => r.total_rides > max.total_rides ? r : max)
          : null
      }
    });
  } catch (error) {
    console.error('骑行热力图时序分析失败:', error);
    res.status(500).json({ code: 500, message: '骑行热力图时序分析失败' });
  }
});

router.get('/density/road', optionalAuth, async (req, res) => {
  try {
    const { bbox, gridSize = 1000 } = req.query;

    let whereClause = '';
    const params = [];
    let paramIndex = 1;

    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
      whereClause = `WHERE geom && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)`;
      params.push(minLng, minLat, maxLng, maxLat);
      paramIndex += 4;
    }

    const sql = `
      WITH grid AS (
        SELECT
          ${parseFloat(gridSize)} as cell_size,
          $${paramIndex} as bbox_min_lng,
          $${paramIndex + 1} as bbox_min_lat,
          $${paramIndex + 2} as bbox_max_lng,
          $${paramIndex + 3} as bbox_max_lat
      ),
      grid_cells AS (
        SELECT
          floor((ST_X(geom) - bbox_min_lng) / cell_size) as col,
          floor((ST_Y(geom) - bbox_min_lat) / cell_size) as row,
          COUNT(*) as road_count,
          SUM(length_km) as total_length,
          AVG(safety_index) as avg_safety,
          ST_AsGeoJSON(
            ST_MakeEnvelope(
              bbox_min_lng + col * cell_size,
              bbox_min_lat + row * cell_size,
              bbox_min_lng + (col + 1) * cell_size,
              bbox_min_lat + (row + 1) * cell_size,
              4326
            )
          )::json as cell_geom
        FROM road, grid
        ${whereClause}
        GROUP BY col, row, bbox_min_lng, bbox_min_lat, cell_size
        ORDER BY road_count DESC
      )
      SELECT
        col,
        row,
        road_count,
        total_length,
        avg_safety,
        cell_geom
      FROM grid_cells
      LIMIT 100
    `;

    let result;
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
      result = await query(sql, [...params, minLng, minLat, maxLng, maxLat]);
    } else {
      const defaultBbox = [114.90, 25.80, 114.98, 25.90];
      result = await query(sql, [...params, ...defaultBbox]);
    }

    res.json({
      code: 200,
      data: {
        gridSize: parseFloat(gridSize),
        totalCells: result.rows.length,
        densityGrid: result.rows,
        maxDensity: result.rows.length > 0 ? result.rows[0] : null
      }
    });
  } catch (error) {
    console.error('道路密度分析失败:', error);
    res.status(500).json({ code: 500, message: '道路密度分析失败' });
  }
});

router.post('/simplify/trajectory', optionalAuth, async (req, res) => {
  try {
    const { diaryId, tolerance = 0.0001, preserveTopology = true } = req.body;

    if (!diaryId) {
      return res.status(400).json({ code: 400, message: '请提供轨迹ID' });
    }

    const diary = await query(`
      SELECT id, track_geom, ST_NumPoints(track_geom) as original_points
      FROM ride_diary WHERE id = $1 AND track_geom IS NOT NULL
    `, [diaryId]);

    if (diary.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '轨迹不存在' });
    }

    const originalPoints = diary.rows[0].original_points;
    const simplifiedGeom = preserveTopology
      ? await query(`SELECT ST_SimplifyPreserveTopology(track_geom, $2) as geom FROM ride_diary WHERE id = $1`, [diaryId, parseFloat(tolerance)])
      : await query(`SELECT ST_Simplify(track_geom, $2) as geom FROM ride_diary WHERE id = $1`, [diaryId, parseFloat(tolerance)]);

    const simplifiedPoints = await query(`SELECT ST_NumPoints($1) as points`, [simplifiedGeom.rows[0].geom]);

    const lengthComparison = await query(`
      SELECT
        ST_Length(track_geom::geography) as original_length,
        ST_Length($1::geography) as simplified_length,
        ABS(ST_Length(track_geom::geography) - ST_Length($1::geography)) / ST_Length(track_geom::geography) as length_diff_ratio
      FROM ride_diary WHERE id = $2
    `, [simplifiedGeom.rows[0].geom, diaryId]);

    res.json({
      code: 200,
      data: {
        diaryId: parseInt(diaryId),
        originalPoints,
        simplifiedPoints: simplifiedPoints.rows[0].points,
        simplificationRatio: (1 - simplifiedPoints.rows[0].points / originalPoints).toFixed(2),
        originalLength: lengthComparison.rows[0].original_length,
        simplifiedLength: lengthComparison.rows[0].simplified_length,
        lengthDiffRatio: lengthComparison.rows[0].length_diff_ratio,
        simplifiedGeom: ST_AsGeoJSON(simplifiedGeom.rows[0].geom)
      }
    });
  } catch (error) {
    console.error('轨迹简化失败:', error);
    res.status(500).json({ code: 500, message: '轨迹简化失败' });
  }
});

router.get('/nearby/poi', optionalAuth, async (req, res) => {
  try {
    const { lng, lat, radius = 1000, category, limit = 20 } = req.query;

    if (!lng || !lat) {
      return res.status(400).json({ code: 400, message: '请提供位置坐标' });
    }

    let whereClause = `WHERE status = 'normal' AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`;
    const params = [parseFloat(lng), parseFloat(lat), parseFloat(radius)];
    let paramIndex = 4;

    if (category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    const sql = `
      SELECT
        p.id,
        p.name,
        p.category,
        p.sub_category,
        ST_AsGeoJSON(p.geom)::json as location,
        ST_Distance(p.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance,
        p.safety_rating,
        p.scenery_rating,
        p.address
      FROM poi p
      ${whereClause}
      ORDER BY distance ASC
      LIMIT $${paramIndex}
    `;

    params.push(parseInt(limit));
    const result = await query(sql, params);

    const categories = [...new Set(result.rows.map(r => r.category))];

    res.json({
      code: 200,
      data: {
        center: { lng: parseFloat(lng), lat: parseFloat(lat) },
        radius: parseFloat(radius),
        totalNearby: result.rows.length,
        categories,
        pois: result.rows
      }
    });
  } catch (error) {
    console.error('附近POI查询失败:', error);
    res.status(500).json({ code: 500, message: '附近POI查询失败' });
  }
});

router.post('/achievement/check', auth, async (req, res) => {
  try {
    const userId = req.userId;

    const userStats = await query(`
      SELECT
        COALESCE(SUM(total_distance), 0) as total_distance,
        COALESCE(SUM(total_time), 0) as total_time,
        COALESCE(SUM(calories), 0) as total_calories,
        COUNT(*) as ride_count,
        COALESCE(MAX(total_distance), 0) as max_single_distance,
        COALESCE(MAX(avg_speed), 0) as max_avg_speed
      FROM ride_diary
      WHERE user_id = $1
    `, [userId]);

    const stats = userStats.rows[0];

    const achievements = await query(`
      SELECT * FROM ride_achievement WHERE is_active = TRUE
    `);

    const userAchievements = await query(`
      SELECT achievement_id, progress_current FROM user_achievement WHERE user_id = $1
    `, [userId]);

    const userAchMap = new Map(userAchievements.rows.map(ua => [ua.achievement_id, ua.progress_current]));

    const newAchievements = [];

    for (const ach of achievements.rows) {
      if (userAchMap.has(ach.id)) continue;

      let achieved = false;
      let progress = 0;

      switch (ach.requirement_type) {
        case 'ride_count':
          progress = stats.ride_count;
          achieved = progress >= ach.requirement_value;
          break;
        case 'total_distance':
          progress = parseFloat(stats.total_distance);
          achieved = progress >= ach.requirement_value;
          break;
        case 'single_distance':
          progress = parseFloat(stats.max_single_distance);
          achieved = progress >= ach.requirement_value;
          break;
        case 'avg_speed':
          progress = parseFloat(stats.max_avg_speed);
          achieved = progress >= ach.requirement_value;
          break;
        case 'total_calories':
          progress = parseFloat(stats.total_calories);
          achieved = progress >= ach.requirement_value;
          break;
      }

      if (achieved) {
        await query(`
          INSERT INTO user_achievement (user_id, achievement_id, progress_current)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `, [userId, ach.id, progress]);

        await query(`
          UPDATE user_point
          SET available_points = available_points + $1,
              total_points = total_points + $1,
              experience = experience + $1 * 10
          WHERE user_id = $2
        `, [ach.points_reward, userId]);

        newAchievements.push(ach);
      }
    }

    const allAchievements = await query(`
      SELECT
        ra.*,
        ua.achieved_at,
        ua.progress_current
      FROM ride_achievement ra
      LEFT JOIN user_achievement ua ON ra.id = ua.achievement_id AND ua.user_id = $1
      WHERE ra.is_active = TRUE
      ORDER BY ua.achieved_at DESC NULLS LAST, ra.points_reward DESC
    `, [userId]);

    res.json({
      code: 200,
      data: {
        stats: {
          totalDistance: parseFloat(stats.total_distance),
          totalTime: parseInt(stats.total_time),
          totalCalories: parseFloat(stats.total_calories),
          rideCount: parseInt(stats.ride_count),
          maxSingleDistance: parseFloat(stats.max_single_distance),
          maxAvgSpeed: parseFloat(stats.max_avg_speed)
        },
        newAchievements,
        allAchievements: allAchievements.rows
      }
    });
  } catch (error) {
    console.error('成就检查失败:', error);
    res.status(500).json({ code: 500, message: '成就检查失败' });
  }
});

router.get('/achievement/list', auth, async (req, res) => {
  try {
    const { category } = req.query;

    let whereClause = 'WHERE is_active = TRUE';
    const params = [];

    if (category) {
      whereClause += ' AND category = $1';
      params.push(category);
    }

    const result = await query(`
      SELECT * FROM ride_achievement ${whereClause} ORDER BY category, points_reward DESC
    `, params);

    const grouped = result.rows.reduce((acc, ach) => {
      if (!acc[ach.category]) acc[ach.category] = [];
      acc[ach.category].push(ach);
      return acc;
    }, {});

    res.json({
      code: 200,
      data: {
        total: result.rows.length,
        grouped
      }
    });
  } catch (error) {
    console.error('成就列表获取失败:', error);
    res.status(500).json({ code: 500, message: '成就列表获取失败' });
  }
});

router.post('/team/location/update', auth, async (req, res) => {
  try {
    const { teamId, lng, lat, accuracy, speed, heading } = req.body;

    if (!teamId || !lng || !lat) {
      return res.status(400).json({ code: 400, message: '缺少必要参数' });
    }

    const membership = await query(`
      SELECT id FROM team_member WHERE team_id = $1 AND user_id = $2 AND status = 'joined'
    `, [teamId, req.userId]);

    if (membership.rows.length === 0) {
      return res.status(403).json({ code: 403, message: '你不是队伍成员' });
    }

    await query(`
      INSERT INTO team_location (team_id, user_id, location, accuracy, speed, heading)
      VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, $7)
      ON CONFLICT (team_id, user_id)
      DO UPDATE SET
        location = ST_SetSRID(ST_MakePoint($3, $4), 4326),
        accuracy = $5,
        speed = $6,
        heading = $7,
        recorded_at = CURRENT_TIMESTAMP
    `, [teamId, req.userId, lng, lat, accuracy || null, speed || null, heading || null]);

    res.json({
      code: 200,
      message: '位置更新成功'
    });
  } catch (error) {
    console.error('位置更新失败:', error);
    res.status(500).json({ code: 500, message: '位置更新失败' });
  }
});

router.get('/team/locations/:teamId', auth, async (req, res) => {
  try {
    const { teamId } = req.params;
    const { maxAge = 300 } = req.query;

    const locations = await query(`
      SELECT
        tl.id,
        tl.user_id,
        u.nickname,
        u.avatar,
        ST_AsGeoJSON(tl.location)::json as location,
        tl.speed,
        tl.heading,
        tl.recorded_at,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - tl.recorded_at)) as age_seconds
      FROM team_location tl
      JOIN "user" u ON tl.user_id = u.id
      JOIN team_member tm ON tl.team_id = tm.team_id AND tl.user_id = tm.user_id
      WHERE tl.team_id = $1
        AND tm.status = 'joined'
        AND tl.recorded_at >= NOW() - INTERVAL '${parseInt(maxAge)} seconds'
      ORDER BY tl.recorded_at DESC
    `, [teamId]);

    const teamInfo = await query(`
      SELECT id, title, status FROM team_ride WHERE id = $1
    `, [teamId]);

    res.json({
      code: 200,
      data: {
        team: teamInfo.rows[0],
        locations: locations.rows.map(l => ({
          ...l,
          isOnline: l.age_seconds < 60
        })),
        lastUpdated: locations.rows.length > 0 ? locations.rows[0].recorded_at : null
      }
    });
  } catch (error) {
    console.error('获取队伍位置失败:', error);
    res.status(500).json({ code: 500, message: '获取队伍位置失败' });
  }
});

module.exports = router;