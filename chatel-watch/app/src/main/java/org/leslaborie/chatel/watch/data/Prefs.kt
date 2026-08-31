package org.leslaborie.chatel.watch.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "settings")

class Prefs(private val context: Context) {

    companion object {
        const val DEFAULT_PROFILE = "matthieu"
        const val DEFAULT_BASE_URL = "https://signalk.example.org"
        private val PROFILE_ID = stringPreferencesKey("profile_id")
        private val BASE_URL = stringPreferencesKey("base_url")
    }

    val profileId: Flow<String> = context.dataStore.data
        .map { it[PROFILE_ID] ?: DEFAULT_PROFILE }

    val baseUrl: Flow<String> = context.dataStore.data
        .map { it[BASE_URL] ?: DEFAULT_BASE_URL }

    suspend fun currentProfileId(): String = profileId.first()

    suspend fun currentBaseUrl(): String = baseUrl.first()

    suspend fun setProfileId(id: String) {
        context.dataStore.edit { it[PROFILE_ID] = id }
    }

    suspend fun setBaseUrl(url: String) {
        context.dataStore.edit { it[BASE_URL] = url.trimEnd('/') }
    }
}
