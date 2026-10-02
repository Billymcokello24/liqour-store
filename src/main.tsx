import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

if (!document.title.trim()) {
  document.title = "Henry's Liquor Hub — Same-day liquor delivery in Nairobi"
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // check for worker updates every 30 minutes without needing a reload
        setInterval(() => void registration.update().catch(() => undefined), 30 * 60 * 1000)
      })
      .catch(() => undefined)
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
