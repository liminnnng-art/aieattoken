# Aieattoken

## 專案架構
- ts/src/ — 核心 TypeScript 代碼
- 每個語言：reverse.{lang}.ts(源碼→IR)、transformer.{lang}.ts、emitter.{lang}.ts、parser.{lang}.ts(AET→IR)
- cli.ts — CLI 入口，支援 .go/.java/.py/.ts/.tsx
- ir.ts — 共用 IR 節點(Go_*、Java_*、Py_*、Ts_* prefixed)

## 支援語言
- Go (.go → .aet)：40.9% 壓縮
- Java (.java → .aetj)：31.8%，boilerplate 44-56%
- Python (.py → .aetp)：39.0%（目標 40%；實測天花板約 40-42%）
- TypeScript (.ts → .aets, .tsx → .aetx)：35.2%

## 規則
- 每個 stdlib alias 必須是 cl100k_base 單一 token
- 改動後跑全部語言測試確認沒退化
- commit 前 npx tsc 確認 build 沒 error
- round-trip 測試：源碼 → AET → 源碼，比對一致性
- 不要用 aieattoken 自身源碼做測試

## 代碼品質要求
- 所有新代碼必須有明確的 TypeScript 類型，不用 any
- 函數要有 JSDoc 註解說明用途和參數
- 錯誤處理要具體，不要 catch 後忽略
- 變數命名要有意義，不要單字母(迴圈 i/j 除外)

## 測試要求
- 每個新功能必須有對應測試
- 修 bug 前先寫能重現 bug 的測試
- 跑測試指令：node ts/test-typescript.mjs(TS)、類似指令 Go/Java/Python

## Git 規範
- commit message 格式：feat/fix/docs(scope): description
- 每個功能點一個 commit，不要把多個改動混在一起

## 優化時的流程
- 每次只改一個壓縮策略
- 改完立刻跑全部測試
- 記錄 before/after 數據
- 任何測試退化就回退

## 授權
- AGPL-3.0-only
- npm: aieattoken
- GitHub: liminnnng-art/aieattoken
