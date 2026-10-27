package vn.vtc.any.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import vn.vtc.any.VtcAnyApp
import vn.vtc.any.data.api.ApiClient
import vn.vtc.any.data.api.CatalogItem
import vn.vtc.any.ui.components.ErrorBox
import vn.vtc.any.ui.components.LoadingBox

/**
 * Chi tiết Video / Short: ảnh bìa + tiêu đề + mô tả + nút xem.
 * kind = "video" | "short" (dùng cho /vod/{kind}/{id}/play).
 */
@Composable
fun ContentDetailScreen(
    publicId: String,
    kind: String,
    onPlay: (item: CatalogItem) -> Unit,
) {
    val context = LocalContext.current
    val app = context.applicationContext as VtcAnyApp
    var item by remember { mutableStateOf<CatalogItem?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var retryKey by remember { mutableStateOf(0) }

    LaunchedEffect(publicId, retryKey) {
        loading = true
        error = null
        runCatching {
            if (kind == "video") app.api.videoPublic(publicId)
            else app.api.shortPublic(publicId)
        }.onSuccess { item = it; loading = false }
            .onFailure { error = ApiClient.errorMessage(it); loading = false }
    }

    when {
        loading -> LoadingBox()
        error != null -> ErrorBox(error!!, onRetry = { retryKey++ })
        item == null -> return
        else -> {
            val it = item!!
            val isShort = kind == "short"
            Column(Modifier.fillMaxSize()) {
                Box(
                    Modifier.fillMaxWidth()
                        .aspectRatio(if (isShort) 9f / 16f else 16f / 9f),
                ) {
                    AsyncImage(
                        model = it.thumbnail ?: it.poster,
                        contentDescription = it.title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                    Box(
                        Modifier.fillMaxSize().background(
                            Brush.verticalGradient(
                                listOf(Color.Transparent, Color.Black.copy(alpha = 0.6f)),
                                startY = 500f,
                            ),
                        ),
                    )
                    Icon(
                        Icons.Filled.PlayArrow, "Xem",
                        tint = Color.White,
                        modifier = Modifier.align(Alignment.Center)
                            .size(72.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.92f))
                            .padding(14.dp),
                    )
                }
                Column(Modifier.padding(16.dp)) {
                    Text(it.title, style = MaterialTheme.typography.headlineSmall)
                    Spacer(Modifier.height(8.dp))
                    if (!it.description.isNullOrBlank()) {
                        Text(
                            it.description!!,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(16.dp))
                    }
                    Button(
                        onClick = { onPlay(it) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Xem ngay")
                    }
                }
            }
        }
    }
}
