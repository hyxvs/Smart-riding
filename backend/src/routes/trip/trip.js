const express = require('express');
const router = express.Router();
const { query, transaction } = require('../../config/database');
const { auth } = require('../../middleware/auth');
const {
  callGaodeWeatherApi,
  buildCurrentWeatherData
} = require('../../utils/weather');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

async function callOllama(prompt) {
  try {
    const fetch = (await import('node-fetch')).default;

    const systemPrompt = `你是"小虔"，一个专业的骑行助手。你可以帮助用户：
1. 规划骑行路线（最快、最短、最安全、风景、红色研学）
2. 查询周边POI和红色景点
3. 查询天气预报和骑行建议
4. 解答骑行相关问题
5. 引导用户上报民生问题
6. 提供骑行安全建议
7. 制定完整的旅行计划

当用户询问天气时，请提取城市名称并告知将为您查询天气信息。
请用友好、专业的语气回答用户问题。如果用户想要规划路线，请提取起点和终点信息。`;

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        system: systemPrompt,
        stream: false
      }),
      timeout: 60000
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

async function searchAttractions(city, interests = [], limit = 10) {
  try {
    let interestFilter = '';
    const params = [`%${city}%`, limit];

    if (interests.length > 0) {
      interestFilter = `AND (`;
      interests.forEach((interest, index) => {
        if (index > 0) interestFilter += ` OR `;
        interestFilter += `name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1} OR red_description ILIKE $${params.length + 1}`;
        params.push(`%${interest}%`);
      });
      interestFilter += `)`;
    }

    const result = await query(
      `SELECT id, name, category, sub_category,
              ST_X(geom) as lng, ST_Y(geom) as lat,
              address, description, is_red_spot, red_description,
              safety_rating, scenery_rating, opening_hours
       FROM poi
       WHERE status = 'normal'
         AND geom IS NOT NULL
         AND (name ILIKE $1 OR address ILIKE $1 ${interestFilter})
       ORDER BY
         CASE WHEN is_red_spot = true THEN 0 ELSE 1 END,
         scenery_rating DESC NULLS LAST,
         safety_rating DESC NULLS LAST
       LIMIT $2`,
      params
    );

    return result.rows;
  } catch (error) {
    console.error('搜索景点失败:', error);
    return [];
  }
}

async function searchRestaurants(city, limit = 5) {
  try {
    const result = await query(
      `SELECT id, name, category, sub_category,
              ST_X(geom) as lng, ST_Y(geom) as lat,
              address, opening_hours
       FROM poi
       WHERE status = 'normal'
         AND geom IS NOT NULL
         AND category IN ('餐饮服务', '购物服务', '生活服务')
         AND (name ILIKE $1 OR address ILIKE $1)
       ORDER BY safety_rating DESC NULLS LAST
       LIMIT $2`,
      [`%${city}%`, limit]
    );

    return result.rows;
  } catch (error) {
    console.error('搜索餐厅失败:', error);
    return [];
  }
}

async function searchAccommodations(city, limit = 3) {
  try {
    const result = await query(
      `SELECT id, name, category, sub_category,
              ST_X(geom) as lng, ST_Y(geom) as lat,
              address, opening_hours
       FROM poi
       WHERE status = 'normal'
         AND geom IS NOT NULL
         AND category IN ('住宿服务', '旅馆招待所', '民宿')
         AND (name ILIKE $1 OR address ILIKE $1)
       ORDER BY safety_rating DESC NULLS LAST
       LIMIT $2`,
      [`%${city}%`, limit]
    );

    return result.rows;
  } catch (error) {
    console.error('搜索住宿失败:', error);
    return [];
  }
}

async function getWeatherForecast(city) {
  try {
    const { data } = await callGaodeWeatherApi(city, 'all');
    return data?.forecasts?.[0] || null;
  } catch (error) {
    console.error('获取天气预报失败:', error);
    return null;
  }
}

router.post('/create', auth, async (req, res) => {
  try {
    const { destination, durationDays, budget, interests, sessionId } = req.body;

    if (!destination || !durationDays) {
      return res.status(400).json({ code: 400, message: '目的地和行程天数不能为空' });
    }

    const tripResult = await query(
      `INSERT INTO trip_plan (user_id, session_id, destination, duration_days, budget, interests, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'planning')
       RETURNING id`,
      [req.userId, sessionId, destination, durationDays, budget, JSON.stringify(interests || [])]
    );

    const tripPlanId = tripResult.rows[0].id;

    const attractions = await searchAttractions(destination, interests, durationDays * 3);
    const weatherForecast = await getWeatherForecast(destination);

    const dailyPlans = [];
    const attractionsPerDay = Math.ceil(attractions.length / durationDays);

    for (let day = 1; day <= durationDays; day++) {
      const dayResult = await query(
        `INSERT INTO day_plan (trip_plan_id, day_number, start_time, end_time, theme, weather_info)
         VALUES ($1, $2, '08:00', '18:00', $3, $4)
         RETURNING id`,
        [
          tripPlanId,
          day,
          `第${day}天 - ${interests?.join('、') || '骑行探秘'}`,
          weatherForecast ? JSON.stringify({
            date: weatherForecast.casts?.[day - 1]?.date,
            dayWeather: weatherForecast.casts?.[day - 1]?.dayweather,
            nightWeather: weatherForecast.casts?.[day - 1]?.nightweather,
            dayTemp: weatherForecast.casts?.[day - 1]?.daytemp,
            nightTemp: weatherForecast.casts?.[day - 1]?.nighttemp,
            wind: weatherForecast.casts?.[day - 1]?.daywind,
            windPower: weatherForecast.casts?.[day - 1]?.daypower
          }) : null
        ]
      );

      const dayPlanId = dayResult.rows[0].id;
      const dayAttractions = attractions.slice((day - 1) * attractionsPerDay, day * attractionsPerDay);

      for (let i = 0; i < dayAttractions.length; i++) {
        const attraction = dayAttractions[i];
        const arrivalHour = 8 + i * 2;
        await query(
          `INSERT INTO trip_attraction (day_plan_id, poi_id, sequence, arrival_time, departure_time, stay_duration, visit_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            dayPlanId,
            attraction.id,
            i + 1,
            `${String(arrivalHour).padStart(2, '0')}:00`,
            `${String(arrivalHour + 1).padStart(2, '0')}:00`,
            60,
            attraction.is_red_spot ? '红色景点' : '风景游览'
          ]
        );
      }

      dailyPlans.push({
        dayNumber: day,
        dayPlanId,
        attractions: dayAttractions,
        startTime: '08:00',
        endTime: '18:00'
      });
    }

    const restaurants = await searchRestaurants(destination, durationDays * 3);
    for (let day = 1; day <= durationDays; day++) {
      const dayPlanId = dailyPlans[day - 1].dayPlanId;

      const meals = [
        { type: 'breakfast', time: '07:30', budget: 15 },
        { type: 'lunch', time: '12:00', budget: 30 },
        { type: 'dinner', time: '18:00', budget: 40 }
      ];

      for (let i = 0; i < meals.length; i++) {
        const restaurant = restaurants[(day - 1) * 3 + i] || restaurants[0];
        if (restaurant) {
          await query(
            `INSERT INTO trip_restaurant (day_plan_id, poi_id, meal_type, sequence, arrival_time, budget)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [dayPlanId, restaurant.id, meals[i].type, i + 1, meals[i].time, meals[i].budget]
          );
        }
      }
    }

    const accommodations = await searchAccommodations(destination, 1);
    if (accommodations.length > 0) {
      await query(
        `INSERT INTO trip_accommodation (trip_plan_id, day_plan_id, poi_id, check_in_date, check_out_date, price, room_type)
         VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE + $4, $5, '标准间')`,
        [tripPlanId, dailyPlans[0].dayPlanId, accommodations[0].id, durationDays, budget ? budget / durationDays : 100]
      );
    }

    const categories = [
      { name: '门票', amount: attractions.length * 30 },
      { name: '餐饮', amount: (durationDays * 3) * 30 },
      { name: '住宿', amount: budget ? budget * 0.4 : durationDays * 100 },
      { name: '交通', amount: durationDays * 20 },
      { name: '其他', amount: budget ? budget * 0.1 : 50 }
    ];

    for (const cat of categories) {
      await query(
        `INSERT INTO trip_budget (trip_plan_id, category, item_name, estimated_cost)
         VALUES ($1, $2, $3, $4)`,
        [tripPlanId, '支出', cat.name, cat.amount]
      );
    }

    const aiPrompt = `请为用户生成一份详细的${destination}${durationDays}天骑行旅行计划，包括：
1. 总体行程亮点
2. 每日主题和特色
3. 骑行安全提示
4. 必备物品清单

用户偏好：${interests?.join('、') || '历史文化'}
预算：${budget || '未知'}元`;

    const aiResponse = await callOllama(aiPrompt);

    const totalDistance = dailyPlans.reduce((sum, day) => {
      return sum + (day.attractions.length * 5);
    }, 0);

    await query(
      `UPDATE trip_plan
       SET total_distance = $1, total_time = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [totalDistance, durationDays * 8, tripPlanId]
    );

    const dayPlansResult = await query(
      `SELECT dp.* FROM day_plan dp WHERE dp.trip_plan_id = $1 ORDER BY dp.day_number`,
      [tripPlanId]
    );

    const dayPlans = [];
    for (const dp of dayPlansResult.rows) {
      const attractionsResult = await query(
        `SELECT ta.*, p.name as poi_name, p.category as poi_category, p.address as poi_address, p.is_red_spot
         FROM trip_attraction ta
         JOIN poi p ON ta.poi_id = p.id
         WHERE ta.day_plan_id = $1
         ORDER BY ta.sequence`,
        [dp.id]
      );

      const restaurantsResult = await query(
        `SELECT tr.*, p.name as poi_name
         FROM trip_restaurant tr
         JOIN poi p ON tr.poi_id = p.id
         WHERE tr.day_plan_id = $1
         ORDER BY tr.sequence`,
        [dp.id]
      );

      dayPlans.push({
        id: dp.id,
        dayNumber: dp.day_number,
        date: dp.date,
        startTime: dp.start_time,
        endTime: dp.end_time,
        theme: dp.theme,
        weatherInfo: dp.weather_info,
        attractions: attractionsResult.rows.map(ta => ({
          id: ta.id,
          poiId: ta.poi_id,
          sequence: ta.sequence,
          arrivalTime: ta.arrival_time,
          departureTime: ta.departure_time,
          stayDuration: ta.stay_duration,
          visitType: ta.visit_type,
          poiName: ta.poi_name,
          poiCategory: ta.poi_category,
          poiAddress: ta.poi_address,
          isRedSpot: ta.is_red_spot
        })),
        restaurants: restaurantsResult.rows.map(tr => ({
          id: tr.id,
          poiId: tr.poi_id,
          mealType: tr.meal_type,
          arrivalTime: tr.arrival_time,
          budget: tr.budget,
          poiName: tr.poi_name
        }))
      });
    }

    const budgetSummary = await query(
      `SELECT category, SUM(estimated_cost) as total
       FROM trip_budget
       WHERE trip_plan_id = $1
       GROUP BY category`,
      [tripPlanId]
    );

    res.json({
      code: 200,
      data: {
        id: tripPlanId,
        destination,
        durationDays,
        budget,
        interests,
        aiResponse,
        dayPlans,
        budgetSummary: budgetSummary.rows,
        weatherForecast: weatherForecast ? {
          city: weatherForecast.city,
          casts: weatherForecast.casts
        } : null
      }
    });
  } catch (error) {
    console.error('创建行程规划失败:', error);
    res.status(500).json({ code: 500, message: '创建行程规划失败' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const tripPlan = await query(
      `SELECT tp.*,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'id', dp.id,
                  'dayNumber', dp.day_number,
                  'date', dp.date,
                  'startTime', dp.start_time,
                  'endTime', dp.end_time,
                  'theme', dp.theme,
                  'weatherInfo', dp.weather_info,
                  'totalDistance', dp.total_distance,
                  'totalTime', dp.total_time,
                  'tips', dp.tips,
                  'attractions', (
                    SELECT json_agg(json_build_object(
                      'id', ta.id,
                      'poiId', ta.poi_id,
                      'sequence', ta.sequence,
                      'arrivalTime', ta.arrival_time,
                      'departureTime', ta.departure_time,
                      'stayDuration', ta.stay_duration,
                      'visitType', ta.visit_type,
                      'tickets', ta.tickets,
                      'description', ta.description,
                      'poiName', p.name,
                      'poiCategory', p.category,
                      'poiAddress', p.address,
                      'poiLng', ST_X(p.geom),
                      'poiLat', ST_Y(p.geom),
                      'isRedSpot', p.is_red_spot,
                      'sceneryRating', p.scenery_rating,
                      'safetyRating', p.safety_rating
                    ) ORDER BY ta.sequence)
                    FROM trip_attraction ta
                    JOIN poi p ON ta.poi_id = p.id
                    WHERE ta.day_plan_id = dp.id
                  ),
                  'restaurants', (
                    SELECT json_agg(json_build_object(
                      'id', tr.id,
                      'poiId', tr.poi_id,
                      'mealType', tr.meal_type,
                      'sequence', tr.sequence,
                      'arrivalTime', tr.arrival_time,
                      'budget', tr.budget,
                      'recommendedDishes', tr.recommended_dishes,
                      'poiName', p.name,
                      'poiAddress', p.address,
                      'poiLng', ST_X(p.geom),
                      'poiLat', ST_Y(p.geom)
                    ))
                    FROM trip_restaurant tr
                    JOIN poi p ON tr.poi_id = p.id
                    WHERE tr.day_plan_id = dp.id
                  ),
                  'route', (
                    SELECT json_build_object(
                      'routeGeom', ST_AsGeoJSON(tr2.route_geom),
                      'waypoints', tr2.waypoints
                    )
                    FROM trip_route tr2
                    WHERE tr_route.day_plan_id = dp.id
                  )
                )) ORDER BY dp.day_number)
                FROM day_plan dp
                WHERE dp.trip_plan_id = tp.id
              ), '[]') as day_plans
       FROM trip_plan tp
       WHERE tp.id = $1 AND (tp.user_id = $2 OR $2 = 1)`,
      [id, req.userId]
    );

    if (tripPlan.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '行程规划不存在' });
    }

    const budgetDetails = await query(
      `SELECT * FROM trip_budget WHERE trip_plan_id = $1 ORDER BY category, id`,
      [id]
    );

    const accommodation = await query(
      `SELECT ta.*, p.name as poi_name, p.address as poi_address,
              ST_X(p.geom) as lng, ST_Y(p.geom) as lat
       FROM trip_accommodation ta
       JOIN poi p ON ta.poi_id = p.id
       WHERE ta.trip_plan_id = $1`,
      [id]
    );

    res.json({
      code: 200,
      data: {
        ...tripPlan.rows[0],
        budgetDetails: budgetDetails.rows,
        accommodation: accommodation.rows[0] || null
      }
    });
  } catch (error) {
    console.error('获取行程规划详情失败:', error);
    res.status(500).json({ code: 500, message: '获取行程规划详情失败' });
  }
});

router.get('/list', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE user_id = $1';
    const params = [req.userId];

    if (status) {
      params.push(status);
      whereClause += ` AND status = $${params.length}`;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM trip_plan ${whereClause}`,
      params
    );

    params.push(limit, offset);
    const result = await query(
      `SELECT tp.id, tp.destination, tp.duration_days, tp.budget, tp.status,
              tp.interests, tp.total_distance, tp.total_time, tp.created_at,
              (SELECT COUNT(*) FROM day_plan WHERE trip_plan_id = tp.id) as day_count
       FROM trip_plan tp
       ${whereClause}
       ORDER BY tp.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
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
    console.error('获取行程规划列表失败:', error);
    res.status(500).json({ code: 500, message: '获取行程规划列表失败' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, dayPlans } = req.body;

    if (dayPlans && dayPlans.length > 0) {
      for (const dayPlan of dayPlans) {
        await query(
          `UPDATE day_plan
           SET date = $1, start_time = $2, end_time = $3, theme = $4, tips = $5
           WHERE id = $6 AND trip_plan_id = $7`,
          [dayPlan.date, dayPlan.startTime, dayPlan.endTime, dayPlan.theme, dayPlan.tips, dayPlan.id, id]
        );

        if (dayPlan.attractions) {
          for (const attraction of dayPlan.attractions) {
            await query(
              `UPDATE trip_attraction
               SET arrival_time = $1, departure_time = $2, stay_duration = $3
               WHERE id = $4 AND day_plan_id = $5`,
              [attraction.arrivalTime, attraction.departureTime, attraction.stayDuration, attraction.id, dayPlan.id]
            );
          }
        }
      }
    }

    if (status) {
      await query(
        `UPDATE trip_plan SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3`,
        [status, id, req.userId]
      );
    }

    res.json({ code: 200, message: '更新成功' });
  } catch (error) {
    console.error('更新行程规划失败:', error);
    res.status(500).json({ code: 500, message: '更新行程规划失败' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    await query(
      `DELETE FROM trip_plan WHERE id = $1 AND user_id = $2`,
      [id, req.userId]
    );

    res.json({ code: 200, message: '删除成功' });
  } catch (error) {
    console.error('删除行程规划失败:', error);
    res.status(500).json({ code: 500, message: '删除行程规划失败' });
  }
});

module.exports = router;
