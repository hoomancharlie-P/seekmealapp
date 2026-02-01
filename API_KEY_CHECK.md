# API Key 配置检查指南

## ✅ 检查清单

### 1. 确认 `.env.local` 文件存在
```bash
# 在项目根目录下
ls -la .env.local
```

### 2. 确认 API Key 格式正确

`.env.local` 文件应该包含：

```env
ANTHROPIC_API_KEY=sk-ant-api03-your_actual_key_here
```

**重要提示：**
- ✅ 不要有引号（不需要 `"` 或 `'`）
- ✅ 不要有空格（`=` 前后可以有空格，但建议没有）
- ✅ 不要有注释符号（`#` 会注释掉整行）
- ✅ 确保 key 以 `sk-ant-` 开头

### 3. 正确格式示例

✅ **正确：**
```env
ANTHROPIC_API_KEY=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
```

❌ **错误示例：**
```env
# 有引号
ANTHROPIC_API_KEY="sk-ant-api03-..."

# 有注释符号
# ANTHROPIC_API_KEY=sk-ant-api03-...

# 有空格
ANTHROPIC_API_KEY = sk-ant-api03-...

# 使用占位符
ANTHROPIC_API_KEY=your_key_here
```

### 4. 重启开发服务器

**重要：** 修改 `.env.local` 后，必须重启开发服务器才能生效！

```bash
# 停止当前服务器（Ctrl+C）
# 然后重新启动
npm run dev
```

### 5. 测试 API Key

访问 AI 教练页面：
1. 打开浏览器：`http://localhost:3000`
2. 点击底部导航的 "💬 AI 教練" 按钮
3. 发送一条消息测试

### 6. 如果遇到错误

#### 错误：`API key not configured`
- 检查 `.env.local` 文件是否存在
- 检查 `ANTHROPIC_API_KEY` 是否正确设置
- **重启开发服务器**

#### 错误：`Failed to get response`
- 检查 API key 是否有效
- 检查网络连接
- 查看浏览器控制台（F12）的详细错误信息

#### 错误：`401 Unauthorized` 或 `Invalid API Key`
- API key 可能已过期或无效
- 前往 [Anthropic Console](https://console.anthropic.com/) 检查 API key 状态
- 生成新的 API key 并更新 `.env.local`

### 7. 验证 API Key 是否被读取

在开发服务器启动时，检查控制台是否有错误信息。如果 API key 配置正确，应该不会有相关错误。

## 🔍 调试步骤

1. **检查文件位置**
   ```bash
   # 确保在项目根目录
   pwd
   # 应该显示：/Users/charliechan/Desktop/Personal/Projects/seekmeal
   ```

2. **检查文件内容格式**
   ```bash
   # 查看文件（注意：不要泄露你的 API key）
   cat .env.local | grep ANTHROPIC
   ```

3. **检查 Next.js 是否读取环境变量**
   - 在 `app/api/coach/chat/route.ts` 中添加临时日志（仅用于调试）：
   ```typescript
   console.log('API Key exists:', !!process.env.ANTHROPIC_API_KEY)
   console.log('API Key length:', process.env.ANTHROPIC_API_KEY?.length)
   ```
   - 然后访问 `/api/coach/chat` 端点，查看服务器控制台输出

4. **清除缓存并重启**
   ```bash
   # 清除 Next.js 缓存
   rm -rf .next
   # 重启服务器
   npm run dev
   ```

## 📝 快速检查命令

```bash
# 1. 检查文件是否存在
test -f .env.local && echo "✓ .env.local 存在" || echo "✗ .env.local 不存在"

# 2. 检查是否包含 ANTHROPIC_API_KEY（不显示内容）
grep -q "ANTHROPIC_API_KEY" .env.local && echo "✓ 找到 ANTHROPIC_API_KEY" || echo "✗ 未找到"

# 3. 检查格式（只显示前20个字符）
grep "ANTHROPIC_API_KEY" .env.local | head -c 30
```

## 🆘 需要帮助？

如果以上步骤都无法解决问题，请：
1. 检查浏览器控制台（F12）的错误信息
2. 检查服务器控制台的错误信息
3. 确认 API key 在 Anthropic Console 中是有效的
