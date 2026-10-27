package vn.vtc.any.ui.player

import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.delay
import vn.vtc.any.VtcAnyApp
import vn.vtc.any.data.api.ApiClient
import vn.vtc.any.data.api.HeartbeatRequest
import vn.vtc.any.ui.components.ErrorBox
import vn.vtc.any.ui.components.LoadingBox
import java.util.UUID

/** Tạo ExoPlayer gắn với 1 URL HLS; đổi URL thì set lại media item. */
@Composable
fun rememberVtcPlayer(url: String, autoplay: Boolean = true): ExoPlayer {
    val context = LocalContext.current
    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            playWhenReady = autoplay
        }
    }
    LaunchedEffect(url) {
        if (url.isNotBlank()) {
            player.setMediaItem(MediaItem.fromUri(url))
            player.prepare()
        }
    }
    DisposableEffect(Unit) {
        onDispose { player.release() }
    }
    return player
}

/**
 * Khung phát video dùng chung: PlayerView (Media3) với controller chuẩn
 * (play/pause, tua ±10s, chọn chất lượng ABR, toàn màn hình).
 */
@Composable
fun VideoPlayer(
    url: String,
    modifier: Modifier = Modifier,
    autoplay: Boolean = true,
    useController: Boolean = true,
    onEnded: () -> Unit = {},
    onPosition: (positionMs: Long) -> Unit = {},
) {
    val player = rememberVtcPlayer(url, autoplay)
    val listener = remember {
        object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) onEnded()
            }
        }
    }
    DisposableEffect(player) {
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }
    // Báo vị trí mỗi 5s cho telemetry.
    LaunchedEffect(player) {
        while (true) {
            delay(5_000)
            onPosition(player.currentPosition)
        }
    }
    AndroidView(
        factory = { ctx ->
            PlayerView(ctx).apply {
                this.player = player
                this.useController = useController
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
            }
        },
        modifier = modifier.background(Color.Black),
    )
}

/**
 * Màn hình phát VOD toàn màn hình.
 * kind = episode | video | short, id = internal id (episode_id / catalog id).
 * Hoặc truyền thẳng directUrl (dùng cho episode đã có hls_url ký sẵn).
 */
@Composable
fun VodPlayerScreen(
    title: String,
    contentId: String,
    kind: String? = null,
    id: String? = null,
    directUrl: String? = null,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val app = context.applicationContext as VtcAnyApp
    var hlsUrl by remember { mutableStateOf(directUrl) }
    var error by remember { mutableStateOf<String?>(null) }
    var positionMs by remember { mutableLongStateOf(0L) }
    var retryKey by remember { mutableStateOf(0) }
    val sessionId = remember { UUID.randomUUID().toString() }

    BackHandler(onBack = onBack)

    LaunchedEffect(kind, id, retryKey) {
        if (kind == null || id == null) return@LaunchedEffect
        // directUrl ưu tiên tuyệt đối; nếu null mới resolve qua /vod.
        if (directUrl != null) {
            hlsUrl = directUrl
            return@LaunchedEffect
        }
        error = null
        hlsUrl = null
        runCatching {
            val resp = app.api.vodPlay(kind, id)
            app.repo.absoluteHls(resp.hlsPath)
        }.onSuccess { hlsUrl = it }
            .onFailure { error = ApiClient.errorMessage(it) }
    }

    // Heartbeat 30s/lần trong lúc xem.
    LaunchedEffect(hlsUrl) {
        if (hlsUrl == null) return@LaunchedEffect
        while (true) {
            delay(30_000)
            runCatching {
                app.api.heartbeat(
                    HeartbeatRequest(
                        sessionId = sessionId,
                        contentId = contentId.ifBlank { id.orEmpty() },
                        currentTimeSeconds = positionMs / 1000,
                    ),
                )
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        when {
            error != null -> ErrorBox(
                message = error!!,
                onRetry = { retryKey++ },
                modifier = Modifier.fillMaxSize(),
            )
            hlsUrl == null -> LoadingBox(Modifier.fillMaxSize())
            else -> VideoPlayer(
                url = hlsUrl!!,
                modifier = Modifier.fillMaxSize(),
                onPosition = { positionMs = it },
            )
        }
        // Nút back nổi
        IconButton(
            onClick = onBack,
            modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(8.dp),
        ) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, "Quay lại", tint = Color.White)
        }
        if (title.isNotBlank() && hlsUrl != null) {
            Text(
                title,
                color = Color.White.copy(alpha = 0.85f),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 18.dp),
            )
        }
    }
}
