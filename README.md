# 寶可夢健檢中心 V6.1

適用於 Pokémon HeartGold / SoulSilver `.sav` / `.dsv`。

## V6 變更

- 頁面標題固定顯示版本號：`寶可夢健檢中心 V6`。
- 不再對每隻 Pokémon 分別呼叫 PokeAPI。
- 固定種族資料改為一次載入靜態資料，並有 Raw GitHub、jsDelivr、PokeAPI 三層備援。
- 固定資料成功後只快取本存檔實際使用到的 Pokémon，之後同裝置再次開啟更快。
- 內建 HGSS / Gen IV 所需的後世代種族值回溯修正，例如 Noctowl 特攻使用 Gen IV 的 76。
- 等級改由 EXP + 成長曲線公式直接計算，不再另外下載 growth-rate 等級表。
- 隊伍 Pokémon 的「性格影響」即使外部固定資料全部失敗，也會利用存檔中的實際能力值 + IV/EV/等級反推，不再顯示固定資料無法取得。
- 保留目前數值、個體質、努力值、性格影響，以及綠色增加／紅色扣除的性格條。

GitHub Pages 請將 `index.html`、`app.js`、`styles.css` 放在 repository 根目錄。

## V6.1 修正

- 修正隊伍可能顯示 7 隻的問題：不再同時解析目前存檔與備份存檔。
- 依 Gen IV 存檔 footer 的 major/minor counter，自動選擇最新 General block（隊伍）與 Storage block（盒子）。
- 舊備份分區內的過期隊伍資料不會再被當成目前隊伍顯示。
