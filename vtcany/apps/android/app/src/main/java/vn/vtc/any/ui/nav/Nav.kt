package vn.vtc.any.ui.nav

import android.content.Context
import android.content.Intent
import androidx.core.net.toUri
import androidx.navigation.NavController
import vn.vtc.any.data.repo.DeepTarget

object Routes {
    const val HOME = "home"
    const val TV = "tv"
    const val LIBRARY = "library/{section}"
    const val CATEGORY = "category/{id}"
    const val MOVIE = "movie/{publicId}"
    const val VIDEO = "video/{publicId}"
    const val SHORT = "short/{publicId}"
    const val SHORTS_FEED = "shorts"
    const val PLAYER = "player"
    const val SEARCH = "search"
    const val LOGIN = "login"
    const val ACCOUNT = "account"

    fun library(section: String) = "library/$section"
    fun category(id: String) = "category/$id"
    fun movie(publicId: String) = "movie/$publicId"
    fun video(publicId: String) = "video/$publicId"
    fun short(publicId: String) = "short/$publicId"
    fun player(kind: String, id: String, title: String, contentId: String) =
        "player?kind=$kind&id=$id&title=${android.net.Uri.encode(title)}&contentId=$contentId"
}

/** Điều hướng theo deep-link của banner/rail. */
fun NavController.navigateDeepTarget(context: Context, target: DeepTarget) {
    when (target) {
        is DeepTarget.Movie -> navigate(Routes.movie(target.publicId))
        is DeepTarget.Video -> navigate(Routes.video(target.publicId))
        is DeepTarget.Short -> navigate(Routes.short(target.publicId))
        is DeepTarget.Category -> navigate(Routes.category(target.idOrPublicId))
        is DeepTarget.External -> {
            runCatching {
                context.startActivity(
                    Intent(Intent.ACTION_VIEW, target.url.toUri())
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }
        }
        DeepTarget.None -> Unit
    }
}

/** Parse path deep-link https://any.vtcrd.top/... thành route nội bộ. */
fun deepLinkRoute(path: String?): String? {
    if (path.isNullOrBlank()) return null
    val target = vn.vtc.any.data.repo.parseDeepTarget(path)
    return when (target) {
        is DeepTarget.Movie -> Routes.movie(target.publicId)
        is DeepTarget.Video -> Routes.video(target.publicId)
        is DeepTarget.Short -> Routes.short(target.publicId)
        is DeepTarget.Category -> Routes.category(target.idOrPublicId)
        else -> null
    }
}
