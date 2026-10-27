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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import vn.vtc.any.VtcAnyApp
import vn.vtc.any.data.api.ApiClient
import vn.vtc.any.data.api.CatalogItem
import vn.vtc.any.data.api.CategoryDetail
import vn.vtc.any.ui.components.ErrorBox
import vn.vtc.any.ui.components.LoadingBox

/** Lưới nội dung của 1 danh mục, có nút "Tải thêm". */
@Composable
fun CategoryScreen(
    id: String,
    onItemClick: (CatalogItem) -> Unit,
) {
    val context = LocalContext.current
    val app = context.applicationContext as VtcAnyApp
    val scope = rememberCoroutineScope()

    var detail by remember { mutableStateOf<CategoryDetail?>(null) }
    val items = remember { mutableStateListOf<CatalogItem>() }
    var page by remember { mutableStateOf(1) }
    var hasMore by remember { mutableStateOf(true) }
    var loading by remember { mutableStateOf(true) }
    var loadingMore by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun loadPage(p: Int) {
        scope.launch {
            if (p == 1) loading = true else loadingMore = true
            error = null
            runCatching { app.api.categoryDetail(id, page = p, limit = 24) }
                .onSuccess { resp ->
                    detail = resp.data
                    if (p == 1) items.clear()
                    items.addAll(resp.data.items)
                    // Hết khi trang trả ít hơn limit.
                    hasMore = resp.data.items.size >= 24
                    page = p
                }
                .onFailure { error = ApiClient.errorMessage(it) }
            loading = false
            loadingMore = false
        }
    }

    LaunchedEffect(id) {
        items.clear()
        page = 1
        hasMore = true
        loadPage(1)
    }

    Column(Modifier.fillMaxSize()) {
        Text(
            detail?.name ?: "",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        )
        when {
            loading -> LoadingBox(Modifier.weight(1f))
            error != null && items.isEmpty() ->
                ErrorBox(error!!, onRetry = { loadPage(1) }, modifier = Modifier.weight(1f))
            else -> {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(items, key = { it.publicId.ifBlank { it.id } }) { item ->
                        Column(
                            Modifier.clip(RoundedCornerShape(10.dp))
                                .clickable { onItemClick(item) },
                        ) {
                            AsyncImage(
                                model = item.poster ?: item.thumbnail,
                                contentDescription = item.title,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxWidth()
                                    .aspectRatio(3f / 4f)
                                    .clip(RoundedCornerShape(10.dp)),
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                item.title,
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    if (hasMore) {
                        item {
                            Column(
                                Modifier.fillMaxWidth().padding(8.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                if (loadingMore) CircularProgressIndicator()
                                else Button(onClick = { loadPage(page + 1) }) {
                                    Text("Tải thêm")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
