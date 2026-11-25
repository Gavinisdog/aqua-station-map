# 水利署河川水位測站地圖

Vue 3 + Leaflet 地圖，顯示經濟部水利署（WRA）河川水位測站的即時水位與警戒狀態；點選測站可查看水位時序圖與警戒線（ECharts）。純前端，無自架後端。

## 資料來源

經濟部水利署 opendata（`https://opendata.wra.gov.tw/api/v2/`），無需 API key：

| 資料 | 資料集 ID | 取得方式 |
| --- | --- | --- |
| 測站基本資料 | `c4acc691-7416-40ca-9464-292c0c00da92` | 建置時（`prebuild`）轉換 TWD97 TM2 → WGS84，輸出 `public/stations.geojson`；若建置時連不上 WRA，保留已提交的檔案 |
| 即時水位 | `73c4c3de-4045-4765-abeb-89f9f9cd5ff0` | 瀏覽器直接呼叫（CORS `*`） |

### 已知特性

- WRA 的機器人防護會擋掉過短的 User-Agent（如 `Mozilla/5.0`），建置腳本使用完整瀏覽器 UA。

## 行為摘要

- 狀態顏色：一級（紅，水位 ≥ 一級警戒）、二／三級（黃）、正常（綠）；無警戒值、資料過舊（> 3 小時）、無資料為灰色變體。
- 每 10 分鐘輪詢即時水位；分頁隱藏時暫停，返回時立即重抓。
- 競態處理：Axios interceptor + abortManager（`cancelPrevious` 取消同一請求的舊請求、轉送呼叫端 `signal`）搭配輪詢端的 latest-request guard（`createLatestRequestGuard`）。
- 地圖存放於 `shallowRef`，卸載時 `map.remove()`。

## 開發

需要 Node 22（`nvm use`，版本見 `.nvmrc`）與 pnpm（版本由 `packageManager` 欄位指定）。

```bash
nvm use
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm preview    # 預覽正式版
```

## 部署

Vercel 透過 `package.json` 的 `engines.node`（`22.x`）使用 Node 22（不讀 `.nvmrc`）。建置時 `public/stations.geojson` 為抓取失敗時的後備，必須已提交到版本庫。`vercel.json` 與 `netlify.toml` 皆已設定：build `pnpm run build`、輸出 `dist`。

```bash
npx vercel --prod
# 或
npx netlify deploy --build --prod
```

或使用 git 連動的 Vercel／Netlify 專案，push 後自動部署。

## 已知限制

- 水位歷史僅從開啟頁面後累積（API 只提供最新值）。
- 地圖標記無法以鍵盤聚焦。
- 首屏 JS 約 330 kB（gzip 約 113 kB）；圖表另成約 531 kB（gzip 約 176 kB）的 chunk，閒置時預先載入（ECharts）。
