package com.ejazzug.ejazzmedia

import android.app.Activity
import android.app.PictureInPictureParams
import android.os.Build
import android.util.Rational
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

class EjazzPictureInPicturePackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext
  ): List<NativeModule> = listOf(EjazzPictureInPictureModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = emptyList()
}

class EjazzPictureInPictureModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "EjazzPictureInPicture"

  @ReactMethod
  fun enter(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.resolve(false)
      return
    }

    // getCurrentActivity() is protected on ReactContextBaseJavaModule, which lives in another
    // package, so Kotlin K2 will not expose it as the synthetic `currentActivity` property --
    // that resolved under K1 but is an unresolved reference now. Call the getter explicitly,
    // and type the local so `activity` is unambiguously a platform-free Activity?.
    val activity: Activity? = getCurrentActivity()
    if (activity == null) {
      promise.resolve(false)
      return
    }

    activity.runOnUiThread {
      try {
        val params = PictureInPictureParams.Builder()
          .setAspectRatio(Rational(16, 9))
          .build()
        promise.resolve(activity.enterPictureInPictureMode(params))
      } catch (error: Exception) {
        promise.reject("E_EJAZZ_PIP", "Could not enter picture-in-picture mode.", error)
      }
    }
  }
}
