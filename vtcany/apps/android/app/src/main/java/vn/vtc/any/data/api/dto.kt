package vn.vtc.any.data.api

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * duration từ API có thể là số, chuỗi số, chuỗi rỗng "" hoặc null.
 * Serializer này chịu được tất cả, trả null khi không parse được.
 */
object LenientDoubleSerializer : KSerializer<Double?> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("LenientDouble", PrimitiveKind.DOUBLE)

    override fun deserialize(decoder: Decoder): Double? {
        val jsonDecoder = decoder as? JsonDecoder
            ?: return runCatching { decoder.decodeDouble() }.getOrNull()
        val el = jsonDecoder.decodeJsonElement()
        if (el is JsonNull) return null
        val prim = el.jsonPrimitive
        if (prim.isString) {
            val s = prim.content.trim()
            if (s.isEmpty()) return null
            // Chuỗi dạng "45:00" (mm:ss) -> đổi ra giây.
            if (":" in s) {
                val parts = s.split(":").mapNotNull { it.toDoubleOrNull() }
                if (parts.isNotEmpty()) {
                    return parts.foldIndexed(0.0) { i, acc, v ->
                        acc + v * Math.pow(60.0, (parts.size - 1 - i).toDouble())
                    }
                }
                return null
            }
            return s.toDoubleOrNull()
        }
        return prim.doubleOrNull
    }

    override fun serialize(encoder: Encoder, value: Double?) {
        if (value == null) encoder.encodeNull() else encoder.encodeDouble(value)
    }
}

// ---------- Phân trang ----------
@Serializable
data class PageMeta(
    val page: Int = 1,
    val limit: Int = 24,
    val total: Int = 0,
)

@Serializable
data class PagedResponse<T>(
    val data: List<T> = emptyList(),
    val meta: PageMeta = PageMeta(),
)

// ---------- Catalog ----------
@Serializable
data class CatalogItem(
    val id: String,
    @SerialName("public_id") val publicId: String,
    val slug: String = "",
    val title: String = "",
    val description: String? = null,
    val thumbnail: String? = null,
    val poster: String? = null,
    // duration có thể là số (giây), chuỗi số, chuỗi rỗng "" hoặc null
    @Serializable(with = LenientDoubleSerializer::class)
    val duration: Double? = null,
    @SerialName("ageLimit") val ageLimit: String? = null,
    @SerialName("publishedAt") val publishedAt: String? = null,
    @SerialName("createdAt") val createdAt: String? = null,
)

@Serializable
data class Category(
    val id: String,
    @SerialName("public_id") val publicId: String,
    val name: String = "",
    val slug: String = "",
)

@Serializable
data class CategoriesResponse(val data: List<Category> = emptyList())

@Serializable
data class CategoryDetail(
    val id: String,
    @SerialName("public_id") val publicId: String,
    val name: String = "",
    val slug: String = "",
    val type: String? = null,
    val items: List<CatalogItem> = emptyList(),
)

@Serializable
data class CategoryDetailResponse(val data: CategoryDetail)

// ---------- Rails ----------
@Serializable
data class RailCategory(
    val id: String,
    @SerialName("public_id") val publicId: String,
    val name: String = "",
    val slug: String = "",
)

@Serializable
data class Rail(
    val id: String,
    val title: String = "",
    val section: String? = null,
    val platform: String? = null,
    val contentType: String? = null,
    val style: String? = null,
    val sortOrder: Int = 0,
    val category: RailCategory? = null,
    val items: List<CatalogItem> = emptyList(),
)

@Serializable
data class RailsResponse(val data: List<Rail> = emptyList())

// ---------- Banners ----------
@Serializable
data class Banner(
    val id: String,
    @SerialName("image_url") val imageUrl: String = "",
    val title: String = "",
    val action: String? = null,
    @SerialName("target_id") val targetId: String = "",
    @SerialName("target_url") val targetUrl: String = "",
)

@Serializable
data class BannersResponse(val data: List<Banner> = emptyList())

// ---------- Chi tiết phim ----------
@Serializable
data class VideoInfo(
    @SerialName("public_id") val publicId: String = "",
    val title: String = "",
    @SerialName("release_year") val releaseYear: Int? = null,
    @SerialName("total_episodes") val totalEpisodes: String? = null,
    val description: String? = null,
    val poster: String? = null,
    val backdrop: String? = null,
    @SerialName("is_favorited") val isFavorited: Boolean = false,
    val tabs: List<String> = emptyList(),
)

@Serializable
data class Episode(
    @SerialName("episode_id") val episodeId: String,
    @SerialName("episode_number") val episodeNumber: Int = 0,
    val title: String = "",
    val thumbnail: String? = null,
    // backend trả chuỗi "45:00"
    val duration: String? = null,
    val description: String? = null,
    @SerialName("hls_url") val hlsUrl: String = "",
)

@Serializable
data class RelatedVideo(
    val id: String = "",
    @SerialName("public_id") val publicId: String = "",
    val slug: String = "",
    val title: String = "",
    val thumbnail: String? = null,
    val aspect: String? = null,
    @SerialName("is_premium") val isPremium: Boolean = false,
    val type: String = "",
)

@Serializable
data class MovieDetailResponse(
    @SerialName("video_info") val videoInfo: VideoInfo = VideoInfo(),
    val episodes: List<Episode> = emptyList(),
    @SerialName("related_videos") val relatedVideos: List<RelatedVideo> = emptyList(),
)

@Serializable
data class FavoriteResponse(
    @SerialName("is_favorited") val isFavorited: Boolean = false,
)

// ---------- Tìm kiếm ----------
@Serializable
data class SearchItem(
    @SerialName("public_id") val publicId: String,
    val slug: String = "",
    val title: String = "",
    val thumbnail: String? = null,
    val aspect: String? = null,
    // phim | video | short
    val type: String = "",
)

@Serializable
data class SearchGroup(
    val type: String = "",
    val items: List<SearchItem> = emptyList(),
)

@Serializable
data class SearchResponse(
    val query: String = "",
    val groups: List<SearchGroup> = emptyList(),
)

// ---------- Kênh + EPG ----------
@Serializable
data class Channel(
    @SerialName("public_id") val publicId: String,
    val name: String = "",
    val logo: String? = null,
    @SerialName("audio_only") val audioOnly: Boolean = false,
)

@Serializable
data class ChannelGroup(
    val name: String = "",
    val channels: List<Channel> = emptyList(),
)

@Serializable
data class ChannelsResponse(val groups: List<ChannelGroup> = emptyList())

@Serializable
data class EpgChannel(
    @SerialName("public_id") val publicId: String = "",
    val name: String = "",
    val logo: String? = null,
    @SerialName("banner_url") val bannerUrl: String? = null,
    @SerialName("hls_url") val hlsUrl: String? = null,
    // epoch milliseconds
    @SerialName("hls_exp") val hlsExp: Long? = null,
    @SerialName("dash_url") val dashUrl: String? = null,
    @SerialName("catchup_hls_url") val catchupHlsUrl: String? = null,
)

@Serializable
data class TimelineItem(
    val time: String = "",
    val title: String = "",
    // LIVE | UPCOMING | REPLAY
    val status: String = "",
    // URL xem lai (timeshift VOD), chi co khi kenh bat timeshift + status=REPLAY.
    @SerialName("replay_url") val replayUrl: String? = null,
)

@Serializable
data class EpgResponse(
    val channel: EpgChannel = EpgChannel(),
    @SerialName("epg_dates") val epgDates: List<String> = emptyList(),
    @SerialName("epg_source") val epgSource: String? = null,
    val timeline: List<TimelineItem> = emptyList(),
)

// ---------- Auth ----------
@Serializable
data class EndUser(
    val id: String = "",
    val email: String? = null,
    val phone: String? = null,
    val avatar: String? = null,
    val displayName: String? = null,
    val provider: String? = null,
    val providerId: String? = null,
    val status: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class LoginRequest(val identifier: String, val password: String)

@Serializable
data class LoginResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("token_type") val tokenType: String = "Bearer",
    @SerialName("expires_in") val expiresIn: Long = 3600,
    val user: EndUser = EndUser(),
)

@Serializable
data class RefreshRequest(@SerialName("refresh_token") val refreshToken: String)

@Serializable
data class Profile(
    val id: String = "",
    val userId: String = "",
    val name: String = "",
    val avatarUrl: String? = null,
    val isKidsProfile: Boolean = false,
)

@Serializable
data class MeResponse(
    val kind: String = "",
    val user: EndUser = EndUser(),
    val profiles: List<Profile> = emptyList(),
)

// ---------- VOD play ----------
@Serializable
data class VodPlayResponse(
    val kind: String = "",
    val id: String = "",
    val title: String = "",
    @SerialName("hls_path") val hlsPath: String = "",
)

// ---------- Telemetry ----------
@Serializable
data class HeartbeatRequest(
    @SerialName("session_id") val sessionId: String,
    @SerialName("content_id") val contentId: String,
    @SerialName("current_time_seconds") val currentTimeSeconds: Long = 0,
    val bitrate: String? = null,
    @SerialName("device_type") val deviceType: String = "android",
)

@Serializable
data class HeartbeatResponse(val ok: Boolean = false, val kicked: Boolean = false)

// ---------- Health / lỗi ----------
@Serializable
data class HealthResponse(val status: String = "", val service: String = "", val phase: Int = 0)

@Serializable
data class ApiErrorBody(val code: String = "", val message: String = "")

@Serializable
data class ApiErrorEnvelope(val error: ApiErrorBody = ApiErrorBody())
