package com.acc.erp;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.app.ProgressDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * التحديث داخل التطبيق: عند فتح التطبيق يقرأ version.json من الرابط المنشور،
 * وإذا وُجد إصدار أحدث يعرض رسالة "تحديث جديد متاح" بزر "تحديث" ينزّل النسخة ويفتح شاشة التثبيت مباشرة.
 */
class Updater {
    static final String VERSION_URL = "https://adomja1212.github.io/nezam-almohaseb/version.json";
    static final String APK_NAME = "sawah-erp-update.apk";

    final Activity act;
    final Handler ui = new Handler(Looper.getMainLooper());
    long downloadId = -1;
    boolean waitingPermission = false;
    String pendingUrl = null;

    Updater(Activity a) { act = a; }

    int myVersion() {
        try {
            PackageInfo p = act.getPackageManager().getPackageInfo(act.getPackageName(), 0);
            return p.versionCode;
        } catch (Exception e) { return 0; }
    }

    /** يفحص وجود تحديث في الخلفية (لا يعطّل فتح البرنامج) */
    void check() {
        new Thread(new Runnable() { public void run() {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(VERSION_URL + "?t=" + System.currentTimeMillis()).openConnection();
                c.setConnectTimeout(8000); c.setReadTimeout(8000); c.setUseCaches(false);
                BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"));
                StringBuilder sb = new StringBuilder(); String line;
                while ((line = r.readLine()) != null) sb.append(line);
                r.close();
                final JSONObject j = new JSONObject(sb.toString());
                final int code = j.optInt("versionCode", 0);
                if (code <= myVersion()) return;
                final String name = j.optString("versionName", "");
                final String url = j.optString("url", "");
                final String notes = j.optString("notes", "");
                if (url.isEmpty()) return;
                ui.post(new Runnable() { public void run() { offer(name, notes, url); } });
            } catch (Exception ignored) { }
        } }).start();
    }

    void offer(String name, String notes, final String url) {
        if (act.isFinishing()) return;
        new AlertDialog.Builder(act)
                .setTitle("تحديث جديد متاح" + (name.isEmpty() ? "" : " — الإصدار " + name))
                .setMessage((notes.isEmpty() ? "" : notes + "\n\n") + "اضغط \"تحديث\" لتنزيل النسخة الجديدة وتثبيتها.")
                .setPositiveButton("تحديث", new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, int w) { start(url); } })
                .setNegativeButton("لاحقاً", null)
                .show();
    }

    /** أندرويد 8+: يلزم السماح للتطبيق بتثبيت التحديثات مرة واحدة */
    void start(String url) {
        if (Build.VERSION.SDK_INT >= 26 && !act.getPackageManager().canRequestPackageInstalls()) {
            pendingUrl = url; waitingPermission = true;
            Toast.makeText(act, "اسمح للتطبيق بتثبيت التحديثات ثم ارجع", Toast.LENGTH_LONG).show();
            try {
                act.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + act.getPackageName())));
            } catch (ActivityNotFoundException e) { download(url); }
            return;
        }
        download(url);
    }

    /** يُستدعى عند رجوع المستخدم من شاشة الإذن */
    void onResume() {
        if (!waitingPermission || pendingUrl == null) return;
        waitingPermission = false;
        if (Build.VERSION.SDK_INT >= 26 && !act.getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(act, "لم يتم السماح بالتثبيت — يمكنك التحديث لاحقاً", Toast.LENGTH_LONG).show();
            return;
        }
        download(pendingUrl);
    }

    void download(String url) {
        try {
            File old = new File(act.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), APK_NAME);
            if (old.exists()) old.delete();
            final DownloadManager dm = (DownloadManager) act.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url + (url.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis()));
            r.setTitle("تحديث Sawah ERP");
            r.setMimeType("application/vnd.android.package-archive");
            r.setDestinationInExternalFilesDir(act, Environment.DIRECTORY_DOWNLOADS, APK_NAME);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            downloadId = dm.enqueue(r);
            final ProgressDialog pd = new ProgressDialog(act);
            pd.setTitle("جارٍ تنزيل التحديث");
            pd.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);
            pd.setMax(100); pd.setCancelable(false); pd.show();
            // متابعة التنزيل حتى يكتمل ثم فتح شاشة التثبيت
            ui.postDelayed(new Runnable() { public void run() {
                Cursor c = dm.query(new DownloadManager.Query().setFilterById(downloadId));
                int status = -1; long done = 0, total = 0;
                if (c != null && c.moveToFirst()) {
                    status = c.getInt(c.getColumnIndex(DownloadManager.COLUMN_STATUS));
                    done = c.getLong(c.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    total = c.getLong(c.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                }
                if (c != null) c.close();
                if (total > 0) pd.setProgress((int) (done * 100 / total));
                if (status == DownloadManager.STATUS_SUCCESSFUL) { pd.dismiss(); install(dm.getUriForDownloadedFile(downloadId)); return; }
                if (status == DownloadManager.STATUS_FAILED || status == -1) { pd.dismiss(); Toast.makeText(act, "تعذّر تنزيل التحديث — تحقق من الإنترنت وحاول مرة أخرى", Toast.LENGTH_LONG).show(); return; }
                ui.postDelayed(this, 500);
            } }, 500);
        } catch (Exception e) {
            Toast.makeText(act, "تعذّر بدء التحديث: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    void install(Uri uri) {
        if (uri == null) { Toast.makeText(act, "تعذّر فتح ملف التحديث", Toast.LENGTH_LONG).show(); return; }
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try { act.startActivity(i); }
        catch (ActivityNotFoundException e) { Toast.makeText(act, "لا يوجد مثبّت تطبيقات على الجهاز", Toast.LENGTH_LONG).show(); }
    }
}
