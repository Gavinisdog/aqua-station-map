# 水利署河川水位測站地圖

Vue 3 + Leaflet 地圖，顯示經濟部水利署（WRA）河川水位測站的即時水位與警戒狀態；點選測站可查看水位與雨量走勢圖（ECharts）。純前端，無自架後端。

## 資料來源

經濟部水利署 opendata（`https://opendata.wra.gov.tw/api/v2/`），無需 API key：

| 資料 | 資料集 ID | 取得方式 |
| --- | --- | --- |
| 測站基本資料 | `c4acc691-7416-40ca-9464-292c0c00da92` | 建置時（`prebuild`）轉換 TWD97 TM2 → WGS84，輸出 `public/stations.geojson`；若建置時連不上 WRA，保留已提交的檔案 |
| 即時水位 | `73c4c3de-4045-4765-abeb-89f9f9cd5ff0` | 瀏覽器直接呼叫（CORS `*`） |
| 雨量（上游） | `a3c4b6e0-7a21-4d8f-9c3b-2e5f6a1b8c77` | 無 CORS，透過平台 rewrite `/wra-rain` 代理 |

### 已知特性

- WRA 的機器人防護會擋掉過短的 User-Agent（如 `Mozilla/5.0`），建置腳本使用完整瀏覽器 UA。
- 雨量 JSON 標示為 UTF-8，實際為 Big5 編碼，前端以 Big5 解碼。

## 行為摘要

- 狀態顏色：一級（紅，水位 ≥ 一級警戒）、二／三級（黃）、正常（綠）；無警戒值、資料過舊（> 3 小時）、無資料為灰色變體。
- 每 10 分鐘輪詢即時水位；分頁隱藏時暫停，返回時立即重抓。
- 競態處理：Axios interceptor + abortManager（`cancelPrevious` 取消同一請求的舊請求、轉送呼叫端 `signal`）搭配輪詢端的 latest-request guard（`createLatestRequestGuard`）；雨量資料集下載以 refcount 共用。
- 地圖存放於 `shallowRef`，卸載時 `map.remove()`。

## 雨量功能開關

`VITE_FEATURE_RAIN`（建置時變數；僅字串 `"false"` 會停用，預設啟用）。

執行期降級：雨量取得失敗時，圖表只顯示水位與警戒線，並標示「雨量資料暫不可用」。

停用方式：在 Vercel（Project Settings → Environment Variables）或 Netlify（Site configuration → Environment variables）新增 `VITE_FEATURE_RAIN=false`，然後重新部署。

## 開發

需要 Node 22（`nvm use`，版本見 `.nvmrc`）與 pnpm（版本由 `packageManager` 欄位指定）。

```bash
nvm use
pnpm install
pnpm dev        # Vite proxy 提供 /wra-rain
pnpm test
pnpm build
pnpm preview    # 預覽正式版；沿用 vite.config.ts 的 /wra-rain proxy
```

## 部署

Vercel 透過 `package.json` 的 `engines.node`（`22.x`）使用 Node 22（不讀 `.nvmrc`）。建置時 `public/stations.geojson` 為抓取失敗時的後備，必須已提交到版本庫。`vercel.json` 與 `netlify.toml` 皆已設定：build `pnpm run build`、輸出 `dist`，並將 `/wra-rain` 轉送至 WRA 雨量 API。

```bash
npx vercel --prod
# 或
npx netlify deploy --build --prod   # --build 讓 VITE_FEATURE_RAIN 在建置時生效
```

或使用 git 連動的 Netlify site（於 site 設定環境變數）。

部署後檢查（確認 Netlify 轉送有保留 query string）：

```bash
curl -s https://<site>/wra-rain | head -c 200   # 應為以 {"version" 開頭的 JSON
```

首次部署後請確認 `/wra-rain` 回傳 JSON；若海外 edge 被 WRA 擋下，設定 `VITE_FEATURE_RAIN=false` 後重新部署。

## 已知限制

- 水位歷史僅從開啟頁面後累積（API 只提供最新值）。
- 地圖標記無法以鍵盤聚焦。
- Bundle 約 877 kB（gzip 約 292 kB）（ECharts + Leaflet）。
