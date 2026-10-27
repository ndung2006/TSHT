package vn.vtc.any.data.session

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import vn.vtc.any.data.api.EndUser
import vn.vtc.any.data.api.LoginResponse

private val Context.sessionStore by preferencesDataStore(name = "vtc_session")

/**
 * Lưu access/refresh token + user vào DataStore.
 * Giữ bản sao in-memory của access token để interceptor đọc không cần blocking.
 */
class SessionManager(private val context: Context) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = Json { ignoreUnknownKeys = true }

    private val _accessToken = MutableStateFlow<String?>(null)
    val accessToken: StateFlow<String?> = _accessToken

    private val _user = MutableStateFlow<EndUser?>(null)
    val user: StateFlow<EndUser?> = _user

    init {
        scope.launch {
            val prefs = context.sessionStore.data.first()
            _accessToken.value = prefs[KEY_ACCESS]
            prefs[KEY_USER]?.let { raw ->
                runCatching { _user.value = json.decodeFromString<EndUser>(raw) }
            }
        }
    }

    /** Đọc nhanh cho OkHttp interceptor (không suspend). */
    fun peekAccessToken(): String? = _accessToken.value

    suspend fun peekRefreshToken(): String? =
        context.sessionStore.data.map { it[KEY_REFRESH] }.first()

    suspend fun saveLogin(resp: LoginResponse) {
        context.sessionStore.edit { p ->
            p[KEY_ACCESS] = resp.accessToken
            p[KEY_REFRESH] = resp.refreshToken
            p[KEY_EXPIRES_AT] = System.currentTimeMillis() + resp.expiresIn * 1000
            p[KEY_USER] = json.encodeToString(resp.user)
        }
        _accessToken.value = resp.accessToken
        _user.value = resp.user
    }

    suspend fun clear() {
        context.sessionStore.edit { it.clear() }
        _accessToken.value = null
        _user.value = null
    }

    fun isLoggedIn(): Boolean = _user.value != null

    companion object {
        private val KEY_ACCESS = stringPreferencesKey("access_token")
        private val KEY_REFRESH = stringPreferencesKey("refresh_token")
        private val KEY_EXPIRES_AT = longPreferencesKey("expires_at")
        private val KEY_USER = stringPreferencesKey("user_json")
    }
}
