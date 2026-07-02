import { Shield } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GroupManager } from '@/components/admin/GroupManager'
import { useAdminUsers } from '@/hooks/useAdmin'
import { Badge } from '@/components/ui/badge'

function UsersPanel() {
  const { data: users = [], isLoading } = useAdminUsers()

  if (isLoading) return null

  return (
    <div className="space-y-2">
      {users.map((u) => (
        <div
          key={u.id}
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-border bg-card"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{u.username}</span>
              {u.is_admin && (
                <Badge variant="destructive" className="text-xs py-0">admin</Badge>
              )}
              {!u.is_active && (
                <Badge variant="secondary" className="text-xs py-0">disabled</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{u.email}</div>
          </div>
          <div className="flex flex-wrap gap-1 justify-end">
            {u.groups.map((g) => (
              <Badge key={g.id} variant="outline" className="text-xs">
                {g.name}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function AdminPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Admin Panel</h1>
      </div>

      <Tabs defaultValue="groups">
        <TabsList>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        <TabsContent value="groups" className="mt-4">
          <GroupManager />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UsersPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
