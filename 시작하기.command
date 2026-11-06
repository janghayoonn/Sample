#!/bin/zsh
# 더블클릭하면 프로젝트 북 아카이브를 켭니다.
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "처음 실행이라 필요한 부품을 설치합니다..."
  npm install
fi
( sleep 1.5; open "http://localhost:3000/edit" ) &
npm start
