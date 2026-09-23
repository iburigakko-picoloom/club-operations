package app.cluboperations;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public final class ClubMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL = "club_reminders";

    @Override public void onNewToken(String token) {
        getSharedPreferences("club_native", MODE_PRIVATE).edit().putString("fcm_token", token).apply();
        MainActivity.tokenChanged();
    }
    @Override public void onMessageReceived(RemoteMessage message) {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "予定とやること", NotificationManager.IMPORTANCE_DEFAULT));
        RemoteMessage.Notification notice = message.getNotification();
        String title = notice != null && notice.getTitle() != null ? notice.getTitle() : "部活運営";
        String body = notice != null ? notice.getBody() : "";
        Intent open = new Intent(this, MainActivity.class);
        open.putExtra(MainActivity.EXTRA_URL, message.getData().getOrDefault("url", MainActivity.APP_URL));
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, message.getMessageId() == null ? 0 : message.getMessageId().hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(body)
            .setContentIntent(pending).setAutoCancel(true).build();
        manager.notify(message.getMessageId() == null ? (int)System.currentTimeMillis() : message.getMessageId().hashCode(), notification);
    }
}
