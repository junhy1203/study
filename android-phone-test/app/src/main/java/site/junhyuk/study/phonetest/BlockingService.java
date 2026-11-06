package site.junhyuk.study.phonetest;

import android.accessibilityservice.AccessibilityService;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.content.SharedPreferences;
import android.content.Intent;
import android.net.Uri;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.JavascriptInterface;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

public class BlockingService extends AccessibilityService {
    private static BlockingService instance;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WindowManager windows;
    private View overlay;
    private WebView web;
    private long allowedUntil;
    private boolean stopped;
    private boolean starting;
    private boolean requestRunning;
    private boolean authenticating;
    private String pendingGoogleToken;
    private TextView title;
    private final Runnable expire = () -> { if (!stopped && SystemClock.elapsedRealtime() >= allowedUntil) showBlock(); };

    @Override protected void onServiceConnected() {
        instance = this;
        windows = (WindowManager) getSystemService(WINDOW_SERVICE);
        showBlock();
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!stopped && !authenticating && SystemClock.elapsedRealtime() >= allowedUntil) showBlock();
    }

    private void showBlock() {
        if (overlay != null || windows == null || stopped || authenticating) return;
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        title = new TextView(this);
        title.setText("폰 시간을 구매한 뒤 5분 사용을 눌러 주세요.");
        title.setTextColor(Color.BLACK);
        title.setPadding(20, 20, 20, 10);
        root.addView(title);
        Button google = new Button(this);
        google.setText("Google 계정으로 로그인");
        google.setOnClickListener(v -> beginGoogleLogin());
        root.addView(google);
        LinearLayout buttons = new LinearLayout(this);
        Button allow = new Button(this);
        allow.setText("폰 시간 5분 사용");
        allow.setOnClickListener(v -> {
            if (starting || web == null || !trusted(web.getUrl())) return;
            starting = true;
            title.setText("로그인 및 이용권을 확인하는 중…");
            web.evaluateJavascript("import('/auth.js?v=20261104-1').then(async m=>{await m.authReady;let u=m.getAuthUser();if(!u){StudyPhone.authError();return;}StudyPhone.start(await u.getIdToken());}).catch(()=>StudyPhone.authError())", null);
        });
        buttons.addView(allow);
        Button stop = new Button(this);
        stop.setText("실험 종료");
        stop.setOnClickListener(v -> { stopped = true; removeBlock(); disableSelf(); });
        buttons.addView(stop);
        root.addView(buttons);
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.addJavascriptInterface(new Bridge(), "StudyPhone");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !trusted(request.getUrl().toString()); }
            @Override public void onPageFinished(WebView view, String url) {
                if (!trusted(url)) return;
                view.evaluateJavascript("if(!window.__studyNativeLogin){window.__studyNativeLogin=true;document.addEventListener('click',e=>{if(e.target.closest('[data-auth-action=google]')){e.preventDefault();e.stopImmediatePropagation();StudyPhone.googleLogin();}},true)}", null);
                if (pendingGoogleToken != null && "/login.html".equals(Uri.parse(url).getPath())) {
                    String token = pendingGoogleToken; pendingGoogleToken = null;
                    String script = "import('/auth.js?v=20261104-1').then(async m=>{let s=await m.authReady;if(!s)throw Error('auth init');let c=s.GoogleAuthProvider.credential(" + JSONObject.quote(token) + ");await s.signInWithCredential(s.auth,c);StudyPhone.loginSuccess();location.href='/play.html';}).catch(e=>StudyPhone.loginError(String(e.code||e.message||'unknown')))";
                    view.evaluateJavascript(script, null);
                }
            }
        });
        web.loadUrl(pendingGoogleToken == null ? "https://study.junhyuk.site/play.html" : "https://study.junhyuk.site/login.html");
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(-1, -1,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP;
        try { windows.addView(root, params); overlay = root; }
        catch (RuntimeException error) { web.destroy(); web = null; }
    }

    private boolean trusted(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        return "https".equals(uri.getScheme()) && "study.junhyuk.site".equals(uri.getHost()) && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    private class Bridge {
        @JavascriptInterface public void authError() { handler.post(() -> failure("로그인 후 다시 시도해 주세요.")); }
        @JavascriptInterface public void loginSuccess() { android.util.Log.i("StudyPhoneLogin", "Firebase web sign-in succeeded"); handler.post(() -> { if (title != null) title.setText("로그인 완료. 폰 시간을 사용할 수 있어요."); }); }
        @JavascriptInterface public void loginError(String code) { android.util.Log.w("StudyPhoneLogin", "Firebase web sign-in failed: " + code.replaceAll("[^a-zA-Z0-9_/-]", "")); handler.post(() -> failure("Study 로그인 연결에 실패했어요. 다시 로그인해 주세요.")); }
        @JavascriptInterface public void googleLogin() { handler.post(BlockingService.this::beginGoogleLogin); }
        @JavascriptInterface public void start(String token) {
            if (token == null || token.length() < 20 || token.length() > 16384) { authError(); return; }
            handler.post(() -> { if (starting && !requestRunning) { requestRunning = true; new Thread(() -> requestSession(token)).start(); } });
        }
    }

    private void beginGoogleLogin() {
        if (authenticating || stopped) return;
        authenticating = true; removeBlock();
        try { startActivity(new Intent(this, GoogleLoginActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (RuntimeException error) { authenticating = false; showBlock(); failure("Google 로그인 화면을 열지 못했어요."); }
    }

    static void finishGoogleLogin(String token, int errorCode) {
        BlockingService service = instance;
        if (service == null) return;
        service.handler.post(() -> {
            service.authenticating = false;
            service.pendingGoogleToken = token;
            service.showBlock();
            if (token == null) service.failure("Google 로그인 실패 (코드 " + errorCode + "). 다시 시도해 주세요.");
        });
    }

    private void failure(String message) { starting = false; if (title != null) title.setText(message); }

    private void requestSession(String token) {
        HttpURLConnection connection = null;
        long startedAt = SystemClock.elapsedRealtime();
        try {
            SharedPreferences prefs = getSharedPreferences("phone_session", MODE_PRIVATE);
            String device = prefs.getString("device", null), request = prefs.getString("request", null);
            if (device == null) { device = UUID.randomUUID().toString(); prefs.edit().putString("device", device).commit(); }
            if (request == null) { request = UUID.randomUUID().toString(); prefs.edit().putString("request", request).commit(); }
            JSONObject data = new JSONObject().put("deviceId", device).put("requestId", request);
            byte[] payload = new JSONObject().put("data", data).toString().getBytes(StandardCharsets.UTF_8);
            connection = (HttpURLConnection) new URL("https://api.study.junhyuk.site/api/v1/rpc/beginPhoneSession").openConnection();
            connection.setConnectTimeout(15000); connection.setReadTimeout(15000);
            connection.setRequestMethod("POST"); connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json"); connection.setRequestProperty("Authorization", "Bearer " + token);
            try (java.io.OutputStream out = connection.getOutputStream()) { out.write(payload); }
            int code = connection.getResponseCode();
            java.io.InputStream input = code >= 200 && code < 300 ? connection.getInputStream() : connection.getErrorStream();
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            try (java.io.InputStream in = input) { byte[] buffer = new byte[1024]; int n; while ((n = in.read(buffer)) != -1 && bytes.size() < 65536) bytes.write(buffer, 0, n); }
            JSONObject response = new JSONObject(bytes.toString("UTF-8"));
            if (code < 200 || code >= 300) {
                if (code >= 400 && code < 500 && code != 429) prefs.edit().remove("request").apply();
                String message = response.optJSONObject("error") == null ? "서버 요청을 확인해 주세요." : response.optJSONObject("error").optString("message", "서버 요청을 확인해 주세요.");
                handler.post(() -> failure(message)); return;
            }
            JSONObject result = response.getJSONObject("data");
            long remaining = Math.max(0, Math.min(300000, result.getLong("endsAtMs") - result.getLong("serverNowMs")) - (SystemClock.elapsedRealtime() - startedAt));
            prefs.edit().remove("request").apply();
            handler.post(() -> {
                starting = false;
                if (stopped) return;
                if (remaining <= 0) { failure("이용권이 종료되었습니다. 다시 시도해 주세요."); return; }
                allowedUntil = SystemClock.elapsedRealtime() + remaining;
                removeBlock(); handler.removeCallbacks(expire); handler.postDelayed(expire, remaining);
            });
        } catch (Exception error) { handler.post(() -> failure("서버 연결에 실패했어요. 다시 시도해 주세요.")); }
        finally { if (connection != null) connection.disconnect(); handler.post(() -> requestRunning = false); }
    }

    private void removeBlock() {
        if (overlay != null) { windows.removeView(overlay); overlay = null; }
        if (web != null) { web.destroy(); web = null; }
    }
    @Override public void onInterrupt() { }
    @Override public void onDestroy() { stopped = true; if (instance == this) instance = null; handler.removeCallbacksAndMessages(null); removeBlock(); super.onDestroy(); }
}
