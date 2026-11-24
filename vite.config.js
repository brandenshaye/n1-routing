import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Unique id per build (the git commit on Vercel). Baked into the app and also
// written to /version.json, so open tabs can tell when a newer version is live.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())

function versionFile() {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId }) })
    },
  }
}

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
})
