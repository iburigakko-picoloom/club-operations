package app.cluboperations;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.app.NotificationChannel;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import java.lang.ref.WeakReference;

public final class MainActivity extends Activity {
    static final String APP_URL = "https://iburigakko-picoloom.github.io/club-operations/";
    static final String EXTRA_URL = "club_url";
    private static final int NOTIFICATION_PERMISSION = 101;
    private static final int FILE_CHOICE = 102;
    private static WeakReference<MainActivity> current = new WeakReference<>(null);
    private WebView web;
    private boolean bridgeAttached;
    private ValueCallback<Uri[]> fileCallback;

    static void tokenChanged() {
        MainActivity activity = current.get();
        if (activity != null) activity.runOnUiThread(activity::notifyPage);
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        current = new WeakReference<>(this);
        NotificationManager notificationManager = getSystemService(NotificationManager.class);
        if (notificationManager != null) notificationManager.createNotificationChannel(new NotificationChannel("club_reminders", "予定とやること", NotificationManager.IMPORTANCE_DEFAULT));
        web = new WebView(this);
        web.setBackgroundColor(0xffffffff);
        setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);
        attachBridge();
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(Uri.parse(url));
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (isAppUri(Uri.parse(url))) notifyPage();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), FILE_CHOICE); return true; }
                catch (Exception e) { fileCallback = null; callback.onReceiveValue(null); return false; }
            }
        });
        web.loadUrl(safeAppUrl(getIntent()));
        initMessaging();
    }

    private boolean isAppUri(Uri uri) {
        return "https".equals(uri.getScheme()) && "iburigakko-picoloom.github.io".equals(uri.getHost())
            && uri.getPath() != null && uri.getPath().startsWith("/club-operations/");
    }
    private String safeAppUrl(Intent intent) {
        String value = intent == null ? null : intent.getStringExtra(EXTRA_URL);
        if (value == null) return APP_URL;
        Uri uri = Uri.parse(value);
        return isAppUri(uri) ? uri.toString() : APP_URL;
    }
    private boolean handleNavigation(Uri uri) {
        if (isAppUri(uri)) { attachBridge(); return false; }
        detachBridge();
        String host = uri.getHost();
        if ("https".equals(uri.getScheme()) && host != null && (host.equals("access.line.me") || host.equals("id.line.me") || host.equals("account.line.me"))) return false;
        if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
        } else if ("intent".equals(uri.getScheme())) {
            try {
                Intent target = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                if ("jp.naver.line.android".equals(target.getPackage())) startActivity(target);
            } catch (Exception ignored) { }
        }
        return true;
    }
    private void attachBridge() {
        if (!bridgeAttached) { web.addJavascriptInterface(new NativeBridge(), "ClubNative"); bridgeAttached = true; }
    }
    private void detachBridge() {
        if (bridgeAttached) { web.removeJavascriptInterface("ClubNative"); bridgeAttached = false; }
    }
    private void notifyPage() {
        if (web != null && isAppUri(Uri.parse(web.getUrl() == null ? "" : web.getUrl())))
            web.evaluateJavascript("window.clubNativeTokenReady&&window.clubNativeTokenReady();", null);
    }
    private void initMessaging() {
        if (BuildConfig.FIREBASE_APP_ID.isEmpty() || BuildConfig.FIREBASE_API_KEY.isEmpty()
            || BuildConfig.FIREBASE_SENDER_ID.isEmpty() || BuildConfig.FIREBASE_PROJECT_ID.isEmpty()) return;
        try {
            FirebaseOptions options = new FirebaseOptions.Builder()
                .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                .setApiKey(BuildConfig.FIREBASE_API_KEY)
                .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                .setProjectId(BuildConfig.FIREBASE_PROJECT_ID).build();
            FirebaseApp.initializeApp(this, options);
            FirebaseMessaging messaging = FirebaseMessaging.getInstance();
            messaging.setAutoInitEnabled(true);
            messaging.getToken().addOnSuccessListener(token -> {
                getSharedPreferences("club_native", MODE_PRIVATE).edit().putString("fcm_token", token).apply();
                notifyPage();
            });
        } catch (RuntimeException ignored) { }
    }
    @Override public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (web != null) web.loadUrl(safeAppUrl(intent));
    }
    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
    @Override public void onDestroy() {
        if (current.get() == this) current.clear();
        if (web != null) { web.removeJavascriptInterface("ClubNative"); web.destroy(); web = null; }
        super.onDestroy();
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOICE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(requestCode, permissions, grants);
        if (requestCode == NOTIFICATION_PERMISSION && web != null)
            web.evaluateJavascript("window.clubNativePermissionChanged&&window.clubNativePermissionChanged();", null);
    }

    private final class NativeBridge {
        @JavascriptInterface public String getPushToken() {
            return getSharedPreferences("club_native", MODE_PRIVATE).getString("fcm_token", "");
        }
        @JavascriptInterface public boolean isNotificationsAllowed() {
            NotificationManager manager = getSystemService(NotificationManager.class);
            return manager != null && manager.areNotificationsEnabled() &&
                (Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
        }
        @JavascriptInterface public void requestNotifications() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION);
                else if (web != null) web.evaluateJavascript("window.clubNativePermissionChanged&&window.clubNativePermissionChanged();", null);
            });
        }
        @JavascriptInterface public void saveWidgetSnapshot(String json) {
            if (json == null || json.length() > 16000) return;
            runOnUiThread(() -> TasksWidget.save(MainActivity.this, json));
        }
        @JavascriptInterface public void clearUserData() {
            runOnUiThread(() -> TasksWidget.save(MainActivity.this, "null"));
        }
    }
}
