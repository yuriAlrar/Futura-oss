<template>
  <div class="space-y-2">
    <v-text-field
      v-model.number="jpyAmount"
      label="金額（円） *"
      type="number"
      step="1"
      variant="outlined"
      :rules="jpyAmountRules"
      suffix="円"
      :disabled="disabled"
      required
      @input="convertJpyToInternal"
    />

    <!-- Rate Loading/Error State -->
    <v-alert v-if="rateError" type="error" variant="tonal" density="compact" class="mt-2">
      レートの取得に失敗しました。時間をおいて再度お試しください。
    </v-alert>
  </div>
</template>

<script setup lang="ts">
import type { MarketRate } from '~/types'

interface Props {
  modelValue: number // 内部保存値（現在は円と等価な内部単位）
  maxBtc?: number
  maxJpy?: number
  disabled?: boolean
}

interface Emits {
  (e: 'update:modelValue', value: number): void
}

const props = withDefaults(defineProps<Props>(), {
  maxBtc: 999999999, // 事実上制限なし
  maxJpy: 999999999999999, // 事実上制限なし
  disabled: false
})

const emit = defineEmits<Emits>()

const logger = useLogger({ prefix: '[CurrencyInput]' })
const apiClient = useApiClient()

// State
const jpyAmount = ref<number>(0)
const latestRate = ref<MarketRate | null>(null)
const rateError = ref<boolean>(false)

// Validation rules
const jpyAmountRules = [
  (v: number) => !!v || '金額は必須です',
  (v: number) => v > 0 || '金額は正の数値で入力してください'
]

// Methods
const loadLatestRate = async () => {
  try {
    rateError.value = false
    const response = await apiClient.get<MarketRate>('/market-rates/latest')
    if (response.data) {
      latestRate.value = response.data
    } else {
      throw new Error('No market rate data available')
    }
  } catch (error) {
    logger.error('レート取得エラー:', error)
    rateError.value = true
    latestRate.value = null
  }
}

// 円入力値を内部保存値に変換（現在はレートが1固定のため実質等価だが、
// 将来レート変動が再開された場合に備えてレート換算のロジックは維持する）
const convertJpyToInternal = () => {
  if (!latestRate.value || !jpyAmount.value || isNaN(jpyAmount.value)) {
    emit('update:modelValue', 0)
    return
  }

  const calculatedValue = jpyAmount.value / latestRate.value.btc_jpy_rate
  emit('update:modelValue', isNaN(calculatedValue) ? 0 : calculatedValue)
}

const convertInternalToJpy = () => {
  if (!latestRate.value || !props.modelValue || isNaN(props.modelValue)) {
    jpyAmount.value = 0
    return
  }

  const calculatedJpy = Math.round(props.modelValue * latestRate.value.btc_jpy_rate)
  jpyAmount.value = isNaN(calculatedJpy) ? 0 : calculatedJpy
}

// Watchers
watch(() => props.modelValue, () => {
  convertInternalToJpy()
})

watch(latestRate, () => {
  convertInternalToJpy()
})

// Initialize
onMounted(async () => {
  await loadLatestRate()
  convertInternalToJpy()
})
</script>
