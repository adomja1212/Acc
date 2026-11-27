package com.acc.erp;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * تطبيق "نظام المحاسب": يفتح البرنامج المنشور على claude.ai داخل التطبيق.
 * أي تحديث يُنشر للبرنامج يظهر فوراً لكل المستخدمين بدون تحديث التطبيق نفسه.
 */
public class MainActivity extends Activity {
    // رابط البرنامج المنشور — لتغييره: عدّل هذا السطر وأعد بناء التطبيق بنفس مفتاح التوقيع
    static final String APP_URL = "https://adomja1212.github.io/Acc/";
    static final int PICK_FILE = 41;

    WebView web;
    ProgressBar bar;
    ValueCallback<Uri[]> fileCallback;
    long lastBack = 0;
    boolean showingError = false;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (Build.VERSION.SDK_INT >= 21) getWindow().setStatusBarColor(Color.rgb(0x1c, 0x51, 0xae));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        FrameLayout.LayoutParams bl = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(4));
        root.addView(bar, bl);
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "AccApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handleUrl(req.getUrl().toString());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                bar.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
                // بعد إتمام تسجيل الدخول في claude.ai نرجع للبرنامج مباشرة
                if (afterLogin && url != null && url.startsWith("https://claude.ai/") && !url.contains("magic-link") && !url.contains("/login") && !url.contains("/artifact/")) {
                    afterLogin = false;
                    view.loadUrl(APP_URL);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showOffline();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int p) {
                bar.setVisibility(p < 100 ? View.VISIBLE : View.GONE);
                bar.setProgress(p);
            }

            // اختيار ملف من الهاتف (استيراد Excel/CSV)
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "application/vnd.ms-excel", "text/csv", "text/comma-separated-values", "text/plain", "application/octet-stream"});
                try {
                    startActivityForResult(Intent.createChooser(i, "اختر الملف"), PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, "لا يوجد تطبيق لاختيار الملفات", Toast.LENGTH_LONG).show();
                    return false;
                }
                return true;
            }
        });

        // التنزيلات (تصدير Excel / النماذج / النسخ الاحتياطية)
        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String ua, String disposition, String mime, long len) {
                String name = URLUtil.guessFileName(url, disposition, mime);
                if (url.startsWith("blob:") || url.startsWith("data:")) {
                    // ملف مُنشأ داخل الصفحة: نقرأه بجافاسكربت ونسلمه للتطبيق ليحفظه في التنزيلات
                    String js = "(async()=>{try{const r=await fetch('" + url.replace("'", "\\'") + "');const b=await r.blob();"
                            + "const fr=new FileReader();fr.onload=()=>AccApp.save(fr.result.split(',')[1],'" + name.replace("'", "") + "',b.type||'" + (mime == null ? "" : mime) + "');"
                            + "fr.readAsDataURL(b);}catch(e){AccApp.fail(String(e));}})()";
                    web.evaluateJavascript(js, null);
                    return;
                }
                try {
                    DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                    r.setMimeType(mime);
                    r.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
                    r.addRequestHeader("User-Agent", ua);
                    r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                    ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
                    Toast.makeText(MainActivity.this, "جارٍ التنزيل: " + name, Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    openExternal(url);
                }
            }
        });

        String link = linkFrom(getIntent());
        if (link != null) { afterLogin = link.contains("magic-link"); web.loadUrl(link); }
        else if (saved != null) web.restoreState(saved);
        else web.loadUrl(APP_URL);
    }

    boolean afterLogin = false;

    // رابط claude.ai مفتوح من البريد أو من مكان آخر
    static String linkFrom(Intent i) {
        if (i == null || i.getData() == null || !Intent.ACTION_VIEW.equals(i.getAction())) return null;
        Uri u = i.getData();
        return "https".equals(u.getScheme()) && "claude.ai".equals(u.getHost()) ? u.toString() : null;
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        String link = linkFrom(i);
        if (link != null) { showingError = false; afterLogin = link.contains("magic-link"); web.loadUrl(link); }
    }

    int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    // رابط البرنامج على GitHub وقاعدة البيانات تبقى داخل التطبيق، وأي رابط آخر يفتح في المتصفح
    boolean handleUrl(String url) {
        Uri u = Uri.parse(url);
        String host = u.getHost() == null ? "" : u.getHost();
        String scheme = u.getScheme() == null ? "" : u.getScheme();
        if (scheme.equals("https") && (host.equals("adomja1212.github.io") || host.endsWith(".supabase.co") || host.equals("claude.ai") || host.endsWith(".claude.ai") || host.endsWith(".anthropic.com") || host.endsWith("claudeusercontent.com"))) return false;
        if (scheme.equals("https") || scheme.equals("http") || scheme.equals("mailto") || scheme.equals("tel") || scheme.equals("intent")) {
            openExternal(url);
            return true;
        }
        return false;
    }

    void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            Toast.makeText(this, "تعذّر فتح الرابط", Toast.LENGTH_SHORT).show();
        }
    }

    void showOffline() {
        showingError = true;
        String html = "<html dir='rtl'><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:90vh;color:#333;text-align:center'>"
                + "<div style='font-size:48px'>📡</div><h3>لا يوجد اتصال بالإنترنت</h3><p>تأكد من الاتصال ثم اضغط إعادة المحاولة</p>"
                + "<button onclick='AccApp.retry()' style='background:#1c51ae;color:#fff;border:0;border-radius:6px;padding:12px 28px;font-size:16px'>إعادة المحاولة</button></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK_FILE && fileCallback != null) {
            Uri[] result = null;
            if (res == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent ev) {
        if (code == KeyEvent.KEYCODE_BACK) {
            if (showingError) { finish(); return true; }
            if (web.canGoBack()) { web.goBack(); return true; }
            long now = System.currentTimeMillis();
            if (now - lastBack > 2000) {
                lastBack = now;
                Toast.makeText(this, "اضغط رجوع مرة أخرى للخروج", Toast.LENGTH_SHORT).show();
                return true;
            }
        }
        return super.onKeyDown(code, ev);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    // جسر بين الصفحة والتطبيق: حفظ الملفات المنزّلة، وإعادة المحاولة عند انقطاع الاتصال
    class Bridge {
        @JavascriptInterface
        public void save(String b64, String name, String mime) {
            try {
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                String where;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    os.write(bytes);
                    os.close();
                    where = "التنزيلات";
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    File f = new File(dir, name);
                    FileOutputStream os = new FileOutputStream(f);
                    os.write(bytes);
                    os.close();
                    where = f.getAbsolutePath();
                }
                final String msg = "تم حفظ " + name + " في " + where;
                runOnUiThread(new Runnable() { public void run() { Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show(); } });
            } catch (Exception e) {
                fail(e.toString());
            }
        }

        @JavascriptInterface
        public void fail(final String err) {
            runOnUiThread(new Runnable() { public void run() { Toast.makeText(MainActivity.this, "تعذّر حفظ الملف: " + err, Toast.LENGTH_LONG).show(); } });
        }

        @JavascriptInterface
        public void retry() {
            runOnUiThread(new Runnable() { public void run() { showingError = false; web.loadUrl(APP_URL); } });
        }
    }
}
