<template>
  <v-card>
    <v-card-title class="bg-primary text-white">
      一括資産調整コントローラー
    </v-card-title>

    <v-card-text class="pa-6">
      <v-alert
        v-if="errorMessage"
        type="error"
        closable
        class="mb-4"
        @click:close="errorMessage = ''"
      >
        {{ errorMessage }}
      </v-alert>

      <v-form @submit.prevent="openConfirmDialog">
        <v-row>
          <v-col cols="12" md="6">
            <v-select
              v-model="targetSegmentId"
              :items="segmentOptions"
              label="対象セグメント"
              variant="outlined"
              hint="未選択の場合は全アクティブユーザーが対象になります"
              persistent-hint
              clearable
            />
          </v-col>

          <v-col cols="12" md="6">
            <v-text-field
              v-model.number="adjustmentRate"
              label="増減率 (%)"
              type="number"
              step="0.01"
              :rules="adjustmentRateRules"
              hint="例: +5 = 5%増加, -3 = 3%減少"
              persistent-hint
              variant="outlined"
              required
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12">
            <v-text-field
              v-model="memo"
              label="メモ (任意)"
              variant="outlined"
              hint="管理用メモ"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-row v-if="adjustmentRate !== 0" class="mt-2">
          <v-col cols="12">
            <v-alert type="info" variant="tonal">
              <div class="font-weight-bold">実行内容</div>
              <div>{{ impactDescription }}</div>
              <div class="text-caption mt-2">
                {{ targetDescription }}
              </div>
            </v-alert>
          </v-col>
        </v-row>

        <v-row class="mt-4">
          <v-col cols="12">
            <v-btn
              type="submit"
              color="primary"
              size="large"
              :disabled="!isValid || loading"
              :loading="loading"
              block
            >
              実行
            </v-btn>
          </v-col>
        </v-row>
      </v-form>
    </v-card-text>

    <!-- Confirmation Dialog -->
    <v-dialog v-model="showConfirmDialog" max-width="500">
      <v-card>
        <v-card-title class="bg-warning text-white">
          確認
        </v-card-title>

        <v-card-text class="pa-6">
          <v-alert type="warning" variant="tonal" class="mb-4">
            {{ targetDescription }}
          </v-alert>

          <div class="mb-4">
            <div class="text-h6 mb-2">実行内容</div>
            <v-list density="compact">
              <v-list-item>
                <v-list-item-title>対象</v-list-item-title>
                <v-list-item-subtitle>{{ selectedSegmentName || '全アクティブユーザー' }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item>
                <v-list-item-title>増減率</v-list-item-title>
                <v-list-item-subtitle class="text-h6">
                  {{ rateDisplay }}
                </v-list-item-subtitle>
              </v-list-item>
              <v-list-item v-if="memo">
                <v-list-item-title>メモ</v-list-item-title>
                <v-list-item-subtitle>{{ memo }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </div>

          <div class="text-body-2">
            {{ impactDescription }}
          </div>
          <div class="text-caption text-medium-emphasis mt-2">
            ※ この操作は取り消せません
          </div>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn
            color="grey"
            variant="text"
            :disabled="loading"
            @click="showConfirmDialog = false"
          >
            キャンセル
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="loading"
            @click="executeBatchOperation"
          >
            実行
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import type { BatchOperationCreateForm, BatchOperationResult, SegmentWithMemberCount } from '~/types'

const emit = defineEmits<{
  success: []
}>()

const apiClient = useApiClient()
const logger = useLogger({ prefix: '[BatchOperationController]' })

// State
const adjustmentRate = ref<number>(0)
const memo = ref<string>('')
const loading = ref(false)
const showConfirmDialog = ref(false)
const errorMessage = ref<string>('')
const segments = ref<SegmentWithMemberCount[]>([])
const targetSegmentId = ref<string | null>(null)

// Segment options for target selector
const segmentOptions = computed(() =>
  segments.value.map(segment => ({
    title: `${segment.name}（${segment.member_count}人）`,
    value: segment.segment_id
  }))
)

const selectedSegmentName = computed(() => {
  return segments.value.find(s => s.segment_id === targetSegmentId.value)?.name || ''
})

const targetDescription = computed(() => {
  return targetSegmentId.value
    ? `※ セグメント「${selectedSegmentName.value}」に所属するアクティブユーザーが対象です`
    : '※ アクティブな全ユーザーが対象です'
})

// Validation
const isValid = computed(() => {
  return adjustmentRate.value !== 0 && adjustmentRate.value > -100
})

const adjustmentRateRules = [
  (v: number) => v !== 0 || '増減率を入力してください',
  (v: number) => v > -100 || '増減率は-100%より大きい値を入力してください'
]

// Load segments for the target selector
const loadSegments = async () => {
  try {
    const response = await apiClient.get<{ items: SegmentWithMemberCount[] }>('/admin/segments')
    segments.value = response.data?.items || []
  } catch (error) {
    logger.error('セグメント一覧の取得に失敗しました:', error)
  }
}

onMounted(() => {
  loadSegments()
})

// Confirm dialog
function openConfirmDialog() {
  if (!isValid.value) {
    return
  }
  errorMessage.value = ''
  showConfirmDialog.value = true
}

// Execute batch operation
async function executeBatchOperation() {
  if (!isValid.value) {
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const payload: BatchOperationCreateForm = {
      adjustment_rate: adjustmentRate.value,
      memo: memo.value || undefined,
      target_segment_id: targetSegmentId.value || undefined
    }

    const response = await apiClient.post<BatchOperationResult>(
      '/admin/batch-operations',
      payload
    )

    if (response.success) {
      showConfirmDialog.value = false
      adjustmentRate.value = 0
      memo.value = ''
      targetSegmentId.value = null
      emit('success')

      // Show success message
      const result = response.data! as BatchOperationResult
      const successMsg = `一括処理が完了しました。成功: ${result.processed_user_count}件, 失敗: ${result.failed_user_count}件`
      logger.info(successMsg)
    }
  } catch (error: any) {
    logger.error('一括処理実行エラー:', error)
    errorMessage.value = error.data?.statusMessage || error.message || '一括処理の実行に失敗しました'
  } finally {
    loading.value = false
  }
}

// Format rate display
const rateDisplay = computed(() => {
  if (adjustmentRate.value === 0) return '0%'
  return `${adjustmentRate.value > 0 ? '+' : ''}${adjustmentRate.value}%`
})

const impactDescription = computed(() => {
  const targetLabel = targetSegmentId.value ? `セグメント「${selectedSegmentName.value}」の` : '全ユーザーの'
  if (adjustmentRate.value === 0) return ''
  if (adjustmentRate.value > 0) {
    return `${targetLabel}資産残高が${adjustmentRate.value}%増加します`
  }
  return `${targetLabel}資産残高が${Math.abs(adjustmentRate.value)}%減少します`
})
</script>
