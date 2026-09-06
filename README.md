# 部活運営アプリ — 実装ベータ 0.9

**[ブラウザーで操作版を開く](https://manatocookietwitter-lang.github.io/club-operations/)**

公開中の操作版はサンプルデータ・端末内保存です。LINEログインと複数人でのデータ共有は含みません。

共有版は [Renderで公開設定を開く](https://render.com/deploy?repo=https://github.com/manatocookietwitter-lang/club-operations) から設定できます。永続ディスクを利用する有料構成です。料金を確認してから作成してください。LINEは初期状態では無効で、公開後にチャネル設定が必要です。

## GitHub版の接続準備（2026-09-06）

LINE認証の設定検証、IP単位の認可開始制限（10分に30回）、設定確認コマンド、Dockerfile、GitHub ActionsのAPI・計算テストを追加しました。LINEを有効にした状態で設定が不正な場合は起動を停止します。認可コードや招待リンクをアクセスログへ残さないよう、標準起動のアクセスログを無効にしています。

実チャネル・公開先は未設定で、実LINE認証の接続完了を意味しません。公開設定は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)、今回の検証記録は [docs/CONNECTION_STATUS.md](docs/CONNECTION_STATUS.md) を参照してください。`QA_REPORT.md`、`qa/`、`docs/FILE_HASHES.json` は提供ZIP時点の記録です。

運営メンバー向けの予定・やること・出欠・配車・練習メニュー・備品をまとめたPWAです。
**このZIPはソースとローカル起動用一式です。インターネットへの公開は行っていません。**

## v0.9で変えたところ

ログイン／グループ選択／アカウントを5タブの前に分離しました。単一HTMLは「デモを試す」→「グループを選ぶ」から始まります。実際のLINEログインや招待をデモで偽装しません。

配車は「往復同じ／行き・帰り別」を常時表示。往復統合時はどちらの配置を使うか確認します。「過去の配車を使う」はコピー元選択→差分確認→適用の順です。「配車表・画像」と「予定表を画像にする」から、プレビュー→画像保存／共有へ進めます。幹部予定の重ね表示は維持しました。

運営メンバーは招待リンクで本人が参加し、オーナーが機能別の編集権限を設定します。部員名簿に追加する操作とは別です。

LINE認証のサーバー経路は用意しましたが、接続設定は無効のままです。**Codexは最初に `docs/CODEX_HANDOFF_v0.9.md` を読み、チャネル・公開URL・秘密設定を実環境で行ってください。** 既存アカウントはアカウント画面からLINEを明示的に連携できます。

## 最初に見るもの

- `club-demo.html`：サンプルデータで操作する、単一HTML。共有ログインはありません。
- `web/`＋`server/`：ログイン・グループ・共有DB・権限を持つサーバー版。
- `QA_REPORT.md`：実行したテストと、この環境で確認できなかったこと。
- `docs/SOURCE_AUDIT.md`：取得できた旧練習HTML、Site/GitHubの取得状況。
- `docs/IMPLEMENTATION_STATUS.md`：実装範囲と未完了部分。

前回の「仕様書を他モデルへ渡す」一式ではありません。画面と処理を実装しています。
練習メニューは公開GitHub `manatocookietwitter-lang/training-menu-app` の `main`（確認時HEAD `53d7258`）と再照合し、`b9466eb` の3段階フロー、`セットあり/1回のみ`、分類・履歴編集モード、削除Undo、画像保存時の履歴追加まで統合しました。予定Siteは公開URLを特定済みですが、この実行環境からSiteの現在ソースを直接取得できないため、コード単位の完全差分は未完了です。

## Windowsで起動

Python 3.11以降を用意し、このZIPを展開してください。`start.bat`を実行するか、展開したフォルダーで次を実行します。

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m server.app
```

ブラウザーで `http://127.0.0.1:8765` を開き、「メールでログイン・既存アカウント」を展開→「新規登録」→「グループを作る」と進みます。LINE設定完了後はLINEからも開始できます。
最初は部員・体育館・予定が空です。グループを作成した人がそのグループのオーナーになります。

Linux/macOSでは以下です。

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m server.app
```

Windows実機での実行は未検証です。コンテナ内のPython 3.13でサーバー処理を検証しました。

## 最短の使い方

1. 設定 → 部員：名前、学年、幹部上/幹部以下、大学配車/駅配車を登録。
2. 運営 → 体育館：名前・面数・メモを登録。料金はありません。
3. 予定：部活予定を登録。日付・曜日指定での複数登録も可能。
4. 運営 → 出欠：参加/不参加を切り替え。日程と部員の両方向に対応。
5. 運営 → 配車 → ＋：部活予定を選択。右の人を左へ配置。
6. 運営 → 練習メニュー：メニュー表作成／メニュー一覧／分類一覧／練習メニュー履歴から操作。画像出力後は履歴にも保存できます。

配車では、＋車へ人を置くと運転者になります。先に運転者を一括指定する画面はありません。
運転者の枠と同乗者の枠は別です。同乗者を最初に置いても、勝手に運転者へ昇格しません。
運転者込み4人までです。スマートフォンでは名前の右のハンドルでドラッグできます。
名前→移動先のタップ操作も使えます。

## 共有

共有版のデータは `data/club.sqlite3` に保存されます。端末のlocalStorageは正本ではありません。
オーナーが設定→運営メンバー→運営メンバーを招待からリンクを発行できます。招待は7日間有効・1人1回限りです。参加先確認→ログイン→明示的な参加の順で進み、参加直後は機能の編集権限なし（担当タスクの完了は従来どおり可能）。発行済みリンクの無効化も可能です。
部員名簿とログイン用の運営メンバーは別データです。

同時編集はバージョンを照合します。衝突時は勝手に上書きせず、未保存データを書き出せます。
画面が操作待ちのときは30秒ごと・アプリ復帰時に他の更新を確認します。入力中やドラッグ中は差し替えません。

`127.0.0.1` は起動したPC自身です。この設定のまま別のスマートフォンからは利用できません。
複数端末で利用するには、HTTPSでアクセスできるサーバーへの設置が必要です。
GitHub Pages等の静的ファイル配信だけでは、このPython/SQLite共有サーバーは動きません。

## 本番公開前の設定

- HTTPS終端と永続ストレージを用意する。
- `PUBLIC_ORIGIN` を実際の公開URL、`COOKIE_SECURE=1` に設定。
- 開発・試験用アカウントを持ち込まない。
- DBのバックアップと復元を検証する。
- スマートフォン実機でログイン・配車・入力・画像共有・PWA更新を確認する。
- パスワード再発行・メール確認・運営保守は本版に未実装。広い一般公開の前に整備する。

環境変数の例は `.env.example`。このファイルを置くだけでは自動で読み込みません。

## 通知

通知の予約・対象決定・取消・重複抑制はサーバー側にあります。ブラウザーのタイマーではありません。
配車通知は配車担当者＋オーナー、幹部予定/タスクは担当者（未指定なら全運営メンバー）です。
時刻なしは9:00、1か月前は暦月で計算し月末を調整します。

実際のPush送信を有効にするには追加設定が必要です。

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-push.txt
.\.venv\Scripts\python.exe -m server.vapid_keys
```

表示された `VAPID_PRIVATE_KEY`、`VAPID_PUBLIC_KEY` と、実在する連絡先 `VAPID_CONTACT` をサーバーの環境変数に設定して再起動します。
秘密鍵をフロントエンド・GitHub・共有画像に含めないでください。

iPhone/Androidへの実送信、OS通知権限、アプリを閉じた状態での着信は未検証です。
今回の環境では外部パッケージのDNS取得にも制約があり、pywebpushのインストールと実送信を完了できていません。
通知の保存・予約処理の合格を、実機への到達確認とは扱っていません。

## バックアップ

設定からのJSON書き出しはグループの業務データ用です。アカウント・セッションを含むサーバー全体の復旧はSQLiteバックアップを使用します。

```powershell
.\.venv\Scripts\python.exe -m server.backup backups\club-2026-09-05.sqlite3
```

稼働中のDBを単純コピーせず、このコマンドのSQLite Backup APIを使ってください。
復元はサーバーを停止してDBファイルを置き換え、整合性を確認してから再開します。

## テスト

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q tests/test_server.py tests/test_identity.py
node --test tests/domain.test.cjs
python tests/browser_checks.py
python tests/browser_server.py
python tests/workflow_browser.py
python tests/workflow_server.py
python tests/touch_check.py
python tests/bundle_check.py
```

ブラウザ試験はChromiumとPlaywrightが必要です。本同梱試験は管理ポリシーによる制限を受ける環境向けの直接描画方式です。通常の公開URLを開くE2E試験ではありません。

単一HTMLを再生成する場合：

```bash
python tools/build_demo.py
```

## 構成

`web/base.js` は合意済みの画面部品と配車ジェスチャーを保持した互換層、`web/app.js` が実画面・接続処理、`web/domain.js` が純粋な計算ロジックです。
`web/workflow.js` がv0.9の入口・招待・配車共有UIです。`server/app.py` が権限・共有データ・通知予約、`server/identity.py` がLINE認証・アカウント・招待管理の追加経路を担当します。
SQLiteの単一サーバー構成です。複数の書き込みサーバーやサーバーレスの一時ディスクへの配置は想定していません。
