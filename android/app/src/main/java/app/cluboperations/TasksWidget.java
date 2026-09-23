package app.cluboperations;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

public final class TasksWidget extends AppWidgetProvider {
    static void save(Context context, String json) {
        if (json != null && !"null".equals(json)) {
            try {
                JSONObject data = new JSONObject(json);
                if (data.optString("userId").isEmpty() || !(data.opt("tasks") instanceof JSONArray)) return;
            } catch (Exception e) { return; }
        }
        context.getSharedPreferences("club_native", Context.MODE_PRIVATE).edit().putString("widget", json == null ? "null" : json).apply();
        updateAll(context);
    }
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TasksWidget.class));
        for (int id : ids) update(context, manager, id);
    }
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) update(context, manager, id);
    }
    private static void update(Context context, AppWidgetManager manager, int id) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.tasks_widget);
        Intent open = new Intent(context, MainActivity.class);
        open.putExtra(MainActivity.EXTRA_URL, MainActivity.APP_URL + "#tasks");
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        String stored = context.getSharedPreferences("club_native", Context.MODE_PRIVATE).getString("widget", "null");
        int[] rows = {R.id.widget_task_1, R.id.widget_task_2, R.id.widget_task_3};
        for (int row : rows) { views.setTextViewText(row, ""); views.setViewVisibility(row, View.GONE); }
        views.setTextViewText(R.id.widget_heading, "自分のやること");
        try {
            JSONObject data = new JSONObject(stored);
            JSONArray tasks = data.optJSONArray("tasks");
            views.setTextViewText(R.id.widget_group, data.optString("group", ""));
            int count = tasks == null ? 0 : Math.min(rows.length, tasks.length());
            for (int i = 0; i < count; i++) {
                JSONObject task = tasks.optJSONObject(i);
                if (task == null) continue;
                String date = task.optString("date", "");
                if (date.length() >= 10) date = date.substring(5, 7) + "/" + date.substring(8, 10) + " ";
                views.setTextViewText(rows[i], date + task.optString("title", ""));
                views.setViewVisibility(rows[i], View.VISIBLE);
            }
            int total = data.optInt("total", count);
            views.setTextViewText(R.id.widget_more, total > count ? "残り" + (total - count) + "件 · 開く ›" : count == 0 ? "やることはありません · 開く ›" : "開く ›");
        } catch (Exception ignored) {
            views.setTextViewText(R.id.widget_group, "アプリを開いてログイン");
            views.setTextViewText(R.id.widget_more, "開く ›");
        }
        manager.updateAppWidget(id, views);
    }
}
