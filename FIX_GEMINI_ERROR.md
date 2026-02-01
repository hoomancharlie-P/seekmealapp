# 修复 Gemini 模块未找到错误

## 错误信息

```
Module not found: Can't resolve '@google/generative-ai'
```

## 原因

代码已更新为使用 Google Gemini API，但 `@google/generative-ai` 包还没有安装。

## 解决方案

### 方法 1: 安装 Gemini SDK（推荐）

在项目根目录的终端中运行：

```bash
npm install @google/generative-ai
```

### 方法 2: 如果方法 1 失败（权限问题）

如果遇到权限错误，尝试：

```bash
# 清除 npm 缓存
npm cache clean --force

# 重新安装
npm install @google/generative-ai
```

或者：

```bash
# 使用 sudo（Mac/Linux，不推荐）
sudo npm install @google/generative-ai
```

### 方法 3: 检查安装是否成功

安装完成后，检查 `package.json` 应该包含：

```json
"dependencies": {
  "@google/generative-ai": "^0.x.x",
  ...
}
```

### 方法 4: 重启开发服务器

**重要：安装包后必须重启服务器！**

```bash
# 1. 停止服务器（Ctrl + C）
# 2. 重新启动
npm run dev
```

## 验证

安装成功后：

1. 检查 `package.json` 中是否有 `@google/generative-ai`
2. 检查 `node_modules/@google/generative-ai` 文件夹是否存在
3. 重启服务器后，错误应该消失

## 如果仍然失败

如果安装仍然失败，可以：

1. 检查网络连接
2. 尝试使用不同的网络
3. 检查 npm 配置：`npm config list`
4. 尝试使用 yarn：`yarn add @google/generative-ai`
