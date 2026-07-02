import { Link, useNavigate } from 'react-router-dom'
import { ScanSearch, LogOut, User, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'

export function Navbar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-primary">
          <ScanSearch className="h-5 w-5" />
          <span>Exoscan</span>
        </Link>

        <div className="flex items-center gap-3">
          {user?.is_admin && (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin">
                <Shield className="h-4 w-4" />
                Admin
              </Link>
            </Button>
          )}
          {user && (
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              {user.username}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </nav>
  )
}
