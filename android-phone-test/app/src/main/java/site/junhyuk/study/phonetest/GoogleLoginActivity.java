package site.junhyuk.study.phonetest;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;

public class GoogleLoginActivity extends Activity {
    private static final int SIGN_IN = 2401;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (state != null) return;
        GoogleSignInOptions options = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken("555183292594-csasg88fmu0tohp7eio5kj2atnaul188.apps.googleusercontent.com")
            .requestEmail().build();
        GoogleSignInClient client = GoogleSignIn.getClient(this, options);
        startActivityForResult(client.getSignInIntent(), SIGN_IN);
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != SIGN_IN) return;
        String token = null;
        int errorCode = 0;
        try { token = GoogleSignIn.getSignedInAccountFromIntent(data).getResult(ApiException.class).getIdToken(); }
        catch (ApiException error) { errorCode = error.getStatusCode(); }
        catch (Exception error) { errorCode = -1; }
        final String resultToken = token;
        final int resultError = errorCode;
        android.util.Log.i("StudyPhoneLogin", "Google sign-in result code=" + resultError + " hasToken=" + (resultToken != null));
        finish();
        new Handler(Looper.getMainLooper()).postDelayed(() -> BlockingService.finishGoogleLogin(resultToken, resultError), 1000);
    }
}
