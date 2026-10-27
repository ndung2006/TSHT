package vn.vtc.any.data.api

import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import vn.vtc.any.data.session.SessionManager
import java.util.concurrent.TimeUnit

/** Base URL production. Đổi ở đây khi cần trỏ môi trường khác. */
const val API_BASE_URL = "https://api.vtcrd.top/api/v1/"

private val json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}

/**
 * Gắn "Authorization: Bearer ..." vào mọi request khi đã đăng nhập.
 * Không gắn cho chính endpoint refresh để tránh vòng lặp.
 */
private class AuthInterceptor(private val session: SessionManager) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        if (req.url.encodedPath.endsWith("auth/refresh")) return chain.proceed(req)
        val token = session.peekAccessToken() ?: return chain.proceed(req)
        return chain.proceed(
            req.newBuilder().header("Authorization", "Bearer $token").build(),
        )
    }
}

/**
 * Khi server trả 401: thử refresh token 1 lần (rotation — lưu cả cặp mới),
 * rồi thử lại request gốc. Hết refresh token thì trả 401 về cho caller.
 */
private class RefreshAuthenticator(
    private val session: SessionManager,
    private val plainApi: () -> VtcApi,
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        // Chỉ thử 1 lần cho mỗi request.
        if (response.request.header("X-Retry-With-Refresh") != null) return null
        val refreshToken = runCatching {
            kotlinx.coroutines.runBlocking { session.peekRefreshToken() }
        }.getOrNull() ?: return null

        val newPair = runCatching {
            kotlinx.coroutines.runBlocking { plainApi().refresh(RefreshRequest(refreshToken)) }
        }.getOrNull() ?: return null

        runCatching {
            kotlinx.coroutines.runBlocking { session.saveLogin(newPair) }
        }
        return response.request.newBuilder()
            .header("Authorization", "Bearer ${newPair.accessToken}")
            .header("X-Retry-With-Refresh", "1")
            .build()
    }
}

object ApiClient {

    fun create(session: SessionManager, debug: Boolean = false): VtcApi {
        val logging = HttpLoggingInterceptor().apply {
            level = if (debug) HttpLoggingInterceptor.Level.BASIC
            else HttpLoggingInterceptor.Level.NONE
        }

        // Client "trần" (không interceptor/authenticator) chỉ dùng để refresh token.
        lateinit var plainApi: VtcApi
        val plainClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(logging)
            .build()
        plainApi = Retrofit.Builder()
            .baseUrl(API_BASE_URL)
            .client(plainClient)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(VtcApi::class.java)

        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(AuthInterceptor(session))
            .authenticator(RefreshAuthenticator(session) { plainApi })
            .addInterceptor(logging)
            .build()

        return Retrofit.Builder()
            .baseUrl(API_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(VtcApi::class.java)
    }

    /** Trích message lỗi thân thiện từ envelope {error:{code,message}}. */
    fun errorMessage(t: Throwable): String {
        val retrofit = (t as? retrofit2.HttpException)
        val body = runCatching { retrofit?.response()?.errorBody()?.string() }.getOrNull()
        val msg = runCatching {
            body?.let { json.decodeFromString<ApiErrorEnvelope>(it).error.message }
        }.getOrNull()
        return when {
            !msg.isNullOrBlank() -> msg
            t is java.net.UnknownHostException -> "Không có kết nối mạng"
            t is java.net.SocketTimeoutException -> "Kết nối quá chậm, thử lại"
            retrofit?.code() == 401 -> "Phiên đăng nhập hết hạn"
            retrofit?.code() == 404 -> "Không tìm thấy nội dung"
            else -> "Có lỗi xảy ra, thử lại sau" +
                (if (vn.vtc.any.BuildConfig.DEBUG) "\n[${t::class.simpleName}: ${t.message?.take(200)}]" else "")
        }
    }
}
