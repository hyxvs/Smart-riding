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