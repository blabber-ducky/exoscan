import { api } from './client'
import type { TokenPair, User } from '@/types'

export const authApi = {
  register: (email: string, username: string, password: string) =>
    api.post<TokenPair>('/auth/register', { email, username, password }).then((r) => r.data),

  login: (email: string, password: string) =>
    api.post<TokenPair>('/auth/login', { email, password }).then((r) => r.data),

  refresh: (refreshToken: string) =>
    api.post<TokenPair>('/auth/refresh', { refresh_token: refreshToken }).then((r) => r.data),

  me: () =>
    api.get<User>('/auth/me').then((r) => r.data),
}
