# 彩序迷宮 · NNECOO

純 HTML、CSS、JavaScript 的瀏覽器迷宮 Demo。把整個資料夾部署到 GitHub Pages 即可遊玩，無需建置或後端。本機預覽請使用靜態 HTTP 伺服器。

A browser-based maze puzzle about following a color sequence, managing limited vision and memory, collecting NNE/COO upgrades, and revealing a hidden image.

## 操作

- 電腦：方向鍵或 WASD。每次按鍵移動一格；長按不會連走。
- 手機：畫面上的四個方向按鈕，按一下走一格。
- Debug：右下角 `DEBUG OFF` 按鈕、`?` 或反引號鍵。

## 關卡調整

在 `js/levels.js` 調整 `SIZE_TIERS` 與五組 `TIER_DIFFICULTY`，系統會為每個 Size Tier 產生 20 個固定 seed 的 Stage（共 100 關）。前五種尺寸沿用原 LV1～LV5：11×11、13×13、15×15、17×17、17×17。每個 Stage 各自建立背景設定，並以實際迷宮最短路徑驗證兩顆紫色到出口的 finishing walk 距離。`validateAllStages({ log: true })` 可批次列印 100 關的 Solver 驗證結果與解答步數。

正常 Stage 初始 VISION 為 2、MEM Level 為 3；`itemEffects` 設定 NNE 的視野增幅（目前 +1）與 COO 的 MEM 增幅（目前 +2），強化上限會依道具數量預留足夠容量。`GAME_CONFIG.memoryStepMultiplier` 設定每級 MEM 對應的實際記憶步數倍率（目前 4）；路線記憶與 Color Memory 都使用 MEM Level × 此倍率。Stage 設定也包含 NNE/COO 數量、複雜度、彩序與數量、出生點、出口距離與背景。

`branchDensity` 控制額外打通牆壁的機率；每個被打通的牆都連接至少兩段既有道路，增加迴路與岔路。`minimumJunctions` 設定生成版圖必須具備的岔路下限。`mazeComplexity` 與目標間的最短路徑距離設定用於調整彩色目標的分布。迷宮先以深度優先搜尋建立連通道路，因此所有地標和出口都可到達。
顏色位置另經順序路徑檢查，保證能在不提前踩到後續顏色的情況下完成。設定 `randomMaze: false` 時可加入 `layout` 字串陣列（`#` 牆、`.` 道路）改用固定地圖；道路須互相連通。

`visionRange` 是玩家上下左右四條主視線的最遠格數；每條視線會顯示第一面牆並立即停止。主線上距離玩家 `d` 的格子若 `visionRange - d >= 1`，會依主線方向額外顯示左右各 1 格。側邊格不會再次延伸視野，斜角格也不會由側邊視野繼續擴散。NNE 會讓主視線和可產生側邊視野的主線格各增加一格。

每個關卡都在自己的 `background` 設定中指定底圖、一般／完成時透明度、切片列數與欄數，以及 `revealOrder`。目前底圖分成 3×4 共 12 片；每成功完成一個彩色目標便依序揭開一片。完成 12 個目標後進入全視野、隱藏記憶標記並提高底圖透明度。若底圖檔案不存在或載入失敗，遊戲會繼續以純迷宮畫面遊玩；Debug Mode 會列出載入警告。

`movementHistory` 每次成功移動便新增目的地座標，重複座標也會保留。HUD 的 MEM 是能力等級，不是步數；目前 MEM 3 對應 12 步，MEM 5 對應 20 步。實際步數同時控制路線白點／牆壁紅叉與 Color Memory。NNE 每顆增加 1 格直線視距，COO 每顆增加 2 MEM；取得 COO 後仍在新記憶範圍內的位置會立即加入記憶標記。

Debug 開啟時會展開全地圖，以不同樣式標出 `mainVisionCells`、`sideVisionCells` 和記憶標記，並列出玩家座標、VISION RANGE、NNE／COO 位置、完整 `movementHistory` 和目前使用的最近位置。

所有程式以 ES modules 分檔，若瀏覽器的本機檔案政策不允許 `file://` 載入模組，可用任意靜態伺服器預覽，GitHub Pages 可直接運行。
