<template>
  <div class="p-4 sm:p-6">
    <div class="mb-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 mb-2">入出金リクエスト</h1>
          <p class="text-gray-600">入出金リクエストの履歴確認と新しいリクエストの作成</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="flex items-center justify-center w-10 h-10 sm:w-auto sm:h-auto sm:px-4 sm:py-2 text-secondary-600 hover:text-secondary-800 hover:bg-secondary-100 rounded-lg transition-all duration-200"
            title="更新" @click="loadRequests">
            <Icon name="mdi:refresh" class="text-xl sm:mr-2" />
            <span class="hidden sm:inline">更新</span>
          </button>
          <button
            class="flex items-center justify-center px-4 py-2 sm:px-6 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-secondary-400 disabled:cursor-not-allowed transition-all duration-200 font-medium whitespace-nowrap"
            :disabled="hasPendingRequest || isProfileUnapproved" @click="showRequestDialog = true">
            <Icon name="mdi:plus" class="text-lg sm:mr-2" />
            <span class="hidden sm:inline">新しいリクエスト</span>
            <span class="sm:hidden">新規</span>
          </button>
        </div>
      </div>
      <p v-if="isProfileUnapproved" class="text-xs text-orange-600 mt-2 text-right">
        プロフィールが未承認のため、新しいリクエストは送信できません
      </p>
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
          <p v-if="hasPendingRequest" class="text-xs text-orange-600 mt-1">
            承認待ち中は新規リクエストできません
          </p>
        </v-card-text>
      </v-card>

      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">承認済み</h3>
            <Icon name="mdi:check-circle" class="text-2xl text-green-500" />
          </div>
          <p class="text-2xl font-bold text-green-600">{{ approvedCount }}</p>
        </v-card-text>
      </v-card>

      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-gray-600">総リクエスト数</h3>
            <Icon name="mdi:history" class="text-2xl text-blue-500" />
          </div>
          <p class="text-2xl font-bold text-blue-600">{{ totalRequestCount }}</p>
        </v-card-text>
      </v-card>
    </div>

    <!-- Filters -->
    <v-card class="mb-6">
      <v-card-text class="py-4">
        <div class="flex flex-col sm:flex-row sm:items-center gap-4">
          <div class="flex flex-col sm:flex-row gap-4">
            <v-select v-model="selectedTransactionType" :items="transactionTypeOptions" label="取引種別" variant="outlined"
              density="compact" class="w-full sm:w-48" @update:model-value="filterRequests" />
            <v-select v-model="selectedStatus" :items="statusOptions" label="ステータス" variant="outlined" density="compact"
              class="w-full sm:w-48" @update:model-value="filterRequests" />
          </div>
          <div class="sm:flex-1" />
          <div class="text-sm text-secondary-500 text-center sm:text-right">
            {{ totalCount }}件中 {{ requests.length }}件を表示
          </div>
        </div>
      </v-card-text>
    </v-card>

    <!-- Requests Table -->
    <v-card class="card-shadow">
      <v-card-text class="p-0">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <div v-else-if="requests.length === 0" class="text-center py-12">
          <Icon name="mdi:inbox" class="text-4xl text-gray-400 mb-4" />
          <p class="text-gray-500">
            {{ getEmptyMessage() }}
          </p>
          <p v-if="selectedStatus === 'all'" class="text-sm text-gray-400 mt-2">
            上の「新しいリクエスト」ボタンから入金をリクエストできます
          </p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  種別
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  金額
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  理由・メモ
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  リクエスト日時
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  ステータス
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  処理日時
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="request in requests" :key="request.transaction_id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" :class="request.transaction_type === 'deposit'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'">
                      {{ getTransactionTypeLabel(request.transaction_type) }}
                    </span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-mono text-gray-900">
                    <span :class="request.transaction_type === 'deposit' ? 'text-green-600' : 'text-red-600'">
                      {{ getTransactionTypeSign(request.transaction_type, request.amount) }}¥{{ formatNumber(Math.abs(request.amount)) }}
                    </span>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <div class="text-sm text-gray-900 max-w-xs">
                    {{ request.reason }}
                  </div>
                  <div v-if="request.memo" class="text-sm text-gray-500 max-w-xs mt-1">
                    メモ: {{ request.memo }}
                  </div>
                  <div v-if="request.status === 'rejected' && request.rejection_reason"
                    class="text-sm text-red-600 max-w-xs mt-1">
                    拒否理由: {{ request.rejection_reason }}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ formatDateTime(request.requested_at || request.timestamp) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <CommonStatusBadge :status="request.status || 'approved'" />
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <span v-if="request.processed_at">
                    {{ formatDateTime(request.processed_at) }}
                  </span>
                  <span v-else-if="request.status === 'pending'" class="text-gray-400">
                    承認待ち
                  </span>
                  <span v-else class="text-gray-400">
                    -
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </v-card-text>
    </v-card>

    <!-- Pagination -->
    <div v-if="totalCount > limit" class="mt-6 flex justify-center">
      <div class="flex items-center gap-2 sm:gap-4">
        <button
          class="px-3 py-2 text-secondary-500 hover:text-secondary-700 hover:bg-secondary-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          :disabled="page <= 1" @click="changePage(page - 1)">
          <Icon name="mdi:chevron-left" class="sm:hidden" />
          <span class="hidden sm:inline">前へ</span>
        </button>
        <span class="text-sm text-secondary-600 px-2">
          {{ page }} / {{ Math.ceil(totalCount / limit) }}
        </span>
        <button
          class="px-3 py-2 text-secondary-500 hover:text-secondary-700 hover:bg-secondary-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          :disabled="!hasMore" @click="changePage(page + 1)">
          <Icon name="mdi:chevron-right" class="sm:hidden" />
          <span class="hidden sm:inline">次へ</span>
        </button>
      </div>
    </div>

    <!-- Request Dialog -->
    <UserTransactionRequestDialog v-model="showRequestDialog" @request-created="onRequestCreated" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Transaction } from '~/types'
import { TRANSACTION_STATUS } from '~/types'
import { getTransactionTypeLabel, getTransactionTypeSign } from '~/utils/transaction'
import { formatNumber } from '~/utils/format'

definePageMeta({
  middleware: 'auth'
})

const logger = useLogger({ prefix: '[USER-TRANSACTION-REQUESTS]' })
const apiClient = useApiClient()

useHead({
  title: '入出金リクエスト - M・S CFD App'
})

// State
const requests = ref<Transaction[]>([])
const loading = ref(false)
const selectedStatus = ref('pending') // デフォルトで承認待ちを表示
const selectedTransactionType = ref('all') // デフォルトですべての取引種別を表示
const page = ref(1)
const limit = ref(20)
const totalCount = ref(0)
const hasMore = ref(false)
const showRequestDialog = ref(false)
const profileApproved = ref<boolean | null>(null)

// Status options
const statusOptions = [
  { title: 'すべて', value: 'all' },
  { title: '承認待ち', value: 'pending' },
  { title: '承認済み', value: 'approved' },
  { title: '拒否済み', value: 'rejected' }
]

// Transaction type options
const transactionTypeOptions = [
  { title: 'すべて', value: 'all' },
  { title: '入金', value: 'deposit' },
  { title: '出金', value: 'withdrawal' }
]

// Computed
const pendingCount = computed(() => {
  return requests.value.filter(r => r.status === TRANSACTION_STATUS.PENDING).length
})

const approvedCount = computed(() => {
  return requests.value.filter(r => !r.status || r.status === TRANSACTION_STATUS.APPROVED).length
})

const totalRequestCount = computed(() => {
  return totalCount.value // APIから取得した総件数を使用
})

const hasPendingRequest = computed(() => {
  return pendingCount.value > 0
})

const isProfileUnapproved = computed(() => {
  return profileApproved.value === false
})

// Methods
const loadRequests = async () => {
  loading.value = true
  try {
    const response = await apiClient.get<{ items: Transaction[]; total: number; hasMore: boolean }>('/transaction-requests', {
      params: {
        status: selectedStatus.value,
        transaction_type: selectedTransactionType.value,
        page: page.value.toString(),
        limit: limit.value.toString()
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

const loadProfileApproval = async () => {
  const response = await apiClient.get<{ profile_approved: boolean }>('/profile')
  profileApproved.value = response.success ? (response.data?.profile_approved ?? null) : null
}

const filterRequests = () => {
  // ページをリセットしてリクエストを再読み込み
  page.value = 1
  loadRequests()
}

const changePage = (newPage: number) => {
  page.value = newPage
  loadRequests()
}

const onRequestCreated = (data: any) => {
  logger.info('新しいリクエストが作成されました:', data)
  // 最初のページに戻してリストを更新
  page.value = 1
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

const getStatusText = (status: string) => {
  const option = statusOptions.find(opt => opt.value === status)
  return option?.title || status
}

const getTransactionTypeText = (type: string) => {
  const option = transactionTypeOptions.find(opt => opt.value === type)
  return option?.title || type
}

const getEmptyMessage = () => {
  const typeText = selectedTransactionType.value === 'all' ? '' : getTransactionTypeText(selectedTransactionType.value)
  const statusText = selectedStatus.value === 'all' ? '' : getStatusText(selectedStatus.value)

  if (selectedTransactionType.value === 'all' && selectedStatus.value === 'all') {
    return 'リクエスト履歴がありません'
  } else if (selectedTransactionType.value === 'all') {
    return `${statusText}のリクエストがありません`
  } else if (selectedStatus.value === 'all') {
    return `${typeText}リクエストがありません`
  } else {
    return `${typeText}の${statusText}リクエストがありません`
  }
}

onMounted(() => {
  loadRequests()
  loadProfileApproval()
})
</script>