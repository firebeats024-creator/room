'use client'

import { useState, useEffect } from 'react'
import { useLanguage } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  User, Lock, Eye, EyeOff, Plus, Trash2, Shield, KeyRound, Users, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

interface AdminUser {
  id: string
  username: string
  name: string
  createdAt: string
}

interface AdminManagerProps {
  token: string
  currentAdminName: string
  currentAdminId: string
}

export default function AdminManager({ token, currentAdminName, currentAdminId }: AdminManagerProps) {
  const { t } = useLanguage()
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)

  // Change password dialog
  const [changePwOpen, setChangePwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [changingPw, setChangingPw] = useState(false)

  // Create admin dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newAdminPw, setNewAdminPw] = useState('')
  const [showNewAdminPw, setShowNewAdminPw] = useState(false)
  const [creating, setCreating] = useState(false)

  // Delete confirm dialog
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const [deleting, setDeleting] = useState(false)

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  useEffect(() => {
    loadAdmins()
  }, [])

  const loadAdmins = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/admins', { headers: authHeaders })
      const data = await res.json()
      if (res.ok) {
        setAdmins(data.admins)
      }
    } catch {
      toast.error('Failed to load admins')
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async () => {
    if (!currentPw || !newPw) {
      toast.error('Please fill all fields')
      return
    }
    if (newPw.length < 4) {
      toast.error('New password must be at least 4 characters')
      return
    }
    if (newPw !== confirmPw) {
      toast.error(t('login_no_match'))
      return
    }
    setChangingPw(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to change password')
        return
      }
      toast.success('Password changed successfully!')
      setChangePwOpen(false)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch {
      toast.error('Failed to change password')
    } finally {
      setChangingPw(false)
    }
  }

  const handleCreateAdmin = async () => {
    if (!newUsername || !newAdminPw) {
      toast.error('Username and password are required')
      return
    }
    if (newAdminPw.length < 4) {
      toast.error(t('login_min_4'))
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/auth/admins', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ username: newUsername, password: newAdminPw, name: newName || 'Admin' }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to create admin')
        return
      }
      toast.success(`Admin "${newUsername}" created!`)
      setCreateOpen(false)
      setNewName('')
      setNewUsername('')
      setNewAdminPw('')
      loadAdmins()
    } catch {
      toast.error('Failed to create admin')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteAdmin = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/auth/admins?id=${deleteTarget.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to delete admin')
        return
      }
      toast.success(`Admin "${deleteTarget.username}" deleted`)
      setDeleteTarget(null)
      loadAdmins()
    } catch {
      toast.error('Failed to delete admin')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-emerald-600" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('admin_accounts')}</h3>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setChangePwOpen(true)}
            className="gap-1.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {t('admin_change_password')}
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('admin_new_admin')}
          </Button>
        </div>
      </div>

      {/* Current Admin Info */}
      <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-emerald-600 p-2">
              <User className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100 truncate">
                {currentAdminName} <span className="text-xs font-normal text-emerald-600">{t('admin_you')}</span>
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{t('admin_logged_in')}</p>
            </div>
            <div className="rounded-full bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5">
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">{t('admin_active')}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Admin List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : admins.length <= 1 ? (
        <div className="text-center py-6 text-gray-400">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('admin_no_other')}</p>
          <p className="text-xs">{t('admin_click_new')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {admins
            .filter(a => a.id !== currentAdminId)
            .map(admin => (
              <div
                key={admin.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900"
              >
                <div className="rounded-full bg-gray-200 dark:bg-gray-700 p-2">
                  <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {admin.name}
                  </p>
                  <p className="text-xs text-gray-500">@{admin.username}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setDeleteTarget(admin)}
                  className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
        </div>
      )}

      {/* ─── Change Password Dialog ─── */}
      <Dialog open={changePwOpen} onOpenChange={setChangePwOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-emerald-600" />
              {t('admin_change_password')}
            </DialogTitle>
            <DialogDescription>
              {t('admin_update_password')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">{t('admin_current_password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="Enter current password"
                  className="pl-10 pr-10 h-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">{t('admin_new_password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type={showNewPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder={t('setup_min_4')}
                  className="pl-10 pr-10 h-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">{t('admin_confirm_new')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder={t('setup_reenter')}
                  className="pl-10 h-10"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setChangePwOpen(false)}>{t('cancel')}</Button>
            <Button
              onClick={handleChangePassword}
              disabled={changingPw || !currentPw || !newPw || newPw !== confirmPw}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {changingPw ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {t('admin_change')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Create Admin Dialog ─── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-emerald-600" />
              {t('admin_create_new')}
            </DialogTitle>
            <DialogDescription>
              {t('admin_create_desc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">{t('setup_full_name')}</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('setup_enter_name')}
                  className="pl-10 h-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">{t('setup_username')} <span className="text-red-500">*</span></label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder={t('setup_choose_username')}
                  className="pl-10 h-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">{t('setup_password')} <span className="text-red-500">*</span></label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type={showNewAdminPw ? 'text' : 'password'}
                  value={newAdminPw}
                  onChange={(e) => setNewAdminPw(e.target.value)}
                  placeholder={t('setup_min_4')}
                  className="pl-10 pr-10 h-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewAdminPw(!showNewAdminPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNewAdminPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('cancel')}</Button>
            <Button
              onClick={handleCreateAdmin}
              disabled={creating || !newUsername || !newAdminPw}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {creating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {t('admin_create_new')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Admin Confirm Dialog ─── */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="h-5 w-5" />
              {t('admin_delete')}
            </DialogTitle>
            <DialogDescription>
              {t('admin_delete_confirm')} <strong>@{deleteTarget?.username}</strong> ({deleteTarget?.name})? {t('admin_lose_access')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('cancel')}</Button>
            <Button
              onClick={handleDeleteAdmin}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {t('admin_delete_button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
