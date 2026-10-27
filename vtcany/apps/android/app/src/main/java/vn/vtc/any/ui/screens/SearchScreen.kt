package vn.vtc.any.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import kotlinx.coroutines.delay
import vn.vtc.any.VtcAnyApp
import vn.vtc.any.data.api.ApiClient
import vn.vtc.any.data.api.SearchGroup
import vn.vtc.any.data.api.SearchItem
import vn.vtc.any.ui.components.EmptyBox
import vn.vtc.any.ui.components.ErrorBox
import vn.vtc.any.ui.components.LoadingBox
import vn.vtc.any.ui.components.RailSection
import vn.vtc.any.data.api.CatalogItem

@Composable
fun SearchScreen(
    onOpenMovie: (String) -> Unit,
    onOpenVideo: (String) -> Unit,
    onOpenShort: (String) -> Unit,
) {
    val context = LocalContext.current
    val app = context.applicationContext as VtcAnyApp
    var query by remember { mutableStateOf("") }
    var groups by remember { mutableStateOf<List<SearchGroup>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var searched by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    // Debounce 400ms rồi gọi /search.
    LaunchedEffect(query) {
        if (query.isBlank()) {
            groups = emptyList()
            searched = false
            searching = false
            return@LaunchedEffect
        }
        delay(400)
        searching = true
        error = null
        runCatching { app.api.search(query.trim()) }
            .onSuccess { groups = it.groups; searched = true }
            .onFailure { error = ApiClient.errorMessage(it); searched = true }
        searching = false
    }

    fun openItem(item: SearchItem) {
        when (item.type) {
            "phim" -> onOpenMovie(item.publicId)
            "video" -> onOpenVideo(item.publicId)
            "short" -> onOpenShort(item.publicId)
        }
    }

    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text("Tìm phim, video, short...") },
            leadingIcon = { Icon(Icons.Filled.Search, "Tìm kiếm") },
            trailingIcon = {
                if (query.isNotBlank()) {
                    IconButton(onClick = { query = "" }) {
                        Icon(Icons.Filled.Clear, "Xoá")
                    }
                }
            },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(16.dp),
        )
        when {
            !searched && !searching -> EmptyBox("Nhập từ khoá để tìm kiếm")
            searching && groups.isEmpty() -> LoadingBox(Modifier.weight(1f))
            error != null -> ErrorBox(
                error!!, onRetry = {}, modifier = Modifier.weight(1f),
            )
            groups.isEmpty() -> EmptyBox("Không tìm thấy kết quả cho \"$query\"")
            else -> {
                LazyColumn(
                    Modifier.weight(1f),
                    contentPadding = PaddingValues(bottom = 16.dp),
                ) {
                    items(groups, key = { it.type }) { group ->
                        RailSection(
                            title = group.type,
                            items = group.items.map {
                                CatalogItem(
                                    id = "",
                                    publicId = it.publicId,
                                    slug = it.slug,
                                    title = it.title,
                                    thumbnail = it.thumbnail,
                                )
                            },
                            onItemClick = { item ->
                                group.items.find { it.publicId == item.publicId }
                                    ?.let(::openItem)
                            },
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(0.dp))
    }
}
