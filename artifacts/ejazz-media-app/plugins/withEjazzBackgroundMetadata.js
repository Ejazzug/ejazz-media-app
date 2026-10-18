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
              // Main dispatcher directly, NOT appContext?.mainQueue: appContext can be null
              // once the activity is gone, and that made this update silently do nothing,
              // which is exactly when the lock screen needs it (app in the background).
              launch(Dispatchers.Main) {
                if (activePlayer == currentPlayer && activePlayer.ref.isPlaying) {
                  updateMetadataInternal(activePlayer, latest)
                }
              }
            }
          }
        } catch (error: Exception) {
          Log.w("EJazzNowPlaying", "Background station metadata refresh failed", error)
        }
        delay(15_000L)
      }
    }
  }

  // The programme on air now, from the Control Room line-up. Blank on any failure or when
  // nothing is scheduled, so a hiccup here never costs the song update itself.
  private fun fetchOnAirShow(stationKey: String): String {
    return try {
      val connection = (URL("https://control.ejazzug.com/api/shows/on-air?station=" + stationKey).openConnection() as HttpURLConnection).apply {
        connectTimeout = 5_000
        readTimeout = 5_000
        setRequestProperty("Accept", "application/json")
        setRequestProperty("User-Agent", "EJazzMediaApp/0.1.0")
      }
      try {
        if (connection.responseCode !in 200..299) return ""
        val root = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
        if (root.isNull("show")) "" else root.optString("show").trim()
      } finally {
        connection.disconnect()
      }
    } catch (error: Exception) {
      ""
    }
  }

  private fun fetchStationMetadata(metadata: Metadata): Metadata? {
    val station = metadata.albumTitle?.trim()?.lowercase() ?: return null
    val url = when (station) {
      "ejazz radio" ->
        "https://eu1.reliastream.com:2199/external/rpc.php?m=recenttracks.get&username=ejazzug&charset=UTF-8&limit=10"
      "ejazz xtra" -> "https://stream.ejazzug.com/api/nowplaying/2"
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
        // AzuraCast: one payload, and song.art is already an absolute URL -- nothing to
        // build from a station id and a cache-busting timestamp any more.
        val song = root.optJSONObject("now_playing")?.optJSONObject("song") ?: return null
        var songTitle = song.optString("title").trim()
        var songArtist = song.optString("artist").trim()
        if (songArtist.isEmpty()) {
          // Untagged files carry "Artist - Title" (or "Artist- Title") in the title
          // alone. Same idea as splitCombinedTitle() in lib/radio.ts, kept deliberately
          // simple here: this Kotlin only compiles on Codemagic.
          val combined = songTitle.ifEmpty { song.optString("text").trim() }
          var cut = combined.indexOf(" - ")
          var skip = 3
          if (cut <= 0) {
            cut = combined.indexOf("- ")
            skip = 2
          }
          if (cut > 0) {
            songArtist = combined.substring(0, cut).trim()
            songTitle = combined.substring(cut + skip).trim()
          } else {
            songTitle = combined
          }
        }
        title = songTitle
        artist = songArtist
        song.optString("art").trim().takeIf { it.startsWith("https://") }?.let {
          artworkUrl = URL(it)
        }
      }
      if (title.isEmpty() && artist.isEmpty()) return null
      // Same wording as lib/lockScreen.ts: line 1 "Song - Artist", line 2 "EJazz Media App
      // - station - show on air" (show left out when the Control Room has none).
      val stationName = metadata.albumTitle?.trim().orEmpty()
      val show = fetchOnAirShow(if (station == "ejazz radio") "radio" else "xtra")
      val line1 = if (title.isNotEmpty() && artist.isNotEmpty()) title + " - " + artist else title.ifEmpty { artist }
      val line2 = listOf("EJazz Media App", stationName, show).filter { it.isNotEmpty() }.joinToString(" \u00B7 ")
      return Metadata(line1, line2, metadata.albumTitle, artworkUrl)
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
