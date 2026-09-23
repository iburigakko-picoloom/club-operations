# Android版

既存の公開画面と共有データを表示するAndroidアプリです。Androidの通知と「自分のやること」ウィジェットはネイティブ実装です。既存のWeb/PWAも引き続き利用できます。

## 通知を有効にする

1. Firebase Consoleでプロジェクトを作成し、Androidアプリ `app.cluboperations` を登録します。Firebase Cloud Messaging API (V1) を有効にします。
2. Androidアプリの設定にある Firebase App ID、API key、Sender ID、Project ID をGitHub Actionsの同名のRepository secretsに設定します。これらはアプリに埋め込まれる公開設定です。秘密のサービスアカウント鍵とは区別してください。
3. FirebaseサービスアカウントのJSONをSupabase Edge Function secret `FCM_SERVICE_ACCOUNT_JSON` に設定します。このJSONはGitHub・Androidアプリ・Webページには入れません。
4. `club-api` Edge Functionを再デプロイし、Android APKを再ビルドします。APKをインストール後、ログイン → 設定 → 通知 → 有効にする → テスト通知を送る、で実機確認します。

ローカルでビルドする場合、JDK 17、Android SDK 35、Gradle 8.9を用意し、`android` ディレクトリで `gradle :app:assembleDebug` を実行します。Firebaseの公開設定は同名の環境変数かGradleプロパティで渡します。設定が空でもAPKはビルドできますが、Android通知は動きません。

ウィジェットはホーム画面のウィジェット一覧から「部活運営 → 自分のやること」を追加します。ログイン中の自分の未完了項目を最大3件と残り件数で表示し、左側をタップすると「やること」、右側の「出欠」をタップすると出欠画面を開きます。内容はアプリを開いて最新データを読み込んだ時と、アプリで項目を編集した時に更新されます。

LINEログイン、通知許可、端末起動中・バックグラウンドでの受信、ウィジェットの更新とタップはAndroid実機で最終確認してください。FCMはGoogle Play開発者サービスのある端末が必要です。
