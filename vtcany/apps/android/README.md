# VTC ANY — Android App (native Kotlin)

App Android native cho VTC ANY, viết bằng Kotlin + Jetpack Compose, gọi trực tiếp
backend API (`https://api.vtcrd.top/api/v1`), phát HLS bằng Media3 ExoPlayer.

## Tính năng (v1)

- **Trang chủ**: banner CMS (tự xoay), strip kênh truyền hình, rails nội dung, deep-link từ banner.
- **Truyền hình**: xem live 24 kênh, tự xin lại link HLS trước khi hết hạn (exp − 30 phút),
  lịch EPG theo ngày, tự cuộn tới mục LIVE, kênh phát thanh (audio-only).
- **Phim / Video / Short / Giải trí**: banner + rails + danh mục + lưới phân trang.
- **Chi tiết phim**: tập phim theo tab (10 tập/tab), nút phát, yêu thích (cần đăng nhập).
- **Short**: feed cuộn dọc tự phát, chạm để dừng/tiếp tục.
- **Tìm kiếm** (debounce), **đăng nhập** email/SĐT + mật khẩu (tự refresh token),
  **tài khoản** + đăng xuất.
- Telemetry heartbeat trong lúc xem (device_type=android).

## Build APK (debug, cài trực tiếp)

Yêu cầu: JDK 17, Android SDK (platform 34, build-tools 34.0.0).

```bash
cd apps/android
echo "sdk.dir=/path/to/android-sdk" > local.properties
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Bản release đưa lên Play Store cần ký keystore riêng (chưa cấu hình).

## Kiến trúc

```
app/src/main/java/vn/vtc/any/
  MainActivity.kt            # NavHost + bottom bar + deep-link
  VtcAnyApp.kt               # DI thủ công: SessionManager, ApiClient, Repository
  data/api/                  # dto.kt (kotlinx.serialization), VtcApi.kt (Retrofit), ApiClient.kt
  data/session/              # SessionManager (DataStore: token + user)
  data/repo/                 # Repository + parse deep-link banner
  ui/theme/                  # Material3 dark theme (navy #091728)
  ui/components/             # Card, Rail, BannerCarousel, Loading/Error
  ui/player/                 # VideoPlayer (Media3) + VodPlayerScreen
  ui/screens/                # Home, Tv (+EPG), Library, Category, MovieDetail,
                             # ContentDetail, ShortsFeed, Search, Login, Account
  ui/nav/                    # Routes + deep-link helpers
```

Chi tiết API backend: xem [API_REFERENCE.md](API_REFERENCE.md).
