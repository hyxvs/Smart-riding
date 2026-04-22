const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { auth, optionalAuth } = require('../middleware/auth');

router.post('/create', auth, async (req, res) => {
  try {
    const { 
      eventType, title, description, 
      lng, lat, address, images, urgencyLevel 
    } = req.body;

    if (!eventType || !lng || !lat) {
      return res.status(400).json({ code: 400, message: '事件类型和位置不能为空' });
    }

    const reportNo = `RPT${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    const result = await query(`
      INSERT INTO report_event 
        (report_no, user_id, event_type, title, description, 
         geom, address, images, urgency_level, status)
      VALUES 
        ($1, $2, $3, $4, $5, 
         ST_SetSRID(ST_MakePoint($6, $7), 4326), $8, $9, $10, 'pending')
      RETURNING id, report_no
    `, [
      reportNo, req.userId, eventType, title || '', description || '',
      lng, lat, address || '', images || [], urgencyLevel || 1
    ]);

    res.json({
      code: 200,
      message: '上报成功',
      data: {
        id: result.rows[0].id,
        reportNo: result.rows[0].report_no
      }
    });
  } catch (error) {
    console.error('民情上报失败:', error);
    res.status(500).json({ code: 500, message: '上报失败' });
  }
});

router.get('/list', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, eventType, userId } = req.query;
    const offset = (page - 1) * limit;

    let sql = `SELECT r.id, r.report_no, r.event_type, r.title, r.description,
                      r.address, r.urgency_level, r.status, r.created_at,
                      r.handle_time, r.points_awarded,
                      ST_AsGeoJSON(r.geom)::json as location,
                      u.id as user_id, u.nickname as user_name, u.avatar as user_avatar
               FROM report_event r
               JOIN "user" u ON r.user_id = u.id
               WHERE 1=1`;
    
    const params = [];
    let paramCount = 1;

    if (userId) {
      sql += ` AND r.user_id = $${paramCount++}`;
      params.push(userId);
    }

    if (status) {
      sql += ` AND r.status = $${paramCount++}`;
      params.push(status);
    }

    if (eventType) {
      sql += ` AND r.event_type = $${paramCount++}`;
      params.push(eventType);
    }

    sql += ` ORDER BY r.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    const countResult = await query(
      'SELECT COUNT(*) FROM report_event WHERE 1=1' + 
      (userId ? ' AND user_id = $1' : '') +
      (status ? ` AND status = '${status}'` : ''),
      userId ? [userId] : []
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
    console.error('获取上报列表失败:', error);
    res.status(500).json({ code: 500, message: '获取上报列表失败' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, 
              ST_AsGeoJSON(r.geom)::json as location,
              u.id as user_id, u.nickname as user_name, u.avatar as user_avatar,
              d.name as dept_name
       FROM report_event r
       JOIN "user" u ON r.user_id = u.id
       LEFT JOIN dept d ON r.dept_id = d.id
       WHERE r.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '上报记录不存在' });
    }

    const logs = await query(
      `SELECT from_status, to_status, note, created_at
       FROM report_handle_log
       WHERE report_id = $1
       ORDER BY created_at`,
      [req.params.id]
    );

    res.json({
      code: 200,
      data: {
        ...result.rows[0],
        handleLogs: logs.rows
      }
    });
  } catch (error) {
    console.error('获取上报详情失败:', error);
    res.status(500).json({ code: 500, message: '获取上报详情失败' });
  }
});

router.get('/nearby/:lng/:lat', async (req, res) => {
  try {
    const { lng, lat } = req.params;
    const { radius = 1000, limit = 20 } = req.query;

    const result = await query(
      `SELECT id, report_no, event_type, title, address, status, created_at,
              ST_AsGeoJSON(geom)::json as location,
              ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance
       FROM report_event
       WHERE status IN ('pending', 'processing')
         AND ST_DWithin(
           geom::geography,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           $3
         )
       ORDER BY distance
       LIMIT $4`,
      [lng, lat, radius, limit]
    );

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取附近上报失败:', error);
    res.status(500).json({ code: 500, message: '获取附近上报失败' });
  }
});

router.post('/:id/rate', auth, async (req, res) => {
  try {
    const { rating, feedback } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ code: 400, message: '请提供1-5的评分' });
    }

    const checkResult = await query(
      'SELECT id, status FROM report_event WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '上报记录不存在' });
    }

    if (checkResult.rows[0].status !== 'completed') {
      return res.status(400).json({ code: 400, message: '只能评价已完成的工单' });
    }

    await query(
      'UPDATE report_event SET user_rating = $1, user_feedback = $2 WHERE id = $3',
      [rating, feedback || '', req.params.id]
    );

    res.json({ code: 200, message: '评价成功' });
  } catch (error) {
    console.error('评价失败:', error);
    res.status(500).json({ code: 500, message: '评价失败' });
  }
});

router.get('/stats/summary', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        AVG(user_rating) FILTER (WHERE user_rating IS NOT NULL) as avg_rating
      FROM report_event
    `);

    const typeStats = await query(`
      SELECT event_type, COUNT(*) as count
      FROM report_event
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT 10
    `);

    res.json({
      code: 200,
      data: {
        summary: result.rows[0],
        typeStats: typeStats.rows
      }
    });
  } catch (error) {
    console.error('获取统计失败:', error);
    res.status(500).json({ code: 500, message: '获取统计失败' });
  }
});

module.exports = router;
