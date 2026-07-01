import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'

export function useLogin() {
  const { setTokens, setUser } = useAuthStore()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: async (tokens) => {
      setTokens(tokens.access_token, tokens.refresh_token)
      const user = await authApi.me()
      setUser(user)
      navigate('/dashboard')
    },
  })
}

export function useRegister() {
  const { setTokens, setUser } = useAuthStore()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: ({
      email,
      username,
      password,
    }: {
      email: string
      username: string
      password: string
    }) => authApi.register(email, username, password),
    onSuccess: async (tokens) => {
      setTokens(tokens.access_token, tokens.refresh_token)
      const user = await authApi.me()
      setUser(user)
      navigate('/dashboard')
    },
  })
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  return () => {
    logout()
    navigate('/login')
  }
}
