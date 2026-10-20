package com.spota.app;

import android.os.Bundle;
import android.os.SystemClock;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Hold the native splash long enough for the animated eye (1000 ms) to play
    // fully and be seen; without this Android dismisses it on the first frame.
    private static final long SPLASH_MIN_MS = 1500;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        final long start = SystemClock.uptimeMillis();
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> SystemClock.uptimeMillis() - start < SPLASH_MIN_MS);
        super.onCreate(savedInstanceState);
    }
}
