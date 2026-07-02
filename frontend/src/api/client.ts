import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token to every request
api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState()
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
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

    const { refreshToken, setTokens, logout } = useAuthStore.getState()
    if (!refreshToken) {
      logout()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    if (!_refreshing) {
      _refreshing = axios
        .post('/api/v1/auth/refresh', { refresh_token: refreshToken })
        .then((r) => {
          const { access_token, refresh_token } = r.data
          setTokens(access_token, refresh_token)
          return access_token as string
        })
        .catch(() => {
          logout()
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
