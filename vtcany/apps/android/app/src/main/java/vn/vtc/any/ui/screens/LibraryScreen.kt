package vn.vtc.any.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import vn.vtc.any.VtcAnyApp
import vn.vtc.any.data.api.ApiClient
import vn.vtc.any.data.api.Banner
import vn.vtc.any.data.api.CatalogItem
import vn.vtc.any.data.api.Category
import vn.vtc.any.data.api.Rail
import vn.vtc.any.data.repo.DeepTarget
import vn.vtc.any.ui.components.BannerCarousel
import vn.vtc.any.ui.components.ErrorBox
import vn.vtc.any.ui.components.LoadingBox
import vn.vtc.any.ui.components.RailSection

val SECTION_TITLES = mapOf(
    "movies" to "Phim",
    "video" to "Video",
    "short" to "Short",
    "entertainment" to "Giải trí",
)

private val SECTION_CATEGORY_TYPES = mapOf(
    "movies" to "phim",
    "video" to "video",
    "short" to "short",
    // entertainment: không có type riêng -> lấy tất cả
)

private data class LibraryData(
    val banners: List<Banner>,
    val rails: List<Rail>,
    val categories: List<Category>,
)

@Composable
fun LibraryScreen(
    section: String,
    onItemClick: (CatalogItem, String?) -> Unit,
    onOpenCategory: (String) -> Unit,
    onDeepTarget: (DeepTarget) -> Unit,
) {
    val context = LocalContext.current
    val app = context.applicationContext as VtcAnyApp
    var data by remember { mutableStateOf<LibraryData?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var retryKey by remember { mutableStateOf(0) }
    var activeCategory by remember { mutableStateOf<Category?>(null) }

    LaunchedEffect(section, retryKey) {
        loading = true
        error = null
        activeCategory = null
        runCatching {
            val banners = app.repo.sectionBanners(section).data
            var rails = app.repo.sectionRails(section).data
            val categories = app.api
                .categories(SECTION_CATEGORY_TYPES[section])
                .data
            // Fallback: nếu rails CMS rỗng (chưa gắn nội dung), lấy trực tiếp từ catalog.
            if (rails.none { it.items.isNotEmpty() }) {
                val items = when (section) {
                    "movies" -> app.api.movies(limit = 24).data
                    "video" -> app.api.videos(limit = 24).data
                    "short" -> app.api.shorts(limit = 24).data
                    "entertainment" -> app.api.videos(limit = 24).data
                    else -> emptyList()
                }
                if (items.isNotEmpty()) {
                    rails = listOf(
                        Rail(
                            id = "fallback-$section",
                            title = "Mới nhất",
                            contentType = when (section) {
                                "movies" -> "movie"
                                "short" -> "short"
                                else -> "video"
                            },
                            items = items,
                        )
                    )
                }
            }
            LibraryData(banners, rails, categories)
        }.onSuccess { data = it; loading = false }
            .onFailure { error = ApiClient.errorMessage(it); loading = false }
    }

    when {
        loading && data == null -> LoadingBox()
        error != null && data == null -> ErrorBox(error!!, onRetry = { retryKey++ })
        else -> {
            val d = data
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 16.dp),
            ) {
                item {
                    Text(
                        SECTION_TITLES[section] ?: section,
                        style = MaterialTheme.typography.headlineSmall,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    )
                }
                item {
                    BannerCarousel(banners = d?.banners.orEmpty(), onBannerClick = onDeepTarget)
                }
                if (!d?.categories.isNullOrEmpty()) {
                    item {
                        Column {
                            Spacer(Modifier.height(4.dp))
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                item {
                                    FilterChip(
                                        selected = activeCategory == null,
                                        onClick = { activeCategory = null },
                                        label = { Text("Tất cả") },
                                    )
                                }
                                items(d!!.categories, key = { it.id }) { cat ->
                                    FilterChip(
                                        selected = activeCategory?.id == cat.id,
                                        onClick = {
                                            activeCategory =
                                                if (activeCategory?.id == cat.id) null else cat
                                        },
                                        label = { Text(cat.name) },
                                    )
                                }
                            }
                        }
                    }
                }
                val cat = activeCategory
                if (cat != null) {
                    // Lọc rails theo danh mục đang chọn; nếu không có thì mở trang danh mục.
                    item {
                        androidx.compose.material3.Button(
                            onClick = { onOpenCategory(cat.publicId.ifBlank { cat.id }) },
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        ) {
                            Text("Xem tất cả \"${cat.name}\"")
                        }
                    }
                }
                val rails = d?.rails.orEmpty()
                    .filter { r ->
                        cat == null ||
                            r.category?.id == cat.id ||
                            r.category?.publicId == cat.publicId
                    }
                items(rails, key = { it.id }) { rail ->
                    RailSection(
                        title = rail.title,
                        items = rail.items,
                        onItemClick = { onItemClick(it, rail.contentType) },
                        onSeeAll = rail.category?.let { c ->
                            { onOpenCategory(c.publicId.ifBlank { c.id }) }
                        },
                    )
                }
            }
        }
    }
}
