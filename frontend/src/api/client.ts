import axios from 'axios'

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token to every request
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('auth')
  if (stored) {
    try {
      const { accessToken } = JSON.parse(stored)
      if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
    } catch {}
  }
  return config
})

// On 401: attempt token refresh, retry once, then redirect to /login
let _refreshing: Promise<string | null> | null = null

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retried) {
      return Promise.reject(error)
    }
    original._retried = true

    const stored = localStorage.getItem('auth')
    if (!stored) {
      window.location.href = '/login'
      return Promise.reject(error)
    }

    const { refreshToken } = JSON.parse(stored)
    if (!refreshToken) {
      window.location.href = '/login'
      return Promise.reject(error)
    }

    if (!_refreshing) {
      _refreshing = axios
        .post('/api/v1/auth/refresh', { refresh_token: refreshToken })
        .then((r) => {
          const { access_token, refresh_token } = r.data
          const parsed = JSON.parse(localStorage.getItem('auth') || '{}')
          localStorage.setItem(
            'auth',
            JSON.stringify({ ...parsed, accessToken: access_token, refreshToken: refresh_token }),
          )
          return access_token as string
        })
        .catch(() => {
          localStorage.removeItem('auth')
          window.location.href = '/login'
          return null
        })
        .finally(() => { _refreshing = null })
    }

    const newToken = await _refreshing
    if (!newToken) return Promise.reject(error)

    original.headers.Authorization = `Bearer ${newToken}`
    return api(original)
  },
)
