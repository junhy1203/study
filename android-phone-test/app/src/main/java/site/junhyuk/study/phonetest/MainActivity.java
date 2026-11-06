package site.junhyuk.study.phonetest;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(32, 48, 32, 32);
        layout.setGravity(Gravity.CENTER);
        TextView info = new TextView(this);
        info.setTextSize(18);
        info.setText("실험용 앱입니다. 접근성 설정을 켜면 Study 화면이 표시됩니다. 로그인하고 구매한 폰 시간을 5분씩 사용할 수 있습니다. 차단 화면의 실험 종료 버튼으로 언제든 끌 수 있습니다.");
        layout.addView(info);
        Button settings = new Button(this);
        settings.setText("접근성 설정 열기");
        settings.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        layout.addView(settings);
        setContentView(layout);
    }
}
