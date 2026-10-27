package vn.vtc.any.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.ui.PlayerView
import vn.vtc.any.VtcAnyApp
import vn.vtc.any.data.api.ApiClient
import vn.vtc.any.data.api.CatalogItem
import vn.vtc.any.ui.components.ErrorBox
import vn.vtc.any.ui.components.LoadingBox

/**
 * Feed Short dạng cuộn dọc (giống TikTok/Reels): mỗi trang 1 video 9:16,
 * tự phát khi tới trang, chạm để tạm dừng/tiếp tục.
 */
@Composable
fun ShortsFeedScreen(onOpenDetail: (CatalogItem) -> Unit) {
    val context = LocalContext.current
    val app = context.applicationContext as VtcAnyApp
    var items by remember { mutableStateOf<List<CatalogItem>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        runCatching { app.api.shorts(page = 1, limit = 24).data }
            .onSuccess { items = it; loading = false }
            .onFailure { error = ApiClient.errorMessage(it); loading = false }
    }

    when {
        loading -> LoadingBox()
        error != null -> ErrorBox(error!!, onRetry = {})
        items.isEmpty() -> ErrorBox("Chưa có short nào.", onRetry = {})
        else -> {
            val pagerState = rememberPagerState(pageCount = { items.size })
            VerticalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                ShortPage(
                    item = items[page],
                    active = page == pagerState.currentPage,
                    onOpenDetail = { onOpenDetail(items[page]) },
                )
            }
        }
    }
}

@Composable
private fun ShortPage(
    item: CatalogItem,
    active: Boolean,
    onOpenDetail: () -> Unit,
) {
    val context = LocalContext.current
    val app = context.applicationContext as VtcAnyApp
    var hlsUrl by remember { mutableStateOf<String?>(null) }
    var paused by remember { mutableStateOf(false) }

    // Resolve link phát 1 lần cho mỗi short.
    LaunchedEffect(item.id) {
        runCatching {
            val resp = app.api.vodPlay("short", item.id)
            app.repo.absoluteHls(resp.hlsPath)
        }.onSuccess { hlsUrl = it }
    }

    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            repeatMode = androidx.media3.common.Player.REPEAT_MODE_ONE
        }
    }
    DisposableEffect(Unit) { onDispose { player.release() } }

    LaunchedEffect(hlsUrl) {
        if (hlsUrl != null) {
            player.setMediaItem(MediaItem.fromUri(hlsUrl!!))
            player.prepare()
        }
    }
    // Chỉ phát trang đang hiển thị.
    LaunchedEffect(active, paused) {
        player.playWhenReady = active && !paused
    }

    Box(
        Modifier.fillMaxSize().background(Color.Black)
            .clickable { paused = !paused },
    ) {
        if (hlsUrl == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color.White)
            }
        } else {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        this.player = player
                        useController = false
                        layoutParams = android.view.ViewGroup.LayoutParams(
                            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                        )
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
        }
        if (paused && hlsUrl != null) {
            Text(
                "❚❚",
                color = Color.White.copy(alpha = 0.85f),
                style = MaterialTheme.typography.displayMedium,
                modifier = Modifier.align(Alignment.Center),
            )
        }
        // Tiêu đề + nút chi tiết
        Column(
            Modifier.align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Transparent, Color.Black.copy(alpha = 0.75f)),
                    ),
                )
                .padding(16.dp),
        ) {
            Text(
                item.title,
                color = Color.White,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clickable(onClick = onOpenDetail),
            )
            Spacer(Modifier.height(4.dp))
            if (!item.description.isNullOrBlank()) {
                Text(
                    item.description!!,
                    color = Color.White.copy(alpha = 0.75f),
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
