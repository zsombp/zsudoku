// Making a new version actually arrive.
//
// `registerType: 'autoUpdate'` installs a new service worker in the background
// and hands it control, but the page already open keeps the JavaScript it
// booted with. On a tab you reload often that is invisible. On an app installed
// to the home screen, which is the whole point of this one, it means running a
// build from weeks ago with nothing on screen saying so. A feature can ship,
// deploy, and still not exist as far as the phone is concerned.
//
// So when a new worker takes over, reload. That is safe here specifically
// because the game writes its whole position to storage on every change and
// every ten seconds besides, so a reload costs nothing but a repaint.

export function takeUpdates() {
  if (!('serviceWorker' in navigator)) return

  // Without the guard this loops: the reload can itself trigger another
  // controllerchange, and each one would reload again.
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })

  // A worker installed while the app was closed is already in control on this
  // load, so controllerchange never fires and the check above would wait
  // forever. Ask outright whenever the app comes back to the foreground, which
  // on an installed app is the only moment it reliably gets to run.
  const check = () => {
    if (document.visibilityState !== 'visible') return
    navigator.serviceWorker.getRegistration().then(reg => reg?.update()).catch(() => {})
  }
  document.addEventListener('visibilitychange', check)
  check()
}
