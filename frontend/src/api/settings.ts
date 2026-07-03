import { client } from './client'
import type { UserSettings, UserSettingsRequest, TestConnectionResult } from '@/types'

export const settingsApi = {
  get: () => client.get<UserSettings>('/api/v1/settings').then((r) => r.data),
  update: (req: UserSettingsRequest) =>
    client.put<UserSettings>('/api/v1/settings', req).then((r) => r.data),
  testConnection: () =>
    client.post<TestConnectionResult>('/api/v1/settings/test-connection').then((r) => r.data),
}
