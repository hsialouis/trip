#!/bin/sh
# 每次更新網站後執行：替所有 JS 引用加上新版本號，避免瀏覽器用到舊快取
V=$(date +%Y%m%d%H%M)
sed -i -E "s/(src=\"app\.js)(\?v=[0-9]+)?\"/\1?v=$V\"/" index.html
sed -i -E "s#(\"\./(store|map|demo|ai|config)\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g" app.js store.js map.js ai.js
echo "version $V"
