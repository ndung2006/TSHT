package vn.vtc.any.ui.components

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import vn.vtc.any.data.api.Banner
import vn.vtc.any.data.api.CatalogItem
import vn.vtc.any.data.repo.DeepTarget
import vn.vtc.any.data.repo.deepTarget

// ---------- Trạng thái chung ----------
@Composable
fun LoadingBox(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}

@Composable
fun ErrorBox(message: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))
        Button(onClick = onRetry) { Text("Thử lại") }
    }
}

@Composable
fun EmptyBox(message: String, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ---------- Thẻ nội dung (poster 3:4 như web) ----------
@Composable
fun ContentCard(
    item: CatalogItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .width(120.dp)
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick),
    ) {
        AsyncImage(
            model = item.poster?.ifBlank { null } ?: item.thumbnail?.ifBlank { null },
            contentDescription = item.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(3f / 4f)
                .clip(RoundedCornerShape(10.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        )
        Spacer(Modifier.height(6.dp))
        Text(
            item.title,
            style = MaterialTheme.typography.bodySmall,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 2.dp),
        )
    }
}

// ---------- Rail ngang ----------
@Composable
fun RailSection(
    title: String,
    items: List<CatalogItem>,
    onItemClick: (CatalogItem) -> Unit,
    onSeeAll: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    if (items.isEmpty()) return
    Column(modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            if (onSeeAll != null) {
                TextButton(onClick = onSeeAll) { Text("Xem thêm") }
            }
        }
        Spacer(Modifier.height(8.dp))
        // Tự cuộn qua lại (ping-pong) cho sinh động; dừng khi người dùng đang vuốt.
        val listState = rememberLazyListState()
        LaunchedEffect(items.size) {
            var index = 0
            var dir = 1
            while (true) {
                delay(3000)
                if (listState.isScrollInProgress) continue
                val total = listState.layoutInfo.totalItemsCount
                if (total <= 1) continue
                index += dir
                if (index >= total - 1) { index = total - 1; dir = -1 }
                if (index <= 0) { index = 0; dir = 1 }
                runCatching { listState.animateScrollToItem(index) }
            }
        }
        LazyRow(
            state = listState,
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(items, key = { it.publicId.ifBlank { it.id } }) { item ->
                ContentCard(item = item, onClick = { onItemClick(item) })
            }
        }
    }
}

// ---------- Banner carousel (tự xoay) ----------
@Composable
fun BannerCarousel(
    banners: List<Banner>,
    onBannerClick: (DeepTarget) -> Unit,
    modifier: Modifier = Modifier,
    autoRotateMs: Long = 5000,
) {
    if (banners.isEmpty()) return
    val pagerState = rememberPagerState(pageCount = { banners.size })
    // Tự xoay luân phiên: tới cuối thì quay ngược lại (ping-pong).
    var bannerDir by remember { mutableStateOf(1) }
    LaunchedEffect(pagerState.currentPage, banners.size) {
        if (banners.size > 1) {
            delay(autoRotateMs)
            val cur = pagerState.currentPage
            var next = cur + bannerDir
            if (next >= banners.size) { next = banners.size - 2; bannerDir = -1 }
            if (next < 0) { next = 1; bannerDir = 1 }
            if (next in 0 until banners.size) {
                runCatching { pagerState.animateScrollToPage(next) }
            }
        }
    }
    Box(modifier.fillMaxWidth()) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxWidth().aspectRatio(16f / 8f),
        ) { page ->
            val banner = banners[page]
            val target = banner.deepTarget()
            Box(
                Modifier.fillMaxSize().clickable(
                    enabled = target != DeepTarget.None,
                    onClick = { onBannerClick(target) },
                ),
            ) {
                AsyncImage(
                    model = banner.imageUrl,
                    contentDescription = banner.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                )
                // Gradient + tiêu đề + nút xem
                Box(
                    Modifier.fillMaxSize().background(
                        Brush.verticalGradient(
                            listOf(Color.Transparent, Color.Black.copy(alpha = 0.72f)),
                            startY = 300f,
                        ),
                    ),
                )
                Row(
                    Modifier.align(Alignment.BottomStart).padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        if (banner.title.isNotBlank()) {
                            Text(
                                banner.title,
                                style = MaterialTheme.typography.titleLarge,
                                color = Color.White,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    if (target != DeepTarget.None) {
                        Box(
                            Modifier.size(52.dp).clip(CircleShape)
                                .background(MaterialTheme.colorScheme.primary),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Filled.PlayArrow, "Xem ngay",
                                tint = Color.White, modifier = Modifier.size(30.dp),
                            )
                        }
                    }
                }
            }
        }
        // Chấm chỉ trang
        if (banners.size > 1) {
            Row(
                Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                repeat(banners.size) { i ->
                    Box(
                        Modifier.size(if (i == pagerState.currentPage) 18.dp else 6.dp, 6.dp)
                            .clip(CircleShape)
                            .background(
                                if (i == pagerState.currentPage) Color.White
                                else Color.White.copy(alpha = 0.45f),
                            ),
                    )
                }
            }
        }
    }
}

// ---------- Logo kênh (có fallback chữ cái khi thiếu/lỗi) ----------
@Composable
fun ChannelLogo(
    logoUrl: String?,
    name: String,
    modifier: Modifier = Modifier,
) {
    var loadFailed by remember(logoUrl) { mutableStateOf(false) }
    if (logoUrl.isNullOrBlank() || loadFailed) {
        Box(
            modifier = modifier
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = name.firstOrNull()?.uppercase() ?: "?",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
    } else {
        AsyncImage(
            model = logoUrl,
            contentDescription = name,
            contentScale = ContentScale.Fit,
            modifier = modifier.clip(CircleShape),
            onError = { loadFailed = true },
        )
    }
}
