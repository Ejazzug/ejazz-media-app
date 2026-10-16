const path = require('node:path');
const fs = require('node:fs/promises');
const { withDangerousMod } = require('expo/config-plugins');

function replaceOnce(source, needle, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(needle)) {
    throw new Error(`EJazz background metadata plugin could not find ${label} in expo-audio.`);
  }
  return source.replace(needle, replacement);
}

function patchAudioControlsService(source) {
  source = replaceOnce(
    source,
    'import kotlinx.coroutines.launch',
    'import kotlinx.coroutines.launch\nimport kotlinx.coroutines.delay\nimport android.util.Log\nimport org.json.JSONObject\nimport java.net.HttpURLConnection',
    'coroutine imports',
  );
  source = replaceOnce(
    source,
    '  private var artworkLoadJob: Job? = null',
    '  private var artworkLoadJob: Job? = null\n  private var stationMetadataPollingJob: Job? = null',
    'service state fields',
  );

  const pollingMethods = `  private fun stopStationMetadataPolling() {
    stationMetadataPollingJob?.cancel()
    stationMetadataPollingJob = null
  }

  private fun startStationMetadataPolling() {
    if (stationMetadataPollingJob?.isActive == true) return
    stationMetadataPollingJob = scope.launch {
      while (isActive) {
        try {
          val activePlayer = currentPlayer
          val metadata = currentMetadata
          if (activePlayer?.ref?.isPlaying == true && metadata != null) {
            val latest = fetchStationMetadata(metadata)
            if (latest != null && activePlayer == currentPlayer) {
              appContext?.mainQueue?.launch {
                if (activePlayer == currentPlayer && activePlayer.ref.isPlaying) {
                  updateMetadataInternal(activePlayer, latest)
                }
              }
            }
          }
        } catch (error: Exception) {
          Log.w("EJazzNowPlaying", "Background station metadata refresh failed", error)
        }
        delay(30_000L)
      }
    }
  }

  private fun fetchStationMetadata(metadata: Metadata): Metadata? {
    val station = metadata.albumTitle?.trim()?.lowercase() ?: return null
    val url = when (station) {
      "ejazz radio" ->
        "https://eu1.reliastream.com:2199/external/rpc.php?m=recenttracks.get&username=ejazzug&charset=UTF-8&limit=10"
      "ejazz xtra" -> "https://c32.radioboss.fm/w/nowplayinginfo?u=320"
      else -> return null
    }
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 8_000
      readTimeout = 8_000
      setRequestProperty("Accept", "application/json")
      setRequestProperty("User-Agent", "EJazzMediaApp/0.1.0")
    }

    try {
      if (connection.responseCode !in 200..299) return null
      val payload = connection.inputStream.bufferedReader().use { it.readText() }
      val root = JSONObject(payload)
      val title: String
      val artist: String
      var artworkUrl = metadata.artworkUrl
      if (station == "ejazz radio") {
        val track = root.optJSONArray("data")?.optJSONArray(0)?.optJSONObject(0) ?: return null
        title = track.optString("title").trim()
        artist = track.optString("artist").trim()
        track.optString("image").trim().takeIf { it.startsWith("https://") }?.let {
          artworkUrl = URL(it)
        }
      } else {
        title = root.optString("currenttrack_title").trim()
        artist = root.optString("currenttrack_artist").trim()
        val artworkTimestamp = root.optString("artwork_ts").trim()
        if (artworkTimestamp.isNotEmpty()) {
          artworkUrl = URL("https://c32.radioboss.fm/w/artwork/320.jpg?$artworkTimestamp")
        }
      }
      if (title.isEmpty() && artist.isEmpty()) return null
      return Metadata(
        title.ifEmpty { metadata.title },
        artist.ifEmpty { metadata.artist },
        metadata.albumTitle,
        artworkUrl
      )
    } finally {
      connection.disconnect()
    }
  }

`;
  source = replaceOnce(
    source,
    '  private fun setActivePlayerInternal(',
    pollingMethods + '  private fun setActivePlayerInternal(',
    'metadata polling insertion point',
  );
  source = replaceOnce(
    source,
    '    player?.isActiveForLockScreen = true',
    '    player?.isActiveForLockScreen = true\n    if (player != null) startStationMetadataPolling() else stopStationMetadataPolling()',
    'lock-screen activation',
  );
  source = replaceOnce(
    source,
    '  private fun clearSessionInternal() {\n    currentPlayer?.isActiveForLockScreen = false',
    '  private fun clearSessionInternal() {\n    stopStationMetadataPolling()\n    currentPlayer?.isActiveForLockScreen = false',
    'lock-screen cleanup',
  );
  source = replaceOnce(
    source,
    '      override fun onIsPlayingChanged(isPlaying: Boolean) {\n        updateSessionCustomLayout(isPlaying)\n        postOrStartForegroundNotification(startInForeground = false)',
    '      override fun onIsPlayingChanged(isPlaying: Boolean) {\n        updateSessionCustomLayout(isPlaying)\n        if (isPlaying) startStationMetadataPolling() else stopStationMetadataPolling()\n        postOrStartForegroundNotification(startInForeground = false)',
    'playback-state listener',
  );
  source = replaceOnce(
    source,
    '    artworkLoadJob?.cancel()\n    artworkLoadJob = null\n    scope.cancel()',
    '    stopStationMetadataPolling()\n    artworkLoadJob?.cancel()\n    artworkLoadJob = null\n    scope.cancel()',
    'service shutdown',
  );
  return source;
}

module.exports = function withEjazzBackgroundMetadata(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const servicePath = path.join(
        modConfig.modRequest.projectRoot,
        'node_modules/expo-audio/android/src/main/java/expo/modules/audio/service/AudioControlsService.kt',
      );
      const original = await fs.readFile(servicePath, 'utf8');
      const patched = patchAudioControlsService(original);
      if (patched !== original) await fs.writeFile(servicePath, patched);
      return modConfig;
    },
  ]);
};

module.exports.patchAudioControlsService = patchAudioControlsService;
