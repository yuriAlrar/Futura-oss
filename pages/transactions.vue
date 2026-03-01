<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 mb-2">取引結果</h1>
      <p class="text-gray-600">あなたの取引履歴を確認できます</p>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
      <!-- 承認済み取引 -->
      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">承認済み取引</h3>
            <Icon name="mdi:check-circle" class="text-2xl text-blue-500" />
          </div>
          <p class="text-2xl font-bold text-gray-900">{{ approvedTransactionCount }}</p>
          <p class="text-xs text-gray-500 mt-1">全体: {{ totalTransactions }}</p>
        </v-card-text>
      </v-card>

      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">承認済み入金額</h3>
            <Icon name="mdi:plus-circle" class="text-2xl text-green-500" />
          </div>
          <p class="text-2xl font-bold text-green-600 font-mono">
            {{ formatBTC(approvedDeposits) }} BTC
          </p>
          <p class="text-xs text-gray-500 mt-1">全体: {{ formatBTC(totalDeposits) }} BTC</p>
        </v-card-text>
      </v-card>

      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">承認済み出金額</h3>
            <Icon name="mdi:minus-circle" class="text-2xl text-red-500" />
          </div>
          <p class="text-2xl font-bold text-red-600 font-mono">
            {{ formatBTC(approvedWithdrawals) }} BTC
          </p>
          <p class="text-xs text-gray-500 mt-1">全体: {{ formatBTC(totalWithdrawals) }} BTC</p>
        </v-card-text>
      </v-card>

      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">承認待ち取引</h3>
            <Icon name="mdi:clock-outline" class="text-2xl text-orange-500" />
          </div>
          <p class="text-2xl font-bold text-orange-600">{{ pendingTransactionCount }}</p>
          <p class="text-xs text-gray-500 mt-1">総: {{ totalTransactions }}</p>
        </v-card-text>
      </v-card>
    </div>

    <!-- Filters -->
    <v-card class="mb-6">
      <v-card-text class="py-4">
        <div class="flex items-center space-x-4 flex-wrap gap-y-2">
          <v-select v-model="selectedTransactionType" :items="transactionTypeOptions" label="取引種別" variant="outlined"
            density="compact" class="w-48" />
          <v-select v-model="selectedStatus" :items="statusOptions" label="承認状態" variant="outlined" density="compact"
            class="w-48" />
          <v-text-field v-model="searchQuery" label="検索（メモ）" prepend-inner-icon="mdi-magnify" variant="outlined"
            density="compact" clearable class="w-64" />
          <v-btn variant="outlined" prepend-icon="mdi-refresh" :loading="loading" @click="loadTransactions">
            更新
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Transactions Table -->
    <v-card>
      <v-data-table :headers="headers" :items="filteredTransactions" :loading="loading" :items-per-page="20"
        class="elevation-0" no-data-text="取引履歴がありません" loading-text="読み込み中...">
        <template #[`item.transaction_type`]="{ item }">
          <div class="flex gap-1.5">
            <v-chip :color="getTransactionTypeColor(item)" size="small" variant="flat" class="justify-start">
              <Icon :name="getTransactionTypeIcon(item.transaction_type)" class="mr-1.5 w-3.5 h-3.5" />
              {{ getTransactionTypeLabel(item.transaction_type) }}
            </v-chip>
            <v-tooltip location="top">
              <template #activator="{ props }">
                <Icon v-bind="props" :name="getStatusIcon(item.status)" :class="getStatusIconClass(item.status)"
                  class="w-5 h-5 cursor-help" />
              </template>
              <span>{{ getStatusText(item.status) }}</span>
            </v-tooltip>
          </div>
        </template>

        <template #[`item.amount`]="{ item }">
          <span class="font-mono font-semibold text-lg" :class="getTransactionTypeTextColor(item.transaction_type)">
            {{ getTransactionTypeSign(item.transaction_type, item.amount) }}{{ formatBTC(Math.abs(item.amount)) }} BTC
          </span>
        </template>

        <template #[`item.timestamp`]="{ item }">
          {{ formatDate(item.timestamp) }}
        </template>

        <template #[`item.memo`]="{ item }">
          <div class="max-w-xs">
            <p class="text-sm font-medium">{{ item.reason }}</p>
            <p class="text-xs text-gray-500 mt-1">{{ item.memo }}</p>
          </div>
        </template>

        <template #[`item.running_balance`]="{ item }">
          <span class="font-mono text-sm text-gray-600">
            {{ formatBTC(getRunningBalance(item)) }} BTC
          </span>
        </template>

        <template #[`item.actions`]="{ item }">
          <v-btn size="small" variant="text" color="info" icon="mdi-eye" @click="viewTransactionDetails(item)" />
        </template>
      </v-data-table>
    </v-card>

    <!-- Transaction Details Dialog -->
    <UserTransactionDetailsDialog v-model="showDetailsDialog" :transaction="selectedTransaction" />
  </div>
</template>

<script setup lang="ts">
import type { Transaction } from '~/types'
import {
  getTransactionTypeLabel,
  getTransactionTypeColor as getTransactionTypeColorUtil,
  getTransactionTypeIcon,
  getTransactionTypeTextColor,
  getTransactionTypeSign,
  getTransactionTypeVuetifyColor,
  isApprovedTransaction,
  calculateBtcSum,
  reduceTransactionsBtc
} from '~/utils/transaction'
import { formatBTC } from '~/utils/format'

const logger = useLogger({ prefix: '[PAGE-TRANSACTIONS]' })
const apiClient = useApiClient()

definePageMeta({
  middleware: 'auth'
})

useHead({
  title: '取引結果 - M・S CFD App'
})

const { user } = useAuth()
const { showError } = useNotification()

// State
const transactions = ref<Transaction[]>([])
const loading = ref(false)
const selectedTransactionType = ref('all')
const selectedStatus = ref('all')
const searchQuery = ref('')
const showDetailsDialog = ref(false)
const selectedTransaction = ref<Transaction | null>(null)

// Options
const transactionTypeOptions = [
  { title: 'すべて', value: 'all' },
  { title: '入金', value: 'deposit' },
  { title: '出金', value: 'withdrawal' },
  { title: '資産運用', value: 'asset_management' }
]

const statusOptions = [
  { title: 'すべて', value: 'all' },
  { title: '承認済み', value: 'approved' },
  { title: '承認待ち', value: 'pending' },
  { title: '拒否済み', value: 'rejected' }
]

// Table headers
const headers = [
  { title: '日時', key: 'timestamp', sortable: true },
  { title: '種別/状態', key: 'transaction_type', sortable: true },
  { title: '金額', key: 'amount', sortable: true },
  { title: '理由/メモ', key: 'memo', sortable: false },
  { title: '残高', key: 'running_balance', sortable: false },
  { title: '詳細', key: 'actions', sortable: false, width: 80 }
]

// Computed
const filteredTransactions = computed(() => {
  let filtered = transactions.value

  // Filter by transaction type
  if (selectedTransactionType.value !== 'all') {
    filtered = filtered.filter(t => t.transaction_type === selectedTransactionType.value)
  }

  // Filter by status
  if (selectedStatus.value !== 'all') {
    filtered = filtered.filter(t => {
      const status = t.status || 'approved' // statusが未設定の場合は承認済みとして扱う
      return status === selectedStatus.value
    })
  }

  // Filter by search query (memo field)
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(t =>
      t.memo.toLowerCase().includes(query) ||
      t.reason.toLowerCase().includes(query)
    )
  }

  return filtered
})

const totalTransactions = computed(() => transactions.value.length)

const totalDeposits = computed(() => reduceTransactionsBtc(transactions.value, 'deposit'))
const totalWithdrawals = computed(() => reduceTransactionsBtc(transactions.value, 'withdrawal'))

// 承認済み統計
const approvedTransactionsList = computed(() => transactions.value.filter(t => isApprovedTransaction(t)))

const approvedTransactionCount = computed(() => approvedTransactionsList.value.length)
const approvedDeposits = computed(() => reduceTransactionsBtc(approvedTransactionsList.value, 'deposit'))
const approvedWithdrawals = computed(() => reduceTransactionsBtc(approvedTransactionsList.value, 'withdrawal'))

const pendingTransactionCount = computed(() => {
  return transactions.value.filter(t => t.status === 'pending').length
})

// Methods
const loadTransactions = async () => {
  if (!user.value) return

  loading.value = true
  try {
    logger.debug('取引履歴を読み込み中...', { userId: user.value.user_id })
    const response = await apiClient.get<{ items: Transaction[] }>(
      `/transactions?user_id=${user.value.user_id}`
    )
    logger.debug('APIレスポンス:', response)

    if (response.success && response.data && response.data.items) {
      transactions.value = response.data.items
      logger.info(`取引履歴を${response.data.items.length}件読み込みました`)
    } else {
      logger.warn('APIレスポンスが期待通りの形式ではありません:', response)
      showError('取引履歴のデータ形式に問題があります')
    }
  } catch (error: any) {
    logger.error('取引履歴の読み込みに失敗しました:', error)

    // 詳細なエラー情報を表示
    let errorMessage = '取引履歴の取得に失敗しました'
    if (error?.statusCode === 401) {
      errorMessage = '認証が必要です。ログインし直してください。'
    } else if (error?.statusCode === 403) {
      errorMessage = '取引履歴へのアクセス権限がありません。'
    } else if (error?.statusCode === 500) {
      errorMessage = 'サーバーエラーが発生しました。管理者にお問い合わせください。'
    } else if (error?.data?.message) {
      errorMessage = `エラー: ${error.data.message}`
    }

    showError(errorMessage)
  } finally {
    loading.value = false
  }
}

const getRunningBalance = (targetItem: Transaction) => {
  // すべての履歴（transactions.value）からこの取引の実際のインデックスを探す
  const targetIndex = transactions.value.findIndex(t => t.transaction_id === targetItem.transaction_id)
  if (targetIndex === -1) return 0

  const amountsToSum: number[] = []

  // transactions.value は新しいものが配列の先頭(index: 0)に来るため、
  // 一番古いもの(length - 1)から、対象の取引(targetIndex)まで遡って拾う
  for (let i = transactions.value.length - 1; i >= targetIndex; i--) {
    const transaction = transactions.value[i]

    // 承認済み取引のみ残高に反映
    if (isApprovedTransaction(transaction)) {
      if (['deposit', 'withdrawal', 'asset_management'].includes(transaction.transaction_type)) {
        amountsToSum.push(transaction.amount) // withdrawal はマイナス値なのでそのままPush
      }
    }
  }

  // 浮動小数点誤差を防ぐ共通関数で合算する
  return calculateBtcSum(amountsToSum)
}

const viewTransactionDetails = (transaction: Transaction) => {
  selectedTransaction.value = transaction
  showDetailsDialog.value = true
}

// Utility functions
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const getTransactionTypeColor = (transaction: Transaction) => {
  if (transaction.status === 'pending') {
    return getTransactionTypeVuetifyColor(transaction.transaction_type)
  }
  if (transaction.status === 'rejected') {
    return 'grey'
  }
  return getTransactionTypeColorUtil(transaction.transaction_type)
}

const getStatusColor = (status?: string) => {
  const statusValue = status || 'approved'
  switch (statusValue) {
    case 'approved':
      return 'success'
    case 'pending':
      return 'warning'
    case 'rejected':
      return 'error'
    default:
      return 'info'
  }
}

const getStatusIcon = (status?: string) => {
  const statusValue = status || 'approved'
  switch (statusValue) {
    case 'approved':
      return 'mdi:check-circle'
    case 'pending':
      return 'mdi:clock-outline'
    case 'rejected':
      return 'mdi:close-circle'
    default:
      return 'mdi:help-circle'
  }
}

const getStatusText = (status?: string) => {
  const statusValue = status || 'approved'
  switch (statusValue) {
    case 'approved':
      return '承認済み'
    case 'pending':
      return '承認待ち'
    case 'rejected':
      return '拒否済み'
    default:
      return '不明'
  }
}

const getStatusIconClass = (status?: string) => {
  const statusValue = status || 'approved'
  switch (statusValue) {
    case 'approved':
      return 'text-green-600'
    case 'pending':
      return 'text-orange-500'
    case 'rejected':
      return 'text-red-600'
    default:
      return 'text-gray-500'
  }
}

// Load transactions on mount
onMounted(() => {
  loadTransactions()
})
</script>