<template>
  <v-dialog :model-value="modelValue" max-width="600" persistent
    @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="text-lg font-semibold">
        新しい取引を追加
      </v-card-title>

      <v-card-text>
        <v-form ref="formRef" @submit.prevent="createTransaction">
          <div class="space-y-4">
            <v-select v-model="form.user_id" :items="userOptions" label="対象ユーザー *" variant="outlined" :rules="userRules"
              :disabled="!!props.preselectedUserId" required @update:model-value="onUserChange" />

            <!-- User Balance Display -->
            <div v-if="form.user_id && (loadingBalance || selectedUserBalance !== null)"
              class="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h4 class="font-medium text-blue-800 mb-2">現在の残高</h4>
              <div v-if="loadingBalance" class="flex items-center gap-2">
                <v-progress-circular indeterminate color="primary" size="20" width="2" />
                <span class="text-sm text-blue-700">残高を取得中...</span>
              </div>
              <p v-else class="text-lg font-semibold text-blue-900">
                ¥{{ formatNumber(selectedUserBalance || 0) }}
              </p>
            </div>

            <v-select v-model="form.transaction_type" :items="transactionTypeOptions" label="取引種別 *" variant="outlined"
              :rules="typeRules" required />

            <!-- Amount Input -->
            <div class="space-y-2">
              <v-text-field v-model.number="jpyAmount" label="金額（円） *"
                type="number" step="1" variant="outlined" :rules="amountRules" suffix="円"
                persistent-hint required class="flex-1" @input="convertJpyToInternal" />

              <!-- Rate Loading/Error State -->
              <v-alert v-if="rateError" type="error" variant="tonal" density="compact" class="mt-2">
                レートの取得に失敗しました。時間をおいて再度お試しください。
              </v-alert>
            </div>

            <v-select v-model="form.reason" :items="reasonOptions"
              :label="`${form.transaction_type === 'deposit' ? '入金' : '出金'}理由 *`" variant="outlined"
              :rules="reasonRules" required />

            <v-textarea v-model="form.memo" label="メモ" variant="outlined" :rules="memoRules" rows="3"
              hint="ユーザーに表示される詳細情報（任意）" persistent-hint />
          </div>
        </v-form>

        <v-alert
          v-if="form.transaction_type === 'withdrawal' && selectedUserBalance !== null && Math.abs(form.amount) > selectedUserBalance"
          type="error" variant="tonal" class="mt-4" density="compact">
          残高不足です。現在の残高: ¥{{ formatNumber(selectedUserBalance) }}
        </v-alert>

        <v-alert type="info" variant="tonal" class="mt-4" density="compact">
          <div class="text-sm">
            <strong>注意:</strong>
            この操作は取り消すことができません。金額と理由を十分に確認してください。
          </div>
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="loading" @click="cancel">
          キャンセル
        </v-btn>
        <v-btn color="primary" :loading="loading" :disabled="isInvalidWithdrawal" @click="createTransaction">
          追加
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { TransactionCreateForm, User, MarketRate } from '~/types'
import { getTransactionTypeLabel } from '~/utils/transaction'
import { formatNumber } from '~/utils/format'

const apiClient = useApiClient()

// Props & Emits
const props = defineProps<{
  modelValue: boolean
  users: User[]
  preselectedUserId?: string
  defaultTransactionType?: 'deposit' | 'withdrawal'
  defaultReason?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'created': []
}>()

const logger = useLogger({ prefix: '[CreateTransactionDialog]' })
const { showSuccess, showError } = useNotification()

// State
const formRef = ref()
const loading = ref(false)
const selectedUserBalance = ref<number | null>(null)
const loadingBalance = ref(false)
const jpyAmount = ref<number>(0)
const latestRate = ref<MarketRate | null>(null)
const rateError = ref<boolean>(false)

const form = reactive<TransactionCreateForm>({
  user_id: '',
  amount: 0,
  transaction_type: 'deposit',
  memo: '',
  reason: ''
})

// Options
const userOptions = computed(() =>
  props.users.map(user => ({
    title: `${user.name} (${user.email})`,
    value: user.user_id
  }))
)

const transactionTypeOptions = [
  { title: '入金', value: 'deposit' },
  { title: '出金', value: 'withdrawal' }
]

const depositReasonOptions = [
  '運用開始',
  '追加入金',
  '証拠金不足',
  'クレジットボーナス',
  'その他'
]

const withdrawalReasonOptions = [
  'テスト出勤',
  '利益確定',
  '損失限定',
  '必要経費',
  '満期',
  'その他'
]

// Computed
const reasonOptions = computed(() => {
  return form.transaction_type === 'deposit' ? depositReasonOptions : withdrawalReasonOptions
})

const isInvalidWithdrawal = computed(() => {
  return form.transaction_type === 'withdrawal' &&
    selectedUserBalance.value !== null &&
    Math.abs(form.amount) > selectedUserBalance.value
})

// Validation rules
const userRules = [
  (v: string) => !!v || 'ユーザーを選択してください'
]

const typeRules = [
  (v: string) => !!v || '取引種別を選択してください'
]

const amountRules = [
  (v: number) => !!v || '金額は必須です',
  (v: number) => v > 0 || '金額は正の数値で入力してください',
  (v: number) => v <= 20000000000 || '金額が大きすぎます（最大200億円）'
]

const reasonRules = [
  (v: string) => !!v || '理由を選択してください'
]

const memoRules = [
  (v: string) => !v || v.length >= 5 || 'メモは5文字以上で入力してください'
]

// Methods
const createTransaction = async () => {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  if (isInvalidWithdrawal.value) {
    showError('残高が不足しています')
    return
  }

  const selectedUser = props.users.find(u => u.user_id === form.user_id)
  const confirmMessage = `${selectedUser?.name}に${getTransactionTypeLabel(form.transaction_type)}（¥${formatNumber(form.amount)}）を実行してもよろしいですか？`

  if (!confirm(confirmMessage)) {
    return
  }

  loading.value = true

  try {
    // 出金の場合は負の値に変換して送信
    const submitData = {
      ...form,
      amount: form.transaction_type === 'withdrawal' ? -Math.abs(form.amount) : form.amount
    }

    const response = await apiClient.post('/admin/transactions', submitData)

    if (!response.success) {
      showError(response.error?.includes('Insufficient balance') ? '残高が不足しています' : (response.error || '取引の追加に失敗しました'))
      return
    }

    showSuccess('取引を追加しました')
    resetForm()
    emit('created')
  } catch (error: unknown) {
    logger.error('取引の作成に失敗しました:', error)
    showError('取引の追加に失敗しました')
  } finally {
    loading.value = false
  }
}

const cancel = () => {
  resetForm()
  emit('update:modelValue', false)
}

// Currency conversion methods
const loadLatestRate = async () => {
  try {
    rateError.value = false
    const response = await apiClient.get<MarketRate>('/market-rates/latest')
    if (response.success && response.data) {
      latestRate.value = response.data
    } else {
      throw new Error('No market rate data available')
    }
  } catch (error) {
    logger.error('相場レート取得エラー:', error)
    rateError.value = true
    latestRate.value = null
  }
}

// 円入力値を内部保存値に変換（現在はレートが1固定のため実質等価だが、
// 将来レート変動が再開された場合に備えてレート換算のロジックは維持する）
const convertJpyToInternal = () => {
  if (!latestRate.value || !jpyAmount.value) {
    form.amount = 0
    return
  }

  form.amount = jpyAmount.value / latestRate.value.btc_jpy_rate
}

const resetForm = () => {
  form.user_id = props.preselectedUserId || ''
  form.amount = 0
  form.transaction_type = props.defaultTransactionType || 'deposit'
  form.memo = ''
  form.reason = props.defaultReason || ''
  selectedUserBalance.value = null
  loadingBalance.value = false
  jpyAmount.value = 0
  formRef.value?.resetValidation()
}

const onUserChange = async (userId: string) => {
  if (!userId) {
    selectedUserBalance.value = null
    loadingBalance.value = false
    return
  }

  loadingBalance.value = true
  try {
    const apiClient = useApiClient()
    const { data } = await apiClient.get<{ success: boolean, btc_balance: number }>(`/admin/users/${userId}/balance`)
    console.log('data', data)
    selectedUserBalance.value = data?.btc_balance || 0
  } catch (error) {
    logger.error('ユーザー残高の取得に失敗しました:', error)
    selectedUserBalance.value = null
  } finally {
    loadingBalance.value = false
  }
}

// Watchers
watch(() => props.modelValue, async (newValue) => {
  if (newValue) {
    // ダイアログが開かれた時に相場レートを取得
    await loadLatestRate()

    // 事前選択されたユーザーIDがある場合、フォームに設定して残高を取得
    if (props.preselectedUserId) {
      form.user_id = props.preselectedUserId
      await onUserChange(props.preselectedUserId)
    }

    // デフォルト値を設定
    if (props.defaultTransactionType) {
      form.transaction_type = props.defaultTransactionType
    }
    if (props.defaultReason) {
      form.reason = props.defaultReason
    }
  } else {
    resetForm()
  }
})

// 取引種別が変更された時に理由をリセット
watch(() => form.transaction_type, () => {
  form.reason = ''
})
</script>