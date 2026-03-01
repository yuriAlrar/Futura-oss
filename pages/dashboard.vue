<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 mb-2">ダッシュボード</h1>
        <p class="text-gray-600">BTCポートフォリオの概要</p>
      </div>
      <v-btn variant="outlined" prepend-icon="mdi-refresh" :loading="loading" @click="loadDashboardData">
        更新
      </v-btn>
    </div>


    <!-- Asset History - Full Width -->
    <div class="mb-8">
      <v-card class="card-shadow">
        <v-card-title class="px-6 py-4 border-b">
          <div class="flex items-center justify-between w-full">
            <h3 class="text-lg font-semibold text-gray-900">BTC保有量推移（30日間）</h3>
            <div class="flex items-center space-x-2">
              <v-btn-toggle v-model="assetViewMode" variant="outlined" density="compact" mandatory>
                <v-btn value="chart" size="small">
                  <Icon name="mdi:chart-line" class="mr-1" />
                  チャート
                </v-btn>
                <v-btn value="table" size="small">
                  <Icon name="mdi:table" class="mr-1" />
                  テーブル
                </v-btn>
              </v-btn-toggle>
            </div>
          </div>
        </v-card-title>
        <v-card-text class="p-6">
          <div v-if="dashboardData?.balanceHistory.length">
            <!-- Summary Stats -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
              <div class="text-center">
                <p class="text-xs text-gray-500 uppercase tracking-wider">30日間変動</p>
                <p class="text-lg font-bold" :class="period30ChangeClass">
                  {{ period30ChangeText }}
                </p>
              </div>
              <div class="text-center">
                <p class="text-xs text-gray-500 uppercase tracking-wider">最大保有量</p>
                <p class="text-lg font-bold text-gray-900">
                  {{ formatBTC(maxBTCBalance) }} BTC
                </p>
              </div>
              <div class="text-center">
                <p class="text-xs text-gray-500 uppercase tracking-wider">最小保有量</p>
                <p class="text-lg font-bold text-gray-900">
                  {{ formatBTC(minBTCBalance) }} BTC
                </p>
              </div>
              <div class="text-center">
                <p class="text-xs text-gray-500 uppercase tracking-wider">平均保有量</p>
                <p class="text-lg font-bold text-gray-900">
                  {{ formatBTC(avgBTCBalance) }} BTC
                </p>
              </div>
            </div>

            <!-- Chart View -->
            <div v-if="assetViewMode === 'chart'" class="h-80">
              <UserBalanceChart :data="dashboardData.balanceHistory" />
            </div>
            <!-- Table View -->
            <div v-else-if="assetViewMode === 'table'">
              <UserAssetHistoryTable :data="dashboardData.balanceHistory" />
            </div>
          </div>
          <div v-else class="h-80 flex items-center justify-center bg-gray-50 rounded-lg">
            <div class="text-center">
              <Icon name="mdi:chart-line" class="text-4xl text-gray-400 mb-2" />
              <p class="text-gray-500">BTC残高データがありません</p>
              <p class="text-sm text-gray-400 mt-2">取引を開始するとBTC保有量推移が表示されます</p>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- Dashboard Cards - 2x2 Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-8">
      <!-- Balance Card -->
      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">現在の残高</h3>
          </div>
          <div class="space-y-1">
            <p class="text-2xl font-bold text-gray-900 font-mono">
              <Icon name="mdi:currency-jpy" class="text-xl text-gray-500 mr-1 align-middle" />
              {{ formatNumber(dashboardData?.currentValue || 0) }}
            </p>
            <p class="text-xl text-gray-900 font-mono">
              <Icon name="mdi:bitcoin" class="text-xl text-gray-500 mr-1 align-middle" />
              {{ formatBTC(dashboardData?.currentBalance || 0) }}
            </p>
          </div>
          <!-- Request Button -->
          <div class="mt-4">
            <NuxtLink to="/transaction-requests"
              class="block w-full px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-center"
              :class="{ 'bg-gray-400 cursor-not-allowed': hasPermission('transaction:request') === false }">
              入出金リクエスト
            </NuxtLink>
          </div>
        </v-card-text>
      </v-card>

      <!-- Transactions Card -->
      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">今月の取引</h3>
            <Icon name="mdi:swap-horizontal" class="text-2xl text-purple-500" />
          </div>
          <div class="space-y-1">
            <p class="text-2xl font-bold text-gray-900">{{ monthlyTransactionCount }}</p>
            <p class="text-sm text-gray-500">件</p>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- Statistics Cards - 2x2 Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-8">
      <!-- Deposit Principal Card -->
      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">入金元本</h3>
            <Icon name="mdi:bank-transfer-in" class="text-2xl text-blue-500" />
          </div>
          <div class="space-y-1">
            <p class="text-2xl font-bold text-blue-700 font-mono">
              {{ formatBTC(dashboardData?.depositPrincipal || 0) }} BTC
            </p>
            <p class="text-sm text-gray-500">承認済み入金の合計</p>
          </div>
        </v-card-text>
      </v-card>

      <!-- Withdrawal Total Card -->
      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">出金額</h3>
            <Icon name="mdi:bank-transfer-out" class="text-2xl text-orange-500" />
          </div>
          <div class="space-y-1">
            <p class="text-2xl font-bold text-orange-700 font-mono">
              {{ formatBTC(dashboardData?.withdrawalTotal || 0) }} BTC
            </p>
            <p class="text-sm text-gray-500">承認済み出金の合計</p>
          </div>
        </v-card-text>
      </v-card>

      <!-- Credit Bonus Card -->
      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">クレジットボーナス</h3>
            <Icon name="mdi:gift" class="text-2xl text-purple-500" />
          </div>
          <div class="space-y-1">
            <p class="text-2xl font-bold text-purple-700 font-mono">
              {{ formatBTC(dashboardData?.creditBonus || 0) }} BTC
            </p>
            <p class="text-sm text-gray-500">ボーナスの合計</p>
          </div>
        </v-card-text>
      </v-card>

      <!-- Net Profit Card -->
      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">純利益</h3>
            <Icon name="mdi:chart-line" class="text-2xl" :class="netProfitIconClass" />
          </div>
          <div class="space-y-1">
            <p class="text-2xl font-bold font-mono" :class="netProfitClass">
              {{ formatBTC(dashboardData?.netProfit || 0) }} BTC
            </p>
            <p class="text-sm text-gray-500">残高 - 元本 + 出金額</p>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- Recent Transactions - Full Width -->
    <div class="mb-8">
      <v-card class="card-shadow">
        <v-card-title class="px-6 py-4 border-b flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">最近の取引</h3>
          <v-btn variant="text" color="primary" size="small" to="/transactions">
            すべて見る
          </v-btn>
        </v-card-title>
        <v-card-text class="p-6">
          <div v-if="dashboardData?.recentTransactions.length" class="space-y-4">
            <div v-for="transaction in dashboardData.recentTransactions" :key="transaction.transaction_id"
              class="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
              <div class="flex items-center space-x-3">
                <v-chip :color="getTransactionTypeColor(transaction.transaction_type)" size="small" variant="flat">
                  <Icon :name="getTransactionTypeIcon(transaction.transaction_type)" class="mr-1" />
                  {{ getTransactionTypeLabel(transaction.transaction_type) }}
                </v-chip>
                <div>
                  <p class="text-sm font-medium">{{ transaction.reason }}</p>
                  <p class="text-xs text-gray-500">{{ transaction.memo }}</p>
                  <p class="text-xs text-gray-500">{{ formatDate(transaction.timestamp) }}</p>
                </div>
              </div>
              <div class="text-right">
                <p class="font-mono font-semibold" :class="getTransactionTypeTextColor(transaction.transaction_type)">
                  {{ getTransactionTypeSign(transaction.transaction_type, transaction.amount) }}{{
                    formatBTC(Math.abs(transaction.amount)) }} BTC
                </p>
              </div>
            </div>
          </div>
          <div v-else class="text-center py-8">
            <Icon name="mdi:history" class="text-4xl text-gray-400 mb-2" />
            <p class="text-gray-500">取引履歴がありません</p>
          </div>
        </v-card-text>
      </v-card>
    </div>


  </div>
</template>

<script setup lang="ts">
import type { DashboardData, MarketRate } from '~/types'
import {
  getTransactionTypeLabel,
  getTransactionTypeColor,
  getTransactionTypeIcon,
  getTransactionTypeTextColor,
  getTransactionTypeSign,
  calculateBtcSum
} from '~/utils/transaction'
import { formatNumber, formatBTC } from '~/utils/format'

const logger = useLogger({ prefix: '[PAGE-DASHBOARD]' })

definePageMeta({
  middleware: 'auth'
})

useHead({
  title: 'ダッシュボード - M・S CFD App'
})

const { showError } = useNotification()
const apiClient = useApiClient()

// State
const dashboardData = ref<DashboardData | null>(null)
const marketRates = ref<MarketRate[]>([])
const loading = ref(false)
const assetViewMode = ref<'chart' | 'table'>('chart')

// Computed
const currentRate = computed(() => {
  if (!dashboardData.value?.balanceHistory.length) return 0
  const latest = dashboardData.value.balanceHistory[dashboardData.value.balanceHistory.length - 1]
  return latest.btc_rate
})

const valueChangeText = computed(() => {
  if (!dashboardData.value?.balanceHistory.length || dashboardData.value.balanceHistory.length < 2) {
    return '+0.00%'
  }

  const history = dashboardData.value.balanceHistory
  const current = history[history.length - 1].btc_amount
  const previous = history[history.length - 2].btc_amount

  if (previous === 0) return '+0.00%'

  const change = ((current - previous) / previous) * 100
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
})

const valueChangeClass = computed(() => {
  const text = valueChangeText.value
  if (text.startsWith('+')) return 'text-green-600'
  if (text.startsWith('-')) return 'text-red-600'
  return 'text-gray-600'
})

const monthlyTransactionCount = computed(() => {
  if (!dashboardData.value?.recentTransactions.length) return 0

  const thisMonth = new Date()
  thisMonth.setDate(1)
  thisMonth.setHours(0, 0, 0, 0)

  return dashboardData.value.recentTransactions.filter(t =>
    new Date(t.timestamp) >= thisMonth
  ).length
})

// Asset history statistics
const period30ChangeText = computed(() => {
  if (!dashboardData.value?.balanceHistory.length || dashboardData.value.balanceHistory.length < 2) {
    return '+0.00%'
  }

  const history = dashboardData.value.balanceHistory
  const current = history[history.length - 1].btc_amount
  const initial = history[0].btc_amount

  if (initial === 0) return '+0.00%'

  const change = ((current - initial) / initial) * 100
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
})

const period30ChangeClass = computed(() => {
  const text = period30ChangeText.value
  if (text.startsWith('+')) return 'text-green-600'
  if (text.startsWith('-')) return 'text-red-600'
  return 'text-gray-600'
})

const maxBTCBalance = computed(() => {
  if (!dashboardData.value?.balanceHistory.length) return 0
  return Math.max(...dashboardData.value.balanceHistory.map(item => item.btc_amount))
})

const minBTCBalance = computed(() => {
  if (!dashboardData.value?.balanceHistory.length) return 0
  return Math.min(...dashboardData.value.balanceHistory.map(item => item.btc_amount))
})

const avgBTCBalance = computed(() => {
  if (!dashboardData.value?.balanceHistory.length) return 0
  const amounts = dashboardData.value.balanceHistory.map(item => item.btc_amount)
  const sum = calculateBtcSum(amounts)
  return sum / dashboardData.value.balanceHistory.length
})

// Market rate statistics
const rateChangeText = computed(() => {
  if (marketRates.value.length < 2) return '+0.00%'

  const sortedRates = [...marketRates.value].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const initial = sortedRates[0].btc_jpy_rate
  const current = sortedRates[sortedRates.length - 1].btc_jpy_rate

  if (initial === 0) return '+0.00%'

  const change = ((current - initial) / initial) * 100
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
})

const rateChangeClass = computed(() => {
  const text = rateChangeText.value
  if (text.startsWith('+')) return 'text-green-600'
  if (text.startsWith('-')) return 'text-red-600'
  return 'text-gray-600'
})

const maxRate = computed(() => {
  if (!marketRates.value.length) return 0
  return Math.max(...marketRates.value.map(rate => rate.btc_jpy_rate))
})

const minRate = computed(() => {
  if (!marketRates.value.length) return 0
  return Math.min(...marketRates.value.map(rate => rate.btc_jpy_rate))
})

const avgRate = computed(() => {
  if (!marketRates.value.length) return 0
  const sum = marketRates.value.reduce((acc, rate) => acc + rate.btc_jpy_rate, 0)
  return Math.round(sum / marketRates.value.length)
})

// Net profit styling
const netProfitClass = computed(() => {
  const netProfit = dashboardData.value?.netProfit || 0
  if (netProfit > 0) return 'text-green-600'
  if (netProfit < 0) return 'text-red-600'
  return 'text-gray-900'
})

const netProfitIconClass = computed(() => {
  const netProfit = dashboardData.value?.netProfit || 0
  if (netProfit > 0) return 'text-green-600'
  if (netProfit < 0) return 'text-red-600'
  return 'text-gray-500'
})

// Methods
const loadDashboardData = async () => {
  loading.value = true
  try {
    const [dashboardResponse, ratesResponse] = await Promise.all([
      apiClient.get<DashboardData>('/dashboard'),
      apiClient.get<{ items: MarketRate[] }>('/market-rates', { params: { limit: 30 } })
    ])
    dashboardData.value = dashboardResponse.data!
    marketRates.value = ratesResponse.data!.items || []
  } catch (error) {
    logger.error('ダッシュボードデータの読み込みに失敗しました:', error)
    showError('ダッシュボードデータの取得に失敗しました')
  } finally {
    loading.value = false
  }
}

// Permission check
const hasPermission = (permission: string) => {
  const { user } = useAuth()
  return user.value?.permissions?.includes(permission)
}



// Utility functions
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Load data on mount
onMounted(() => {
  loadDashboardData()
})
</script>