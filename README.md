# 彩序迷宮 · NNECOO

純 HTML、CSS、JavaScript 的瀏覽器迷宮 Demo。把整個資料夾部署到 GitHub Pages 即可遊玩，無需建置或後端。本機預覽請使用靜態 HTTP 伺服器。

## 操作

- 電腦：方向鍵或 WASD。每次按鍵移動一格；長按不會連走。
- 手機：畫面上的四個方向按鈕，按一下走一格。
- Debug：右下角 `DEBUG OFF` 按鈕、`?` 或反引號鍵。

## 關卡調整

在 `js/levels.js` 修改 `LEVELS`。正常關卡初始 VISION 為 2、MEM Level 為 3；`itemEffects` 設定 NNE 的視野增幅（目前 +1）與 COO 的 MEM 增幅（目前 +2），強化上限會依道具數量預留足夠容量。`GAME_CONFIG.memoryStepMultiplier` 設定每級 MEM 對應的實際記憶步數倍率（目前 4）；路線記憶與 Color Memory 都使用 MEM Level × 此倍率。關卡也包含迷宮尺寸、NNE/COO 數量、複雜度、彩序與數量、錯誤懲罰、迷宮產生方式、出生點與出口策略。新增關卡時，複製一筆設定並給予不同 `id`、`name`。

`mazeComplexity` 越高，額外打通的牆越少，岔路和回頭路越多。迷宮由深度優先搜尋建立連通道路，故所有地標和出口都可到達。
顏色位置另經順序路徑檢查，保證能在不提前踩到後續顏色的情況下完成。設定 `randomMaze: false` 時可加入 `layout` 字串陣列（`#` 牆、`.` 道路）改用固定地圖；道路須互相連通。

`visionRange` 是玩家上下左右四條主視線的最遠格數；每條視線會顯示第一面牆並立即停止。主線上距離玩家 `d` 的格子若 `visionRange - d >= 1`，會依主線方向額外顯示左右各 1 格。側邊格不會再次延伸視野，斜角格也不會由側邊視野繼續擴散。NNE 會讓主視線和可產生側邊視野的主線格各增加一格。

每個關卡都在自己的 `background` 設定中指定底圖、一般／完成時透明度、切片列數與欄數，以及 `revealOrder`。目前底圖分成 3×4 共 12 片；每成功完成一個彩色目標便依序揭開一片。完成 12 個目標後進入全視野、隱藏記憶標記並提高底圖透明度。若底圖檔案不存在或載入失敗，遊戲會繼續以純迷宮畫面遊玩；Debug Mode 會列出載入警告。

`movementHistory` 每次成功移動便新增目的地座標，重複座標也會保留。HUD 的 MEM 是能力等級，不是步數；目前 MEM 3 對應 12 步，MEM 5 對應 20 步。實際步數同時控制路線白點／牆壁紅叉與 Color Memory。NNE 每顆增加 1 格直線視距，COO 每顆增加 2 MEM；取得 COO 後仍在新記憶範圍內的位置會立即加入記憶標記。

Debug 開啟時會展開全地圖，以不同樣式標出 `mainVisionCells`、`sideVisionCells` 和記憶標記，並列出玩家座標、VISION RANGE、NNE／COO 位置、完整 `movementHistory` 和目前使用的最近位置。

所有程式以 ES modules 分檔，若瀏覽器的本機檔案政策不允許 `file://` 載入模組，可用任意靜態伺服器預覽，GitHub Pages 可直接運行。
