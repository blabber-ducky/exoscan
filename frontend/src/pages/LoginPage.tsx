import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanSearch } from 'lucide-react'
import { LoginForm } from '@/components/auth/LoginForm'
import { useAuthStore } from '@/store/authStore'

export function LoginPage() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const navigate = useNavigate()

  useEffect(() => {
    if (accessToken) navigate('/dashboard', { replace: true })
  }, [accessToken])

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-4">
      <div className="flex items-center gap-2 text-primary font-semibold text-2xl">
        <ScanSearch className="h-7 w-7" />
        <span>Exoscan</span>
      </div>
      <LoginForm />
    </div>
  )
}
