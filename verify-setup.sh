#!/bin/bash
# SeekMeal App - 驗證複製與清理是否成功

set -e
cd "$(dirname "$0")"

PASS="✅"
FAIL="❌"
OK=0

check() {
  if [ "$1" = "0" ]; then
    echo "$2 $PASS"
    return 0
  else
    echo "$2 $FAIL"
    return 1
  fi
}

echo "驗證專案設定..."
echo ""

# 1. package.json 名稱
NAME=$(node -e "try { console.log(require('./package.json').name); } catch(e) { console.log(''); }" 2>/dev/null || echo "")
if [ "$NAME" = "seekmeal-app" ]; then
  check 0 "檢查 package.json 名稱..."
else
  check 1 "檢查 package.json 名稱..."
fi
[ "$NAME" != "seekmeal-app" ] && exit 1

# 2. node_modules 已刪除
if [ ! -d "node_modules" ]; then
  check 0 "檢查 node_modules 已刪除..."
else
  check 1 "檢查 node_modules 已刪除..."
  exit 1
fi

# 3. .next 已刪除
if [ ! -d ".next" ]; then
  check 0 "檢查 .next 已刪除..."
else
  check 1 "檢查 .next 已刪除..."
  exit 1
fi

# 4. 源代碼目錄存在
MISSING=""
[ ! -d "app" ]        && MISSING="${MISSING} app/"
[ ! -d "components" ] && MISSING="${MISSING} components/"
[ ! -d "lib" ]        && MISSING="${MISSING} lib/"
[ ! -d "types" ]      && MISSING="${MISSING} types/"
[ ! -d "public" ]     && MISSING="${MISSING} public/"
if [ -z "$MISSING" ]; then
  check 0 "檢查源代碼目錄..."
else
  echo "檢查源代碼目錄... $FAIL (缺少: $MISSING)"
  exit 1
fi

# 5. .env.local 存在
if [ -f ".env.local" ]; then
  check 0 "檢查環境變量文件..."
else
  check 1 "檢查環境變量文件..."
  echo "  (若尚未建立 .env.local，可從 .env.example 複製並填寫)"
fi

echo ""
echo "$PASS 專案複製成功！可以開始轉換。"
