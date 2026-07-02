import { useState } from 'react'
import { Share2, X, Users, User, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  useScanShares,
  useMyGroups,
  useUserSearch,
  useShareWithUser,
  useShareWithGroup,
  useRevokeShare,
} from '@/hooks/useShares'

interface Props {
  scanId: string
  open: boolean
  onClose: () => void
}

export function ShareDialog({ scanId, open, onClose }: Props) {
  const [userQuery, setUserQuery] = useState('')

  const { data: shares = [], isLoading: sharesLoading } = useScanShares(scanId, open)
  const { data: myGroups = [] } = useMyGroups()
  const { data: userResults = [] } = useUserSearch(userQuery)

  const shareWithUser = useShareWithUser(scanId)
  const shareWithGroup = useShareWithGroup(scanId)
  const revokeShare = useRevokeShare(scanId)

  const sharedGroupIds = new Set(shares.map((s) => s.shared_with_group?.id).filter(Boolean))
  const sharedUserIds = new Set(shares.map((s) => s.shared_with_user?.id).filter(Boolean))

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Share Scan
          </DialogTitle>
        </DialogHeader>

        {/* Current shares */}
        {shares.length > 0 && (
          <div className="space-y-1.5 pb-3 border-b border-border">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Shared with</p>
            {shares.map((share) => (
              <div key={share.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-1.5">
                  {share.shared_with_group ? (
                    <>
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{share.shared_with_group.name}</span>
                      <Badge variant="secondary" className="text-xs py-0">group</Badge>
                    </>
                  ) : (
                    <>
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{share.shared_with_user?.username}</span>
                    </>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => revokeShare.mutate(share.id)}
                  disabled={revokeShare.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Tabs defaultValue="groups">
          <TabsList className="w-full">
            <TabsTrigger value="groups" className="flex-1">My Groups</TabsTrigger>
            <TabsTrigger value="users" className="flex-1">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="groups" className="space-y-2 mt-3">
            {myGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                You are not a member of any groups.
              </p>
            ) : (
              myGroups.map((group) => {
                const already = sharedGroupIds.has(group.id)
                return (
                  <div key={group.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{group.name}</span>
                      {group.description && (
                        <span className="text-xs text-muted-foreground truncate hidden sm:block">
                          {group.description}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={already ? 'secondary' : 'default'}
                      disabled={already || shareWithGroup.isPending}
                      onClick={() => !already && shareWithGroup.mutate(group.id)}
                      className="shrink-0"
                    >
                      {shareWithGroup.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : already ? (
                        'Shared'
                      ) : (
                        'Share'
                      )}
                    </Button>
                  </div>
                )
              })
            )}
          </TabsContent>

          <TabsContent value="users" className="space-y-3 mt-3">
            <Input
              placeholder="Search by username…"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
            />
            <div className="space-y-2">
              {userResults.map((user) => {
                const already = sharedUserIds.has(user.id)
                return (
                  <div key={user.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{user.username}</span>
                    </div>
                    <Button
                      size="sm"
                      variant={already ? 'secondary' : 'default'}
                      disabled={already || shareWithUser.isPending}
                      onClick={() => !already && shareWithUser.mutate(user.id)}
                      className="shrink-0"
                    >
                      {shareWithUser.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : already ? (
                        'Shared'
                      ) : (
                        'Share'
                      )}
                    </Button>
                  </div>
                )
              })}
              {userQuery.length >= 1 && userResults.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">No users found.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
