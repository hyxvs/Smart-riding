const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth, optionalAuth } = require('../middleware/auth');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

async function callOllama(prompt) {
  try {
    const fetch = (await import('node-fetch')).default;

    const systemPrompt = `你是"小虔"，一个专业的骑行路况分析助手。你的职责是：
1. 分析道路坡度难度，给出骑行建议
2. 根据天气预测路况变化
3. 提供骑行安全提醒
4. 评估道路舒适度

请用简洁、专业的语言回答，使用中文输出。`;

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        system: systemPrompt,
        stream: false
      }),
      timeout: 30000
    });

    if (!response.ok) {
      throw new Error(`Ollama API错误: ${response.status}`);
    }

    const data = await response.json();
    return data.response || '';
  } catch (error) {
    console.error('调用Ollama失败:', error);
    return null;
  }
}

function getCongestionLevel(score) {
  if (score >= 0.8) return { level: '畅通', color: '#67c23a', description: '路况非常好，适合高速骑行' };
  if (score >= 0.6) return { level: '良好', color: '#85ce61', description: '路况良好，可以正常骑行' };
  if (score >= 0.4) return { level: '一般', color: '#e6a23c', description: '路况一般，请注意安全' };
  if (score >= 0.2) return { level: '较堵', color: '#f56c6c', description: '比较拥堵，建议绕行或减速' };
  return { level: '拥堵', color: '#c45656', description: '非常拥堵，不建议骑行' };
}

function getTrafficCongestionLevel(score) {
  const numericScore = Number(score || 0);

  if (numericScore >= 0.8) {
    return { level: '拥堵', color: '#c45656', description: '路况非常拥堵，不建议骑行' };
  }
  if (numericScore >= 0.6) {
    return { level: '较堵', color: '#f56c6c', description: '路况较堵，建议绕行或错峰出行' };
  }
  if (numericScore >= 0.4) {
    return { level: '一般', color: '#e6a23c', description: '路况一般，请注意安全' };
  }
  if (numericScore >= 0.2) {
    return { level: '良好', color: '#85ce61', description: '路况良好，可以正常骑行' };
  }

  return { level: '畅通', color: '#67c23a', description: '路况非常好，适合高速骑行' };
}

function getDifficultyLevel(avgSlope, maxSlope) {
  const score = (avgSlope * 0.6 + maxSlope * 0.4) / 15;

  if (score < 0.2) {
    return {
      level: '轻松',
      score: 0.2,
      color: '#67c23a',
      suitableFor: '初学者、儿童、休闲骑行',
      warnings: [],
      description: '道路平缓，骑行轻松，适合所有级别的骑行者'
    };
  }
  if (score < 0.4) {
    return {
      level: '简单',
      score: 0.4,
      color: '#85ce61',
      suitableFor: '一般骑行者、初学者',
      warnings: [],
      description: '略有起伏，有少量缓坡，骑行难度不大'
    };
  }
  if (score < 0.6) {
    return {
      level: '中等',
      score: 0.6,
      color: '#e6a23c',
      suitableFor: '有经验的骑行者',
      warnings: ['注意陡坡路段', '保持体力分配'],
      description: '有一定坡度起伏，需要一定体能，建议有骑行经验者'
    };
  }
  if (score < 0.8) {
    return {
      level: '困难',
      score: 0.8,
      color: '#f56c6c',
      suitableFor: '资深骑行者、体能较好者',
      warnings: ['多处陡坡', '注意换挡', '携带补给'],
      description: '坡度较大，对体能和技术要求较高'
    };
  }
  return {
    level: '极难',
    score: 1.0,
    color: '#c45656',
    suitableFor: '专业骑行者',
    warnings: ['连续陡坡', '强烈建议绕行', '需要专业装备'],
    description: '路况极具挑战性，非专业人士请勿尝试'
  };
}

function getWeatherImpact(weatherType) {
  const impacts = {
    '晴': { congestionFactor: 1.0, safetyFactor: 1.0, comfortFactor: 1.0, description: '最佳骑行天气' },
    '多云': { congestionFactor: 1.0, safetyFactor: 0.95, comfortFactor: 0.95, description: '适合骑行' },
    '阴': { congestionFactor: 1.1, safetyFactor: 0.9, comfortFactor: 0.85, description: '适合骑行，注意能见度' },
    '小雨': { congestionFactor: 1.3, safetyFactor: 0.6, comfortFactor: 0.5, description: '路况湿滑，建议减速' },
    '中雨': { congestionFactor: 1.5, safetyFactor: 0.4, comfortFactor: 0.35, description: '不建议骑行，路面湿滑' },
    '大雨': { congestionFactor: 1.8, safetyFactor: 0.25, comfortFactor: 0.2, description: '不建议骑行，危险' },
    '雷阵雨': { congestionFactor: 2.0, safetyFactor: 0.15, comfortFactor: 0.1, description: '禁止骑行，注意防雷' },
    '雪': { congestionFactor: 2.5, safetyFactor: 0.1, comfortFactor: 0.1, description: '绝对不要骑行' },
    '雾': { congestionFactor: 1.2, safetyFactor: 0.4, comfortFactor: 0.5, description: '能见度差，建议避免骑行' },
    '霾': { congestionFactor: 1.2, safetyFactor: 0.5, comfortFactor: 0.4, description: '注意呼吸，减速慢行' },
    '大风': { congestionFactor: 1.4, safetyFactor: 0.5, comfortFactor: 0.4, description: '注意侧风，握紧车把' }
  };

  return impacts[weatherType] || impacts['晴'];
}

function normalizeWeatherImpactLookup(weatherType) {
  const value = String(weatherType || '').trim();

  if (!value) return 'sunny';
  if (value.includes('雷') || value.includes('雨')) return 'rainy';
  if (value.includes('雪')) return 'snow';
  if (value.includes('雾') || value.includes('霾')) return 'foggy';
  if (value.includes('风')) return 'windy';
  if (value.includes('阴') || value.includes('云')) return 'cloudy';

  return 'sunny';
}

function normalizeRoadImpactLookup(roadType) {
  const value = String(roadType || '').trim();

  if (!value) return 'city';
  if (value.includes('山') || value.includes('坡')) return 'mountain';

  return 'city';
}

function predictHourlyTraffic(hourOfDay, dayOfWeek, baseCongestion = 0.3) {
  let congestionMultiplier = 1.0;

  if (dayOfWeek >= 6) {
    congestionMultiplier = hourOfDay >= 10 && hourOfDay <= 16 ? 1.3 : 1.1;
  } else {
    if (hourOfDay >= 7 && hourOfDay <= 9) congestionMultiplier = 1.8;
    else if (hourOfDay >= 17 && hourOfDay <= 19) congestionMultiplier = 2.0;
    else if (hourOfDay >= 11 && hourOfDay <= 13) congestionMultiplier = 1.4;
    else if (hourOfDay >= 22 || hourOfDay <= 6) congestionMultiplier = 0.5;
  }

  return Math.min(1.0, baseCongestion * congestionMultiplier);
}

router.post('/analyze-road', optionalAuth, async (req, res) => {
  try {
    const { roadId, roadGeom, avgSlope, maxSlope, roadType } = req.body;

    if (!roadId && !roadGeom) {
      return res.status(400).json({ code: 400, message: '道路ID或几何信息不能同时为空' });
    }

    let roadInfo = { road_id: roadId, avg_slope: avgSlope || 0, max_slope: maxSlope || 0, road_type: roadType };

    if (roadId) {
      const roadResult = await query(
        `SELECT id, name, road_type, length_km, avg_slope, max_slope, slope_category,
                ST_AsGeoJSON(geom)::json as geom
         FROM road WHERE id = $1`,
        [roadId]
      );
      if (roadResult.rows.length > 0) {
        roadInfo = roadResult.rows[0];
      }
    }

    const difficulty = getDifficultyLevel(roadInfo.avg_slope || 0, roadInfo.max_slope || 0);

    const aiAdvice = await callOllama(`
请分析以下道路的骑行难度，并给出建议：
- 道路名称：${roadInfo.name || '未命名道路'}
- 道路类型：${roadInfo.road_type || '未知'}
- 路线长度：${roadInfo.length_km || 0} 公里
- 平均坡度：${roadInfo.avg_slope || 0}%
- 最大坡度：${roadInfo.max_slope || 0}%
- 难度等级：${difficulty.level}

请给出简短的骑行建议（不超过100字）。
`);

    const result = {
      roadId: roadId || null,
      roadName: roadInfo.name || '未命名道路',
      roadType: roadInfo.road_type || '未知',
      roadLength: roadInfo.length_km || 0,
      slopeAnalysis: {
        avgSlope: roadInfo.avg_slope || 0,
        maxSlope: roadInfo.max_slope || 0,
        slopeCategory: roadInfo.slope_category || '未知',
        difficultyLevel: difficulty.level,
        difficultyScore: difficulty.score,
        difficultyColor: difficulty.color,
        suitableFor: difficulty.suitableFor,
        warnings: difficulty.warnings,
        description: difficulty.description
      },
      aiAdvice: aiAdvice || difficulty.description,
      recommendations: difficulty.warnings.length > 0 ? difficulty.warnings : ['注意安全，遵守交通规则'],
      createdAt: new Date().toISOString()
    };

    res.json({
      code: 200,
      data: result
    });
  } catch (error) {
    console.error('道路分析失败:', error);
    res.status(500).json({ code: 500, message: '道路分析失败' });
  }
});

router.post('/predict-traffic', optionalAuth, async (req, res) => {
  try {
    const { roadId, targetDate, targetHour, weather, dayOfWeek } = req.body;

    if (!roadId) {
      return res.status(400).json({ code: 400, message: '道路ID不能为空' });
    }

    const target = targetDate || new Date().toISOString().split('T')[0];
    const hour = targetHour !== undefined ? targetHour : new Date().getHours();
    const dow = dayOfWeek !== undefined ? dayOfWeek : new Date().getDay();

    const roadResult = await query(
      `SELECT r.*,
              COALESCE(AVG(rcs.overall_score), 0.5) as historical_score,
              COUNT(rcs.id) as score_history_count
       FROM road r
       LEFT JOIN road_condition_score rcs ON r.id = rcs.road_id
       WHERE r.id = $1
       GROUP BY r.id`,
      [roadId]
    );

    if (roadResult.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '道路不存在' });
    }

    const road = roadResult.rows[0];
    const baseCongestion = Number(road.historical_score || 0.5);
    const safetyIndex = Number(road.safety_index || 0.5);
    const avgSlopeValue = Number(road.avg_slope || 0);

    const weatherImpact = getWeatherImpact(weather || '晴');
    const hourlyTraffic = predictHourlyTraffic(hour, dow, baseCongestion);

    const predictedCongestion = Math.min(1.0, hourlyTraffic * weatherImpact.congestionFactor);
    const predictedSafety = Math.max(0, Math.min(1, safetyIndex * weatherImpact.safetyFactor));
    const predictedComfort = Math.max(0, (1 - avgSlopeValue / 100) * weatherImpact.comfortFactor);

    const congestionInfo = getTrafficCongestionLevel(predictedCongestion);

    const peakHours = {
      morning: { start: 7, end: 9 },
      midday: { start: 11, end: 13 },
      evening: { start: 17, end: 19 }
    };

    let peakType = '非高峰';
    if (dow < 6) {
      if (hour >= peakHours.morning.start && hour <= peakHours.morning.end) peakType = '早高峰';
      else if (hour >= peakHours.evening.start && hour <= peakHours.evening.end) peakType = '晚高峰';
      else if (hour >= peakHours.midday.start && hour <= peakHours.midday.end) peakType = '午间高峰';
    }

    const predictionResult = {
      roadId: roadId,
      roadName: road.name,
      prediction: {
        date: target,
        hour: hour,
        dayOfWeek: dow,
        congestionLevel: congestionInfo.level,
        congestionScore: parseFloat(predictedCongestion.toFixed(2)),
        congestionColor: congestionInfo.color,
        congestionDescription: congestionInfo.description,
        predictedAvgSpeed: parseFloat((20 * (1 - predictedCongestion * 0.5)).toFixed(1)),
        predictedSafety: parseFloat(predictedSafety.toFixed(2)),
        predictedComfort: parseFloat(Math.min(1, predictedComfort).toFixed(2)),
        overallScore: parseFloat(((predictedCongestion + predictedSafety + Math.min(1, predictedComfort)) / 3).toFixed(2))
      },
      trafficAnalysis: {
        peakType: peakType,
        weatherImpact: weatherImpact,
        weatherType: weather || '晴',
        baseCongestion: parseFloat(baseCongestion.toFixed(2)),
        hourlyFactor: parseFloat(hourlyTraffic.toFixed(2))
      },
      recommendations: [],
      createdAt: new Date().toISOString()
    };

    if (predictedCongestion > 0.7) {
      predictionResult.recommendations.push({ type: 'warning', text: '当前时段路况较堵，建议错峰出行' });
    }
    if (predictedSafety < 0.5) {
      predictionResult.recommendations.push({ type: 'danger', text: '安全风险较高，请谨慎骑行或选择其他路线' });
    }
    if (weatherImpact.congestionFactor > 1.3) {
      predictionResult.recommendations.push({ type: 'info', text: `天气${weatherImpact.description}，请注意安全` });
    }

    res.json({
      code: 200,
      data: predictionResult
    });
  } catch (error) {
    console.error('交通预测失败:', error);
    res.status(500).json({ code: 500, message: '交通预测失败' });
  }
});

router.post('/weather-road-impact', optionalAuth, async (req, res) => {
  try {
    const { weather, roadType, avgSlope } = req.body;

    if (!weather) {
      return res.status(400).json({ code: 400, message: '天气类型不能为空' });
    }

    const weatherImpact = getWeatherImpact(weather);
    const roadTypeNorm = roadType || '城市道路';
    const weatherLookup = normalizeWeatherImpactLookup(weather);
    const roadTypeLookup = normalizeRoadImpactLookup(roadTypeNorm);

    const dbResult = await query(
      `SELECT * FROM weather_road_impact
       WHERE weather_type = $1 AND road_type = $2
       ORDER BY CASE WHEN road_type = $2 THEN 0 ELSE 1 END
       LIMIT 1`,
      [weatherLookup, roadTypeLookup]
    );

    const dbImpact = dbResult.rows[0] || null;
    const slopeValue = Number(avgSlope || 0);
    const dbCongestionFactor = Number(dbImpact?.congestion_factor || weatherImpact.congestionFactor);
    const dbSafetyFactor = Number(dbImpact?.safety_factor || weatherImpact.safetyFactor);
    const dbComfortFactor = Number(dbImpact?.comfort_factor || weatherImpact.comfortFactor);
    const safetyScore = dbSafetyFactor * (1 - slopeValue / 100 * 0.3);
    const comfortScore = dbComfortFactor;

    let advice = '';
    if (weatherImpact.congestionFactor >= 1.8) {
      advice = `天气条件较差（${weather}），${dbImpact?.description || weatherImpact.description}。强烈建议避免骑行，如必须出行请格外小心。`;
    } else if (weatherImpact.congestionFactor >= 1.3) {
      advice = `天气${weather}条件下，${dbImpact?.description || weatherImpact.description}。建议减速慢行，保持安全距离。`;
    } else {
      advice = `天气${weather}，${dbImpact?.description || weatherImpact.description}。适合骑行出行。`;
    }

    if (slopeValue > 10 && weather.includes('雨')) {
      advice += ' 注意：该路段坡度较大，雨天骑行风险极高，建议绕行。';
    }

    res.json({
      code: 200,
      data: {
        weather: weather,
        roadType: roadTypeNorm,
        avgSlope: slopeValue,
        impact: {
          congestionFactor: dbCongestionFactor,
          safetyFactor: parseFloat(safetyScore.toFixed(2)),
          comfortFactor: parseFloat(comfortScore.toFixed(2)),
          description: dbImpact?.description || weatherImpact.description
        },
        advice: advice,
        recommendations: [
          safetyScore < 0.5 ? '⚠️ 安全风险较高，建议推迟骑行计划' : null,
          weather.includes('雨') && slopeValue > 5 ? '⚠️ 雨天坡道危险，请特别小心' : null,
          weather.includes('大风') ? '⚠️ 注意横风影响，保持低速' : null,
          safetyScore >= 0.5 ? '✓ 天气条件尚可，可以正常骑行' : null
        ].filter(Boolean)
      }
    });
  } catch (error) {
    console.error('天气路况影响分析失败:', error);
    res.status(500).json({ code: 500, message: '天气路况影响分析失败' });
  }
});

router.post('/route-analysis', optionalAuth, async (req, res) => {
  try {
    const { routeGeom, weather, userLevel } = req.body;

    if (!routeGeom) {
      return res.status(400).json({ code: 400, message: '路线几何信息不能为空' });
    }

    const slopeAnalysisResult = await query(`
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
          COALESCE((
            SELECT ST_Value(d.rast, s.geom)
            FROM dem d
            WHERE ST_Intersects(d.rast, s.geom)
            LIMIT 1
          ), 0) AS elevation
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
              AND p1.elevation IS NOT NULL AND p2.elevation IS NOT NULL
            THEN ABS((p2.elevation - p1.elevation) / ST_Distance(p1.geom::geography, p2.geom::geography)) * 100
            ELSE 0
          END AS slope_percent,
          GREATEST(COALESCE(p2.elevation - p1.elevation, 0), 0) AS uphill_gain
        FROM sampled_points p1
        JOIN sampled_points p2 ON p2.idx = p1.idx + 1
      ),
      slope_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL) AS segment_count,
          COUNT(*) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL AND slope_percent < 3) AS flat,
          COUNT(*) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL AND slope_percent >= 3 AND slope_percent < 8) AS moderate,
          COUNT(*) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL AND slope_percent >= 8 AND slope_percent < 15) AS steep,
          COUNT(*) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL AND slope_percent >= 15) AS very_steep,
          COALESCE(MAX(slope_percent), 0) AS max_slope,
          COALESCE(AVG(slope_percent) FILTER (WHERE elevation_start IS NOT NULL AND elevation_end IS NOT NULL), 0) AS avg_slope,
          COALESCE(SUM(uphill_gain), 0) AS total_elevation_gain
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
        slope_stats.*,
        elevation_stats.*,
        route_meta.route_length_m
      FROM route_meta, slope_stats, elevation_stats
    `, [JSON.stringify(routeGeom)]);

    const stats = slopeAnalysisResult.rows[0] || {};
    const routeLength = stats.route_length_m || 0;
    const avgSlope = stats.avg_slope || 0;
    const maxSlope = stats.max_slope || 0;
    const totalElevationGain = stats.total_elevation_gain || 0;

    const difficulty = getDifficultyLevel(avgSlope, maxSlope);

    const weatherImpact = getWeatherImpact(weather || '晴');

    const energyConsumption = Math.round(routeLength / 1000 * 30 * (1 + avgSlope / 50));
    const estimatedTime = Math.round(routeLength / 1000 / 15 * 60 * (1 + avgSlope / 100));

    const aiAdvice = await callOllama(`
请为以下骑行路线提供建议：

路线概况：
- 总长度：${(routeLength / 1000).toFixed(2)} 公里
- 平均坡度：${avgSlope.toFixed(2)}%
- 最大坡度：${maxSlope.toFixed(2)}%
- 总爬升：${totalElevationGain.toFixed(0)} 米
- 天气：${weather || '晴'}
- 用户级别：${userLevel || 1} 级

坡度分布：
- 平缓：${stats.flat || 0} 段
- 中等：${stats.moderate || 0} 段
- 较陡：${stats.steep || 0} 段
- 陡峭：${stats.very_steep || 0} 段

请给出骑行建议（不超过150字）。
`);

    const recommendations = [];

    if (maxSlope > 15) {
      recommendations.push({ type: 'danger', text: '路线包含陡峭坡道，新手不建议尝试' });
    } else if (maxSlope > 8) {
      recommendations.push({ type: 'warning', text: '部分路段坡度较大，建议提前减速' });
    }

    if (weatherImpact.congestionFactor > 1.3) {
      recommendations.push({ type: 'warning', text: `${weather}天气下骑行请注意安全` });
    }

    if (totalElevationGain > 500) {
      recommendations.push({ type: 'info', text: '累计爬升较大，建议携带充足补给' });
    }

    if (userLevel && userLevel < 3 && avgSlope > 5) {
      recommendations.push({ type: 'info', text: '作为新手骑行者，建议控制速度，量力而行' });
    }

    recommendations.push({ type: 'info', text: `预计骑行时间：约${estimatedTime}分钟` });
    recommendations.push({ type: 'info', text: `预计消耗热量：约${energyConsumption}千卡` });

    res.json({
      code: 200,
      data: {
        routeOverview: {
          totalDistance: parseFloat((routeLength / 1000).toFixed(2)),
          totalDistanceMeters: parseFloat(routeLength.toFixed(0)),
          avgSlope: parseFloat(avgSlope.toFixed(2)),
          maxSlope: parseFloat(maxSlope.toFixed(2)),
          totalElevationGain: parseFloat(totalElevationGain.toFixed(0)),
          estimatedTime: estimatedTime,
          energyConsumption: energyConsumption
        },
        slopeDistribution: {
          flat: stats.flat || 0,
          moderate: stats.moderate || 0,
          steep: stats.steep || 0,
          verySteep: stats.very_steep || 0,
          segments: stats.segment_count || 0,
          coveredSegments: stats.covered_sample_count || 0
        },
        difficulty: difficulty,
        weatherImpact: weatherImpact,
        aiAdvice: aiAdvice || difficulty.description,
        recommendations: recommendations,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('路线分析失败:', error);
    res.status(500).json({ code: 500, message: '路线分析失败' });
  }
});

router.get('/:roadId', optionalAuth, async (req, res) => {
  try {
    const { roadId } = req.params;
    const { date } = req.query;

    const targetDate = date || new Date().toISOString().split('T')[0];

    const conditionResult = await query(
      `SELECT * FROM road_condition_score
       WHERE road_id = $1 AND score_date = $2
       ORDER BY created_at DESC LIMIT 1`,
      [roadId, targetDate]
    );

    const historyResult = await query(
      `SELECT score_date, overall_score, congestion_score, safety_score, comfort_score
       FROM road_condition_score
       WHERE road_id = $1
       ORDER BY score_date DESC
       LIMIT 30`,
      [roadId]
    );

    const roadResult = await query(
      `SELECT * FROM road WHERE id = $1`,
      [roadId]
    );

    if (roadResult.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '道路不存在' });
    }

    const road = roadResult.rows[0];
    const currentCondition = conditionResult.rows[0];

    res.json({
      code: 200,
      data: {
        road: {
          id: road.id,
          name: road.name,
          roadType: road.road_type,
          lengthKm: road.length_km,
          avgSlope: road.avg_slope,
          maxSlope: road.max_slope,
          slopeCategory: road.slope_category
        },
        currentCondition: currentCondition ? {
          date: currentCondition.score_date,
          overallScore: parseFloat(currentCondition.overall_score),
          congestionScore: parseFloat(currentCondition.congestion_score),
          safetyScore: parseFloat(currentCondition.safety_score),
          comfortScore: parseFloat(currentCondition.comfort_score),
          congestionLevel: getTrafficCongestionLevel(currentCondition.congestion_score).level
        } : null,
        history: historyResult.rows.map(row => ({
          date: row.score_date,
          overallScore: parseFloat(row.overall_score),
          congestionScore: parseFloat(row.congestion_score),
          safetyScore: parseFloat(row.safety_score),
          comfortScore: parseFloat(row.comfort_score)
        })),
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('获取路况失败:', error);
    res.status(500).json({ code: 500, message: '获取路况失败' });
  }
});

module.exports = router;
