import { useState } from 'react'
import { Plus, Trash2, UserMinus, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  useAdminGroups,
  useAdminUsers,
  useCreateGroup,
  useDeleteGroup,
  useAddMember,
  useRemoveMember,
} from '@/hooks/useAdmin'
import type { Group } from '@/types'

function GroupRow({ group }: { group: Group }) {
  const [open, setOpen] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const deleteGroup = useDeleteGroup()
  const addMember = useAddMember()
  const removeMember = useRemoveMember()
  const { data: allUsers = [] } = useAdminUsers(userSearch)

  const memberIds = new Set(group.members.map((m) => m.user_id))
  const candidates = allUsers.filter((u) => !memberIds.has(u.id))

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-card">
        <button
          className="flex items-center gap-2 text-left flex-1 min-w-0"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="font-medium truncate">{group.name}</span>
          <Badge variant="secondary" className="shrink-0">{group.members.length}</Badge>
          {group.description && (
            <span className="text-sm text-muted-foreground truncate hidden md:block">
              {group.description}
            </span>
          )}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive shrink-0"
          onClick={() => deleteGroup.mutate(group.id)}
          disabled={deleteGroup.isPending}
        >
          {deleteGroup.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      {open && (
        <div className="px-4 pb-4 pt-2 space-y-3 border-t border-border bg-background">
          {/* Current members */}
          {group.members.length > 0 ? (
            <div className="space-y-1">
              {group.members.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between text-sm">
                  <span>{m.username}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeMember.mutate({ groupId: group.id, userId: m.user_id })}
                    disabled={removeMember.isPending}
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          )}

          {/* Add member */}
          <div className="space-y-2 pt-1">
            <Input
              placeholder="Search users to add…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="h-8 text-sm"
            />
            {candidates.slice(0, 8).map((u) => (
              <div key={u.id} className="flex items-center justify-between text-sm">
                <span>{u.username}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs"
                  onClick={() => addMember.mutate({ groupId: group.id, userId: u.id })}
                  disabled={addMember.isPending}
                >
                  Add
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function GroupManager() {
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const { data: groups = [], isLoading } = useAdminGroups()
  const createGroup = useCreateGroup()

  const handleCreate = () => {
    if (!newName.trim()) return
    createGroup.mutate(
      { name: newName.trim(), description: newDesc.trim() || undefined },
      { onSuccess: () => { setNewName(''); setNewDesc('') } },
    )
  }

  return (
    <div className="space-y-4">
      {/* Create group */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4 font-medium text-sm">Create Group</CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          <Input
            placeholder="Group name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <Input
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={!newName.trim() || createGroup.isPending}
          >
            {createGroup.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Plus className="h-4 w-4 mr-1" />
            )}
            Create
          </Button>
        </CardContent>
      </Card>

      {/* Group list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No groups yet.</p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <GroupRow key={g.id} group={g} />
          ))}
        </div>
      )}
    </div>
  )
}
