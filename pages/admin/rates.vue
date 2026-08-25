<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 mb-2">相場価格設定</h1>
        <p class="text-gray-600">内部レート（資産評価に使用する円換算レート）の設定・変更を行います</p>
      </div>
      <div class="flex gap-3">
        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          @click="showCreateDialog = true"
        >
          新しい相場価格を設定
        </v-btn>
      </div>
    </div>

    <!-- Current Rate Card -->
    <v-card class="mb-6 bg-gradient-to-r from-primary-50 to-primary-100 border border-primary-200">
      <v-card-text class="p-6">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-primary-800 mb-1">現在の相場価格</h3>
            <p class="text-sm text-primary-600">最新の設定価格</p>
          </div>
          <div class="text-right">
            <p class="text-3xl font-bold text-primary-900 mb-1">
              {{ latestRate ? `¥${latestRate.btc_jpy_rate.toLocaleString()}` : '未設定' }}
            </p>
            <p class="text-sm text-primary-600">
              {{ latestRate ? formatDate(latestRate.timestamp) : '' }}
            </p>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <!-- Statistics Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">今日の更新回数</h3>
            <Icon name="mdi:update" class="text-2xl text-blue-500" />
          </div>
          <p class="text-2xl font-bold text-gray-900">{{ todayUpdateCount }}</p>
        </v-card-text>
      </v-card>

      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">過去30日の変動率</h3>
            <Icon name="mdi:chart-line" class="text-2xl text-green-500" />
          </div>
          <p class="text-2xl font-bold" :class="monthlyChangeClass">
            {{ monthlyChangePercent }}%
          </p>
        </v-card-text>
      </v-card>

      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">総レコード数</h3>
            <Icon name="mdi:database" class="text-2xl text-purple-500" />
          </div>
          <p class="text-2xl font-bold text-gray-900">{{ totalRecords }}</p>
        </v-card-text>
      </v-card>
    </div>

    <!-- Rates History Table -->
    <v-card>
      <v-card-title class="px-6 py-4 border-b flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-900">相場履歴</h3>
        <v-btn
          variant="outlined"
          size="small"
                      prepend-icon="mdi-refresh"
          @click="loadRates"
        >
          更新
        </v-btn>
      </v-card-title>

      <v-data-table
        :headers="headers"
        :items="rates"
        :loading="loading"
        :items-per-page="20"
        class="elevation-0"
        no-data-text="相場データがありません"
        loading-text="読み込み中..."
      >
        <template #[`item.btc_jpy_rate`]="{ item }">
          <span class="font-mono font-semibold">
            ¥{{ item.btc_jpy_rate.toLocaleString() }}
          </span>
        </template>

        <template #[`item.timestamp`]="{ item }">
          {{ formatDate(item.timestamp) }}
        </template>

        <template #[`item.created_at`]="{ item }">
          {{ formatDate(item.created_at) }}
        </template>

        <template #[`item.change`]="{ item, index }">
          <v-chip
            v-if="index < rates.length - 1"
            :color="getChangeColor(item, rates[index + 1])"
            size="small"
            variant="flat"
          >
            {{ getChangeText(item, rates[index + 1]) }}
          </v-chip>
          <span v-else class="text-gray-400">-</span>
        </template>

        <template #[`item.actions`]="{ item }">
          <v-btn size="small" variant="text" color="primary" @click="openEditDialog(item)">
            <Icon name="mdi:pencil" />
            編集
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <!-- Create Market Rate Dialog -->
    <AdminCreateMarketRateDialog
      v-model="showCreateDialog"
      @created="loadRates"
    />

    <!-- Edit Market Rate Dialog -->
    <AdminEditMarketRateDialog
      v-model="showEditDialog"
      :market-rate="selectedRate"
      @updated="loadRates"
    />
  </div>
</template>

<script setup lang="ts">
import type { MarketRate } from '~/types'

definePageMeta({
  middleware: 'auth',
  requireAdmin: true,
  layout: 'default'
})

useHead({
  title: '相場価格設定 - M・S CFD App'
})

const logger = useLogger({ prefix: '[AdminRates]' })
const { showError } = useNotification()
const apiClient = useApiClient()

// State
const rates = ref<MarketRate[]>([])
const latestRate = ref<MarketRate | null>(null)
const loading = ref(false)
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const selectedRate = ref<MarketRate | null>(null)

// Table headers
const headers = [
  { title: '設定日時', key: 'timestamp', sortable: true },
  { title: '内部レート（円）', key: 'btc_jpy_rate', sortable: true },
  { title: '前回からの変動', key: 'change', sortable: false },
  { title: '作成日時', key: 'created_at', sortable: true },
  { title: 'アクション', key: 'actions', sortable: false, width: 120 }
]

// Computed
const todayUpdateCount = computed(() => {
  const today = new Date().toDateString()
  return rates.value.filter(rate => 
    new Date(rate.created_at).toDateString() === today
  ).length
})

const monthlyChangePercent = computed(() => {
  if (rates.value.length < 2) return 0

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const recent = rates.value[0]
  const monthAgo = rates.value.find(rate => 
    new Date(rate.timestamp) <= thirtyDaysAgo
  )

  if (!monthAgo) return 0

  const change = ((recent.btc_jpy_rate - monthAgo.btc_jpy_rate) / monthAgo.btc_jpy_rate) * 100
  return Math.round(change * 100) / 100
})

const monthlyChangeClass = computed(() => {
  const change = monthlyChangePercent.value
  if (change > 0) return 'text-green-600'
  if (change < 0) return 'text-red-600'
  return 'text-gray-600'
})

const totalRecords = computed(() => rates.value.length)

// Methods
const loadRates = async () => {
  loading.value = true
  try {
    const [ratesResponse, latestResponse] = await Promise.all([
      apiClient.get<{ items: MarketRate[] }>('/market-rates'),
      apiClient.get<MarketRate>('/market-rates/latest')
    ])

    if (!ratesResponse.success) {
      showError(ratesResponse.error || '相場データの取得に失敗しました')
      return
    }

    rates.value = ratesResponse.data!.items
    latestRate.value = latestResponse.success ? (latestResponse.data || null) : null
  } catch (error) {
    logger.error('相場データの読み込みに失敗しました:', error)
    showError('相場データの取得に失敗しました')
  } finally {
    loading.value = false
  }
}

const openEditDialog = (rate: MarketRate) => {
  selectedRate.value = rate
  showEditDialog.value = true
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

const getChangeColor = (current: MarketRate, previous: MarketRate) => {
  const change = current.btc_jpy_rate - previous.btc_jpy_rate
  if (change > 0) return 'success'
  if (change < 0) return 'error'
  return 'grey'
}

const getChangeText = (current: MarketRate, previous: MarketRate) => {
  const change = current.btc_jpy_rate - previous.btc_jpy_rate
  const changePercent = (change / previous.btc_jpy_rate) * 100
  
  if (change === 0) return '変動なし'
  
  const sign = change > 0 ? '+' : ''
  return `${sign}${changePercent.toFixed(2)}%`
}

// Load data on mount
onMounted(() => {
  loadRates()
})
</script>