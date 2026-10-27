package vn.vtc.any.data.repo

import vn.vtc.any.data.api.Banner
import vn.vtc.any.data.api.VtcApi

/** Deep-link đích đến khi bấm banner / rail. */
sealed interface DeepTarget {
    data class Movie(val publicId: String) : DeepTarget
    data class Video(val publicId: String) : DeepTarget
    data class Short(val publicId: String) : DeepTarget
    data class Category(val idOrPublicId: String) : DeepTarget
    data class External(val url: String) : DeepTarget
    data object None : DeepTarget
}

private val PUBLIC_ID_SUFFIX = Regex("-([0-9a-f]{24})$")

/**
 * Parse target_url đã chuẩn hoá từ backend:
 * /phim|video|short|danh-muc/{slug}-{24hex}, URL tuyệt đối, hoặc "".
 */
fun parseDeepTarget(targetUrl: String): DeepTarget {
    if (targetUrl.isBlank()) return DeepTarget.None
    if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
        return DeepTarget.External(targetUrl)
    }
    val path = targetUrl.substringBefore("?").trim()
    val m = PUBLIC_ID_SUFFIX.find(path) ?: return DeepTarget.None
    val publicId = m.groupValues[1]
    return when {
        path.startsWith("/phim/") -> DeepTarget.Movie(publicId)
        path.startsWith("/video/") -> DeepTarget.Video(publicId)
        path.startsWith("/short/") -> DeepTarget.Short(publicId)
        path.startsWith("/danh-muc/") -> DeepTarget.Category(publicId)
        else -> DeepTarget.None
    }
}

fun Banner.deepTarget(): DeepTarget = parseDeepTarget(targetUrl)

class VtcRepository(val api: VtcApi) {

    suspend fun homeBanners() = api.banners(page = "home", platform = "mobile")

    suspend fun homeRails() = api.rails(section = "home", platform = "web")

    suspend fun sectionBanners(section: String) =
        api.banners(page = section, platform = "mobile")

    suspend fun sectionRails(section: String) =
        api.rails(section = section, platform = "web")

    /** Đổi hls_path tương đối thành tuyệt đối khi backend dev trả relative. */
    fun absoluteHls(hlsPath: String): String =
        if (hlsPath.startsWith("http")) hlsPath
        else "https://api.vtcrd.top$hlsPath"
}
