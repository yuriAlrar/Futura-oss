<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 mb-2">入出金リクエスト承認</h1>
        <p class="text-gray-600">ユーザーからの入出金リクエストを確認し、承認・拒否を行います</p>
      </div>
      <button class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors" @click="loadRequests">
        <Icon name="mdi:refresh" class="mr-2" />
        更新
      </button>
    </div>

    <!-- Status Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">承認待ち</h3>
            <Icon name="mdi:clock-outline" class="text-2xl text-orange-500" />
          </div>
          <p class="text-2xl font-bold text-orange-600">{{ pendingCount }}</p>
        </v-card-text>
      </v-card>

      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">今日の承認</h3>
            <Icon name="mdi:check-circle" class="text-2xl text-green-500" />
          </div>
          <p class="text-2xl font-bold text-green-600">{{ todayApprovedCount }}</p>
        </v-card-text>
      </v-card>

      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">今日の拒否</h3>
            <Icon name="mdi:close-circle" class="text-2xl text-red-500" />
          </div>
          <p class="text-2xl font-bold text-red-600">{{ todayRejectedCount }}</p>
        </v-card-text>
      </v-card>
    </div>

    <!-- Filters -->
    <v-card class="mb-6">
      <v-card-text class="py-4">
        <div class="flex items-center space-x-4 flex-wrap gap-y-2">
          <v-select v-model="selectedStatus" :items="statusOptions" label="ステータス" variant="outlined" density="compact"
            class="w-48" @update:model-value="loadRequests" />
          <div class="flex-1" />
          <span class="text-sm text-gray-500">
            {{ totalCount }}件中 {{ requests.length }}件を表示
          </span>
        </div>
      </v-card-text>
    </v-card>

    <v-card class="card-shadow">
      <v-data-table-server v-model:items-per-page="limit" v-model:page="page" :headers="headers" :items="requests"
        :items-length="totalCount" :loading="loading" class="elevation-0" no-data-text="リクエストがありません"
        loading-text="読み込み中..." @update:options="handleOptionsUpdate">
        <template #[`item.user_id`]="{ item }">
          <div>
            <div class="text-sm font-medium text-gray-900">
              {{ item.user_name }}
            </div>
            <div class="text-sm text-gray-500">
              {{ item.user_email }}
            </div>
          </div>
        </template>

        <template #[`item.amount`]="{ item }">
          <div class="text-sm font-mono text-gray-900">
            ¥{{ formatNumber(Math.abs(item.amount)) }}
          </div>
        </template>

        <template #[`item.reason`]="{ item }">
          <div class="text-sm text-gray-900 max-w-xs truncate" :title="item.reason">
            {{ item.reason }}
          </div>
          <div v-if="item.memo" class="text-sm text-gray-500 max-w-xs truncate" :title="item.memo">
            メモ: {{ item.memo }}
          </div>
        </template>

        <template #[`item.requested_at`]="{ item }">
          <span class="text-sm text-gray-900">
            {{ formatDateTime(item.requested_at) }}
          </span>
        </template>

        <template #[`item.status`]="{ item }">
          <CommonStatusBadge :status="item.status" />
        </template>

        <template #[`item.actions`]="{ item }">
          <div v-if="item.status === 'pending'" class="flex space-x-2">
            <v-btn size="small" color="success" variant="flat" @click="approveRequest(item)">
              承認
            </v-btn>
            <v-btn size="small" color="error" variant="flat" @click="showRejectDialog(item)">
              拒否
            </v-btn>
          </div>
          <div v-else class="text-gray-500">
            {{ item.status === 'approved' ? '承認済み' : '拒否済み' }}
          </div>
        </template>
      </v-data-table-server>
    </v-card>

    <!-- Reject Dialog -->
    <AdminTransactionRejectDialog v-model="showRejectDialogState" :request="selectedRequest"
      @request-processed="onRequestProcessed" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { PaginatedResponse } from '~/types'
import { TRANSACTION_STATUS } from '~/types'
import { getTransactionTypeLabel } from '~/utils/transaction'
import { formatNumber } from '~/utils/format'

const logger = useLogger({ prefix: '[ADMIN-TRANSACTION-REQUESTS]' })
const apiClient = useApiClient()

definePageMeta({
  middleware: 'auth',
  layout: 'default'
})

useHead({
  title: '入出金リクエスト承認 - M・S CFD App Admin'
})

interface EnhancedTransactionRequest {
  transaction_id: string
  user_id: string
  user_name: string
  user_email: string
  amount: number
  transaction_type: 'deposit' | 'withdrawal' | 'asset_management'
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
  processed_at?: string
  processed_by?: string
  memo: string
  reason: string
  rejection_reason?: string
}

// State
const requests = ref<EnhancedTransactionRequest[]>([])
const loading = ref(false)
const selectedStatus = ref('pending')
const page = ref(1)
const limit = ref(20)
const totalCount = ref(0)
const hasMore = ref(false)
const currentRate = ref(0)
const showRejectDialogState = ref(false)
const selectedRequest = ref<EnhancedTransactionRequest | null>(null)

// Table headers
const headers = [
  { title: 'ユーザー', key: 'user_id', sortable: false },
  { title: '金額', key: 'amount', sortable: true },
  { title: '理由', key: 'reason', sortable: false },
  { title: 'リクエスト日時', key: 'requested_at', sortable: true },
  { title: 'ステータス', key: 'status', sortable: true },
  { title: 'アクション', key: 'actions', sortable: false, width: 160 }
]

// Status options
const statusOptions = [
  { title: '承認待ち', value: 'pending' },
  { title: '承認済み', value: 'approved' },
  { title: '拒否済み', value: 'rejected' }
]

// Computed
const pendingCount = computed(() => {
  return requests.value.filter(r => r.status === TRANSACTION_STATUS.PENDING).length
})

const todayApprovedCount = computed(() => {
  const today = new Date().toISOString().split('T')[0]
  return requests.value.filter(r =>
    r.status === TRANSACTION_STATUS.APPROVED &&
    r.processed_at?.startsWith(today)
  ).length
})

const todayRejectedCount = computed(() => {
  const today = new Date().toISOString().split('T')[0]
  return requests.value.filter(r =>
    r.status === TRANSACTION_STATUS.REJECTED &&
    r.processed_at?.startsWith(today)
  ).length
})

// Methods
const loadRequests = async () => {
  loading.value = true
  try {
    const response = await apiClient.get<PaginatedResponse<EnhancedTransactionRequest>>('/admin/transaction-requests', {
      params: {
        status: selectedStatus.value,
        page: page.value,
        limit: limit.value
      }
    })

    // 資産運用タイプを除外
    requests.value = response.data!.items.filter(item => item.transaction_type !== 'asset_management')
    totalCount.value = response.data!.total
    hasMore.value = response.data!.hasMore
  } catch (error: any) {
    logger.error('リクエスト取得エラー:', error)
    useNotification().showError(error?.data?.message || 'リクエストの取得に失敗しました')
  } finally {
    loading.value = false
  }
}

const changePage = (newPage: number) => {
  page.value = newPage
  loadRequests()
}

const handleOptionsUpdate = (options: any) => {
  page.value = options.page
  limit.value = options.itemsPerPage
  loadRequests()
}

watch([selectedStatus], () => {
  page.value = 1
  loadRequests()
})

const approveRequest = async (request: EnhancedTransactionRequest) => {
  try {
    const response = await apiClient.patch(`/admin/transactions/${request.transaction_id}/status`, {
      status: TRANSACTION_STATUS.APPROVED
    })

    useNotification().showSuccess(`${request.user_name}さんの${getTransactionTypeLabel(request.transaction_type)}リクエストを承認しました`)

    loadRequests()
  } catch (error: any) {
    logger.error('承認エラー:', error)
    useNotification().showError(error?.data?.message || '承認処理に失敗しました')
  }
}

const showRejectDialog = (request: EnhancedTransactionRequest) => {
  selectedRequest.value = request
  showRejectDialogState.value = true
}

const onRequestProcessed = () => {
  loadRequests()
}

const formatDateTime = (dateString: string) => {
  return new Date(dateString).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Load current rate
const loadCurrentRate = async () => {
  try {
    const response = await apiClient.get<any>('/market-rates/latest')
    currentRate.value = response.data!.btc_jpy_rate
  } catch (error) {
    logger.error('レート取得エラー:', error)
  }
}

onMounted(() => {
  loadRequests()
  loadCurrentRate()
})
</script>