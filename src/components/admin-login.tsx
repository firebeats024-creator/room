'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Building2, Eye, EyeOff, Lock, User, ShieldCheck, Loader2, KeyRound } from 'lucide-react'
import { toast } from 'sonner'

interface AdminLoginProps {
  onLoginSuccess: (token: string, name: string) => void
}

export default function AdminLogin({ onLoginSuccess }: AdminLoginProps) {
  const [isSetup, setIsSetup] = useState(false)
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)

  // Login fields
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Setup fields
  const [setupName, setSetupName] = useState('')
  const [setupUsername, setSetupUsername] = useState('')
  const [setupPassword, setSetupPassword] = useState('')
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('')
  const [showSetupPassword, setShowSetupPassword] = useState(false)

  // Forgot password fields
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetUsername, setResetUsername] = useState('')
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')
  const [resetKey, setResetKey] = useState('')
  const [showResetNewPassword, setShowResetNewPassword] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  useEffect(() => {
    checkAdminExists()
  }, [])

  const checkAdminExists = async () => {
    try {
      const res = await fetch('/api/auth/setup')
      const data = await res.json()
      setIsSetup(!data.hasAdmin)
    } catch {
      setIsSetup(true)
    } finally {
      setChecking(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      toast.error('Please enter username and password')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Invalid credentials')
        return
      }

      // Store token in localStorage (works in all environments including iframes)
      if (data.token) {
        localStorage.setItem('admin_token', data.token)
        localStorage.setItem('admin_name', data.name || 'Admin')
      }

      toast.success('Login successful!')
      onLoginSuccess(data.token, data.name || 'Admin')
    } catch {
      toast.error('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!setupUsername || !setupPassword) {
      toast.error('Please fill all required fields')
      return
    }
    if (setupPassword.length < 4) {
      toast.error('Password must be at least 4 characters')
      return
    }
    if (setupPassword !== setupConfirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: setupUsername,
          password: setupPassword,
          name: setupName || 'Admin',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Setup failed')
        return
      }

      // Auto-login after setup
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: setupUsername, password: setupPassword }),
      })
      const loginData = await loginRes.json()

      if (loginRes.ok && loginData.token) {
        localStorage.setItem('admin_token', loginData.token)
        localStorage.setItem('admin_name', loginData.name || 'Admin')
        toast.success('Admin account created! Welcome!')
        onLoginSuccess(loginData.token, loginData.name || 'Admin')
      } else {
        toast.success('Admin account created! Please login.')
        setIsSetup(false)
        setUsername(setupUsername)
      }

      setSetupName('')
      setSetupUsername('')
      setSetupPassword('')
      setSetupConfirmPassword('')
    } catch {
      toast.error('Setup failed')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  // First-time setup screen
  if (isSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-4">
        <Card className="w-full max-w-md shadow-xl border-emerald-100">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-3">
              <div className="rounded-xl bg-emerald-600 p-3 shadow-lg shadow-emerald-200">
                <ShieldCheck className="h-8 w-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">Create Admin Account</CardTitle>
            <CardDescription className="text-gray-500">
              First time? Set up your admin credentials to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSetup} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={setupName}
                    onChange={(e) => setSetupName(e.target.value)}
                    placeholder="Enter your name"
                    className="pl-10 h-11"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Username <span className="text-red-500">*</span></label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={setupUsername}
                    onChange={(e) => setSetupUsername(e.target.value)}
                    placeholder="Choose a username"
                    className="pl-10 h-11"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Password <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type={showSetupPassword ? 'text' : 'password'}
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    placeholder="Min 4 characters"
                    className="pl-10 pr-10 h-11"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetupPassword(!showSetupPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showSetupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Confirm Password <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="password"
                    value={setupConfirmPassword}
                    onChange={(e) => setSetupConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="pl-10 h-11"
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Admin Account'
                )}
              </Button>
            </form>
            {/* Back to login link */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsSetup(false)}
                className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors py-2 rounded-lg hover:bg-gray-50"
              >
                <Building2 className="h-4 w-4" />
                Back to Login
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Login screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-4">
      <Card className="w-full max-w-sm shadow-xl border-emerald-100">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <div className="rounded-xl bg-emerald-600 p-3 shadow-lg shadow-emerald-200">
              <Building2 className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">Room Rent</CardTitle>
          <CardDescription className="text-gray-500">
            Manager — Admin Login
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="pl-10 h-11"
                  autoComplete="username"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="pl-10 pr-10 h-11"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </Button>
          </form>

          {/* Forgot Password */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            {!showForgotPassword ? (
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="w-full text-center text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors py-2 rounded-lg hover:bg-emerald-50"
              >
                Forgot Password?
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <KeyRound className="h-4 w-4 text-emerald-600" />
                  Reset Password
                </div>
                <p className="text-xs text-gray-500">
                  Enter your username, new password, and the server reset key to reset your password.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!resetUsername || !resetNewPassword || !resetKey) {
                      toast.error('All fields are required')
                      return
                    }
                    if (resetNewPassword.length < 4) {
                      toast.error('Password must be at least 4 characters')
                      return
                    }
                    if (resetNewPassword !== resetConfirmPassword) {
                      toast.error('Passwords do not match')
                      return
                    }
                    setResetLoading(true)
                    try {
                      const res = await fetch('/api/auth/reset-password', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          username: resetUsername,
                          newPassword: resetNewPassword,
                          resetKey,
                        }),
                      })
                      const data = await res.json()
                      if (!res.ok) {
                        toast.error(data.error || 'Reset failed')
                        return
                      }
                      toast.success(data.message || 'Password reset successfully!')
                      setShowForgotPassword(false)
                      setResetUsername('')
                      setResetNewPassword('')
                      setResetConfirmPassword('')
                      setResetKey('')
                      setUsername(resetUsername)
                    } catch {
                      toast.error('Reset failed. Please try again.')
                    } finally {
                      setResetLoading(false)
                    }
                  }}
                  className="space-y-3"
                >
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Username</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <Input
                        value={resetUsername}
                        onChange={(e) => setResetUsername(e.target.value)}
                        placeholder="Enter your username"
                        className="pl-9 h-9 text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <Input
                        type={showResetNewPassword ? 'text' : 'password'}
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        placeholder="Min 4 characters"
                        className="pl-9 pr-9 h-9 text-sm"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetNewPassword(!showResetNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showResetNewPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Confirm New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <Input
                        type="password"
                        value={resetConfirmPassword}
                        onChange={(e) => setResetConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="pl-9 h-9 text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">
                      Reset Key
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <Input
                        type="password"
                        value={resetKey}
                        onChange={(e) => setResetKey(e.target.value)}
                        placeholder="Enter reset key"
                        className="pl-9 h-9 text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 h-9 text-sm"
                      onClick={() => {
                        setShowForgotPassword(false)
                        setResetUsername('')
                        setResetNewPassword('')
                        setResetConfirmPassword('')
                        setResetKey('')
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 h-9 text-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={resetLoading}
                    >
                      {resetLoading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          Resetting...
                        </>
                      ) : (
                        'Reset Password'
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
