# 贡献指南

感谢您对骑行智慧民生服务平台的关注和支持！我们欢迎各种形式的贡献，包括代码、文档、bug报告和功能建议。

## 开发环境设置

### 1. 克隆仓库

```bash
git clone https://github.com/yourusername/cycling-smart.git
cd cycling-smart
```

### 2. 安装依赖

```bash
# 前端依赖
cd frontend
npm install

# 后端依赖
cd ../backend
npm install
```

### 3. 配置环境变量

复制 `.env.example` 文件为 `.env` 并根据您的环境进行配置：

```bash
# 前端
cp frontend/.env.example frontend/.env

# 后端
cp backend/.env.example backend/.env
```

### 4. 初始化数据库

```bash
# 创建数据库
psql -U postgres -c "CREATE DATABASE cycling_smart;"

# 执行初始化脚本
psql -U postgres -d cycling_smart -f database/init.sql
```

### 5. 启动开发服务器

```bash
# 启动后端
cd backend
npm run dev

# 启动前端
cd ../frontend
npm run dev
```

## 代码规范

### 前端
- 使用 ES6+ 语法
- 遵循 Vue 3 组合式 API 风格
- 组件命名使用 PascalCase
- 变量和函数命名使用 camelCase
- 常量命名使用 UPPERCASE
- 代码缩进使用 2 个空格

### 后端
- 使用 ES6+ 语法
- 遵循 RESTful API 设计规范
- 路由命名使用 kebab-case
- 变量和函数命名使用 camelCase
- 常量命名使用 UPPERCASE
- 代码缩进使用 2 个空格

## 提交规范

### 提交信息格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 类型说明

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码风格调整
- `refactor`: 代码重构
- `test`: 测试更新
- `chore`: 构建或依赖更新

### 示例

```
feat(route): 添加骑行路线规划功能

- 支持最快、最短、最安全三种路线模式
- 集成 pgRouting 进行路径计算
- 添加路线预览和保存功能

Closes #123
```

## 分支管理

- `main`: 主分支，用于发布稳定版本
- `develop`: 开发分支，用于集成新功能
- `feature/*`: 功能分支，用于开发新功能
- `fix/*`: 修复分支，用于修复 bug

## 提交流程

1. **Fork** 仓库到您的 GitHub 账号
2. **克隆** 您的 fork 到本地
3. **创建** 一个新分支
4. **开发** 您的功能或修复
5. **提交** 您的更改
6. **推送** 到您的 fork
7. **创建** 一个 Pull Request

## 代码审查

- 所有代码更改都需要经过代码审查
- 至少需要一位维护者批准才能合并
- 确保所有测试通过
- 确保代码符合项目的代码规范

## 问题反馈

如果您发现 bug 或有功能建议，请在 GitHub Issues 中提交：

1. **Bug 报告**：
   - 描述问题的详细步骤
   - 提供预期行为和实际行为
   - 附上相关的错误信息和截图

2. **功能建议**：
   - 描述您希望添加的功能
   - 解释为什么这个功能对项目有价值
   - 提供任何相关的设计或实现思路

## 联系方式

如果您有任何问题或需要帮助，可以通过以下方式联系我们：

- GitHub Issues: https://github.com/hyxvs/Smart-riding/issues

---

感谢您的贡献，让我们一起打造更好的骑行智慧民生服务平台！

基于骑行用户的真实需求，我来为你分析现有功能的市场潜力，并提出新的功能扩展建议。

---

## 一、现有功能的市场价值评估

### ✅ 已具备商业化潜力的功能

| 功能模块 | 市场定位 | 竞争优势 | 改进建议 |
|---------|---------|---------|---------|
| **智能路线规划** | 核心产品 | 坡度分析+DEM数据支撑 | 增加离线地图支持 |
| **民情上报系统** | 民生服务 | 政府背书信任度 | 增加问题分类精细化 |
| **组队骑行** | 社交产品 | 邀请码私密机制 | 增加实时位置共享 |
| **个人中心** | 用户体系 | 等级积分系统 | 增加成就徽章系统 |
| **服务范围分析** | 专业工具 | 等时圈可视化 | 增加更多分析维度 |

---

## 二、面向骑行用户的新功能建议

### 🎯 需求洞察：骑行用户的核心痛点

| 用户场景 | 痛点描述 | 需求强度 |
|---------|---------|---------|
| **安全骑行** | 夜间骑行不安全、路况不明 | 🔴 高 |
| **数据记录** | 无法记录和分析骑行数据 | 🔴 高 |
| **社交互动** | 难以找到志同道合的骑友 | 🟡 中 |
| **装备管理** | 自行车保养维护提醒 | 🟡 中 |
| **应急保障** | 骑行中突发状况求助困难 | 🔴 高 |

---

### 新功能建议详情

#### 1. **实时骑行记录模块**
**功能描述**：GPS轨迹记录、速度/距离/时间统计

```markdown
核心功能：
├── GPS轨迹实时追踪
├── 自动暂停/恢复（红绿灯检测）
├── 分段统计（每公里配速）
├── 海拔变化可视化
└── 数据导出（GPX/KML格式）
```

**用户价值**：记录骑行数据，分析骑行表现，支持运动社交分享

---

#### 2. **骑行安全助手**
**功能描述**：针对骑行安全的全方位保护

```markdown
核心功能：
├── 夜间骑行模式（高对比度地图）
├── 危险路段预警（陡坡/施工/事故多发区）
├── 紧急联系人一键呼叫
├── 摔倒检测（结合手机传感器）
└── 骑行保险快捷购买入口
```

**用户价值**：提升骑行安全性，减少事故风险

---

#### 3. **智能装备管家** ✅ 已实现
**功能描述**：自行车和装备的全生命周期管理

```markdown
核心功能：
├── 车辆档案管理（品牌/型号/购买日期）
├── 保养提醒（链条/刹车/轮胎周期）
├── 装备清单（头盔/锁/工具等）
├── 维护费用记录
└── 二手交易信息发布
```

**用户价值**：科学管理骑行装备，延长使用寿命

**实现详情**：
- 数据库表：`database/create_equipment_tables.sql`
- 后端路由：`backend/src/routes/equipment.js`
- 前端入口：用户中心 → 我的装备标签页
- API接口：
  - `GET /api/equipment/list` - 获取装备列表
  - `GET /api/equipment/categories` - 获取分类列表
  - `GET /api/equipment/:id` - 获取装备详情
  - `POST /api/equipment` - 添加装备
  - `PUT /api/equipment/:id` - 更新装备
  - `DELETE /api/equipment/:id` - 删除装备
  - `POST /api/equipment/maintenance` - 添加保养记录
  - `GET /api/equipment/maintenance/:equipmentId` - 获取保养记录
  - `GET /api/equipment/reminders` - 获取保养提醒
  - `GET /api/equipment/stats` - 获取装备统计

---

#### 4. **骑行社交广场** ✅ 已实现
**功能描述**：骑行爱好者的社交互动平台

```markdown
核心功能：
├── 附近骑友发现
├── 骑行日记分享（图文/视频）
├── 话题讨论区
├── 骑行挑战活动
└── 排行榜（里程/爬升/次数）
```

**用户价值**：扩大社交圈，增强社区归属感

**实现详情**：
- 数据库表：`database/create_social_tables.sql`
- 后端路由：`backend/src/routes/social.js`
- 前端页面：`frontend/src/views/social.vue`
- 首页入口：首页 → 社交广场按钮
- API接口：
  - `GET /api/social/feed` - 获取动态流
  - `GET /api/social/post/:id` - 获取动态详情
  - `POST /api/social/post` - 发布动态
  - `DELETE /api/social/post/:id` - 删除动态
  - `POST /api/social/like/:postId` - 点赞/取消点赞
  - `POST /api/social/comment` - 添加评论
  - `DELETE /api/social/comment/:id` - 删除评论
  - `POST /api/social/follow/:userId` - 关注/取消关注
  - `GET /api/social/following` - 获取关注列表
  - `GET /api/social/followers` - 获取粉丝列表
  - `GET /api/social/nearby` - 获取附近骑友
  - `GET /api/social/topics` - 获取话题列表
  - `GET /api/social/topics/:id/posts` - 获取话题动态
  - `GET /api/social/challenges` - 获取挑战列表
  - `GET /api/social/challenges/:id` - 获取挑战详情
  - `POST /api/social/challenges/:id/join` - 参加挑战
  - `PUT /api/social/challenges/:id/progress` - 更新挑战进度
  - `GET /api/social/leaderboard` - 获取排行榜

---

#### 5. **周边服务地图**
**功能描述**：骑行相关服务的一站式查询

```markdown
核心功能：
├── 自行车维修店定位
├── 共享单车停车点
├── 骑行友好商家（提供打气/补水）
├── 风景打卡点推荐
└── 洗手间/休息区地图
```

**用户价值**：解决骑行途中的实际需求

---

#### 6. **多人实时骑行**
**功能描述**：组队骑行时的实时位置共享

```markdown
核心功能：
├── 组队实时定位（类似高德组队）
├── 队长导航共享
├── 掉队提醒
├── 语音对讲（接入第三方SDK）
└── 骑行结束合影生成
```

**用户价值**：提升团队骑行体验，增强安全性

---

#### 7. **骑行天气助手**
**功能描述**：专为骑行设计的天气预报

```markdown
核心功能：
├── 骑行时段天气预测
├── 风力/风向分析（影响骑行难度）
├── 降水概率预警
├── 紫外线指数（防晒提醒）
└── 穿衣建议
```

**用户价值**：帮助用户做出是否骑行的决策

---

#### 8. **训练计划模块**
**功能描述**：针对不同目标的训练指导

```markdown
核心功能：
├── 入门训练计划（每周3次）
├── 减脂训练计划
├── 耐力提升计划
├── 自定义训练目标
└── 训练进度跟踪
```

**用户价值**：科学指导骑行训练，达成健身目标

---

## 三、功能优先级排序

### 🔴 第一阶段 - 核心功能（立即开发）
1. **实时骑行记录** - 基础数据采集
2. **骑行安全助手** - 解决核心痛点
3. **周边服务地图** - 实用工具属性

### 🟡 第二阶段 - 社交功能（3个月内）
4. **骑行社交广场** ✅ 已实现
5. **多人实时骑行** - 团队体验提升

### 🟢 第三阶段 - 进阶功能（6个月内）
6. **智能装备管家** ✅ 已实现
7. **骑行天气助手** - 精细化体验
8. **训练计划模块** - 专业用户需求

---

## 四、技术实现建议

### 前端技术栈
| 功能 | 技术方案 | 说明 |
|-----|---------|------|
| GPS定位 | HTML5 Geolocation API | 实时位置获取 |
| 轨迹绘制 | OpenLayers/Leaflet | 地图渲染 |
| 运动传感器 | DeviceMotion API | 步数/摔倒检测 |
| 语音对讲 | WebRTC/第三方SDK | 实时通讯 |
| 数据存储 | LocalStorage + 云端同步 | 离线可用 |

### 后端支持需求
```markdown
需要新增的API接口：
├── /api/trip/create          # 创建骑行记录
├── /api/trip/list            # 获取骑行记录列表
├── /api/trip/detail/{id}     # 骑行记录详情
├── /api/social/post          # 发布骑行动态
├── /api/social/feed          # 社交动态流
├── /api/service/search       # 周边服务搜索
├── /api/team/location        # 组队实时位置
└── /api/weather/forecast     # 骑行天气预报
```

---

## 五、商业化路径

### 短期（1年内）
- **增值服务**：高级数据分析报告
- **广告收入**：骑行装备商家入驻
- **会员订阅**：解锁高级功能

### 中期（2年内）
- **电商平台**：骑行装备销售
- **赛事运营**：组织线上/线下骑行活动
- **保险合作**：骑行意外险定制

---

## 总结

现有平台已经具备了良好的基础，建议优先开发**实时骑行记录**和**骑行安全助手**这两个高需求功能，同时完善**周边服务地图**，形成"导航+记录+社交+服务"的完整骑行生态。

如需进一步讨论某个功能的具体实现方案，我可以提供更详细的技术分析。