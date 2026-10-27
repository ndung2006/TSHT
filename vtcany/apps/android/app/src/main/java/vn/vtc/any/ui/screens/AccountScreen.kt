package vn.vtc.any.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import vn.vtc.any.VtcAnyApp

/** Tab Tài khoản: thông tin user + đăng xuất. */
@Composable
fun AccountScreen(onGoLogin: () -> Unit) {
    val context = LocalContext.current
    val app = context.applicationContext as VtcAnyApp
    val scope = rememberCoroutineScope()
    val user by app.session.user.collectAsState()

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (user == null) {
            Text("Tài khoản", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(8.dp))
            Text(
                "Đăng nhập để đồng bộ danh sách yêu thích và xem tiếp",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(20.dp))
            Button(onClick = onGoLogin, modifier = Modifier.fillMaxWidth()) {
                Text("Đăng nhập")
            }
        } else {
            val u = user!!
            if (!u.avatar.isNullOrBlank()) {
                AsyncImage(
                    model = u.avatar,
                    contentDescription = u.displayName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(96.dp).clip(CircleShape),
                )
                Spacer(Modifier.height(16.dp))
            }
            Text(
                u.displayName ?: u.email ?: u.phone ?: "Người dùng",
                style = MaterialTheme.typography.headlineSmall,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                listOfNotNull(u.email, u.phone).joinToString(" • "),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(24.dp))
            OutlinedButton(
                onClick = { scope.launch { app.session.clear() } },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Đăng xuất")
            }
        }
    }
}
