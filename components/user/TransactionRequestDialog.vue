<template>
  <v-dialog :model-value="modelValue" max-width="500" persistent
    @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="text-lg font-semibold">
        {{ form.transaction_type === 'deposit' ? '入金' : '出金' }}リクエスト
      </v-card-title>

      <v-card-text>
        <v-form ref="formRef" @submit.prevent="submitRequest">
          <div class="space-y-4">
            <!-- Transaction Type Selection -->
            <v-select v-model="form.transaction_type" :items="transactionTypeOptions" label="取引種別 *" variant="outlined"
              :rules="typeRules" required />

            <!-- Amount Input with Currency Conversion -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-700">金額 *</label>
              <CommonCurrencyInput v-model="form.amount" :max-btc="maxBtcAmount"
                :disabled="loading || (form.transaction_type === 'withdrawal' && !isBalanceLoaded)" />

              <!-- Balance Info for Withdrawal -->
              <div v-if="form.transaction_type === 'withdrawal'"
                class="bg-blue-50 p-3 rounded-lg border border-blue-200">
                <div v-if="isBalanceLoaded" class="flex items-center justify-between text-sm">
                  <span class="font-medium text-blue-700">現在の残高:</span>
                  <span class="font-mono text-blue-900">{{ formatNumber(safeCurrentBalance) }}円</span>
                </div>
                <div v-else class="text-sm text-blue-700">
                  残高を取得中...
                </div>
              </div>

              <!-- Withdrawal Warning -->
              <v-alert v-if="isInsufficientBalance" type="error" variant="tonal" density="compact" class="mt-2">
                残高が不足しています。最大出金可能額: {{ formatNumber(safeCurrentBalance) }}円
              </v-alert>
            </div>

            <v-select v-model="form.reason" :items="reasonOptions"
              :label="`${form.transaction_type === 'deposit' ? '入金' : '出金'}理由 *`" variant="outlined"
              :rules="reasonRules" required />

            <v-textarea v-model="form.memo" label="メモ（任意）" variant="outlined" rows="3" maxlength="500" counter
              :hint="form.reason === 'その他' ? '「その他」を選択した場合は理由の詳細があれば記入してください' : '管理者への追加情報があれば記入してください'"
              persistent-hint />

            <!-- Warning Message -->
            <v-alert color="warning" variant="tonal" class="text-sm">
              <div class="space-y-1">
                <p>• リクエスト後は管理者による承認が必要です</p>
                <p>• 承認待ち中は新しいリクエストを送信できません</p>
                <p>• 1日あたり最大5回まで送信可能です</p>
                <p v-if="form.transaction_type === 'withdrawal'">• 出金の場合、残高を超える金額はリクエストできません</p>
              </div>
            </v-alert>
          </div>
        </v-form>
      </v-card-text>

      <v-card-actions class="flex justify-end gap-2 px-6 pb-6">
        <button type="button" class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          @click="$emit('update:modelValue', false)">
          キャンセル
        </button>
        <button type="button"
          class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          :disabled="loading" @click="submitRequest">
          <span v-if="loading">送信中...</span>
          <span v-else>リクエスト送信</span>
        </button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { TransactionRequestForm, DashboardData } from '~/types'
import CurrencyInput from '~/components/common/CurrencyInput.vue'
import { formatNumber } from '~/utils/format'

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'request-created': [data: any]
}>()

defineProps<{
  modelValue: boolean
}>()

const formRef = ref<any>(null)
const loading = ref(false)
const currentBalance = ref<number | null>(null)
const apiClient = useApiClient()

const form = ref<TransactionRequestForm>({
  amount: 0,
  transaction_type: 'deposit',
  reason: '',
  memo: ''
})

// Options
const transactionTypeOptions = [
  { title: '入金', value: 'deposit' },
  { title: '出金', value: 'withdrawal' }
]

const depositReasonOptions = [
  '運用開始',
  '追加入金',
  '証拠金不足',
  'その他'
]

const withdrawalReasonOptions = [
  '利益確定',
  '損失限定',
  '必要経費',
  '満期',
  'その他'
]

const reasonOptions = computed(() => {
  return form.value.transaction_type === 'deposit' ? depositReasonOptions : withdrawalReasonOptions
})

// Validation rules
const typeRules = [
  (v: string) => !!v || '取引種別を選択してください'
]

const reasonRules = [
  (v: string) => !!v || '理由を選択してください'
]

// Computed
const safeCurrentBalance = computed(() => {
  return currentBalance.value ?? 0
})

const isBalanceLoaded = computed(() => {
  return currentBalance.value !== null && currentBalance.value !== undefined
})

const maxBtcAmount = computed(() => {
  // 金額制限なし - 出金時のみ残高チェックは別途実施
  if (form.value.transaction_type === 'deposit') {
    return 999999999 // 事実上制限なし
  }
  return isBalanceLoaded.value ? safeCurrentBalance.value : 999999999
})

const isInsufficientBalance = computed(() => {
  return form.value.transaction_type === 'withdrawal' &&
    isBalanceLoaded.value &&
    Math.abs(form.value.amount) > safeCurrentBalance.value
})

// Fetch current user balance
const fetchUserBalance = async () => {
  try {
    const response = await apiClient.get<DashboardData>('/dashboard')
    currentBalance.value = response.data!.currentBalance
  } catch (error) {
    console.error('Failed to fetch user balance:', error)
    currentBalance.value = null
  }
}

// Submit request
const submitRequest = async () => {
  if (!formRef.value) return

  const { valid } = await formRef.value.validate()
  if (!valid) return

  if (isInsufficientBalance.value) {
    useNotification().showError('残高が不足しています')
    return
  }

  loading.value = true

  try {
    // 出金の場合は負の値に変換して送信
    const submitData = {
      ...form.value,
      amount: form.value.transaction_type === 'withdrawal' ? -Math.abs(form.value.amount) : form.value.amount
    }

    const response = await apiClient.post<{ data: any; message: string }>('/transactions/request', submitData)

    const transactionType = form.value.transaction_type === 'deposit' ? '入金' : '出金'
    useNotification().showSuccess(response.data!.message || `${transactionType}リクエストを送信しました`)

    emit('request-created', response.data!.data)
    emit('update:modelValue', false)

    // Reset form
    form.value = {
      amount: 0,
      transaction_type: 'deposit',
      reason: '',
      memo: ''
    }
    formRef.value?.reset()
  } catch (error: any) {
    useNotification().showError(error?.data?.message || 'リクエストの送信に失敗しました')
  } finally {
    loading.value = false
  }
}

// Watch for transaction type changes to fetch balance and reset reason
watch(() => form.value.transaction_type, (newType) => {
  if (newType === 'withdrawal') {
    fetchUserBalance()
  }
  // Reset reason when transaction type changes
  form.value.reason = ''
})

onMounted(() => {
  // Fetch balance if it's withdrawal type on mount
  if (form.value.transaction_type === 'withdrawal') {
    fetchUserBalance()
  }
})
</script>