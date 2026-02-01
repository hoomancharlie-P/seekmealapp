# 重启开发服务器指南

## 为什么需要重启？

修改 `.env.local` 文件后，Next.js 开发服务器需要重启才能读取新的环境变量。

## 重启步骤

### 方法 1: 标准重启（推荐）

1. **停止当前服务器**
   - 在运行 `npm run dev` 的终端窗口中
   - 按 `Ctrl + C`（Mac/Linux）或 `Ctrl + C`（Windows）
   - 等待服务器完全停止

2. **重新启动服务器**
   ```bash
   npm run dev
   ```

3. **验证环境变量已加载**
   - 查看终端输出，应该没有环境变量相关的错误
   - 访问应用测试功能

### 方法 2: 快速重启（如果方法 1 不行）

1. **完全停止服务器**
   ```bash
   # 按 Ctrl + C 停止服务器
   # 如果还在运行，强制停止：
   # Mac/Linux:
   pkill -f "next dev"
   # 或找到进程 ID 后：
   # kill <PID>
   ```

2. **清除 Next.js 缓存（可选但推荐）**
   ```bash
   rm -rf .next
   ```

3. **重新启动**
   ```bash
   npm run dev
   ```

## 验证环境变量是否生效

### 方法 1: 查看服务器启动日志

启动服务器时，检查是否有错误信息：
- ❌ 如果有 `ANTHROPIC_API_KEY is not set` → 环境变量未加载
- ✅ 如果没有相关错误 → 环境变量已加载

### 方法 2: 通过 API 测试

1. 访问 `http://localhost:3000/coach`
2. 发送一条测试消息
3. 查看：
   - **浏览器控制台**（F12 → Console）
   - **服务器终端**（应该看到 "Calling Claude API..." 日志）

### 方法 3: 添加临时调试代码

在 `app/api/coach/chat/route.ts` 中添加（仅用于调试）：

```typescript
console.log('Environment check:', {
  hasApiKey: !!process.env.ANTHROPIC_API_KEY,
  keyLength: process.env.ANTHROPIC_API_KEY?.length || 0
})
```

然后重启服务器，发送消息，查看终端输出。

## 常见问题

### Q: 修改了 `.env.local` 但服务器还在运行，需要重启吗？
**A:** 是的，必须重启！Next.js 只在启动时读取环境变量。

### Q: 重启后还是不行？
**A:** 尝试以下步骤：
1. 完全停止服务器（`Ctrl + C`）
2. 清除缓存：`rm -rf .next`
3. 确认 `.env.local` 格式正确（无引号、无注释符号）
4. 重新启动：`npm run dev`

### Q: 如何确认 `.env.local` 格式正确？
**A:** 检查以下几点：
- ✅ 文件在项目根目录
- ✅ 格式：`ANTHROPIC_API_KEY=sk-ant-...`（无引号）
- ✅ 没有 `#` 注释符号在行首
- ✅ `=` 前后无多余空格（可选，但建议没有）

### Q: 服务器启动后立即停止？
**A:** 可能是：
- `.env.local` 格式错误
- 语法错误导致无法解析
- 检查终端错误信息

## 完整重启流程示例

```bash
# 1. 停止服务器（在运行 npm run dev 的终端按 Ctrl+C）

# 2. （可选）清除缓存
rm -rf .next

# 3. 重新启动
npm run dev

# 4. 等待看到：
# ✓ Ready in X seconds
# ○ Compiling / ...
# ✓ Compiled / ... in X ms

# 5. 测试功能
# 访问 http://localhost:3000/coach
```

## 快速检查清单

- [ ] 已停止当前开发服务器（`Ctrl + C`）
- [ ] `.env.local` 文件格式正确
- [ ] 已清除 `.next` 缓存（可选但推荐）
- [ ] 已重新启动服务器（`npm run dev`）
- [ ] 服务器启动成功（无错误）
- [ ] 已测试功能（访问 `/coach` 页面）

## 提示

💡 **最佳实践：**
- 每次修改 `.env.local` 后都重启服务器
- 使用版本控制时，不要提交 `.env.local`（已在 `.gitignore` 中）
- 保持 `.env.local` 格式简洁，避免不必要的空格和注释
