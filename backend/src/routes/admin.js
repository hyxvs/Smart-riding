const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');

const DASHBOARD_DAYS = 14;
const DEFAULT_GRID_SIZE = 500;
const DEFAULT_HEATMAP_LIMIT = 200;

const HOTSPOT_SOURCE_CONFIG = {
  rides: {
    label: '骑行热点',
    description: '基于骑行日记轨迹中点生成热点网格',
    metricLabel: '平均速度',
    countSql: `
      SELECT COUNT(*)::int AS count
      FROM ride_diary
      WHERE is_draft = false
        AND (track_geom IS NOT NULL OR start_point IS NOT NULL OR end_point IS NOT NULL)
    `,
    baseSql: `
      SELECT
        COALESCE(ST_LineInterpolatePoint(track_geom, 0.5), start_point, end_point) AS geom,
        avg_speed::numeric AS metric_value,
        COALESCE(
          NULLIF(title, ''),
          CONCAT(COALESCE(start_name, '起点'), ' - ', COALESCE(end_name, '终点'))
        ) AS label,
        COALESCE(ride_start_time, created_at) AS stat_time
      FROM ride_diary
      WHERE is_draft = false
        AND COALESCE(ST_LineInterpolatePoint(track_geom, 0.5), start_point, end_point) IS NOT NULL
        AND ($1::date IS NULL OR DATE(COALESCE(ride_start_time, created_at)) = $1::date)
        AND ($2::int IS NULL OR EXTRACT(HOUR FROM COALESCE(ride_start_time, created_at)) = $2::int)
    `
  },
  reports: {
    label: '事件热点',
    description: '基于民情上报位置生成问题热点区域',
    metricLabel: '平均紧急度',
    countSql: `
      SELECT COUNT(*)::int AS count
      FROM report_event
      WHERE geom IS NOT NULL
    `,
    baseSql: `
      SELECT
        geom,
        urgency_level::numeric AS metric_value,
        COALESCE(
          NULLIF(address, ''),
          NULLIF(title, ''),
          NULLIF(event_type, ''),
          CONCAT('事件#', report_no)
        ) AS label,
        created_at AS stat_time
      FROM report_event
      WHERE geom IS NOT NULL
        AND ($1::date IS NULL OR DATE(created_at) = $1::date)
        AND ($2::int IS NULL OR EXTRACT(HOUR FROM created_at) = $2::int)
    `
  },
  poi: {
    label: '服务热区',
    description: '基于 POI 点位分布生成服务设施热区',
    metricLabel: '平均安全评分',
    countSql: `
      SELECT COUNT(*)::int AS count
      FROM poi
      WHERE status = 'normal'
        AND geom IS NOT NULL
    `,
    baseSql: `
      SELECT
        geom,
        safety_rating::numeric AS metric_value,
        COALESCE(NULLIF(name, ''), NULLIF(address, ''), 'POI') AS label,
        created_at AS stat_time
      FROM poi
      WHERE status = 'normal'
        AND geom IS NOT NULL
        AND ($1::date IS NULL OR DATE(created_at) = $1::date)
        AND ($2::int IS NULL OR EXTRACT(HOUR FROM created_at) = $2::int)
    `
  },
  red_poi: {
    label: '红色资源热区',
    description: '基于红色景点与红色资源点位生成专题热区',
    metricLabel: '平均安全评分',
    countSql: `
      SELECT COUNT(*)::int AS count
      FROM poi
      WHERE status = 'normal'
        AND is_red_spot = true
        AND geom IS NOT NULL
    `,
    baseSql: `
      SELECT
        geom,
        safety_rating::numeric AS metric_value,
        COALESCE(NULLIF(name, ''), NULLIF(address, ''), '红色资源点') AS label,
        created_at AS stat_time
      FROM poi
      WHERE status = 'normal'
        AND is_red_spot = true
        AND geom IS NOT NULL
        AND ($1::date IS NULL OR DATE(created_at) = $1::date)
        AND ($2::int IS NULL OR EXTRACT(HOUR FROM created_at) = $2::int)
    `
  }
};

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toNullableDate(value) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function toNullableHour(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 23 ? parsed : null;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function getHotspotSourceOptions(counts) {
  return Object.entries(HOTSPOT_SOURCE_CONFIG).map(([value, config]) => ({
    value,
    label: config.label,
    description: config.description,
    count: counts[value] || 0,
    available: (counts[value] || 0) > 0
  }));
}

function resolveHotspotSource(requestedSource, sourceOptions) {
  if (requestedSource && requestedSource !== 'auto' && HOTSPOT_SOURCE_CONFIG[requestedSource]) {
    return requestedSource;
  }

  const preferredOrder = ['reports', 'rides', 'red_poi', 'poi'];
  for (const value of preferredOrder) {
    const option = sourceOptions.find(item => item.value === value && item.available);
    if (option) {
      return option.value;
    }
  }

  return sourceOptions[0]?.value || 'reports';
}

async function getHotspotSourceCounts() {
  const entries = await Promise.all(
    Object.entries(HOTSPOT_SOURCE_CONFIG).map(async ([key, config]) => {
      const result = await query(config.countSql);
      return [key, result.rows[0]?.count || 0];
    })
  );

  return Object.fromEntries(entries);
}

async function buildHotspotPayload(source, date, hour, gridSize, limit) {
  const config = HOTSPOT_SOURCE_CONFIG[source];

  if (!config) {
    return {
      source,
      summary: {
        totalRecords: 0,
        recentRecords: 0,
        hotspotCells: 0,
        peakCount: 0,
        avgMetric: null,
        metricLabel: ''
      },
      cells: [],
      topAreas: []
    };
  }

  const baseSql = config.baseSql;
  const cellResult = await query(`
    WITH source_data AS (
      ${baseSql}
    ),
    projected AS (
      SELECT
        ST_Transform(geom, 3857) AS geom_3857,
        metric_value,
        label,
        stat_time
      FROM source_data
      WHERE geom IS NOT NULL
    ),
    snapped AS (
      SELECT
        ST_SnapToGrid(geom_3857, 0, 0, $3::numeric, $3::numeric) AS cell_origin,
        metric_value,
        label,
        stat_time
      FROM projected
    ),
    aggregated AS (
      SELECT
        ST_MakeEnvelope(
          ST_X(cell_origin),
          ST_Y(cell_origin),
          ST_X(cell_origin) + $3::numeric,
          ST_Y(cell_origin) + $3::numeric,
          3857
        ) AS cell_geom,
        COUNT(*)::int AS point_count,
        ROUND(AVG(metric_value)::numeric, 2) AS metric_avg,
        (ARRAY_REMOVE(ARRAY_AGG(NULLIF(label, '') ORDER BY stat_time DESC), NULL))[1] AS sample_label
      FROM snapped
      GROUP BY cell_origin
    )
    SELECT
      ST_AsGeoJSON(ST_Transform(cell_geom, 4326))::json AS geom,
      point_count,
      metric_avg,
      COALESCE(sample_label, '热点区域') AS label,
      ST_X(ST_Centroid(ST_Transform(cell_geom, 4326))) AS lng,
      ST_Y(ST_Centroid(ST_Transform(cell_geom, 4326))) AS lat
    FROM aggregated
    ORDER BY point_count DESC, metric_avg DESC NULLS LAST
    LIMIT $4
  `, [date, hour, gridSize, limit]);

  const summaryResult = await query(`
    WITH source_data AS (
      ${baseSql}
    ),
    projected AS (
      SELECT
        ST_Transform(geom, 3857) AS geom_3857,
        metric_value,
        stat_time
      FROM source_data
      WHERE geom IS NOT NULL
    ),
    snapped AS (
      SELECT
        ST_SnapToGrid(geom_3857, 0, 0, $3::numeric, $3::numeric) AS cell_origin,
        metric_value,
        stat_time
      FROM projected
    ),
    aggregated AS (
      SELECT cell_origin, COUNT(*)::int AS point_count
      FROM snapped
      GROUP BY cell_origin
    )
    SELECT
      COALESCE((SELECT COUNT(*) FROM source_data), 0)::int AS total_records,
      COALESCE((SELECT COUNT(*) FROM source_data WHERE stat_time >= NOW() - INTERVAL '7 days'), 0)::int AS recent_records,
      COALESCE((SELECT COUNT(*) FROM aggregated), 0)::int AS hotspot_cells,
      COALESCE((SELECT MAX(point_count) FROM aggregated), 0)::int AS peak_count,
      ROUND((SELECT AVG(metric_value)::numeric FROM source_data WHERE metric_value IS NOT NULL), 2) AS avg_metric
  `, [date, hour, gridSize]);

  const cells = cellResult.rows.map(item => ({
    geom: item.geom,
    count: item.point_count,
    avgMetric: item.metric_avg === null ? null : Number(item.metric_avg),
    label: item.label,
    centroid: {
      lng: Number(item.lng),
      lat: Number(item.lat)
    }
  }));

  const summaryRow = summaryResult.rows[0] || {};

  return {
    source,
    label: config.label,
    description: config.description,
    metricLabel: config.metricLabel,
    summary: {
      totalRecords: Number(summaryRow.total_records || 0),
      recentRecords: Number(summaryRow.recent_records || 0),
      hotspotCells: Number(summaryRow.hotspot_cells || 0),
      peakCount: Number(summaryRow.peak_count || 0),
      avgMetric: summaryRow.avg_metric === null ? null : Number(summaryRow.avg_metric),
      metricLabel: config.metricLabel
    },
    cells,
    topAreas: cells.slice(0, 5).map(item => ({
      name: item.label,
      count: item.count,
      avgMetric: item.avgMetric,
      centroid: item.centroid
    }))
  };
}

router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = toPositiveInt(req.query.limit, 20);
    const offset = (page - 1) * limit;
    const { keyword, role, status } = req.query;

    const whereClauses = ['1=1'];
    const filterParams = [];

    if (keyword) {
      filterParams.push(`%${keyword}%`);
      whereClauses.push(`(u.nickname ILIKE $${filterParams.length} OR u.phone ILIKE $${filterParams.length})`);
    }

    if (role) {
      filterParams.push(role);
      whereClauses.push(`u.role = $${filterParams.length}`);
    }

    if (status) {
      filterParams.push(status);
      whereClauses.push(`u.status = $${filterParams.length}`);
    }

    const whereSql = whereClauses.join(' AND ');
    const listParams = [...filterParams, limit, offset];

    const [result, countResult] = await Promise.all([
      query(`
        SELECT
          u.id,
          u.phone,
          u.nickname,
          u.avatar,
          u.role,
          u.status,
          u.created_at,
          u.last_login_at,
          up.total_points,
          up.level
        FROM "user" u
        LEFT JOIN user_point up ON u.id = up.user_id
        WHERE ${whereSql}
        ORDER BY u.created_at DESC
        LIMIT $${filterParams.length + 1}
        OFFSET $${filterParams.length + 2}
      `, listParams),
      query(`
        SELECT COUNT(*)::int AS total
        FROM "user" u
        WHERE ${whereSql}
      `, filterParams)
    ]);

    res.json({
      code: 200,
      data: {
        list: result.rows,
        total: countResult.rows[0]?.total || 0,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ code: 500, message: '获取用户列表失败' });
  }
});

router.put('/users/:id/status', auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['active', 'disabled'].includes(status)) {
      return res.status(400).json({ code: 400, message: '无效的状态值' });
    }

    await query(
      'UPDATE "user" SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, req.params.id]
    );

    res.json({ code: 200, message: '用户状态更新成功' });
  } catch (error) {
    console.error('更新用户状态失败:', error);
    res.status(500).json({ code: 500, message: '更新用户状态失败' });
  }
});

router.get('/reports', auth, adminOnly, async (req, res) => {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = toPositiveInt(req.query.limit, 20);
    const offset = (page - 1) * limit;
    const { status, eventType, deptId } = req.query;

    const whereClauses = ['1=1'];
    const filterParams = [];

    if (status) {
      filterParams.push(status);
      whereClauses.push(`r.status = $${filterParams.length}`);
    }

    if (eventType) {
      filterParams.push(eventType);
      whereClauses.push(`r.event_type = $${filterParams.length}`);
    }

    if (deptId) {
      filterParams.push(deptId);
      whereClauses.push(`r.dept_id = $${filterParams.length}`);
    }

    const whereSql = whereClauses.join(' AND ');
    const listParams = [...filterParams, limit, offset];

    const [result, countResult] = await Promise.all([
      query(`
        SELECT
          r.id,
          r.report_no,
          r.event_type,
          r.title,
          r.description,
          r.address,
          r.urgency_level,
          r.status,
          r.dept_id,
          r.handle_note,
          r.created_at,
          r.handle_time,
          ST_AsGeoJSON(r.geom)::json AS location,
          u.nickname AS user_name,
          u.phone AS user_phone,
          d.name AS dept_name
        FROM report_event r
        LEFT JOIN "user" u ON r.user_id = u.id
        LEFT JOIN dept d ON r.dept_id = d.id
        WHERE ${whereSql}
        ORDER BY r.created_at DESC
        LIMIT $${filterParams.length + 1}
        OFFSET $${filterParams.length + 2}
      `, listParams),
      query(`
        SELECT COUNT(*)::int AS total
        FROM report_event r
        WHERE ${whereSql}
      `, filterParams)
    ]);

    res.json({
      code: 200,
      data: {
        list: result.rows,
        total: countResult.rows[0]?.total || 0,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('获取上报列表失败:', error);
    res.status(500).json({ code: 500, message: '获取上报列表失败' });
  }
});

router.put('/reports/:id', auth, adminOnly, async (req, res) => {
  try {
    const reportId = req.params.id;
    const { status, deptId, handleNote } = req.body;

    await transaction(async client => {
      const currentResult = await client.query(
        'SELECT status, user_id, points_awarded FROM report_event WHERE id = $1',
        [reportId]
      );

      if (currentResult.rows.length === 0) {
        const error = new Error('上报记录不存在');
        error.status = 404;
        throw error;
      }

      const current = currentResult.rows[0];
      const nextStatus = status || current.status;

      await client.query(
        `UPDATE report_event
         SET status = COALESCE($1, status),
             dept_id = COALESCE($2, dept_id),
             handle_note = COALESCE($3, handle_note),
             handle_time = CASE WHEN $1 = 'completed' THEN NOW() ELSE handle_time END,
             handler_id = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [status || null, deptId || null, handleNote || null, req.userId, reportId]
      );

      await client.query(
        `INSERT INTO report_handle_log (report_id, operator_id, from_status, to_status, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [reportId, req.userId, current.status, nextStatus, handleNote || '']
      );

      if (nextStatus === 'completed' && Number(current.points_awarded || 0) === 0) {
        await client.query(
          `UPDATE user_point
           SET total_points = total_points + 10,
               available_points = available_points + 10,
               experience = experience + 10,
               updated_at = NOW()
           WHERE user_id = $1`,
          [current.user_id]
        );

        await client.query(
          'UPDATE report_event SET points_awarded = 10 WHERE id = $1',
          [reportId]
        );
      }
    });

    res.json({ code: 200, message: '上报处理成功' });
  } catch (error) {
    console.error('处理上报失败:', error);
    res.status(error.status || 500).json({
      code: error.status || 500,
      message: error.message || '处理上报失败'
    });
  }
});

router.get('/heatmap', auth, adminOnly, async (req, res) => {
  try {
    const requestedSource = req.query.source || 'auto';
    const date = toNullableDate(req.query.date);
    const hour = toNullableHour(req.query.hour);
    const gridSize = Math.min(Math.max(toPositiveInt(req.query.gridSize, DEFAULT_GRID_SIZE), 100), 5000);
    const limit = Math.min(toPositiveInt(req.query.limit, DEFAULT_HEATMAP_LIMIT), 500);

    const sourceCounts = await getHotspotSourceCounts();
    const sourceOptions = getHotspotSourceOptions(sourceCounts);
    const activeSource = resolveHotspotSource(requestedSource, sourceOptions);
    const payload = await buildHotspotPayload(activeSource, date, hour, gridSize, limit);
    const activeOption = sourceOptions.find(item => item.value === activeSource);

    res.json({
      code: 200,
      data: {
        requestedSource,
        activeSource,
        activeSourceLabel: activeOption?.label || payload.label,
        gridSize,
        filters: {
          date,
          hour
        },
        sourceOptions,
        empty: payload.cells.length === 0,
        emptyReason: payload.cells.length === 0
          ? '当前数据源暂无可分析记录，请切换其他数据源或调整筛选条件。'
          : '',
        summary: payload.summary,
        cells: payload.cells,
        topAreas: payload.topAreas
      }
    });
  } catch (error) {
    console.error('获取热点分析数据失败:', error);
    res.status(500).json({ code: 500, message: '获取热点分析数据失败' });
  }
});

router.get('/stats/dashboard', auth, adminOnly, async (req, res) => {
  try {
    const [
      userStats,
      reportStats,
      diaryStats,
      routeStats,
      poiStats,
      roadStats,
      reportTrend,
      reportTypes,
      pendingReports,
      newUsers
    ] = await Promise.all([
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_week
        FROM "user"
      `),
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
          ROUND(
            AVG(EXTRACT(EPOCH FROM (handle_time - created_at)) / 3600)
              FILTER (WHERE status = 'completed' AND handle_time IS NOT NULL)::numeric,
            2
          ) AS avg_handle_hours
        FROM report_event
      `),
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS week_count
        FROM ride_diary
        WHERE is_draft = false
      `),
      query(`
        SELECT
          COUNT(*)::int AS total,
          COALESCE(SUM(total_distance), 0) AS total_distance
        FROM ride_diary
        WHERE is_draft = false
      `),
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE is_red_spot = true)::int AS red_spots,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_month
        FROM poi
        WHERE status = 'normal'
      `),
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE is_bike_lane = true)::int AS bike_lane_count,
          ROUND(COALESCE(SUM(length_km), 0)::numeric, 2) AS total_length_km
        FROM road
      `),
      query(`
        WITH days AS (
          SELECT generate_series(
            CURRENT_DATE - INTERVAL '${DASHBOARD_DAYS - 1} days',
            CURRENT_DATE,
            INTERVAL '1 day'
          )::date AS day
        ),
        report_daily AS (
          SELECT DATE(created_at) AS day, COUNT(*)::int AS count
          FROM report_event
          GROUP BY DATE(created_at)
        )
        SELECT
          TO_CHAR(days.day, 'YYYY-MM-DD') AS date,
          TO_CHAR(days.day, 'MM-DD') AS label,
          COALESCE(report_daily.count, 0)::int AS count
        FROM days
        LEFT JOIN report_daily ON report_daily.day = days.day
        ORDER BY days.day
      `),
      query(`
        SELECT
          event_type AS name,
          COUNT(*)::int AS value
        FROM report_event
        GROUP BY event_type
        ORDER BY value DESC, name ASC
      `),
      query(`
        SELECT
          id,
          report_no,
          event_type,
          title,
          status,
          address,
          created_at
        FROM report_event
        WHERE status IN ('pending', 'processing')
        ORDER BY created_at DESC
        LIMIT 5
      `),
      query(`
        SELECT
          id,
          nickname,
          phone,
          role,
          status,
          created_at
        FROM "user"
        ORDER BY created_at DESC
        LIMIT 5
      `)
    ]);

    res.json({
      code: 200,
      data: {
        users: userStats.rows[0],
        reports: reportStats.rows[0],
        diaries: diaryStats.rows[0],
        routes: routeStats.rows[0],
        poi: poiStats.rows[0],
        roads: roadStats.rows[0],
        reportTrend: reportTrend.rows,
        reportTypes: reportTypes.rows,
        pendingReports: pendingReports.rows,
        newUsers: newUsers.rows
      }
    });
  } catch (error) {
    console.error('获取仪表盘数据失败:', error);
    res.status(500).json({ code: 500, message: '获取仪表盘数据失败' });
  }
});

router.get('/opinion', auth, adminOnly, async (req, res) => {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = toPositiveInt(req.query.limit, 20);
    const offset = (page - 1) * limit;
    const { sentiment } = req.query;
    const alertOnly = toBoolean(req.query.isAlert);

    const whereClauses = ['1=1'];
    const filterParams = [];

    if (sentiment) {
      filterParams.push(sentiment);
      whereClauses.push(`sentiment = $${filterParams.length}`);
    }

    if (alertOnly === true) {
      whereClauses.push('is_alert = true');
    }

    const whereSql = whereClauses.join(' AND ');
    const listParams = [...filterParams, limit, offset];

    const [listResult, countResult, statsResult, trendResult] = await Promise.all([
      query(`
        SELECT
          id,
          source,
          content,
          sentiment,
          sentiment_score,
          keywords,
          is_alert,
          alert_level,
          created_at
        FROM opinion_monitor
        WHERE ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${filterParams.length + 1}
        OFFSET $${filterParams.length + 2}
      `, listParams),
      query(`
        SELECT COUNT(*)::int AS total
        FROM opinion_monitor
        WHERE ${whereSql}
      `, filterParams),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE sentiment = 'positive')::int AS positive,
          COUNT(*) FILTER (WHERE sentiment = 'neutral')::int AS neutral,
          COUNT(*) FILTER (WHERE sentiment = 'negative')::int AS negative,
          COUNT(*) FILTER (WHERE is_alert = true)::int AS alerts
        FROM opinion_monitor
      `),
      query(`
        WITH days AS (
          SELECT generate_series(
            CURRENT_DATE - INTERVAL '6 days',
            CURRENT_DATE,
            INTERVAL '1 day'
          )::date AS day
        ),
        opinion_daily AS (
          SELECT DATE(created_at) AS day, COUNT(*)::int AS count
          FROM opinion_monitor
          GROUP BY DATE(created_at)
        )
        SELECT
          TO_CHAR(days.day, 'MM-DD') AS label,
          COALESCE(opinion_daily.count, 0)::int AS count
        FROM days
        LEFT JOIN opinion_daily ON opinion_daily.day = days.day
        ORDER BY days.day
      `)
    ]);

    res.json({
      code: 200,
      data: {
        list: listResult.rows,
        total: countResult.rows[0]?.total || 0,
        page,
        limit,
        stats: statsResult.rows[0] || {
          positive: 0,
          neutral: 0,
          negative: 0,
          alerts: 0
        },
        trend: trendResult.rows
      }
    });
  } catch (error) {
    console.error('获取舆情数据失败:', error);
    res.status(500).json({ code: 500, message: '获取舆情数据失败' });
  }
});

router.get('/depts', auth, adminOnly, async (req, res) => {
  try {
    const result = await query('SELECT * FROM dept ORDER BY id');
    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取部门列表失败:', error);
    res.status(500).json({ code: 500, message: '获取部门列表失败' });
  }
});

module.exports = router;
