const express = require('express');
const router = express.Router();
const { query, transaction } = require('../../config/database');
const { auth } = require('../../middleware/auth');

router.post('/start', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { challenge_id } = req.body;

    const existingSession = await query(
      `SELECT id FROM ride_sessions WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [userId]
    );

    if (existingSession.rows.length > 0) {
      return res.json({
        code: 200,
        data: {
          session_id: existingSession.rows[0].id,
          resumed: true
        }
      });
    }

    const result = await query(
      `INSERT INTO ride_sessions (user_id, challenge_id, start_time, status)
       VALUES ($1, $2, NOW(), 'active')
       RETURNING id`,
      [userId, challenge_id || null]
    );

    const sessionId = result.rows[0].id;

    if (challenge_id) {
      const challenge = await query(
        `SELECT * FROM social_challenges WHERE id = $1 AND status = 'active'`,
        [challenge_id]
      );

      if (challenge.rows.length === 0) {
        await query(`UPDATE ride_sessions SET challenge_id = NULL WHERE id = $1`, [sessionId]);
      }
    }

    res.json({
      code: 200,
      data: {
        session_id: sessionId,
        resumed: false
      }
    });
  } catch (error) {
    console.error('[RIDE] Start ride error:', error);
    res.status(500).json({ code: 500, message: '开始骑行失败' });
  }
});

router.post('/update-progress', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { session_id, distance, challenge_id } = req.body;

    const session = await query(
      `SELECT * FROM ride_sessions WHERE id = $1 AND user_id = $2`,
      [session_id, userId]
    );

    if (session.rows.length === 0) {
      return res.status(400).json({ code: 400, message: '无效的骑行会话' });
    }

    await query(
      `UPDATE ride_sessions SET current_distance = $1 WHERE id = $2`,
      [distance, session_id]
    );

    if (!challenge_id) {
      return res.json({ code: 200, data: { progress: 0 } });
    }

    const challenge = await query(
      `SELECT * FROM social_challenges WHERE id = $1`,
      [challenge_id]
    );

    if (challenge.rows.length === 0) {
      return res.json({ code: 200, data: { progress: 0 } });
    }

    const challengeData = challenge.rows[0];
    let progress = 0;

    if (challengeData.challenge_type === 'distance') {
      progress = (distance / challengeData.target_value) * 100;
    } else if (challengeData.challenge_type === 'count') {
      progress = (distance / challengeData.target_value) * 100;
    }

    progress = Math.min(progress, 100);

    await query(
      `UPDATE challenge_participants
       SET progress = $1, updated_at = NOW()
       WHERE challenge_id = $2 AND user_id = $3`,
      [progress, challenge_id, userId]
    );

    res.json({
      code: 200,
      data: {
        progress: progress,
        target: challengeData.target_value,
        target_unit: challengeData.target_unit
      }
    });
  } catch (error) {
    console.error('[RIDE] Update progress error:', error);
    res.status(500).json({ code: 500, message: '更新进度失败' });
  }
});

router.post('/end', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { session_id, track_geom, total_distance, duration, challenge_id } = req.body;

    console.log('[RIDE END] 收到结束请求:', { userId, session_id, track_geom, total_distance, duration, challenge_id });

    const session = await query(
      `SELECT * FROM ride_sessions WHERE id = $1 AND user_id = $2`,
      [session_id, userId]
    );

    if (session.rows.length === 0) {
      return res.status(400).json({ code: 400, message: '无效的骑行会话' });
    }

    const sessionData = session.rows[0];
    const effectiveChallengeId = challenge_id || sessionData.challenge_id;

    console.log('[RIDE END] 会话数据:', sessionData);
    console.log('[RIDE END] 有效挑战ID:', effectiveChallengeId);

    // 处理 track_geom，如果为空则不更新
    let updateTrackGeomSql = `UPDATE ride_sessions
       SET end_time = NOW(),
           total_distance = COALESCE($1, current_distance),
           duration = $2,
           status = 'completed'`;
    let updateParams = [total_distance, duration];

    if (track_geom) {
      updateTrackGeomSql += `, track_geom = ST_GeomFromText($3, 4326)`;
      updateParams.push(track_geom);
    }

    updateTrackGeomSql += ` WHERE id = $${updateParams.length + 1}`;
    updateParams.push(session_id);

    await query(updateTrackGeomSql, updateParams);
    console.log('[RIDE END] 会话更新成功');

    let challengeProgress = null;
    let challengeCompleted = false;

    if (effectiveChallengeId) {
      const challenge = await query(
        `SELECT * FROM social_challenges WHERE id = $1`,
        [effectiveChallengeId]
      );

      if (challenge.rows.length > 0) {
        const challengeData = challenge.rows[0];
        let newProgress = 0;

        if (challengeData.challenge_type === 'distance') {
          const currentProgress = sessionData.current_distance || 0;
          newProgress = ((currentProgress + total_distance) / challengeData.target_value) * 100;
        } else if (challengeData.challenge_type === 'count') {
          newProgress = ((total_distance) / challengeData.target_value) * 100;
        }

        newProgress = Math.min(newProgress, 100);

        await query(
          `UPDATE challenge_participants
           SET progress = $1, updated_at = NOW()
           WHERE challenge_id = $2 AND user_id = $3`,
          [newProgress, effectiveChallengeId, userId]
        );

        if (newProgress >= 100) {
          await query(
            `UPDATE challenge_participants
             SET is_completed = true, completed_at = NOW()
             WHERE challenge_id = $1 AND user_id = $2 AND is_completed = false`,
            [effectiveChallengeId, userId]
          );

          const { processChallengeCompletion } = require('../../utils/challengeRewards');
          await processChallengeCompletion(userId, effectiveChallengeId);

          challengeCompleted = true;
        }

        challengeProgress = newProgress;
      }
    }

    if (total_distance > 0) {
      const stats = await query(
        `SELECT * FROM ride_statistics WHERE user_id = $1`,
        [userId]
      );

      if (stats.rows.length === 0) {
        await query(
          `INSERT INTO ride_statistics (user_id, total_distance, total_time, total_rides, avg_speed)
           VALUES ($1, $2, $3, 1, $4)`,
          [userId, total_distance, duration, duration > 0 ? (total_distance / 1000) / (duration / 3600) : 0]
        );
      } else {
        await query(
          `UPDATE ride_statistics
           SET total_distance = total_distance + $1,
               total_time = total_time + $2,
               total_rides = total_rides + 1,
               avg_speed = CASE WHEN total_time + $2 > 0
                               THEN (total_distance + $1) / 1000 / ((total_time + $2) / 3600)
                               ELSE 0 END,
               updated_at = NOW()
           WHERE user_id = $3`,
          [total_distance, duration, userId]
        );
      }
    }

    res.json({
      code: 200,
      data: {
        session_id: session_id,
        challenge_progress: challengeProgress,
        challenge_completed: challengeCompleted
      }
    });
  } catch (error) {
    console.error('[RIDE] End ride error:', error);
    res.status(500).json({ code: 500, message: '结束骑行失败' });
  }
});

router.get('/history', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT rs.*, sc.title as challenge_title
       FROM ride_sessions rs
       LEFT JOIN social_challenges sc ON rs.challenge_id = sc.id
       WHERE rs.user_id = $1 AND rs.status = 'completed'
       ORDER BY rs.end_time DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM ride_sessions WHERE user_id = $1 AND status = 'completed'`,
      [userId]
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
    console.error('[RIDE] Get history error:', error);
    res.status(500).json({ code: 500, message: '获取骑行历史失败' });
  }
});

router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.userId;

    const result = await query(
      `SELECT * FROM ride_statistics WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        code: 200,
        data: {
          total_distance: 0,
          total_time: 0,
          total_rides: 0,
          avg_speed: 0
        }
      });
    }

    res.json({ code: 200, data: result.rows[0] });
  } catch (error) {
    console.error('[RIDE] Get stats error:', error);
    res.status(500).json({ code: 500, message: '获取骑行统计失败' });
  }
});

module.exports = router;
