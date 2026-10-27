package vn.vtc.any.data.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Client cho VTC ANY backend. Base URL có sẵn "/api/v1/" ở cuối —
 * các path dưới đây là tương đối, KHÔNG bắt đầu bằng "/".
 */
interface VtcApi {

    // ---- Health ----
    @GET("health")
    suspend fun health(): HealthResponse

    // ---- Auth (end-user) ----
    @POST("auth/user/login")
    suspend fun login(@Body req: LoginRequest): LoginResponse

    @POST("auth/refresh")
    suspend fun refresh(@Body req: RefreshRequest): LoginResponse

    @GET("auth/me")
    suspend fun me(): MeResponse

    // ---- Catalog ----
    @GET("catalog/movies")
    suspend fun movies(
        @Query("categoryId") categoryId: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 24,
    ): PagedResponse<CatalogItem>

    @GET("catalog/videos")
    suspend fun videos(
        @Query("categoryId") categoryId: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 24,
    ): PagedResponse<CatalogItem>

    @GET("catalog/shorts")
    suspend fun shorts(
        @Query("categoryId") categoryId: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 24,
    ): PagedResponse<CatalogItem>

    @GET("catalog/movies/{publicId}")
    suspend fun moviePublic(@Path("publicId") publicId: String): CatalogItem

    @GET("catalog/videos/{publicId}")
    suspend fun videoPublic(@Path("publicId") publicId: String): CatalogItem

    @GET("catalog/shorts/{publicId}")
    suspend fun shortPublic(@Path("publicId") publicId: String): CatalogItem

    @GET("catalog/categories")
    suspend fun categories(@Query("type") type: String? = null): CategoriesResponse

    @GET("catalog/categories/{id}")
    suspend fun categoryDetail(
        @Path("id") id: String,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 24,
    ): CategoryDetailResponse

    @GET("catalog/rails")
    suspend fun rails(
        @Query("section") section: String? = null,
        @Query("platform") platform: String = "web",
    ): RailsResponse

    @GET("catalog/banners")
    suspend fun banners(
        @Query("page") page: String,
        @Query("platform") platform: String = "mobile",
    ): BannersResponse

    // ---- Chi tiết phim / tập ----
    @GET("movies/{publicId}")
    suspend fun movieDetail(@Path("publicId") publicId: String): MovieDetailResponse

    @POST("movies/{publicId}/favorite")
    suspend fun toggleFavorite(@Path("publicId") publicId: String): FavoriteResponse

    // ---- Tìm kiếm ----
    @GET("search")
    suspend fun search(@Query("s") query: String): SearchResponse

    // ---- Kênh truyền hình + EPG ----
    @GET("channels")
    suspend fun channels(): ChannelsResponse

    @GET("channels/{publicId}/epg")
    suspend fun epg(
        @Path("publicId") publicId: String,
        @Query("date") date: String? = null,
    ): EpgResponse

    // ---- Phát VOD (kind = episode | video | short; id = internal id) ----
    @GET("vod/{kind}/{id}/play")
    suspend fun vodPlay(
        @Path("kind") kind: String,
        @Path("id") id: String,
    ): VodPlayResponse

    // ---- Telemetry ----
    @POST("telemetry/heartbeat")
    suspend fun heartbeat(@Body body: HeartbeatRequest): HeartbeatResponse
}
