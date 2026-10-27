package vn.vtc.any

import android.app.Application
import vn.vtc.any.data.api.ApiClient
import vn.vtc.any.data.api.VtcApi
import vn.vtc.any.data.repo.VtcRepository
import vn.vtc.any.data.session.SessionManager

class VtcAnyApp : Application() {

    lateinit var session: SessionManager
        private set

    lateinit var api: VtcApi
        private set

    lateinit var repo: VtcRepository
        private set

    override fun onCreate() {
        super.onCreate()
        session = SessionManager(this)
        api = ApiClient.create(session, debug = BuildConfig.DEBUG)
        repo = VtcRepository(api)
    }
}
