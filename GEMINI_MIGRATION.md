# Gemini API 迁移指南

## ✅ 已完成的步骤

### 1. 安装 Gemini SDK
```bash
npm install @google/generative-ai
```

### 2. 更新 API 端点
- ✅ `app/api/coach/chat/route.ts` 已完全重写
- ✅ 使用 Google Gemini API 替代 Anthropic Claude
- ✅ 保持前端代码不变（`app/coach/page.tsx` 无需修改）

## 📝 需要你完成的步骤

### Step 1: 更新 .env.local

在项目根目录的 `.env.local` 文件中：

**删除或注释掉：**
```env
# ANTHROPIC_API_KEY=sk-ant-api03-...
```

**添加：**
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### Step 2: 获取 Gemini API Key

1. 访问：https://aistudio.google.com/app/apikey
2. 登录你的 Google 账号
3. 点击 "Create API key"（创建 API 密钥）
4. 选择项目（或创建新项目）
5. 复制生成的 API key
6. 添加到 `.env.local` 文件中

### Step 3: 重启开发服务器

**重要：修改 `.env.local` 后必须重启服务器！**

```bash
# 1. 停止当前服务器（Ctrl + C）

# 2. 重新启动
npm run dev
```

### Step 4: 测试功能

1. 访问：`http://localhost:3000`
2. 点击底部导航的 "💬 AI 教練"
3. 发送测试消息：
   - "你好"
   - "我可以食珍珠奶茶嗎？"
   - "而家可以食咩？"

## 🔍 关键差异说明

### API 格式差异

| 项目 | Anthropic Claude | Google Gemini |
|------|-----------------|---------------|
| 角色名称 | `assistant` | `model` |
| 系统提示 | `system` | `systemInstruction` |
| 消息格式 | `{role, content}` | `{role, parts: [{text: "..."}]}` |
| 模型名称 | `claude-sonnet-4-20250514` | `gemini-2.0-flash-exp` |

### 代码变更

**之前 (Claude):**
```typescript
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  system: systemPrompt,
  messages: [...]
})
```

**现在 (Gemini):**
```typescript
const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash-exp',
  systemInstruction: systemInstruction,
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 500,
  }
})

const chat = model.startChat({ history: history })
const result = await chat.sendMessage(message)
```

## 📋 检查清单

- [ ] 已安装 `@google/generative-ai` 包
- [ ] 已在 `.env.local` 添加 `GEMINI_API_KEY`
- [ ] 已删除或注释掉 `ANTHROPIC_API_KEY`
- [ ] 已重启开发服务器（`npm run dev`）
- [ ] 已测试 AI 教练功能
- [ ] 消息发送成功
- [ ] 收到 AI 回复

## 🐛 故障排除

### 错误：API key not configured
- ✅ 检查 `.env.local` 中是否有 `GEMINI_API_KEY`
- ✅ 确认 API key 格式正确（无引号、无空格）
- ✅ 重启开发服务器

### 错误：Invalid API key
- ✅ 检查 API key 是否正确
- ✅ 前往 https://aistudio.google.com/app/apikey 验证 key 状态
- ✅ 确认 key 未被禁用

### 错误：API quota exceeded
- ✅ 免费 tier 有使用限制
- ✅ 等待一段时间后重试
- ✅ 考虑升级到付费计划

### 错误：Content blocked by safety filters
- ✅ Gemini 的安全过滤器可能阻止某些内容
- ✅ 尝试重新表述你的问题
- ✅ 这是正常的保护机制

## 📚 资源链接

- **Gemini API 文档**: https://ai.google.dev/docs
- **API Key 管理**: https://aistudio.google.com/app/apikey
- **模型列表**: https://ai.google.dev/models/gemini
- **免费额度**: https://ai.google.dev/pricing

## 💡 提示

1. **免费使用**: `gemini-2.0-flash-exp` 是免费模型，适合开发测试
2. **生产环境**: 可考虑升级到 `gemini-2.0-flash` 或 `gemini-pro`
3. **速率限制**: 免费 tier 有请求速率限制，注意控制请求频率
4. **安全性**: API key 不要提交到 git（`.env.local` 已在 `.gitignore` 中）

## ✅ 迁移完成

完成以上步骤后，AI 教练功能应该可以正常使用 Gemini API 了！

如有问题，请查看：
- 服务器终端日志
- 浏览器控制台（F12）
- 错误信息详情
