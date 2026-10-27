package vn.vtc.any

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import vn.vtc.any.data.api.CatalogItem
import vn.vtc.any.ui.nav.Routes
import vn.vtc.any.ui.nav.deepLinkRoute
import vn.vtc.any.ui.nav.navigateDeepTarget
import vn.vtc.any.ui.player.VodPlayerScreen
import vn.vtc.any.ui.screens.AccountScreen
import vn.vtc.any.ui.screens.CategoryScreen
import vn.vtc.any.ui.screens.ContentDetailScreen
import vn.vtc.any.ui.screens.HomeScreen
import vn.vtc.any.ui.screens.LibraryScreen
import vn.vtc.any.ui.screens.LoginScreen
import vn.vtc.any.ui.screens.MovieDetailScreen
import vn.vtc.any.ui.screens.SECTION_TITLES
import vn.vtc.any.ui.screens.SearchScreen
import vn.vtc.any.ui.screens.ShortsFeedScreen
import vn.vtc.any.ui.screens.TvScreen
import vn.vtc.any.ui.theme.VtcAnyTheme

private data class Tab(
    val route: String,
    val label: String,
    val icon: ImageVector,
    val title: String,
)

private val TABS = listOf(
    Tab(Routes.HOME, "Trang chủ", Icons.Filled.Home, "VTC ANY"),
    Tab(Routes.TV, "Truyền hình", Icons.Filled.LiveTv, "Truyền hình"),
    Tab(Routes.library("movies"), "Phim", Icons.Filled.Movie, "Phim"),
    Tab(Routes.SHORTS_FEED, "Short", Icons.Filled.VideoLibrary, "Short"),
    Tab(Routes.ACCOUNT, "Tài khoản", Icons.Filled.Person, "Tài khoản"),
)

/** Route có hiện bottom bar. */
private fun showBottomBar(route: String?): Boolean =
    route != null && TABS.any { it.route == route } || route == Routes.SEARCH

class MainActivity : ComponentActivity() {

    private var pendingDeepLink: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingDeepLink = intent?.data?.path?.let { deepLinkRoute(it) }
        setContent {
            VtcAnyTheme(darkTheme = true) {
                MainNav(
                    pendingDeepLink = pendingDeepLink,
                    onConsumed = { pendingDeepLink = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Deep-link khi app đang chạy sẽ được xử lý ở lần recompose tiếp theo
        // qua pendingDeepLink — đơn giản hoá: mở lại MainNav không cần thiết,
        // vì launchMode singleTask + autoVerify thường cold-start.
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainNav(pendingDeepLink: String?, onConsumed: () -> Unit) {
    val nav = rememberNavController()
    val context = androidx.compose.ui.platform.LocalContext.current
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val currentTab = TABS.find { it.route == route }

    // Mở deep-link từ banner ngoài trình duyệt.
    androidx.compose.runtime.LaunchedEffect(pendingDeepLink) {
        if (pendingDeepLink != null) {
            nav.navigate(pendingDeepLink)
            onConsumed()
        }
    }

    fun openMovie(item: CatalogItem) = nav.navigate(Routes.movie(item.publicId))
    fun openVideo(item: CatalogItem) = nav.navigate(Routes.video(item.publicId))
    fun openShort(item: CatalogItem) = nav.navigate(Routes.short(item.publicId))

    fun openItemByType(item: CatalogItem, contentType: String?) {
        when (contentType) {
            "video" -> openVideo(item)
            "short" -> openShort(item)
            else -> openMovie(item)
        }
    }

    fun openChannel(publicId: String) {
        nav.navigate("tv?channel=$publicId") {
            popUpTo(Routes.TV) { inclusive = true }
            launchSingleTop = true
        }
    }

    Scaffold(
        topBar = {
            if (currentTab != null || route == Routes.SEARCH) {
                TopAppBar(
                    title = {
                        Text(
                            when {
                                route == Routes.SEARCH -> "Tìm kiếm"
                                route?.startsWith("library/") == true ->
                                    SECTION_TITLES[route.removePrefix("library/")] ?: "Thư viện"
                                else -> currentTab?.title ?: "VTC ANY"
                            },
                        )
                    },
                    navigationIcon = {
                        if (currentTab == null) {
                            IconButton(onClick = { nav.popBackStack() }) {
                                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Quay lại")
                            }
                        }
                    },
                    actions = {
                        if (route != Routes.SEARCH) {
                            IconButton(onClick = { nav.navigate(Routes.SEARCH) }) {
                                Icon(Icons.Filled.Search, "Tìm kiếm")
                            }
                        }
                    },
                )
            }
        },
        bottomBar = {
            if (showBottomBar(route)) {
                NavigationBar {
                    TABS.forEach { tab ->
                        NavigationBarItem(
                            selected = route == tab.route,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo(Routes.HOME)
                                    launchSingleTop = true
                                }
                            },
                            icon = { Icon(tab.icon, tab.label) },
                            label = {
                                Text(
                                    tab.label,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            },
                        )
                    }
                }
            }
        },
    ) { inner ->
        NavHost(
            navController = nav,
            startDestination = Routes.HOME,
            modifier = Modifier.padding(inner),
        ) {
            composable(Routes.HOME) {
                HomeScreen(
                    onOpenChannel = { openChannel(it.publicId) },
                    onOpenMovie = ::openMovie,
                    onOpenVideo = ::openVideo,
                    onOpenShort = ::openShort,
                    onOpenCategory = { nav.navigate(Routes.category(it)) },
                    onOpenLibrary = { nav.navigate(Routes.library(it)) },
                    onDeepTarget = { nav.navigateDeepTarget(context, it) },
                )
            }
            composable(
                route = "tv?channel={channel}",
                arguments = listOf(
                    navArgument("channel") {
                        type = NavType.StringType
                        nullable = true
                        defaultValue = null
                    },
                ),
            ) { entry ->
                TvScreen(initialChannelId = entry.arguments?.getString("channel"))
            }
            composable(
                route = Routes.LIBRARY,
                arguments = listOf(navArgument("section") { type = NavType.StringType }),
            ) { entry ->
                val section = entry.arguments?.getString("section") ?: "movies"
                LibraryScreen(
                    section = section,
                    onItemClick = ::openItemByType,
                    onOpenCategory = { nav.navigate(Routes.category(it)) },
                    onDeepTarget = { nav.navigateDeepTarget(context, it) },
                )
            }
            composable(
                route = Routes.CATEGORY,
                arguments = listOf(navArgument("id") { type = NavType.StringType }),
            ) { entry ->
                CategoryScreen(
                    id = entry.arguments?.getString("id").orEmpty(),
                    onItemClick = { openItemByType(it, null) },
                )
            }
            composable(
                route = Routes.MOVIE,
                arguments = listOf(navArgument("publicId") { type = NavType.StringType }),
            ) { entry ->
                val publicId = entry.arguments?.getString("publicId").orEmpty()
                MovieDetailScreen(
                    publicId = publicId,
                    onPlayEpisode = { ep, movieTitle ->
                        nav.navigate(
                            Routes.player(
                                kind = "episode",
                                id = ep.episodeId,
                                title = "${movieTitle} - ${ep.title.ifBlank { "Tập ${ep.episodeNumber}" }}",
                                contentId = publicId,
                            ),
                        )
                    },
                    onOpenRelated = { nav.navigate(Routes.movie(it.publicId)) },
                )
            }
            composable(
                route = Routes.VIDEO,
                arguments = listOf(navArgument("publicId") { type = NavType.StringType }),
            ) { entry ->
                val publicId = entry.arguments?.getString("publicId").orEmpty()
                ContentDetailScreen(
                    publicId = publicId,
                    kind = "video",
                    onPlay = {
                        nav.navigate(
                            Routes.player(
                                kind = "video", id = it.id,
                                title = it.title, contentId = publicId,
                            ),
                        )
                    },
                )
            }
            composable(
                route = Routes.SHORT,
                arguments = listOf(navArgument("publicId") { type = NavType.StringType }),
            ) { entry ->
                val publicId = entry.arguments?.getString("publicId").orEmpty()
                ContentDetailScreen(
                    publicId = publicId,
                    kind = "short",
                    onPlay = {
                        nav.navigate(
                            Routes.player(
                                kind = "short", id = it.id,
                                title = it.title, contentId = publicId,
                            ),
                        )
                    },
                )
            }
            composable(Routes.SHORTS_FEED) {
                ShortsFeedScreen(onOpenDetail = ::openShort)
            }
            composable(
                route = "player?kind={kind}&id={id}&title={title}&contentId={contentId}",
                arguments = listOf(
                    navArgument("kind") { type = NavType.StringType },
                    navArgument("id") { type = NavType.StringType },
                    navArgument("title") {
                        type = NavType.StringType; nullable = true; defaultValue = null
                    },
                    navArgument("contentId") {
                        type = NavType.StringType; nullable = true; defaultValue = null
                    },
                ),
            ) { entry ->
                val a = entry.arguments!!
                VodPlayerScreen(
                    title = a.getString("title").orEmpty(),
                    contentId = a.getString("contentId").orEmpty(),
                    kind = a.getString("kind"),
                    id = a.getString("id"),
                    onBack = { nav.popBackStack() },
                )
            }
            composable(Routes.SEARCH) {
                SearchScreen(
                    onOpenMovie = { nav.navigate(Routes.movie(it)) },
                    onOpenVideo = { nav.navigate(Routes.video(it)) },
                    onOpenShort = { nav.navigate(Routes.short(it)) },
                )
            }
            composable(Routes.LOGIN) {
                LoginScreen(
                    onSuccess = { nav.popBackStack() },
                    onSkip = { nav.popBackStack() },
                )
            }
            composable(Routes.ACCOUNT) {
                AccountScreen(onGoLogin = { nav.navigate(Routes.LOGIN) })
            }
        }
    }
}
