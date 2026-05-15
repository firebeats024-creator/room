'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Home,
  Users,
  DollarSign,
  Clock,
  Shield,
  AlertCircle,
  RefreshCw,
  BedDouble,
  CheckCircle2,
  XCircle,
  Download,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface DashboardData {
  totalRooms: number
  occupiedRooms: number
  vacantRooms: number
  maintenanceRooms: number
  activeGuests: number
  totalRevenue: number
  overdueBills: number
  overdueAmount: number
  activeDeposits: number
  totalDepositAmount: number
  recentGuests: {
    id: string
    name: string
    phone: string
    checkInDate: string
    status: string
    room: {
      roomNo: string
      type: string
      monthlyRent: number
    }
  }[]
  revenueByMonth: Record<number, number>
  occupancyRate: number
}

function StatCardSkeleton() {
  return (
    <Card className="py-4">
      <CardHeader className="pb-0 pt-0">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

export default function PgDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard')
      if (!res.ok) throw new Error('Failed to fetch dashboard data')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/export')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `PG_Hostel_Report_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // Will show error via sonner if needed
    } finally {
      setExporting(false)
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  const statCards = data
    ? [
        {
          title: 'Total Rooms',
          value: data.totalRooms,
          subtitle: `${data.occupancyRate}% occupancy`,
          icon: Home,
          color: 'text-emerald-600',
          bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        },
        {
          title: 'Occupied',
          value: data.occupiedRooms,
          subtitle: `${data.activeGuests} active guests`,
          icon: CheckCircle2,
          color: 'text-teal-600',
          bg: 'bg-teal-50 dark:bg-teal-950/40',
        },
        {
          title: 'Vacant',
          value: data.vacantRooms,
          subtitle: `${data.maintenanceRooms} maintenance`,
          icon: BedDouble,
          color: 'text-amber-600',
          bg: 'bg-amber-50 dark:bg-amber-950/40',
        },
        {
          title: 'Monthly Revenue',
          value: formatCurrency(data.totalRevenue),
          subtitle: 'Total collected revenue',
          icon: DollarSign,
          color: 'text-emerald-600',
          bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        },
        {
          title: 'Due Bills (Overdue)',
          value: data.overdueBills,
          subtitle: `Total due: ${formatCurrency(data.overdueAmount)}`,
          icon: AlertCircle,
          color: 'text-rose-600',
          bg: 'bg-rose-50 dark:bg-rose-950/40',
        },
        {
          title: 'Active Deposits',
          value: data.activeDeposits,
          subtitle: formatCurrency(data.totalDepositAmount) + ' held',
          icon: Shield,
          color: 'text-violet-600',
          bg: 'bg-violet-50 dark:bg-violet-950/40',
        },
      ]
    : []

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">
            Overview of your PG Hostel operations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDashboard}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Download className={`size-4 ${exporting ? 'animate-bounce' : ''}`} />
            {exporting ? 'Exporting...' : 'Export Excel'}
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="size-5 text-rose-600" />
            <p className="text-sm text-rose-700 dark:text-rose-400">
              {error}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchDashboard}
              className="ml-auto text-rose-600 hover:text-rose-700"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))
          : statCards.map((card) => (
              <Card key={card.title} className="py-4">
                <CardHeader className="pb-0 pt-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">
                      {card.title}
                    </p>
                    <div className={`rounded-md p-2 ${card.bg}`}>
                      <card.icon className={`size-4 ${card.color}`} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-bold tracking-tight">
                    {card.value}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {card.subtitle}
                  </p>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Recent Guests Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="size-5 text-emerald-600" />
            Recent Guests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton />
          ) : data && data.recentGuests.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentGuests.map((guest) => (
                  <TableRow key={guest.id}>
                    <TableCell className="font-medium">
                      {guest.name}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <Home className="size-3.5 text-muted-foreground" />
                        {guest.room?.roomNo || '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(guest.checkInDate)}
                    </TableCell>
                    <TableCell>
                      {guest.status === 'Live' ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-400 border-0">
                          <CheckCircle2 className="size-3" />
                          Active
                        </Badge>
                      ) : guest.status === 'CheckedOut' ? (
                        <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 border-0">
                          <XCircle className="size-3" />
                          Checked Out
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <Clock className="size-3" />
                          {guest.status}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Users className="size-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                No guests yet. Check in your first guest to see them here.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
