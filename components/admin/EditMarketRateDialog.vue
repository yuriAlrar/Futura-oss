<template>
  <v-dialog
    :model-value="modelValue"
    max-width="600"
    persistent
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="text-lg font-semibold">
        相場価格を編集
      </v-card-title>

      <v-card-text>
        <v-form ref="formRef" @submit.prevent="updateRate">
          <div class="space-y-4">
            <v-text-field
              v-model="form.timestamp"
              label="設定日時 *"
              type="datetime-local"
              variant="outlined"
              :rules="timestampRules"
              hint="この日時時点での相場価格として記録されます"
              persistent-hint
              required
            />

            <v-text-field
              v-model="formattedRate"
              label="内部レート（円） *"
              type="text"
              variant="outlined"
              :rules="rateRules"
              prefix="¥"
              suffix="JPY"
              hint="1単位あたりの内部レート（円）を入力してください（小数点2桁まで、カンマ自動挿入）"
              persistent-hint
              required
              @blur="formatOnBlur"
            />

            <div class="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h4 class="font-medium text-blue-800 mb-2 flex items-center">
                <Icon name="mdi:calculator" class="mr-2" />
                価格例（参考値）
              </h4>
              <div class="grid grid-cols-2 gap-4 text-sm text-blue-700">
                <div class="cursor-pointer hover:bg-blue-100 p-2 rounded" @click="setExampleRate(5123456.78)">
                  {{ (5123456.78).toLocaleString('ja-JP') }}円 (保守的)
                </div>
                <div class="cursor-pointer hover:bg-blue-100 p-2 rounded" @click="setExampleRate(7850000.50)">
                  {{ (7850000.50).toLocaleString('ja-JP') }}円 (中程度)
                </div>
                <div class="cursor-pointer hover:bg-blue-100 p-2 rounded" @click="setExampleRate(10975432.25)">
                  {{ (10975432.25).toLocaleString('ja-JP') }}円 (高価格)
                </div>
                <div class="cursor-pointer hover:bg-blue-100 p-2 rounded" @click="setExampleRate(13250000.99)">
                  {{ (13250000.99).toLocaleString('ja-JP') }}円 (極高価格)
                </div>
              </div>
            </div>
          </div>
        </v-form>

        <v-alert
          type="info"
          variant="tonal"
          class="mt-4"
          density="compact"
        >
          <div class="text-sm">
            <strong>注意:</strong>
            <ul class="mt-2 ml-4 list-disc space-y-1">
              <li>この価格変更により、全ユーザーの資産価値が影響を受ける可能性があります</li>
              <li>過去の日時を設定することも可能です</li>
              <li>変更後の取り消しはできません</li>
            </ul>
          </div>
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          :disabled="loading"
          @click="cancel"
        >
          キャンセル
        </v-btn>
        <v-btn
          color="primary"
          :loading="loading"
          @click="updateRate"
        >
          更新
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { MarketRate, MarketRateUpdateForm } from '~/types'

const apiClient = useApiClient()

const props = defineProps<{
  modelValue: boolean
  marketRate: MarketRate | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'updated': []
}>()

const logger = useLogger({ prefix: '[EditMarketRateDialog]' })
const { showSuccess, showError } = useNotification()

const formRef = ref()
const loading = ref(false)

const form = reactive<MarketRateUpdateForm>({
  timestamp: '',
  btc_jpy_rate: 0
})

// カンマ区切り表示用（form側は素の数値を保持する）
const formattedRate = ref('')

watch(formattedRate, (newValue) => {
  const cleanValue = newValue.replace(/,/g, '')
  const numValue = parseFloat(cleanValue)
  form.btc_jpy_rate = isNaN(numValue) ? 0 : numValue
}, { immediate: true })

const formatOnBlur = () => {
  if (form.btc_jpy_rate && !isNaN(form.btc_jpy_rate)) {
    formattedRate.value = form.btc_jpy_rate.toLocaleString('ja-JP', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })
  }
}

const timestampRules = [
  (v: string) => !!v || '設定日時は必須です',
  (v: string) => {
    const date = new Date(v)
    return !isNaN(date.getTime()) || '有効な日時を入力してください'
  }
]

const rateRules = [
  (v: string) => !!v || '内部レートは必須です',
  (v: string) => {
    const numValue = parseFloat(v.replace(/,/g, ''))
    return !isNaN(numValue) || '有効な数値を入力してください'
  },
  (v: string) => {
    const numValue = parseFloat(v.replace(/,/g, ''))
    return numValue > 0 || '内部レートは正の数値で入力してください'
  },
  (v: string) => {
    const numValue = parseFloat(v.replace(/,/g, ''))
    return numValue <= 100000000 || '内部レートが高すぎます'
  },
  (v: string) => {
    const cleanValue = v.replace(/,/g, '')
    const decimal = cleanValue.split('.')[1]
    return !decimal || decimal.length <= 2 || '小数点以下は2桁までです'
  }
]

const updateRate = async () => {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  if (!props.marketRate) {
    showError('更新対象の相場データが見つかりません')
    return
  }

  if (!confirm('この相場価格を更新してよろしいですか？')) {
    return
  }

  loading.value = true

  try {
    const response = await apiClient.put(`/admin/market-rates/${props.marketRate.rate_id}`, form)

    if (!response.success) {
      showError(response.statusCode === 403 ? '相場価格を編集する権限がありません' : (response.error || '相場価格の更新に失敗しました'))
      return
    }

    showSuccess('相場価格を更新しました')
    resetForm()
    emit('updated')
    emit('update:modelValue', false)
  } catch (error) {
    logger.error('相場価格の更新に失敗しました:', error)
    showError('相場価格の更新に失敗しました')
  } finally {
    loading.value = false
  }
}

const cancel = () => {
  resetForm()
  emit('update:modelValue', false)
}

const resetForm = () => {
  form.timestamp = ''
  form.btc_jpy_rate = 0
  formattedRate.value = ''
  formRef.value?.resetValidation()
}

const setExampleRate = (rate: number) => {
  form.btc_jpy_rate = rate
  formattedRate.value = rate.toLocaleString('ja-JP', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

watch(() => props.marketRate, (newRate) => {
  if (newRate && props.modelValue) {
    const date = new Date(newRate.timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')

    form.timestamp = `${year}-${month}-${day}T${hours}:${minutes}`
    form.btc_jpy_rate = newRate.btc_jpy_rate
    formattedRate.value = newRate.btc_jpy_rate.toLocaleString('ja-JP', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })
  }
}, { immediate: true })

watch(() => props.modelValue, (newValue) => {
  if (!newValue) {
    resetForm()
  }
})
</script>
