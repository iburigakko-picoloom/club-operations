# LINEログインの接続

現在の公開構成はGitHub Pages＋Supabase Edge Functionsです。チャネル設定がない間もメールで登録・ログインできます。

## LINE Developers

1. 部活用のWebアプリ対応LINEログインチャネルを作成します。
2. LINEログイン設定のコールバックURLに次のURLを登録します（末尾の `/` を含む）。

```text
https://manatocookietwitter-lang.github.io/club-operations/
```

3. Supabaseの部活専用プロジェクト → Edge Functions → Secretsへ `LINE_CHANNEL_ID`、`LINE_CHANNEL_SECRET` を登録し、`LINE_LOGIN_ENABLED=1` を設定します。シークレットをGitHub・画面ソース・チャットへ書きません。
4. 開発中はチャネルのテスト権限を持つ利用者で確認します。一般の運営メンバーにも使ってもらうには、チャネルの公開設定も必要です。

## 認証の流れ

ブラウザーがランダムなフロー確認値を生成し、タブ内のsessionStorageに保存します。Edge Functionはstate・nonce・PKCE検証値と確認値のハッシュを10分間DBに保管します。LINEから画面へ戻るとstateを照合し、認可コードをアドレス欄から除いてサーバーへ送ります。

サーバーでフローの有効期限・確認値・単回利用を検証し、LINEの固定HTTPSエンドポイントでコード交換とIDトークン検証を行います。iss/aud/nonce/exp/iat/subを照合します。LINEのアクセストークンやチャネルシークレットをブラウザーへ返しません。アプリ独自のセッションはDBへハッシュだけを保存します。

既存アカウントの連携は、ログイン済みのアカウント画面から開始します。他アカウントのLINEを自動統合しません。連携の完了時にもアプリセッションとCSRFトークンを再確認します。

## 検証

新規ログイン、キャンセル、期限切れ・別タブ、再利用、既存アカウント連携、別アカウントへの重複連携拒否、招待リンクからの参加を確認してください。自動テストのLINE応答はモックで、実チャネルによる認証往復の代わりにはなりません。

公式：[LINE Webログイン](https://developers.line.biz/ja/docs/line-login/integrate-line-login/)、[PKCE](https://developers.line.biz/ja/docs/line-login/integrate-pkce/)、[Supabase秘密設定](https://supabase.com/docs/guides/functions/secrets)。
