package com.hanzipark;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.webkit.JavascriptInterface;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.util.LinkedHashMap;
import java.util.Map;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

/**
 * 语音桥接：
 * 1) 优先使用微软 Edge 神经网络语音（真人级音色，在线）；
 * 2) 失败时回退到 Android 系统中文语音（离线可用）。
 */
public class TtsBridge implements TextToSpeech.OnInitListener {

    private static final String TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    private static final String WSS_BASE = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=" + TRUSTED_TOKEN;
    private static final String GEC_VERSION = "1-143.0.3650.75";
    private static final String VOICE = "zh-CN-XiaoxiaoNeural";
    private static final String UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";

    private final Context ctx;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicInteger generation = new AtomicInteger(0);

    private TextToSpeech tts;
    private boolean ttsReady = false;
    private boolean engineRetried = false;
    private String pendingText = null;
    private float pendingRate = 0.72f;
    private float pendingPitch = 1.15f;

    private final OkHttpClient http = new OkHttpClient.Builder()
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build();
    private WebSocket ws;
    private MediaPlayer player;

    // 语音缓存：重复点按秒读
    private static final int CACHE_MAX = 40;
    private final LinkedHashMap<String, File> cache = new LinkedHashMap<String, File>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, File> eldest) {
            if (size() > CACHE_MAX) {
                eldest.getValue().delete();
                return true;
            }
            return false;
        }
    };

    public TtsBridge(Context ctx) {
        this.ctx = ctx;
        tts = new TextToSpeech(ctx, this, "com.google.android.tts");
    }

    /* ---------- 系统 TTS ---------- */

    @Override
    public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS) {
            setupLanguage();
        } else if (!engineRetried) {
            engineRetried = true;
            try {
                tts.shutdown();
            } catch (Exception ignored) {}
            tts = new TextToSpeech(ctx, this);
        }
    }

    private void setupLanguage() {
        int r = TextToSpeech.LANG_MISSING_DATA;
        for (Locale loc : new Locale[]{Locale.CHINA, Locale.SIMPLIFIED_CHINESE, Locale.TRADITIONAL_CHINESE}) {
            r = tts.setLanguage(loc);
            if (r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED) break;
        }
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
            Set<Voice> vs = tts.getVoices();
            for (Voice v : vs) {
                if (v.getLocale() != null && v.getLocale().getLanguage().startsWith("zh")) {
                    tts.setVoice(v);
                    break;
                }
            }
        }
        ttsReady = true; // 引擎初始化成功；在线语音为主要通道
        try {
            tts.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
        } catch (Exception ignored) {}
        if (pendingText != null) {
            String t = pendingText;
            pendingText = null;
            speakSystem(t, pendingRate, pendingPitch);
        }
    }

    private void speakSystem(String text, float rate, float pitch) {
        if (!ttsReady) return;
        tts.setSpeechRate(rate);
        tts.setPitch(pitch);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "hanzi-park");
    }

    /* ---------- JS 接口 ---------- */

    private String cacheKey(String text, float rate) {
        int pct = Math.max(-50, Math.min(50, Math.round((rate - 1f) * 100f)));
        return text + "|" + pct;
    }

    @JavascriptInterface
    public void speak(String text, float rate, float pitch) {
        if (text == null || text.isEmpty()) return;
        final int gen = generation.incrementAndGet();
        stopPlayer();
        if (ttsReady) tts.stop();
        final float r = rate > 0 ? rate : 0.72f;
        final float p = pitch > 0 ? pitch : 1.15f;
        // 命中缓存：立即播放，无延迟
        final String key = cacheKey(text, r);
        synchronized (cache) {
            File cached = cache.get(key);
            if (cached != null && cached.exists()) {
                playFile(cached, gen, false);
                return;
            }
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                byte[] audio = synthesize(text, r, gen);
                if (audio != null && audio.length > 500) {
                    File f = new File(ctx.getCacheDir(), "hz_tts_" + System.currentTimeMillis() + ".mp3");
                    try {
                        FileOutputStream fos = new FileOutputStream(f);
                        fos.write(audio);
                        fos.flush();
                        fos.close();
                        synchronized (cache) {
                            cache.put(key, f);
                        }
                        main.post(new Runnable() {
                            @Override
                            public void run() { playFile(f, gen, true); }
                        });
                        return;
                    } catch (Exception e) {
                        f.delete();
                    }
                }
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        if (gen != generation.get()) return;
                        speakSystem(text, r, p);
                    }
                });
            }
        }).start();
    }

    @JavascriptInterface
    public void warm(String text, float rate) {
        if (text == null || text.isEmpty()) return;
        final float r = rate > 0 ? rate : 0.72f;
        final String key = cacheKey(text, r);
        synchronized (cache) {
            if (cache.containsKey(key)) return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                byte[] audio = synthesize(text, r, -1);
                if (audio != null && audio.length > 500) {
                    File f = new File(ctx.getCacheDir(), "hz_tts_" + System.currentTimeMillis() + ".mp3");
                    try {
                        FileOutputStream fos = new FileOutputStream(f);
                        fos.write(audio);
                        fos.flush();
                        fos.close();
                        synchronized (cache) {
                            cache.put(key, f);
                        }
                    } catch (Exception e) {
                        f.delete();
                    }
                }
            }
        }).start();
    }

    /** 播放打包在 assets/audio/ 里的预合成语音（零延迟） */
    @JavascriptInterface
    public void playBundled(String name) {
        if (name == null || name.isEmpty()) return;
        final int gen = generation.incrementAndGet();
        stopPlayer();
        if (ttsReady) tts.stop();
        try {
            android.content.res.AssetFileDescriptor afd = ctx.getAssets().openFd("audio/" + name);
            final MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
            mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            mp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override
                public void onCompletion(MediaPlayer m) {
                    m.release();
                    if (player == m) player = null;
                }
            });
            mp.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override
                public boolean onError(MediaPlayer m, int what, int extra) {
                    m.release();
                    if (player == m) player = null;
                    return true;
                }
            });
            mp.prepare();
            mp.start();
            player = mp;
        } catch (Exception e) {
            throw new RuntimeException("bundled-audio-missing");
        }
    }

    @JavascriptInterface
    public void stop() {
        generation.incrementAndGet();
        stopPlayer();
        if (ttsReady) tts.stop();
        pendingText = null;
    }

    @JavascriptInterface
    public boolean ready() {
        return ttsReady;
    }

    public void shutdown() {
        generation.incrementAndGet();
        stopPlayer();
        if (tts != null) {
            try { tts.stop(); } catch (Exception ignored) {}
            try { tts.shutdown(); } catch (Exception ignored) {}
        }
        if (ws != null) {
            try { ws.close(1000, null); } catch (Exception ignored) {}
        }
    }

    /* ---------- Edge 神经网络语音 ---------- */

    private static String dateStr() {
        SimpleDateFormat f = new SimpleDateFormat("EEE MMM dd yyyy HH:mm:ss 'GMT+0000 (Coordinated Universal Time)'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("GMT"));
        return f.format(new Date());
    }

    private static String secMsGec() {
        try {
            long winEpoch = 11644473600L;
            long ticks = System.currentTimeMillis() / 1000L + winEpoch;
            ticks -= ticks % 300L;
            ticks *= 10000000L;
            String s = ticks + TRUSTED_TOKEN;
            byte[] h = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.US_ASCII));
            StringBuilder sb = new StringBuilder();
            for (byte b : h) sb.append(String.format("%02X", b));
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private static String esc(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private byte[] synthesize(String text, float rate, final int gen) {
        try {
            String gec = secMsGec();
            if (gec.isEmpty()) return null;
            String url = WSS_BASE + "&ConnectionId=" + UUID.randomUUID().toString().replace("-", "")
                    + "&Sec-MS-GEC=" + gec + "&Sec-MS-GEC-Version=" + GEC_VERSION;
            Request req = new Request.Builder().url(url)
                    .header("Pragma", "no-cache")
                    .header("Cache-Control", "no-cache")
                    .header("Origin", "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold")
                    .header("User-Agent", UA)
                    .header("Accept-Encoding", "gzip, deflate, br, zstd")
                    .header("Accept-Language", "en-US,en;q=0.9")
                    .build();

            final CountDownLatch done = new CountDownLatch(1);
            final ByteArrayOutputStream audio = new ByteArrayOutputStream();
            final boolean[] failed = {false};

            WebSocketListener listener = new WebSocketListener() {
                @Override
                public void onMessage(WebSocket webSocket, String text) {
                    if (text.contains("Path:turn.end")) done.countDown();
                }

                @Override
                public void onMessage(WebSocket webSocket, ByteString bytes) {
                    byte[] b = bytes.toByteArray();
                    if (b.length > 2) {
                        int headerLen = ((b[0] & 0xFF) << 8) | (b[1] & 0xFF);
                        if (2 + headerLen < b.length) {
                            synchronized (audio) {
                                audio.write(b, 2 + headerLen, b.length - 2 - headerLen);
                            }
                        }
                    }
                }

                @Override
                public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                    failed[0] = true;
                    done.countDown();
                }
            };
            ws = http.newWebSocket(req, listener);
            ws.send("X-Timestamp:" + dateStr() + "\r\n"
                    + "Content-Type:application/json; charset=utf-8\r\n"
                    + "Path:speech.config\r\n\r\n"
                    + "{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"true\"},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}");
            int pct = Math.max(-50, Math.min(50, Math.round((rate - 1f) * 100f)));
            String ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>"
                    + "<voice name='" + VOICE + "'>"
                    + "<prosody pitch='+0Hz' rate='" + pct + "%' volume='+0%'>"
                    + esc(text)
                    + "</prosody></voice></speak>";
            ws.send("X-RequestId:" + UUID.randomUUID().toString().replace("-", "") + "\r\n"
                    + "Content-Type:application/ssml+xml\r\n"
                    + "X-Timestamp:" + dateStr() + "Z\r\n"
                    + "Path:ssml\r\n\r\n" + ssml);

            if (!done.await(12, TimeUnit.SECONDS) || failed[0]) {
                try { ws.close(1000, null); } catch (Exception ignored) {}
                return null;
            }
            try { ws.close(1000, null); } catch (Exception ignored) {}
            synchronized (audio) {
                byte[] out = audio.toByteArray();
                return out.length > 500 ? out : null;
            }
        } catch (Exception e) {
            return null;
        }
    }

    /* ---------- 播放器 ---------- */

    private void playFile(final File f, final int gen, final boolean deletable) {
        if (gen != generation.get()) {
            if (deletable) f.delete();
            return;
        }
        stopPlayer();
        try {
            final MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
            mp.setDataSource(f.getAbsolutePath());
            mp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override
                public void onCompletion(MediaPlayer m) {
                    if (deletable) f.delete();
                    m.release();
                    if (player == m) player = null;
                }
            });
            mp.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override
                public boolean onError(MediaPlayer m, int what, int extra) {
                    if (deletable) f.delete();
                    m.release();
                    if (player == m) player = null;
                    return true;
                }
            });
            mp.prepare();
            mp.start();
            player = mp;
        } catch (Exception e) {
            f.delete();
        }
    }

    private void stopPlayer() {
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) {}
            try { player.release(); } catch (Exception ignored) {}
            player = null;
        }
    }
}
