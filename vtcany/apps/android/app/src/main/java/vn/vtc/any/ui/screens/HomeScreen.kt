package vn.vtc.any.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import vn.vtc.any.VtcAnyApp
import vn.vtc.any.data.api.ApiClient
import vn.vtc.any.data.api.Banner
import vn.vtc.any.data.api.CatalogItem
import vn.vtc.any.data.api.Channel
import vn.vtc.any.data.api.Rail
import vn.vtc.any.data.repo.DeepTarget
import vn.vtc.any.ui.components.BannerCarousel
import vn.vtc.any.ui.components.ChannelLogo
import vn.vtc.any.ui.components.EmptyBox
import vn.vtc.any.ui.components.ErrorBox
import vn.vtc.any.ui.components.LoadingBox
import vn.vtc.any.ui.components.RailSection

private data class HomeData(
    val banners: List<Banner>,
    val channels: List<Channel>,
    val rails: List<Rail>,
)

@Composable
fun HomeScreen(
    onOpenChannel: (Channel) -> Unit,
    onOpenMovie: (CatalogItem) -> Unit,
    onOpenVideo: (CatalogItem) -> Unit,
    onOpenShort: (CatalogItem) -> Unit,
    onOpenCategory: (String) -> Unit,
    onOpenLibrary: (section: String) -> Unit,
    onDeepTarget: (DeepTarget) -> Unit,
) {
    val context = LocalContext.current
    val app = context.applicationContext as VtcAnyApp
    var data by remember { mutableStateOf<HomeData?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var retryKey by remember { mutableStateOf(0) }

    LaunchedEffect(retryKey) {
        loading = true
        error = null
        runCatching {
            val banners = app.repo.homeBanners().data
            val rails = app.repo.homeRails().data
            val channels = app.api.channels().groups.flatMap { it.channels }
            HomeData(banners, channels, rails)
        }.onSuccess { data = it; loading = false }
            .onFailure { error = ApiClient.errorMessage(it); loading = false }
    }

    when {
        loading && data == null -> LoadingBox()
        error != null && data == null -> ErrorBox(error!!, onRetry = { retryKey++ })
        else -> HomeContent(
            data = data,
            onOpenChannel = onOpenChannel,
            onItemClick = { item, contentType ->
                when (contentType) {
                    "movie" -> onOpenMovie(item)
                    "video" -> onOpenVideo(item)
                    "short" -> onOpenShort(item)
                    else -> onOpenMovie(item)
                }
            },
            onOpenCategory = onOpenCategory,
            onOpenLibrary = onOpenLibrary,
            onDeepTarget = onDeepTarget,
        )
    }
}

@Composable
private fun HomeContent(
    data: HomeData?,
    onOpenChannel: (Channel) -> Unit,
    onItemClick: (CatalogItem, String?) -> Unit,
    onOpenCategory: (String) -> Unit,
    onOpenLibrary: (section: String) -> Unit,
    onDeepTarget: (DeepTarget) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 16.dp),
    ) {
        item {
            BannerCarousel(
                banners = data?.banners.orEmpty(),
                onBannerClick = onDeepTarget,
            )
        }
        if (!data?.channels.isNullOrEmpty()) {
            item {
                Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                    Text(
                        "Kênh truyền hình",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                    Spacer(Modifier.height(8.dp))
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(data!!.channels, key = { it.publicId }) { ch ->
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier.width(72.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .clickable { onOpenChannel(ch) }
                                    .padding(4.dp),
                            ) {
                                ChannelLogo(
                                    logoUrl = ch.logo,
                                    name = ch.name,
                                    modifier = Modifier.size(56.dp),
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    ch.name,
                                    style = MaterialTheme.typography.bodySmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        }
                    }
                }
            }
        }
        val rails = data?.rails.orEmpty()
        items(rails, key = { it.id }) { rail ->
            // Rail kênh TV đã có strip riêng ở trên.
            if (rail.contentType == "tv") return@items
            RailSection(
                title = rail.title,
                items = rail.items,
                onItemClick = { onItemClick(it, rail.contentType) },
                onSeeAll = rail.category?.let { cat ->
                    { onOpenCategory(cat.publicId.ifBlank { cat.id }) }
                },
            )
        }
        // Lối vào các thư viện Video / Giải trí
        item {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item {
                    androidx.compose.material3.AssistChip(
                        onClick = { onOpenLibrary("video") },
                        label = { Text("Video") },
                    )
                }
                item {
                    androidx.compose.material3.AssistChip(
                        onClick = { onOpenLibrary("entertainment") },
                        label = { Text("Giải trí") },
                    )
                }
            }
        }
        if (data == null || (data.banners.isEmpty() && data.rails.isEmpty())) {
            item { EmptyBox("Chưa có nội dung") }
        }
    }
}

// Nút "Xem tất cả kênh" — tái sử dụng strip kênh ở màn hình khác nếu cần.
@Composable
fun ChannelStrip(
    channels: List<Channel>,
    onOpenChannel: (Channel) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(channels, key = { it.publicId }) { ch ->
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.width(64.dp)
                    .clickable { onOpenChannel(ch) },
            ) {
                ChannelLogo(
                    logoUrl = ch.logo,
                    name = ch.name,
                    modifier = Modifier.size(52.dp),
                )
                Text(
                    ch.name,
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
