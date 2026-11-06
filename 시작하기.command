#!/bin/zsh
# 더블클릭하면 멜로디 스케치를 켭니다. 끄려면 이 창을 닫으세요.
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "처음 실행이라 필요한 부품을 설치합니다..."
  npm install
fi
URL="http://localhost:5180"
( sleep 2; open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL" ) &
echo ""
echo "멜로디 스케치가 켜졌어요 → $URL"
echo "다 쓰면 이 창을 닫으면 꺼집니다."
echo ""
npm run dev
