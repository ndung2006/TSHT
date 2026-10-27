package vn.vtc.any.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import vn.vtc.any.VtcAnyApp
import vn.vtc.any.data.api.ApiClient
import vn.vtc.any.data.api.Episode
import vn.vtc.any.data.api.MovieDetailResponse
import vn.vtc.any.data.api.RelatedVideo
import vn.vtc.any.ui.components.ErrorBox
import vn.vtc.any.ui.components.LoadingBox
import vn.vtc.any.ui.components.RailSection
import vn.vtc.any.data.api.CatalogItem

@Composable
fun MovieDetailScreen(
    publicId: String,
    onPlayEpisode: (episode: Episode, movieTitle: String) -> Unit,
    onOpenRelated: (RelatedVideo) -> Unit,
) {
    val context = LocalContext.current
    val app = context.applicationContext as VtcAnyApp
    val scope = rememberCoroutineScope()
    val user by app.session.user.collectAsState()

    var detail by remember { mutableStateOf<MovieDetailResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var activeTab by remember { mutableStateOf(0) }
    var favorited by remember { mutableStateOf(false) }
    var retryKey by remember { mutableStateOf(0) }

    LaunchedEffect(publicId, retryKey) {
        loading = true
        error = null
        runCatching { app.api.movieDetail(publicId) }
            .onSuccess {
                detail = it
                favorited = it.videoInfo.isFavorited
                loading = false
            }
            .onFailure { error = ApiClient.errorMessage(it); loading = false }
    }

    when {
        loading -> LoadingBox()
        error != null -> ErrorBox(error!!, onRetry = { retryKey++ })
        detail == null -> return
        else -> {
            val info = detail!!.videoInfo
            val episodes = detail!!.episodes
            // Chia tập theo tab (mỗi tab 10 tập, khớp backend).
            val tabCount = maxOf(1, (episodes.size + 9) / 10)
            val shownTabs = info.tabs.ifEmpty {
                (0 until tabCount).map { i ->
                    val from = i * 10 + 1
                    val to = minOf((i + 1) * 10, episodes.size)
                    if (to >= episodes.size) "Tập $from - Tập cuối" else "Tập $from - Tập $to"
                }
            }
            val visibleEpisodes = episodes.drop(activeTab * 10).take(10)

            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 24.dp),
            ) {
                // Backdrop
                item {
                    Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f)) {
                        AsyncImage(
                            model = info.backdrop ?: info.poster,
                            contentDescription = info.title,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                        Box(
                            Modifier.fillMaxSize().background(
                                Brush.verticalGradient(
                                    listOf(
                                        Color.Transparent,
                                        MaterialTheme.colorScheme.background,
                                    ),
                                    startY = 400f,
                                ),
                            ),
                        )
                        // Nút phát tập đầu
                        val firstPlayable = episodes.firstOrNull { it.hlsUrl.isNotBlank() }
                        if (firstPlayable != null) {
                            IconButton(
                                onClick = { onPlayEpisode(firstPlayable, info.title) },
                                modifier = Modifier.align(Alignment.Center)
                                    .size(72.dp)
                                    .clip(androidx.compose.foundation.shape.CircleShape)
                                    .background(MaterialTheme.colorScheme.primary),
                            ) {
                                Icon(
                                    Icons.Filled.PlayArrow, "Xem ngay",
                                    tint = Color.White, modifier = Modifier.size(40.dp),
                                )
                            }
                        }
                    }
                }
                // Tiêu đề + meta + yêu thích
                item {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(info.title, style = MaterialTheme.typography.headlineSmall)
                            Spacer(Modifier.height(4.dp))
                            val meta = listOfNotNull(
                                info.releaseYear?.toString(),
                                info.totalEpisodes,
                            ).joinToString(" • ")
                            if (meta.isNotBlank()) {
                                Text(
                                    meta,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        if (user != null) {
                            IconButton(onClick = {
                                scope.launch {
                                    runCatching { app.api.toggleFavorite(publicId) }
                                        .onSuccess { favorited = it.isFavorited }
                                }
                            }) {
                                Icon(
                                    if (favorited) Icons.Filled.Favorite
                                    else Icons.Filled.FavoriteBorder,
                                    "Yêu thích",
                                    tint = if (favorited) MaterialTheme.colorScheme.error
                                    else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
                if (!info.description.isNullOrBlank()) {
                    item {
                        Text(
                            info.description!!,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                    }
                }
                // Tabs tập phim
                if (episodes.isNotEmpty()) {
                    item {
                        Text(
                            "Danh sách tập",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                    }
                    if (shownTabs.size > 1) {
                        item {
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                items(shownTabs.size) { i ->
                                    FilterChip(
                                        selected = activeTab == i,
                                        onClick = { activeTab = i },
                                        label = { Text(shownTabs[i]) },
                                    )
                                }
                            }
                        }
                    }
                    items(visibleEpisodes, key = { it.episodeId }) { ep ->
                        EpisodeRow(
                            episode = ep,
                            onClick = { onPlayEpisode(ep, info.title) },
                        )
                    }
                }
                // Liên quan
                if (detail!!.relatedVideos.isNotEmpty()) {
                    item {
                        RailSection(
                            title = "Có thể bạn thích",
                            items = detail!!.relatedVideos.map {
                                CatalogItem(
                                    id = it.id,
                                    publicId = it.publicId,
                                    slug = it.slug,
                                    title = it.title,
                                    thumbnail = it.thumbnail,
                                )
                            },
                            onItemClick = { item ->
                                detail!!.relatedVideos
                                    .find { it.publicId == item.publicId }
                                    ?.let(onOpenRelated)
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EpisodeRow(episode: Episode, onClick: () -> Unit) {
    val playable = episode.hlsUrl.isNotBlank()
    Row(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable(enabled = playable, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .alpha(if (playable) 1f else 0.45f),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.width(120.dp).aspectRatio(16f / 9f)
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            AsyncImage(
                model = episode.thumbnail,
                contentDescription = episode.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            if (playable) {
                Icon(
                    Icons.Filled.PlayArrow, null,
                    tint = Color.White,
                    modifier = Modifier.size(32.dp)
                        .clip(androidx.compose.foundation.shape.CircleShape)
                        .background(Color.Black.copy(alpha = 0.55f))
                        .padding(4.dp),
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                episode.title.ifBlank { "Tập ${episode.episodeNumber}" },
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!episode.duration.isNullOrBlank()) {
                Text(
                    episode.duration!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (!playable) {
                Text(
                    "Chưa có video",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}
