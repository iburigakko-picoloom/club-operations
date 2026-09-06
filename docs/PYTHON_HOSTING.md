# 旧Pythonホスト構成（現在の公開構成ではありません）

現在はGitHub Pages＋Supabaseを使用します。以下はPython版の参照資料です。

# LINEログインの接続手順

無料公開はPythonサーバー1台と外部Postgresを使います。ローカル起動時はSQLiteも使えます。現在の標準公開手順は [FREE_HOSTING.md](FREE_HOSTING.md) です。以下のDocker例は永続SQLiteで運用する場合の補足です。

## Renderで共有版を作る

[公開設定を開く](https://render.com/deploy?repo=https://github.com/manatocookietwitter-lang/club-operations) と同梱 `render.yaml` を使えます。Pythonサーバー1台、Freeプラン、シンガポール配置です。保存先はSupabaseの無料Postgresです。DATABASE_URLが未設定なら起動を停止し、一時ディスクへの保存に切り替わらないようにしています。

公開直後はメール登録・ログインが利用可能で、LINEは無効です。表示されたHTTPS URLをPUBLIC_ORIGINとLINEコールバックに設定し、以下の手順でLINEを有効にします。共有版のURLはRenderのデプロイ成功後に確定します。

## LINE Developers側

1. Webアプリ用のLINEログインチャネルを作成します。既存アカウントを引き継ぐ場合は同じチャネルを使います。
2. LINEログイン設定のコールバックURLに `https://公開ドメイン/api/auth/line/callback` を登録します。
3. 開発中のチャネルは利用者の権限を設定してテストします。公開ステータスへの変更は実接続確認後に判断します。
4. チャネルIDとチャネルシークレットをホストの環境変数へ設定します。シークレットはGitHubのファイル・チャット・フロントエンドへ書きません。

利用スコープは `openid profile`。PKCE S256、state、nonce、IDトークン検証を使用します。

公式資料：[Webアプリへの組み込み](https://developers.line.biz/ja/docs/line-login/integrate-line-login/)、[PKCE](https://developers.line.biz/ja/docs/line-login/integrate-pkce/)。

## サーバー側

以下をホストの環境変数として注入します。

```text
PUBLIC_ORIGIN=https://公開ドメイン
COOKIE_SECURE=1
LINE_LOGIN_ENABLED=1
LINE_CHANNEL_ID=チャネルID
LINE_CHANNEL_SECRET=ホストの秘密設定から注入
LINE_REDIRECT_URI=https://公開ドメイン/api/auth/line/callback
PASSWORD_LOGIN_ENABLED=1
CLUB_DB=/data/club.sqlite3
```

PUBLIC_ORIGINはHTTPSの標準ポート443、パス・認証情報・クエリ・フラグメントなし。`.env.example`を置くだけではPythonに読み込まれません。Dockerの `--env-file` またはホストの環境変数設定を利用してください。

コンテナー利用時の例（先に `.env` を実環境の値で用意）：

```sh
docker build -t club-operations .
docker volume create club-data
docker run --rm --env-file .env club-operations python -m server.check_config
docker run -d --name club-operations --restart unless-stopped --env-file .env -v club-data:/data -p 127.0.0.1:8765:8765 club-operations
```

コンテナーはUID 10001の非rootユーザーで動きます。ホストのディレクトリをバインドマウントする場合は、このUIDがDBディレクトリへ書き込めるよう設定します。上記の名前付きボリューム例は同梱Dockerfileの初期所有権を使います。

HTTPSリバースプロキシを8765番へ接続します。LINEの開始制限はサーバーが認識した接続元IPごとに10分30回です。プロキシを使う場合、ホスト構成に応じて `FORWARDED_ALLOW_IPS` を実際の信頼済みプロキシIPだけに設定し、プロキシ側で転送ヘッダーを正規化してください。未設定では全利用者が同一IPとして扱われる場合があります。無条件の `*` 信頼は使いません。

同梱起動方法はuvicornのアクセスログを無効にしています。プロキシ・ホスト側にも認証コールバックのクエリや `/api/invites/` のトークンを記録させない設定が必要です。参考：[Uvicorn設定](https://www.uvicorn.org/settings/)。

## 接続確認

1. ホスト上で `python -m server.check_config` が成功することを確認します。これは設定の形式検証で、LINEへの疎通試験ではありません。
2. 公開URLの `/api/config` で `lineLogin: true` を確認します。
3. 実ブラウザーでLINEログイン→LINEの同意画面→アプリのグループ選択へ戻ることを確認します。
4. ログアウト、キャンセル、再試行、既存アカウントからのLINE連携、招待先への参加を確認します。
5. 既存オーナーがLINE連携で同じグループへ戻れるまで、メールログインは無効にしません。
6. サーバー再起動後も所属・業務データが残ることと、バックアップから復元できることを確認します。

GitHub Actionsは外部LINE APIをモックしたテストです。実LINEログインやスマートフォン検証の代わりにはなりません。Dockerビルド・HTTPS・実LINE認証は実ホストで確認する必要があります。
