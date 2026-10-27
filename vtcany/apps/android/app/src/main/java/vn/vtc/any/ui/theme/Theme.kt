package vn.vtc.any.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Bảng màu theo web VTC ANY: nền navy #091728, nhấn emerald.
val VtcNavy = Color(0xFF091728)
val VtcNavyLight = Color(0xFF10253D)
val VtcEmerald = Color(0xFF10B981)
val VtcAmber = Color(0xFFFBBF24)
val VtcRed = Color(0xFFEF4444)

private val DarkColors = darkColorScheme(
    primary = VtcEmerald,
    onPrimary = Color.White,
    secondary = VtcAmber,
    background = VtcNavy,
    onBackground = Color.White,
    surface = VtcNavyLight,
    onSurface = Color.White,
    surfaceVariant = Color(0xFF1A3350),
    onSurfaceVariant = Color(0xFFB8C6D8),
    error = VtcRed,
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF059669),
    onPrimary = Color.White,
    secondary = Color(0xFFD97706),
    background = Color(0xFFF6F8FB),
    onBackground = Color(0xFF0B1B2B),
    surface = Color.White,
    onSurface = Color(0xFF0B1B2B),
    error = VtcRed,
)

@Composable
fun VtcAnyTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
