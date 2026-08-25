<template>
  <v-dialog v-model="isOpen" max-width="900" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between bg-primary text-white">
        <span>一括処理詳細</span>
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          @click="isOpen = false"
        />
      </v-card-title>

      <v-card-text v-if="loading" class="pa-6 text-center">
        <v-progress-circular indeterminate color="primary" />
        <div class="mt-4">読み込み中...</div>
      </v-card-text>

      <v-card-text v-else-if="operation" class="pa-6">
        <!-- Operation Info -->
        <v-card variant="outlined" class="mb-4">
          <v-card-title class="text-h6">基本情報</v-card-title>
          <v-card-text>
            <v-row dense>
              <v-col cols="12" md="6">
                <div class="text-caption text-medium-emphasis">バッチID</div>
                <div class="font-mono text-body-2">{{ operation.batch_id }}</div>
              </v-col>
              <v-col cols="12" md="6">
                <div class="text-caption text-medium-emphasis">ステータス</div>
                <v-chip
                  :color="getStatusColor(operation.status)"
                  size="small"
                  variant="tonal"
                  class="mt-1"
                >
                  {{ getStatusLabel(operation.status) }}
                </v-chip>
              </v-col>
              <v-col cols="12" md="6">
                <div class="text-caption text-medium-emphasis">増減率</div>
                <v-chip
                  :color="operation.adjustment_rate > 0 ? 'success' : 'error'"
                  size="small"
                  variant="tonal"
                  class="mt-1"
                >
                  {{ formatRate(operation.adjustment_rate) }}
                </v-chip>
              </v-col>
              <v-col cols="12" md="6">
                <div class="text-caption text-medium-emphasis">実行者</div>
                <div class="text-body-2">{{ operation.created_by }}</div>
              </v-col>
              <v-col cols="12" md="6">
                <div class="text-caption text-medium-emphasis">対象</div>
                <div class="text-body-2">{{ operation.target_segment_id ? `セグメント: ${operation.target_segment_id}` : '全アクティブユーザー' }}</div>
              </v-col>
              <v-col v-if="operation.memo" cols="12">
                <div class="text-caption text-medium-emphasis">メモ</div>
                <div class="text-body-2">{{ operation.memo }}</div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Statistics -->
        <v-card variant="outlined" class="mb-4">
          <v-card-title class="text-h6">処理統計</v-card-title>
          <v-card-text>
            <v-row dense>
              <v-col cols="6" md="3">
                <div class="text-center">
                  <div class="text-h5">{{ operation.target_user_count }}</div>
                  <div class="text-caption text-medium-emphasis">対象数</div>
                </div>
              </v-col>
              <v-col cols="6" md="3">
                <div class="text-center">
                  <div class="text-h5 text-success">{{ operation.processed_user_count }}</div>
                  <div class="text-caption text-medium-emphasis">成功数</div>
                </div>
              </v-col>
              <v-col cols="6" md="3">
                <div class="text-center">
                  <div class="text-h5 text-error">{{ operation.failed_user_count }}</div>
                  <div class="text-caption text-medium-emphasis">失敗数</div>
                </div>
              </v-col>
              <v-col cols="6" md="3">
                <div class="text-center">
                  <div class="text-h5">
                    {{ operation.target_user_count > 0
                      ? Math.round((operation.processed_user_count / operation.target_user_count) * 100)
                      : 0 }}%
                  </div>
                  <div class="text-caption text-medium-emphasis">成功率</div>
                </div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Timestamps -->
        <v-card variant="outlined" class="mb-4">
          <v-card-title class="text-h6">タイムスタンプ</v-card-title>
          <v-card-text>
            <v-row dense>
              <v-col cols="12" md="4">
                <div class="text-caption text-medium-emphasis">作成日時</div>
                <div class="text-body-2">{{ formatDate(operation.created_at) }}</div>
              </v-col>
              <v-col cols="12" md="4">
                <div class="text-caption text-medium-emphasis">開始日時</div>
                <div class="text-body-2">{{ formatDate(operation.started_at) }}</div>
              </v-col>
              <v-col cols="12" md="4">
                <div class="text-caption text-medium-emphasis">完了日時</div>
                <div class="text-body-2">{{ formatDate(operation.completed_at) }}</div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Error Message -->
        <v-alert v-if="operation.error_message" type="error" variant="tonal" class="mb-4">
          <div class="text-caption font-weight-bold">エラーメッセージ</div>
          <div class="text-body-2">{{ operation.error_message }}</div>
        </v-alert>

        <!-- Transactions -->
        <v-card variant="outlined">
          <v-card-title class="text-h6">
            作成されたトランザクション ({{ transactions.length }}件)
          </v-card-title>
          <v-card-text>
            <v-data-table
              :headers="transactionHeaders"
              :items="transactions"
              :items-per-page="10"
              density="compact"
              class="elevation-0"
            >
              <template #item.user_id="{ item }">
                <span class="text-caption font-mono">{{ item.user_id.substring(0, 12) }}...</span>
              </template>

              <template #item.amount="{ item }">
                <span class="font-weight-medium">¥{{ formatNumber(item.amount) }}</span>
              </template>

              <template #item.transaction_type="{ item }">
                <v-chip
                  :color="getTransactionTypeColor(item.transaction_type)"
                  size="x-small"
                  variant="tonal"
                >
                  {{ getTransactionTypeLabel(item.transaction_type) }}
                </v-chip>
              </template>

              <template #item.timestamp="{ item }">
                <span class="text-caption">{{ formatDate(item.timestamp) }}</span>
              </template>

              <template #no-data>
                <div class="text-center pa-4 text-medium-emphasis">
                  トランザクションがありません
                </div>
              </template>
            </v-data-table>
          </v-card-text>
        </v-card>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn color="grey" variant="text" @click="isOpen = false">
          閉じる
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { BatchOperation, Transaction } from '~/types'
import { BATCH_OPERATION_STATUS } from '~/types'
import { getTransactionTypeLabel, getTransactionTypeColor } from '~/utils/transaction'
import { formatNumber } from '~/utils/format'

const props = defineProps<{
  modelValue: boolean
  batchId: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const apiClient = useApiClient()

// State
const operation = ref<BatchOperation | null>(null)
const transactions = ref<Transaction[]>([])
const loading = ref(false)

// Computed
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// Fetch detail
async function fetchDetail() {
  if (!props.batchId) return

  loading.value = true

  try {
    const response = await apiClient.get<{ operation: BatchOperation; transactions: Transaction[] }>(
      `/admin/batch-operations/${props.batchId}`
    )

    if (response.success && response.data) {
      operation.value = response.data.operation
      transactions.value = response.data.transactions
    }
  } catch (error) {
    console.error('一括処理詳細取得エラー:', error)
  } finally {
    loading.value = false
  }
}

// Watch for dialog open
watch(() => props.batchId, (newBatchId) => {
  if (newBatchId && props.modelValue) {
    fetchDetail()
  }
})

watch(() => props.modelValue, (newValue) => {
  if (newValue && props.batchId) {
    fetchDetail()
  } else {
    // Reset on close
    operation.value = null
    transactions.value = []
  }
})

// Status color
function getStatusColor(status: string): string {
  switch (status) {
    case BATCH_OPERATION_STATUS.COMPLETED:
      return 'success'
    case BATCH_OPERATION_STATUS.PROCESSING:
      return 'info'
    case BATCH_OPERATION_STATUS.FAILED:
      return 'error'
    case BATCH_OPERATION_STATUS.PENDING:
      return 'warning'
    case BATCH_OPERATION_STATUS.CANCELLED:
      return 'grey'
    default:
      return 'grey'
  }
}

// Status label
function getStatusLabel(status: string): string {
  switch (status) {
    case BATCH_OPERATION_STATUS.COMPLETED:
      return '完了'
    case BATCH_OPERATION_STATUS.PROCESSING:
      return '処理中'
    case BATCH_OPERATION_STATUS.FAILED:
      return '失敗'
    case BATCH_OPERATION_STATUS.PENDING:
      return '待機中'
    case BATCH_OPERATION_STATUS.CANCELLED:
      return 'キャンセル'
    default:
      return status
  }
}

// Format date
function formatDate(isoString?: string): string {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// Format rate
function formatRate(rate: number): string {
  return `${rate > 0 ? '+' : ''}${rate}%`
}

// Transaction headers
const transactionHeaders = [
  { title: 'ユーザーID', key: 'user_id', sortable: false },
  { title: '金額', key: 'amount', sortable: false },
  { title: '種類', key: 'transaction_type', sortable: false },
  { title: '日時', key: 'timestamp', sortable: false }
]
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
</style>
